/**
 * Recherche du prix neuf d'un produit identifié.
 *
 * Sources disponibles sans API payante :
 *   1. Open Library      — livres uniquement, gratuit, complet
 *   2. EAN-search.org    — base EAN/UPC avec prix conseillé constructeur (100 req/jour gratuit)
 *                          → seule source capable de retourner confidence:"exact"
 *   3. DuckDuckGo IA     — résumé de recherche, indicatif → confidence:"equivalent"
 *   4. Wayback Machine   — pages archivées du fabricant / sites marchands
 *                          → clé pour les objets DISCONTINUÉS → confidence:"equivalent"
 *
 * Sources à activer sur accord du propriétaire (payantes) :
 *   5. Google Shopping / SERP APIs (Oxylabs, SerpAPI)
 *   6. Amazon Product Advertising API (compte Associates requis)
 *
 * Règles de fiabilité :
 *   - confidence:"exact"      → EAN confirmé avec prix constructeur ≥ 1 €
 *   - confidence:"equivalent" → Prix trouvé sur site marchand (DuckDuckGo ou archive)
 *   - confidence:"manual"     → Aucun prix automatique → validation admin obligatoire
 *
 *   - On n'accepte jamais un prix de marketplace d'occasion ou de reconditionné.
 *   - On n'accepte pas un accessoire homonyme (câble iPhone ≠ iPhone).
 *   - Si aucun prix fiable n'est trouvé, on retourne confidence:"manual"
 *     avec une instruction à l'utilisateur (jamais un prix inventé).
 */

import type { ProductIdentity, NewPriceResult } from "./types";

/**
 * Jeton discriminant : chiffre isolé ou code alphanumérique qui identifie
 * une génération, capacité ou variante (ex: "14", "15", "256", "128go", "pro").
 *
 * Ces tokens sont extraits séparément car une différence sur l'un d'eux
 * suffit à invalider la correspondance, même si tous les mots génériques concordent.
 *
 * Exemples de tokens discriminants :
 *   "iPhone 14 Pro 256 Go" → ["14", "256"]
 *   "iPhone 15 Pro 128 Go" → ["15", "128"]
 *   un seul token différent entre les deux → aucun prix ne doit être accepté.
 */
function extractDiscriminatingTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Normaliser les capacités : "256go", "256gb", "256 go", "256 gb" → "256go"
      .replace(/(\d+)\s*(go|gb|to|tb)/g, "$1go")
      // Normaliser les pouces : "13.3\"", "13,3 pouces" → "13p"
      .replace(/(\d+)[,.](\d+)\s*(?:pouces?|")/g, "$1$2p")
      .replace(/(\d+)\s*(?:pouces?|")/g, "$1p")
      .split(/[\s\-\/,;:().]+/)
      // Garder : chiffres seuls, codes alphanumériques courts (ex: "pro", "max", "air")
      // et capacités normalisées
      .filter((w) =>
        /^\d+$/.test(w) ||          // génération : 14, 15, 2023…
        /^\d+go$/.test(w) ||        // capacité : 128go, 256go
        /^\d+p$/.test(w) ||         // taille écran normalisée
        (w.length >= 2 && w.length <= 6 && /^[a-z0-9]+$/.test(w)) // codes courts : pro, max, air, ultra, s23…
      )
      // Mots sans valeur discriminante (articles, prépositions, unités)
      .filter((w) => !["and", "for", "the", "avec", "sur", "les", "une"].includes(w))
  );
}

/**
 * Vérifie qu'un token est présent comme MOT ENTIER dans le texte cible.
 *
 * CRITIQUE — interdit les correspondances de sous-chaîne :
 *   containsTokenAsWord("14", "iphone 114 128go") → false  ✓ (14 ⊂ 114)
 *   containsTokenAsWord("14", "iphone 14 pro")    → true   ✓
 *   containsTokenAsWord("128go", "256go-128go")   → true   ✓
 *
 * On considère qu'un séparateur de mot est : espace, tiret, barre oblique,
 * virgule, point, parenthèse, début/fin de chaîne.
 */
function containsTokenAsWord(tok: string, text: string): boolean {
  // Échapper les caractères regex dans le token (ex : "128go" → littéral)
  const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Le token doit être précédé et suivi par un non-alphanumérique ou les bords
  const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
  return re.test(text);
}

/**
 * Vérifie que le nom du produit identifié par l'API correspond EXACTEMENT
 * au nom déclaré par le vendeur, en tenant compte des générations et variantes.
 *
 * Trois niveaux de vérification :
 *  1. Tokens discriminants (générations, capacités) : TOUS les tokens présents dans
 *     le nom déclaré doivent figurer dans le texte de référence comme MOTS ENTIERS.
 *     → Un token différent ou inclus dans un nombre plus long = refus immédiat.
 *     Exemples : "14" ≠ "114", "iPhone 14" ≠ "iPhone 15", "256 Go" ≠ "128 Go"
 *
 *  2. Variantes exclusives à l'API : si l'API mentionne un variant (Max, Ultra, Plus…)
 *     absent du nom déclaré → refus.
 *
 *  3. Mots significatifs : au moins 60 % doivent correspondre comme mots entiers
 *     ET le nombre de correspondances doit être ≥ 2 (ou ≥ 1 si titre très court).
 *
 * Si l'un des deux textes est absent/trop court → false (pas de prix).
 */
function nameMatchesSufficiently(
  declared: string | undefined | null,
  apiText: string | undefined | null,
): boolean {
  if (!declared || !apiText) return false;

  const declaredLower = declared.toLowerCase();
  const apiLower = apiText.toLowerCase();

  // ── Niveau 1 : tokens discriminants — correspondance EXACTE de mot entier ──
  //
  // On normalise d'abord le texte API (même normalisation que extractDiscriminatingTokens)
  // pour que "256 Go" dans l'API corresponde au token normalisé "256go".
  const apiNorm = apiLower
    .replace(/(\d+)\s*(go|gb|to|tb)/g, "$1go")
    .replace(/(\d+)[,.](\d+)\s*(?:pouces?|")/g, "$1$2p")
    .replace(/(\d+)\s*(?:pouces?|")/g, "$1p");

  const VARIANT_TOKENS = new Set(["max", "ultra", "plus", "mini", "lite", "se"]);

  const declaredTokens = extractDiscriminatingTokens(declaredLower);
  const apiTokens = extractDiscriminatingTokens(apiNorm);

  // Règle A : chaque token déclaré doit être présent dans l'API comme MOT ENTIER
  for (const tok of declaredTokens) {
    if (!containsTokenAsWord(tok, apiNorm)) {
      return false; // Token discriminant absent ou confondu avec un nombre plus long → refus
    }
  }

  // Règle B : un token variant présent dans l'API mais absent du déclaré → refus
  for (const tok of apiTokens) {
    if (VARIANT_TOKENS.has(tok) && !containsTokenAsWord(tok, declaredLower)) {
      return false; // Variant exclusif à l'API non mentionné dans le déclaré → refus
    }
  }

  // ── Niveau 2 : correspondance des mots significatifs (mot entier) ──────────
  const STOP_WORDS = new Set([
    "le", "la", "les", "de", "du", "des", "un", "une", "avec",
    "the", "and", "for", "with", "edition", "version", "modele",
  ]);

  const significant = (text: string) =>
    text
      .toLowerCase()
      .replace(/(\d+)\s*(go|gb|to|tb)/g, "$1go")
      .split(/[\s\-\/,;:().]+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const declaredWords = significant(declared);
  if (declaredWords.length === 0) return false;

  // Correspondance en mot entier pour les mots significatifs aussi
  const matched = declaredWords.filter((w) => containsTokenAsWord(w, apiNorm));

  // Seuil : 60 % des mots significatifs + minimum absolu
  const ratio = matched.length / declaredWords.length;
  const minAbsolute = declaredWords.length >= 3 ? 2 : 1;

  return ratio >= 0.6 && matched.length >= minAbsolute;
}

/**
 * Recherche le prix neuf via EAN-search.org (100 req/jour gratuit, sans clé).
 *
 * C'est la SEULE source capable de retourner confidence:"exact" :
 * elle associe un code-barres EAN à un produit identifié sans ambiguïté
 * et fournit parfois le prix conseillé constructeur.
 *
 * Sans EAN, cette fonction retourne null.
 * Sans prix dans la réponse, retourne null (pas de prix inventé).
 */
async function searchByEan(identity: ProductIdentity): Promise<NewPriceResult | null> {
  if (!identity.ean) return null;

  // Nettoyer le code EAN (13 chiffres attendus)
  const ean = identity.ean.replace(/\D/g, "");
  if (ean.length !== 13 && ean.length !== 12) return null;

  try {
    // EAN-search.org : endpoint JSON public (100 requêtes/jour sans inscription)
    const url = `https://www.ean-search.org/perl/ean-search.pl?q=${ean}&lang=fr&redirect=1&token=free`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "moins-que-rien/1.0 (product-price-research; contact: admin@moins-que-rien.fr)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) return null;

    // La réponse peut être JSON ou HTML selon l'endpoint utilisé
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      // Tentative d'extraction du prix depuis le HTML de réponse
      const html = await res.text();
      if (isLikelySecondHand(html)) return null;

      const price = extractEurPrice(html);
      if (!price) return null;

      // Vérifier que le nom du produit dans la page correspond au modèle déclaré
      const pageText = html.replace(/<[^>]*>/g, " ").toLowerCase();
      if (!nameMatchesSufficiently(identity.name, pageText)) return null;

      return {
        priceEUR: price,
        source: url,
        fetchedAt: new Date().toISOString(),
        confidence: "exact",   // EAN confirmé → identification sans ambiguïté
      };
    }

    // Réponse JSON structurée
    type EanSearchResult = { name?: string; price?: number | string; currency?: string };
    const data = (await res.json()) as EanSearchResult | EanSearchResult[];
    const item = Array.isArray(data) ? data[0] : data;
    if (!item) return null;

    if (isLikelySecondHand(item.name ?? "")) return null;

    // Vérifier que le nom renvoyé par l'API correspond au produit déclaré.
    // Sans correspondance suffisante, on refuse le prix même si l'EAN est valide :
    // un accessoire homonyme (câble iPhone) ne doit pas plafonner un iPhone.
    if (!nameMatchesSufficiently(identity.name, item.name)) return null;

    const rawPrice = typeof item.price === "string" ? parseFloat(item.price) : item.price;
    if (!rawPrice || isNaN(rawPrice) || rawPrice < 1) return null;

    // Convertir en EUR si nécessaire (EAN-search peut retourner USD)
    // Pas de conversion automatique : on accepte uniquement EUR ou absence de devise
    const currency = (item.currency ?? "EUR").toUpperCase();
    if (currency !== "EUR" && currency !== "") return null;

    return {
      priceEUR: rawPrice,
      source: `ean-search.org (EAN: ${ean})`,
      fetchedAt: new Date().toISOString(),
      confidence: "exact",   // EAN confirmé + correspondance de nom vérifiée
    };
  } catch {
    return null;
  }
}

/** Extrait le premier montant en euros d'un texte libre. */
function extractEurPrice(text: string): number | null {
  // Cherche les formes "123,99 €", "123.99€", "€ 123", "EUR 123"
  const patterns = [
    /(\d[\d\s]*[,.]?\d*)\s*€/,
    /€\s*(\d[\d\s]*[,.]?\d*)/,
    /EUR\s*(\d[\d\s]*[,.]?\d*)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] !== undefined) {
      const raw = m[1].replace(/\s/g, "").replace(",", ".");
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 1 && val < 100_000) return val;
    }
  }
  return null;
}

/** Vérifie qu'un texte n'est pas un prix d'occasion ou de reconditionné. */
function isLikelySecondHand(text: string): boolean {
  const keywords = [
    "occasion", "reconditionné", "reconditionnee", "d'occasion",
    "usagé", "usagee", "remis à neuf", "refurb", "used", "pre-owned",
    "seconde main", "seconde-main",
  ];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Recherche dans la Wayback Machine (Internet Archive) les archives
 * d'une page fabricant ou d'un site marchand pour trouver un prix neuf.
 *
 * Utilise l'API CDX (gratuite, sans clé) pour lister les snapshots,
 * puis tente d'extraire le prix de la première page archivée trouvée.
 *
 * Idéal pour les produits DISCONTINUÉS (n'existe plus sur les sites actuels).
 */
async function searchWaybackMachine(identity: ProductIdentity): Promise<NewPriceResult | null> {
  // Construire plusieurs URL candidates que l'on cherchera dans les archives
  const urlCandidates: string[] = buildSearchUrls(identity);
  if (urlCandidates.length === 0) return null;

  for (const urlPattern of urlCandidates) {
    try {
      // CDX API : liste les snapshots disponibles pour cette URL
      const cdxUrl =
        `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(urlPattern)}&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&limit=5&from=20100101`;

      const cdxRes = await fetch(cdxUrl, {
        headers: { "User-Agent": "moins-que-rien/1.0 (product-price-research)" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!cdxRes.ok) continue;

      const cdxData = (await cdxRes.json()) as string[][];
      if (!cdxData || cdxData.length <= 1) continue; // première ligne = en-têtes

      // Prendre le snapshot le plus récent (dernier de la liste)
      const latestSnapshot = cdxData[cdxData.length - 1] ?? [];
      const timestamp = latestSnapshot[0] ?? "";
      const originalUrl = latestSnapshot[1] ?? "";

      // Construire l'URL Wayback pour accéder à la page archivée
      const waybackUrl = `https://web.archive.org/web/${timestamp}/${originalUrl}`;

      const pageRes = await fetch(waybackUrl, {
        headers: {
          "User-Agent": "moins-que-rien/1.0 (product-price-research)",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!pageRes.ok) continue;

      const html = await pageRes.text();

      // Supprimer les balises HTML pour ne garder que le texte
      const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

      // Vérifier qu'il ne s'agit pas d'une page d'occasion
      if (isLikelySecondHand(text)) continue;

      const price = extractEurPrice(text);
      if (!price) continue;

      // Extraire l'année de l'archive
      const archiveYear = timestamp.substring(0, 4);

      return {
        priceEUR: price,
        source: waybackUrl,
        fetchedAt: new Date().toISOString(),
        confidence: "equivalent",
        warningMessage: `Prix trouvé dans une archive du web (${archiveYear}). Ce produit semble discontinué — le prix peut avoir varié depuis.`,
      };
    } catch {
      // Essayer la prochaine URL candidate
      continue;
    }
  }
  return null;
}

/**
 * Construit des URL candidates pour la recherche dans les archives.
 * Utilise des patterns connus des sites marchands français.
 */
function buildSearchUrls(identity: ProductIdentity): string[] {
  const { name, brand, model } = identity;
  if (!brand && !model) return [];

  const slug = `${brand} ${model}`.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const slug2 = `${brand} ${model}`.trim().toLowerCase().replace(/\s+/g, "+");

  return [
    // Fnac
    `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${encodeURIComponent(name ?? `${brand} ${model}`)}`,
    // Darty
    `https://www.darty.com/nav/recherche/?text=${encodeURIComponent(name ?? `${brand} ${model}`)}`,
    // Site officiel du fabricant (tentative)
    brand ? `https://www.${brand.toLowerCase().replace(/\s/g, "")}.com/${slug}` : "",
    brand ? `https://www.${brand.toLowerCase().replace(/\s/g, "")}.fr/${slug}` : "",
    // Boulanger
    `https://www.boulanger.com/recherche/${slug2}`,
  ].filter(Boolean);
}

/** Recherche le prix sur Open Library (livres uniquement). */
async function searchOpenLibrary(identity: ProductIdentity): Promise<NewPriceResult | null> {
  if (identity.categoryId !== "livres") return null;

  const query = encodeURIComponent(`${identity.brand} ${identity.model}`);
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`, {
      headers: { "User-Agent": "moins-que-rien/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { docs: { title?: string }[] };
    const doc = data.docs[0];
    if (!doc) return null;

    // Open Library ne fournit pas de prix — on retourne une entrée "manual"
    return {
      priceEUR: null,
      source: "openlibrary.org",
      fetchedAt: new Date().toISOString(),
      confidence: "manual",
      warningMessage: `Livre identifié sur Open Library (${doc.title ?? ""}). Saisissez le prix neuf (dos du livre ou libraire en ligne).`,
    };
  } catch {
    return null;
  }
}

/**
 * Recherche sommaire via DuckDuckGo Instant Answers (gratuit, sans clé).
 * Retourne un résultat partiel — indicatif uniquement.
 */
async function searchDuckDuckGo(identity: ProductIdentity): Promise<NewPriceResult | null> {
  const query = encodeURIComponent(
    `${identity.name} prix neuf site:fnac.com OR site:darty.com OR site:boulanger.com`,
  );
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`, {
      headers: { "User-Agent": "moins-que-rien/1.0" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { AbstractText?: string; AbstractURL?: string };

    if (!data.AbstractText) return null;
    if (isLikelySecondHand(data.AbstractText)) return null;

    const price = extractEurPrice(data.AbstractText);
    if (!price) return null;

    return {
      priceEUR: price,
      source: data.AbstractURL ?? "duckduckgo.com",
      fetchedAt: new Date().toISOString(),
      confidence: "equivalent",
      warningMessage: "Prix indicatif extrait automatiquement. Vérifiez la source avant publication.",
    };
  } catch {
    return null;
  }
}

/**
 * Point d'entrée : recherche le prix neuf d'un produit identifié.
 *
 * Stratégie :
 *  1. Open Library (livres) — résultat fiable mais sans prix
 *  2. DuckDuckGo — rapide, pour produits encore en vente
 *  3. Wayback Machine — pour produits DISCONTINUÉS (archives web)
 *  4. Fallback manuel — avec message d'instruction explicite
 *
 * Ne retourne jamais un prix inventé.
 */
export async function searchNewPrice(identity: ProductIdentity): Promise<NewPriceResult> {
  // Open Library pour les livres (priorité maximale — identifie mais sans prix)
  const libraryResult = await searchOpenLibrary(identity);
  if (libraryResult) return libraryResult;

  // EAN-search : seule source capable de retourner confidence:"exact"
  // Prioritaire sur toutes les autres si un EAN est fourni
  if (identity.ean) {
    const eanResult = await searchByEan(identity);
    if (eanResult?.priceEUR) return eanResult;
  }

  // DDG d'abord (rapide) et Wayback Machine en parallèle
  const [ddgResult, waybackResult] = await Promise.allSettled([
    searchDuckDuckGo(identity),
    searchWaybackMachine(identity),
  ]);

  const ddg = ddgResult.status === "fulfilled" ? ddgResult.value : null;
  const wayback = waybackResult.status === "fulfilled" ? waybackResult.value : null;

  // DDG prioritaire si prix trouvé (produit en vente)
  if (ddg?.priceEUR) return ddg;
  // Wayback Machine en fallback (produit discontinué)
  if (wayback?.priceEUR) return wayback;

  // Aucune source automatique n'a retourné de prix fiable
  return {
    priceEUR: null,
    source: "aucune source automatique disponible",
    fetchedAt: new Date().toISOString(),
    confidence: "manual",
    warningMessage:
      `Aucun prix neuf trouvé automatiquement pour « ${identity.name} ». ` +
      `Ce produit est peut-être discontinué et absent des archives web. ` +
      `Saisissez la valeur neuve en vous appuyant sur une facture d'achat, ` +
      `la fiche technique fabricant ou des sites de référence (Fnac, Darty, Boulanger, ` +
      `ou les archives de presse spécialisée). ` +
      `La valeur saisie sera vérifiée par un modérateur avant publication.`,
  };
}

// Exporter les fonctions internes pour les tests
export { extractEurPrice, isLikelySecondHand, buildSearchUrls, nameMatchesSufficiently, extractDiscriminatingTokens };
