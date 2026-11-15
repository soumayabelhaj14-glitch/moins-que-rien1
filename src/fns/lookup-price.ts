/**
 * Server function : recherche du prix neuf + calcul du plafond.
 *
 * Appelée par le formulaire /deposer dès que l'utilisateur saisit un EAN,
 * une référence ou modifie les paramètres de son annonce.
 *
 * SÉCURITÉ :
 *   - Le plafond est calculé ici, côté serveur, à partir du prix neuf trouvé
 *     automatiquement OU du prix manuel fourni par l'utilisateur.
 *   - Un prix manuel déclenche toujours un `pending_price_review` : un admin
 *     valide le prix avant publication.
 *   - L'UI affiche le plafond indicatif mais le plafond DÉFINITIF est recalculé
 *     par `submitListingFn` au moment de la soumission réelle.
 */

import { createServerFn } from "@tanstack/react-start";
import { searchNewPrice } from "@/lib/product-lookup/price-search";
import type { ProductIdentity } from "@/lib/product-lookup/types";
import { computeP2P, defaultP2PConfig } from "@/lib/pricing/p2p";
import { computePro, defaultProConfig } from "@/lib/pricing/pro";
import { computeVehicle, defaultVehicleConfig } from "@/lib/pricing/vehicle";

// ── Seuil identique à submit-listing.ts ──────────────────────────────────────
const CONFIDENCE_THRESHOLD_AUTO = 0.6;

export type LookupPriceInput = {
  // Identification du produit
  ean?: string;
  reference?: string;
  title?: string;

  // Prix saisi manuellement par le vendeur (en €, TTC)
  manualPriceEur?: number;
  manualSourceUrl?: string; // URL complète ou nom du site (ex: "Amazon")

  // Paramètres nécessaires au calcul du plafond
  mode: "particulier" | "pro" | "vehicule" | "don" | "don_asso";
  category: string;
  condition: string;
  ageYears: number;
  quantity?: number;
  km?: number;
};

export type LookupPriceResult =
  | {
      ok: true;
      /** Nom du produit identifié (si trouvé automatiquement). */
      productName: string | null;
      /** Prix neuf retenu (auto ou manuel). */
      priceEUR: number;
      /** Nom lisible de la source ("Amazon", "Fnac", "darty.com"…). */
      source: string;
      /** URL complète vers la fiche produit (si disponible). */
      sourceUrl: string | null;
      /** Niveau de confiance. "manual" = prix renseigné par le vendeur. */
      confidence: "exact" | "equivalent" | "manual";
      /** Plafond calculé (null pour les dons). */
      maxPriceEur: number | null;
      /** L'annonce devra être validée par un admin avant publication. */
      pendingPriceReview: boolean;
      /** Message d'avertissement si confiance insuffisante. */
      warningMessage: string | null;
    }
  | {
      ok: false;
      reason:
        | "missing_input"
        | "price_not_found"
        | "network_error";
      message: string;
    };

/** Extrait un nom de site lisible depuis une URL (ex: https://www.fnac.com/… → "Fnac"). */
function sourceName(raw: string): string {
  try {
    const hostname = new URL(raw).hostname.replace(/^www\./, "");
    const domain = hostname.split(".")[0] ?? hostname;
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    // `raw` est déjà un nom (ex: "EAN Database", "manual")
    return raw;
  }
}

/** Vérifie si une chaîne est une URL absolue valide. */
function isUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

