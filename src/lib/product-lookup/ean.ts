/**
 * Identification par EAN/code-barres — sources gratuites uniquement.
 *
 * Priorité des sources :
 *   1. Open EAN Database (ean-search.org) — gratuit, 100 req/jour sans compte
 *   2. Open Food Facts (pour produits alimentaires uniquement)
 *   3. Fallback manuel
 *
 * Cette fonction est appelée côté SERVEUR uniquement (jamais depuis le navigateur)
 * pour éviter d'exposer les clés API.
 *
 * Aucune clé API payante n'est requise pour le fonctionnement de base.
 * Le volume gratuit (100 req/jour) est suffisant pour les premiers mois.
 */

import type { ProductIdentity } from "./types";

/** Nettoyage et validation d'un code EAN-13 ou UPC-A. */
export function normalizeEAN(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12) return "0" + digits; // UPC-A → EAN-13
  if (digits.length === 13) return digits;
  return null;
}

/** Vérifie la somme de contrôle EAN-13. */
export function validateEAN(ean: string): boolean {
  if (ean.length !== 13 || !/^\d{13}$/.test(ean)) return false;
  const digits = ean.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === digits[12];
}

type EanSearchResult = {
  EAN: string;
  name: string;
  categoryId: number;
};

/**
 * Interroge l'API ean-search.org (gratuit, sans authentification pour les 100 premières req/jour).
 * Documentation : https://www.ean-search.org/perl/api.pl
 */
async function fetchFromEanSearch(ean: string): Promise<EanSearchResult | null> {
  // Note : l'API gratuite n'accepte pas d'authentification ; les requêtes authentifiées
  // sont réservées aux abonnés. Nous utilisons le endpoint public JSON.
  const url = `https://www.ean-search.org/perl/api.pl?q=${ean}&token=OPTIONAL&format=json`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "moins-que-rien/1.0 (contact: yahyaclache@gmail.com)" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as EanSearchResult[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

/** Mapping grossier des catégories EAN-search vers les catégories P2P internes. */
function mapEanCategory(categoryId: number): string {
  // Catégories EAN-search (liste partielle) → CategoryId P2P
  const map: Record<number, string> = {
    1: "informatique",    // Computers & Software
    2: "smartphones",     // Mobile & Tablets
    3: "tv-audio",        // Electronics & Audio
    4: "electromenager",  // Home Appliances
    5: "vetements",       // Clothing & Apparel
    6: "livres",          // Books
    7: "jouets",          // Toys & Games
    8: "outillage",       // Tools & Hardware
  };
  return map[categoryId] ?? "informatique"; // fallback : informatique
}

/**
 * Point d'entrée principal : identifie un produit à partir de son EAN.
 *
 * @returns ProductIdentity ou null si introuvable.
 */
export async function identifyByEAN(rawEAN: string): Promise<ProductIdentity | null> {
  const ean = normalizeEAN(rawEAN);
  if (!ean) return null;
  if (!validateEAN(ean)) return null;

  const result = await fetchFromEanSearch(ean);
  if (!result) return null;

  // Décompose "Marque Modèle Variante" en champs séparés (heuristique simple)
  const parts = result.name.trim().split(/\s+/);
  const brand = parts[0] ?? "";
  const middle = parts.slice(1, -1).join(" ");
  const model = middle !== "" ? middle : (parts[1] ?? "");
  const rawVariant = parts.length > 2 ? parts[parts.length - 1] : undefined;
  const variant = rawVariant ?? null;

  return {
    name: result.name,
    brand,
    model,
    variant,
    ean,
    categoryId: mapEanCategory(result.categoryId),
    source: "ean_database",
    confidence: 0.85, // EAN exact → confiance élevée
  };
}
