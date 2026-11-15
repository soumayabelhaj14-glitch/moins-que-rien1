/**
 * Server Action — Soumission d'une annonce
 *
 * Cette fonction s'exécute UNIQUEMENT côté serveur (TanStack Start).
 *
 * SÉCURITÉ FONDAMENTALE :
 * La valeur neuve de référence ne peut jamais être fournie librement par le vendeur.
 * Le serveur cherche toujours le prix neuf de façon autonome via des sources fiables.
 * Si aucune source fiable n'est disponible, l'annonce passe en `pending_price_review`
 * et un administrateur doit fixer le prix de référence avant toute publication.
 *
 * Le client ne peut jamais forcer un prix supérieur au plafond.
 * La contrainte SQL `price_within_cap` est une double protection.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { computeP2P, defaultP2PConfig } from "@/lib/pricing/p2p";
import { computePro, defaultProConfig } from "@/lib/pricing/pro";
import { computeVehicle, defaultVehicleConfig } from "@/lib/pricing/vehicle";
import { getSupabaseAdmin } from "@/lib/supabase";
import { searchNewPrice } from "@/lib/product-lookup/price-search";
import type { ProductIdentity } from "@/lib/product-lookup/types";

// Seuil de confiance minimal pour accepter automatiquement la valeur neuve.
// En dessous de ce seuil → `pending_price_review`.
const CONFIDENCE_THRESHOLD_AUTO = 0.75;

// Types -----------------------------------------------------------------------

export type SubmitListingInput = {
  // Identité de l'objet
  title: string;
  description?: string;
  category: string;
  // Conditions P2P particulier
  // | Conditions Pro            | Conditions Véhicule
  condition:
    | "neuf-jamais-utilise" | "comme-neuf" | "tres-bon" | "bon" | "usage" | "defauts"
    | "neuf-emballe" | "neuf-deballe" | "occasion"
    | "excellent" | "moyen";
  ageYears: number;
  ean?: string;
  reference?: string;

  // Mode
  mode: "particulier" | "pro" | "vehicule" | "don" | "don_association";
  associationId?: string;

  // Prix demandé par le vendeur (brut, non validé)
  askedPriceEur?: number;

  // Garantie vérifiée (en jours restants)
  verifiedWarrantyDaysLeft?: number | null;

  // Mode Pro : nombre d'unités en stock
  quantity?: number;

  // Mode Véhicule : kilométrage réel
  km?: number;

  /**
   * Prix neuf saisi manuellement par le vendeur (€ TTC).
   * Utilisé comme FALLBACK si l'auto-lookup échoue.
   * Déclenche toujours `pending_price_review` → validation admin avant publication.
   */
  manualNewPriceEur?: number;
  /** URL ou nom du site source (ex : https://amazon.fr/dp/XXX ou "Darty"). */
  manualSourceUrl?: string;
};

export type SubmitListingResult =
  | {
      ok: true;
      listingId: string;
      maxPriceEur: number | null;
      /** L'annonce est en attente de validation admin du prix neuf */
      pendingPriceReview: boolean;
    }
  | {
      ok: false;
      error: string;
      code: "auth" | "price_cap_exceeded" | "db" | "validation";
    };

// Logique métier pure (testable sans contexte TanStack) -----------------------

/**
 * Traitement de la soumission d'une annonce.
 * Fonction pure exportée pour les tests d'intégration.
 * Prend un userId déjà authentifié — l'authentification est vérifiée par le caller.
 */