export const lookupPriceFn = createServerFn({
  method: "POST",
})
  .validator((data: LookupPriceInput) => data)
  .handler(async ({ data }): Promise<LookupPriceResult> => {
    // ── 0. Dons : pas de calcul de plafond ──────────────────────────────────
    if (data.mode === "don" || data.mode === "don_asso") {
      return {
        ok: true,
        productName: null,
        priceEUR: 0,
        source: "don_gratuit",
        sourceUrl: null,
        confidence: "manual",
        maxPriceEur: 0,
        pendingPriceReview: false,
        warningMessage: null,
      };
    }

    // ── 1. Source du prix neuf ───────────────────────────────────────────────
    let priceEUR: number | null = null;
    let source = "";
    let sourceUrl: string | null = null;
    let confidence: "exact" | "equivalent" | "manual" = "manual";
    let confidenceScore = 0;
    let productName: string | null = null;
    let warningMessage: string | null = null;

    // 1a. Prix saisi manuellement → priorité si aucun EAN/référence n'est fourni,
    //     ou si le vendeur a explicitement renseigné une valeur.
    const hasAutoIdentifier = !!(data.ean?.trim() || data.reference?.trim() || data.title?.trim());

    if (hasAutoIdentifier) {
      // 1b. Recherche automatique
      const identity: ProductIdentity = {
        name: data.title ?? data.reference ?? "",
        brand: "",
        model: data.reference ?? data.title ?? "",
        variant: null,
        ean: data.ean?.trim() || null,
        categoryId: data.category,
        source: "manual",
        confidence: 0.5,
      };

      try {
        const priceResult = await searchNewPrice(identity);
        if (priceResult.priceEUR !== null) {
          priceEUR = priceResult.priceEUR;
          source = priceResult.source;
          sourceUrl = isUrl(priceResult.source) ? priceResult.source : null;
          warningMessage = priceResult.warningMessage ?? null;

          if (priceResult.confidence === "exact") {
            confidence = "exact";
            confidenceScore = 0.9;
          } else if (priceResult.confidence === "equivalent") {
            confidence = "equivalent";
            confidenceScore = 0.65;
          } else {
            confidence = "manual";
            confidenceScore = 0.0;
          }
        }
      } catch {
        // Silencieux : fallback vers le prix manuel si disponible
      }
    }

    // 1c. Fallback : prix manuel fourni par le vendeur
    if (priceEUR === null && data.manualPriceEur && data.manualPriceEur > 0) {
      priceEUR = data.manualPriceEur;
      confidence = "manual";
      confidenceScore = 0;
      source = data.manualSourceUrl
        ? sourceName(data.manualSourceUrl)
        : "Renseigné par le vendeur";
      sourceUrl = data.manualSourceUrl && isUrl(data.manualSourceUrl)
        ? data.manualSourceUrl
        : null;
      warningMessage = "Prix renseigné manuellement. Un administrateur devra valider cette valeur avant publication.";
    }

    // 1d. Toujours utiliser le prix manuel si explicitement fourni
    //     (l'auto-lookup est en complément, pas en remplacement si le vendeur a rempli le champ)
    if (data.manualPriceEur && data.manualPriceEur > 0) {
      priceEUR = data.manualPriceEur;
      confidence = "manual";
      confidenceScore = 0;
      const manualSrc = data.manualSourceUrl ?? "";
      source = manualSrc ? sourceName(manualSrc) : "Renseigné par le vendeur";
      sourceUrl = manualSrc && isUrl(manualSrc) ? manualSrc : null;
      warningMessage = "Prix renseigné manuellement. Un administrateur devra valider cette valeur avant publication.";
    }

    if (priceEUR === null) {
      return {
        ok: false,
        reason: "price_not_found",
        message: hasAutoIdentifier
          ? "Aucun prix neuf trouvé automatiquement. Renseignez le prix manuellement."
          : "Renseignez un EAN, une référence ou un prix neuf manuel pour calculer le plafond.",
      };
    }

    // ── 2. Calcul du plafond (côté serveur uniquement) ───────────────────────
    const autoApproved = confidenceScore >= CONFIDENCE_THRESHOLD_AUTO;
    const pendingPriceReview = !autoApproved;

    let maxPriceEur: number | null = null;

    if (autoApproved) {
      try {
        if (data.mode === "particulier") {
          const r = computeP2P(
            {
              referenceNewValue: priceEUR,
              category: data.category as Parameters<typeof computeP2P>[0]["category"],
              ageYears: data.ageYears,
              condition: data.condition as Parameters<typeof computeP2P>[0]["condition"],
              verifiedWarrantyDaysLeft: null,
            },
            defaultP2PConfig,
          );
          maxPriceEur = r.maxPrice;
        } else if (data.mode === "pro") {
          const r = computePro(
            {
              referenceValueHT: priceEUR,
              category: data.category,
              stockAgeYears: data.ageYears,
              condition: data.condition,
              quantity: data.quantity ?? 1,
            },
            defaultProConfig,
          );
          maxPriceEur = r.maxPrice;
        } else if (data.mode === "vehicule") {
          const r = computeVehicle(
            {
              referenceValue: priceEUR,
              type: data.category,
              ageYears: data.ageYears,
              km: data.km ?? 0,
              condition: data.condition,
            },
            defaultVehicleConfig,
          );
          maxPriceEur = r.maxPrice;
        }
      } catch {
        maxPriceEur = null;
      }
    }

    return {
      ok: true,
      productName: productName ?? null,
      priceEUR,
      source: source || "Inconnu",
      sourceUrl,
      confidence,
      maxPriceEur,
      pendingPriceReview,
      warningMessage,
    };
  });
