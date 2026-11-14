/**
 * Script de test des recherches de prix réelles — aucune réponse simulée.
 *
 * Usage :
 *   bun run scripts/test-price-search-real.ts
 *
 * Ce script interroge les vraies APIs :
 *   - EAN-search.org     (100 req/jour, sans clé)
 *   - DuckDuckGo Instant Answers (sans limite, sans clé)
 *   - Wayback Machine CDX API (sans limite, sans clé)
 */

import { searchNewPrice } from "../src/lib/product-lookup/price-search";
import type { ProductIdentity } from "../src/lib/product-lookup/types";

// ── Produits de test ────────────────────────────────────────────────────

const PRODUCTS: Array<{ label: string; identity: ProductIdentity }> = [
  {
    label: "iPhone 15 Pro (EAN connu, référence exacte attendue)",
    identity: {
      name: "Apple iPhone 15 Pro 128Go Natural Titanium",
      brand: "Apple",
      model: "iPhone 15 Pro",
      variant: "128Go",
      ean: "0194253717737",   // EAN officiel Apple France
      categoryId: "smartphones",
      source: "manual",
      confidence: 0.5,
    },
  },
  {
    label: "AirPods Pro 2 (EAN, source exacte attendue)",
    identity: {
      name: "Apple AirPods Pro 2ème génération",
      brand: "Apple",
      model: "AirPods Pro",
      variant: "2ème génération",
      ean: "0194253378587",
      categoryId: "audio",
      source: "manual",
      confidence: 0.5,
    },
  },
  {
    label: "Dyson V15 Detect (EAN, aspirateur)",
    identity: {
      name: "Dyson V15 Detect Absolute",
      brand: "Dyson",
      model: "V15 Detect",
      variant: "Absolute",
      ean: "5025155061282",
      categoryId: "electromenager",
      source: "manual",
      confidence: 0.5,
    },
  },
  {
    label: "Produit sans EAN (DDG/Wayback, confiance équivalent attendue)",
    identity: {
      name: "Vélo électrique Decathlon B'Twin E-Triban 500",
      brand: "Decathlon",
      model: "E-Triban 500",
      variant: null,
      ean: null,                // Pas d'EAN → DDG/Wayback uniquement
      categoryId: "sport",
      source: "manual",
      confidence: 0.5,
    },
  },
  {
    label: "Objet introuvable (aucune source, manual attendu)",
    identity: {
      name: "Bidouille artisanale XZQ-9000 prototype",
      brand: "Artisan",
      model: "XZQ-9000",
      variant: null,
      ean: null,
      categoryId: "autre",
      source: "manual",
      confidence: 0.5,
    },
  },
];

// ── Exécution ────────────────────────────────────────────────────────────

type TestResult = {
  label: string;
  priceEUR: number | null;
  source: string;
  confidence: "exact" | "equivalent" | "manual";
  warning?: string;
  durationMs: number;
  autoApproved: boolean;
};

const CONFIDENCE_THRESHOLD = 0.75;
const CONFIDENCE_SCORES: Record<string, number> = {
  exact: 0.9,
  equivalent: 0.65,
  manual: 0.0,
};

async function runTests(): Promise<void> {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  TESTS DE PRIX RÉELS — Moins que rien V4");
  console.log(`  ${new Date().toISOString()}`);
  console.log("══════════════════════════════════════════════════\n");

  const results: TestResult[] = [];

  for (const product of PRODUCTS) {
    console.log(`\n▶ ${product.label}`);
    console.log(`  EAN: ${product.identity.ean ?? "aucun"}`);

    const t0 = Date.now();
    try {
      const result = await searchNewPrice(product.identity);
      const durationMs = Date.now() - t0;
      const score = CONFIDENCE_SCORES[result.confidence] ?? 0;
      const autoApproved = result.priceEUR !== null && score >= CONFIDENCE_THRESHOLD;

      const r: TestResult = {
        label: product.label,
        priceEUR: result.priceEUR,
        source: result.source,
        confidence: result.confidence,
        warning: result.warningMessage,
        durationMs,
        autoApproved,
      };
      results.push(r);

      const icon = autoApproved ? "✅" : result.priceEUR !== null ? "⚠️ " : "❌";
      console.log(`  ${icon} Prix : ${result.priceEUR !== null ? result.priceEUR + " €" : "non trouvé"}`);
      console.log(`     Source     : ${result.source}`);
      console.log(`     Confiance  : ${result.confidence} (score ${score})`);
      console.log(`     Auto-approuvé : ${autoApproved}`);
      console.log(`     Durée      : ${durationMs} ms`);
      if (result.warningMessage) {
        console.log(`     Avertissement : ${result.warningMessage}`);
      }
    } catch (err) {
      const durationMs = Date.now() - t0;
      console.log(`  ❌ ERREUR : ${err}`);
      results.push({
        label: product.label,
        priceEUR: null,
        source: "erreur",
        confidence: "manual",
        warning: String(err),
        durationMs,
        autoApproved: false,
      });
    }
  }

  // ── Résumé ──────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  RÉSUMÉ");
  console.log("══════════════════════════════════════════════════");

  const autoApprovedCount = results.filter((r) => r.autoApproved).length;
  const withPrice = results.filter((r) => r.priceEUR !== null).length;
  const withExact = results.filter((r) => r.confidence === "exact").length;
  const withEquivalent = results.filter((r) => r.confidence === "equivalent").length;
  const noPrice = results.filter((r) => r.priceEUR === null).length;

  console.log(`\n  ${results.length} produits testés`);
  console.log(`  ${autoApprovedCount} auto-approuvés (seuil 0.75)`);
  console.log(`  ${withExact} confidence:"exact" (EAN-search.org)`);
  console.log(`  ${withEquivalent} confidence:"equivalent" (DDG/Wayback)`);
  console.log(`  ${noPrice} sans prix (→ pending_price_review / admin)`);

  console.log("\n  Tableau détaillé :");
  for (const r of results) {
    const icon = r.autoApproved ? "✅" : r.priceEUR !== null ? "⚠️" : "❌";
    console.log(`  ${icon}  [${r.confidence.padEnd(10)}] ${r.priceEUR !== null ? String(r.priceEUR).padStart(6) + " €" : "   n/a  "} | ${r.label.slice(0, 50)}`);
  }

  console.log("\n══════════════════════════════════════════════════\n");

  // ── Vérifications critiques ─────────────────────────────────────────────
  const errors: string[] = [];

  const eanProducts = results.filter((_, i) => PRODUCTS[i]?.identity.ean !== null);
  const noEanProducts = results.filter((_, i) => PRODUCTS[i]?.identity.ean === null);

  // EAN-search.org doit retourner "exact" pour au moins un produit avec EAN connu
  const hasExactFromEan = eanProducts.some((r) => r.confidence === "exact");
  if (!hasExactFromEan) {
    errors.push("⛔ Aucun résultat confidence:'exact' depuis EAN-search.org — approbation automatique impossible");
  }

  // Les produits sans EAN ne doivent pas être "exact"
  const wrongExact = noEanProducts.some((r) => r.confidence === "exact");
  if (wrongExact) {
    errors.push("⛔ Un produit sans EAN a reçu confidence:'exact' — anomalie logique");
  }

  if (errors.length === 0) {
    console.log("  ✅ Toutes les vérifications critiques passent.\n");
  } else {
    console.log("  VÉRIFICATIONS CRITIQUES ÉCHOUÉES :");
    for (const e of errors) {
      console.log(`    ${e}`);
    }
    console.log();
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