export async function processListingSubmission(
  data: SubmitListingInput,
  userId: string,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
): Promise<SubmitListingResult> {
  // 1. Validation minimale du titre
  if (!data.title?.trim() || data.title.trim().length < 5) {
    return {
      ok: false,
      error: "Le titre doit comporter au moins 5 caractères.",
      code: "validation",
    };
  }

  // 2. Circuit de traitement selon le mode
  //
  // Les DONS suivent un circuit spécifique :
  //   • Pas de recherche de prix neuf (l'objet est gratuit — le prix neuf est sans objet).
  //   • Pas de calcul de plafond (plafond = 0 €).
  //   • Statut initial : pending_review (vérification anti-spam par un admin).
  //   • Pas de vérification EAN automatique — la modération admin suffit.
  //
  // Les VENTES (particulier, pro, véhicule) suivent le circuit tarifaire :
  //   • Recherche obligatoire du prix neuf côté serveur.
  //   • Calcul du plafond selon le moteur de tarification.
  //   • Statut : pending_price_review si prix non trouvé, pending_review sinon.

  const isDon = data.mode === "don" || data.mode === "don_association";

  let referenceNewValueEur: number | null = null;
  let priceNewSource: string = "non_applicable";
  let priceNewConfidence: "verified" | "equivalent" | "manual_admin" = "manual_admin";
  let priceNewFetchedAt: string = new Date().toISOString();
  let maxPriceEur: number | null = null;
  let pendingPriceReview = false;

  if (isDon) {
    // ── Circuit don : pas de recherche de prix, modération simple ───────────
    // Le prix neuf est sans objet pour un don. L'admin vérifie l'objet
    // et publie directement (pending_review → published).
    priceNewSource = "don_gratuit";
    maxPriceEur = 0;
    pendingPriceReview = false; // → pending_review directement
  } else {
    // ── Circuit vente : recherche obligatoire du prix neuf ───────────────────
    let confidenceScore = 0;

    const identity: ProductIdentity = {
      name: data.title,
      brand: "",
      model: data.reference ?? data.title,
      variant: null,
      ean: data.ean ?? null,
      categoryId: data.category,
      source: "manual",
      confidence: 0.5,
    };

    try {
      const priceResult = await searchNewPrice(identity);
      if (priceResult.priceEUR !== null) {
        referenceNewValueEur = priceResult.priceEUR;
        priceNewSource = priceResult.source;
        priceNewFetchedAt = new Date().toISOString();

        if (priceResult.confidence === "exact") {
          priceNewConfidence = "verified";
          confidenceScore = 0.9;
        } else if (priceResult.confidence === "equivalent") {
          priceNewConfidence = "equivalent";
          confidenceScore = 0.65;
        } else {
          priceNewConfidence = "manual_admin";
          confidenceScore = 0.0;
        }
      }
    } catch {
      referenceNewValueEur = null;
      priceNewSource = "erreur_réseau";
      confidenceScore = 0;
    }

    // Fallback : prix neuf saisi manuellement par le vendeur
    if (referenceNewValueEur === null && data.manualNewPriceEur && data.manualNewPriceEur > 0) {
      referenceNewValueEur = data.manualNewPriceEur;
      priceNewSource = data.manualSourceUrl ?? "manuel_vendeur";
      priceNewConfidence = "manual_admin";
      priceNewFetchedAt = new Date().toISOString();
      confidenceScore = 0; // toujours pending_price_review pour un prix manuel
    }

    // La règle de cotation s'applique TOUJOURS si on a un prix neuf —
    // qu'il soit trouvé automatiquement ou renseigné manuellement.
    // `pendingPriceReview` concerne la vérification de la SOURCE du prix, pas le calcul.
    pendingPriceReview = confidenceScore < CONFIDENCE_THRESHOLD_AUTO;

    if (referenceNewValueEur !== null) {
      if (data.mode === "particulier") {
        // SÉCURITÉ : la majoration de garantie ne peut être accordée que sur
        // justificatif vérifié par un administrateur.
        const pricing = computeP2P(
          {
            referenceNewValue: referenceNewValueEur,
            category: data.category as Parameters<typeof computeP2P>[0]["category"],
            ageYears: data.ageYears,
            condition: data.condition as Parameters<typeof computeP2P>[0]["condition"],
            verifiedWarrantyDaysLeft: null, // jamais accordé automatiquement
          },
          defaultP2PConfig,
        );
        maxPriceEur = pricing.maxPrice;
      } else if (data.mode === "pro") {
        const pricing = computePro(
          {
            referenceValueHT: referenceNewValueEur,
            category: data.category,
            stockAgeYears: data.ageYears,
            condition: data.condition,
            quantity: data.quantity ?? 1,
          },
          defaultProConfig,
        );
        maxPriceEur = pricing.maxPrice;
      } else if (data.mode === "vehicule") {
        const pricing = computeVehicle(
          {
            referenceValue: referenceNewValueEur,
            type: data.category,
            ageYears: data.ageYears,
            km: data.km ?? 0,
            condition: data.condition,
          },
          defaultVehicleConfig,
        );
        maxPriceEur = pricing.maxPrice;
      }
    }

    // Vérification du plafond pour les ventes uniquement
    if (maxPriceEur !== null && data.askedPriceEur !== undefined && data.askedPriceEur > maxPriceEur) {
      return {
        ok: false,
        error: `Le prix demandé (${data.askedPriceEur.toFixed(2)} €) dépasse le plafond autorisé (${maxPriceEur.toFixed(2)} €). La marketplace « Moins que rien » interdit la vente au-dessus du prix calculé.`,
        code: "price_cap_exceeded",
      };
    }
  }

  const listingStatus = pendingPriceReview ? "pending_price_review" : "pending_review";

  const { data: inserted, error: dbError } = await supabaseAdmin
    .from("listings")
    .insert({
      seller_id: userId,
      association_id: data.associationId ?? null,
      mode: data.mode,
      status: listingStatus,
      title: data.title.trim(),
      description: data.description?.trim() ?? null,
      category: data.category,
      condition: data.condition,
      age_years: data.ageYears,
      ean: data.ean ?? null,
      reference: data.reference ?? null,
      reference_new_value_eur: referenceNewValueEur,
      price_new_source: priceNewSource,
      price_new_confidence: priceNewConfidence,
      price_new_fetched_at: priceNewFetchedAt,
      max_price_eur: maxPriceEur,
      asked_price_eur:
        data.mode === "don" || data.mode === "don_association"
          ? 0
          : (data.askedPriceEur ?? null),
      warranty_days: data.verifiedWarrantyDaysLeft ?? 0,
    })
    .select("id")
    .single();

  if (dbError || !inserted) {
    return { ok: false, error: "Erreur lors de l'enregistrement. Veuillez réessayer.", code: "db" };
  }

  if (data.mode === "don" || data.mode === "don_association") {
    await supabaseAdmin.from("donations").insert({
      listing_id: inserted.id,
      association_id: data.mode === "don_association" ? (data.associationId ?? null) : null,
      status: "open",
    });
  }

  return { ok: true, listingId: inserted.id, maxPriceEur, pendingPriceReview };
}

