/**
 * Point d'entrée public du module d'identification produit.
 *
 * Usage :
 *   import { lookupByReference } from "@/lib/product-lookup";
 *   const result = await lookupByReference("iPhone 14 128GB");
 *   if (result.ok) { /* utiliser result.identity et result.price *\/ }
 *
 * Ce module fonctionne côté SERVEUR uniquement (TanStack Start server functions).
 * Ne pas importer depuis un composant client.
 */

export { normalizeEAN, validateEAN, identifyByEAN } from "./ean";
export { searchNewPrice } from "./price-search";
export type { ProductIdentity, NewPriceResult, LookupResult } from "./types";

import { identifyByEAN, normalizeEAN } from "./ean";
import { searchNewPrice } from "./price-search";
import type { LookupResult, ProductIdentity } from "./types";

/**
 * Identification par référence textuelle libre (nom de modèle, numéro de série…).
 * Utilisé quand l'utilisateur saisit une référence sans scanner de code-barres.
 *
 * Version actuelle : retourne une identité partielle (saisie manuelle confirmée).
 * Version future : connecter un modèle de vision ou un catalogue de références.
 */
async function identifyByTextReference(reference: string): Promise<ProductIdentity> {
  // Heuristique simple : on découpe la référence en marque + modèle
  const parts = reference.trim().split(/\s+/);
  return {
    name: reference.trim(),
    brand: parts[0] ?? "",
    model: parts.slice(1).join(" "),
    variant: null,
    ean: null,
    categoryId: "informatique", // catégorie par défaut, corrigée par l'utilisateur
    source: "manual",
    confidence: 0.5, // confiance modérée : à confirmer par l'utilisateur
  };
}

/**
 * Flux principal : identifie un produit à partir d'un EAN ou d'une référence textuelle,
 * puis recherche son prix neuf.
 *
 * @param input.ean        — Code EAN/UPC scanné (prioritaire si fourni)
 * @param input.reference  — Référence textuelle libre (nom de modèle)
 */
export async function lookupProduct(input: {
  ean?: string;
  reference?: string;
}): Promise<LookupResult> {
  let identity: ProductIdentity | null = null;

  // 1. Identification par EAN (prioritaire, plus fiable)
  if (input.ean) {
    const ean = normalizeEAN(input.ean);
    if (!ean) {
      return {
        ok: false,
        reason: "identification_failed",
        message: `Le code-barres « ${input.ean} » n'est pas un EAN-13 valide.`,
      };
    }
    identity = await identifyByEAN(ean);
  }

  // 2. Fallback : identification par référence textuelle
  if (!identity && input.reference) {
    identity = await identifyByTextReference(input.reference);
  }

  if (!identity) {
    return {
      ok: false,
      reason: "identification_failed",
      message: "Produit non identifié. Fournissez un code-barres ou une référence exacte (marque, modèle, variante).",
    };
  }

  // 3. Alerte si confiance insuffisante
  if (identity.confidence < 0.6) {
    return {
      ok: false,
      reason: "low_confidence",
      message: `Identification incertaine (confiance ${Math.round(identity.confidence * 100)} %). Confirmez le produit avant de continuer.`,
      partial: { identity },
    };
  }

  // 4. Recherche du prix neuf
  const price = await searchNewPrice(identity);

  return { ok: true, identity, price };
}
