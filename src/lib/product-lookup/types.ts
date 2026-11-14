/**
 * Types partagés pour l'identification produit et la recherche de prix neuf.
 *
 * Flux : référence/EAN/photo → ProductIdentity → NewPriceResult → computeP2P()
 */

/** Résultat de l'identification d'un produit. */
export type ProductIdentity = {
  /** Référence normalisée : marque + modèle + variante exacte. */
  name: string;
  brand: string;
  model: string;
  /** Variante précise (couleur, capacité, génération…). Null si non déterminée. */
  variant: string | null;
  /** EAN/GTIN si disponible. */
  ean: string | null;
  /** Catégorie P2P correspondante. */
  categoryId: string;
  /** Source de l'identification. */
  source: "ean_database" | "open_library" | "manual" | "vision_api";
  /** Niveau de confiance de 0 à 1. En dessous de 0.6 : demander confirmation. */
  confidence: number;
};

/** Résultat de la recherche de prix neuf. */
export type NewPriceResult = {
  /** Prix neuf en euros. Null si introuvable. */
  priceEUR: number | null;
  /** Source du prix (URL ou nom de source). */
  source: string;
  /** Date de la consultation (ISO 8601). */
  fetchedAt: string;
  /** Devise d'origine (si conversion effectuée). */
  originalCurrency?: string;
  /** Prix dans la devise d'origine. */
  originalPrice?: number;
  /** Niveau de confiance : "exact" = produit identique, "equivalent" = équivalent documenté, "manual" = à vérifier. */
  confidence: "exact" | "equivalent" | "manual";
  /** Message affiché à l'utilisateur si la confiance est insuffisante. */
  warningMessage?: string;
};

/** Résultat consolidé renvoyé au formulaire de dépôt. */
export type LookupResult =
  | {
      ok: true;
      identity: ProductIdentity;
      price: NewPriceResult;
    }
  | {
      ok: false;
      /** Raison de l'échec : identification impossible ou prix introuvable. */
      reason: "identification_failed" | "price_not_found" | "low_confidence" | "network_error";
      message: string;
      /** Résultat partiel disponible (ex : identité trouvée mais pas le prix). */
      partial?: { identity?: ProductIdentity; price?: NewPriceResult };
    };