// Server Function (wrapper TanStack Start) ------------------------------------

export const submitListingFn = createServerFn({
  method: "POST",
})
  .validator((data: SubmitListingInput) => data)
  .handler(async ({ data }): Promise<SubmitListingResult> => {
    // 1. Vérifier l'authentification
    // getRequestHeader() lit les headers HTTP de la requête courante via l'AsyncLocalStorage
    // de TanStack Start — c'est l'API correcte pour TanStack Start v1.168+.
    const authHeader = getRequestHeader("authorization");

    // Protéger contre une clé SERVICE_ROLE manquante en production :
    // getSupabaseAdmin() throw si SUPABASE_SERVICE_ROLE_KEY n'est pas défini.
    // Sans ce try/catch, l'exception remonte dans TanStack Start qui renvoie un 500
    // brut — le client le perçoit comme "erreur réseau" sans aucun message utile.
    let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
    try {
      supabaseAdmin = getSupabaseAdmin();
    } catch {
      console.error("[submit-listing] SUPABASE_SERVICE_ROLE_KEY manquant ou invalide.");
      return {
        ok: false,
        error: "Le serveur n'est pas encore configuré pour enregistrer des annonces. Contactez l'administrateur.",
        code: "db",
      };
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(
      authHeader?.replace("Bearer ", "") ?? "",
    );

    if (authError || !user) {
      return {
        ok: false,
        error: "Vous devez être connecté pour déposer une annonce.",
        code: "auth",
      };
    }

    return processListingSubmission(data, user.id, supabaseAdmin);
  });

