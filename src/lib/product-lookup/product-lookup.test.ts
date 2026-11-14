import { describe, expect, it } from "vitest";
import { normalizeEAN, validateEAN } from "./ean";
import { lookupProduct } from "./index";
import { extractEurPrice, isLikelySecondHand, buildSearchUrls } from "./price-search";

// ── Validation EAN ────────────────────────────────────────────────────────────

describe("normalizeEAN", () => {
  it("convertit un UPC-A (12 chiffres) en EAN-13", () => {
    expect(normalizeEAN("012345678905")).toBe("0012345678905");
  });
  it("retourne un EAN-13 inchangé", () => {
    expect(normalizeEAN("3614270584034")).toBe("3614270584034");
  });
  it("ignore les tirets et espaces", () => {
    expect(normalizeEAN("361-4270 584034")).toBe("3614270584034");
  });
  it("retourne null si longueur incorrecte", () => {
    expect(normalizeEAN("123456")).toBeNull();
  });
});

describe("validateEAN", () => {
  it("accepte un EAN-13 valide", () => {
    // 9780201379624 — The Pragmatic Programmer (ISBN EAN), somme de contrôle correcte
    expect(validateEAN("9780201379624")).toBe(true);
  });
  it("accepte un second EAN-13 valide", () => {
    // 3614270584039 — somme de contrôle calculée et vérifiée
    expect(validateEAN("3614270584039")).toBe(true);
  });
  it("rejette un EAN avec mauvaise somme de contrôle", () => {
    expect(validateEAN("9780201379625")).toBe(false);
  });
  it("rejette une chaîne trop courte", () => {
    expect(validateEAN("123")).toBe(false);
  });
  it("rejette une chaîne avec des lettres", () => {
    expect(validateEAN("361427058403X")).toBe(false);
  });
});

// ── Extraction de prix ────────────────────────────────────────────────────────

describe("extractEurPrice", () => {
  it("extrait un prix avec le symbole €", () => {
    expect(extractEurPrice("Prix : 299,99 €")).toBe(299.99);
  });
  it("extrait un prix avec EUR", () => {
    expect(extractEurPrice("EUR 1 499")).toBe(1499);
  });
  it("extrait un prix € collé au nombre", () => {
    expect(extractEurPrice("149€ seulement")).toBe(149);
  });
  it("retourne null si aucun prix trouvé", () => {
    expect(extractEurPrice("Produit épuisé")).toBeNull();
  });
  it("ignore les prix négatifs ou nuls", () => {
    expect(extractEurPrice("0 €")).toBeNull();
  });
  it("ignore les prix supérieurs à 100 000 €", () => {
    expect(extractEurPrice("200 000 €")).toBeNull();
  });
});

// ── Détection d'occasion ──────────────────────────────────────────────────────

describe("isLikelySecondHand", () => {
  it("détecte « occasion »", () => {
    expect(isLikelySecondHand("iPhone d'occasion 128GB")).toBe(true);
  });
  it("détecte « reconditionné »", () => {
    expect(isLikelySecondHand("Produit reconditionné garanti 1 an")).toBe(true);
  });
  it("ne marque pas un produit neuf", () => {
    expect(isLikelySecondHand("iPhone 14 Pro neuf sous scellé")).toBe(false);
  });
  it("ne marque pas une description neutre", () => {
    expect(isLikelySecondHand("Aspirateur sans fil Dyson 24V")).toBe(false);
  });
});

// ── Construction d'URLs de recherche ─────────────────────────────────────────

describe("buildSearchUrls", () => {
  it("retourne un tableau non vide pour une identité complète", () => {
    const urls = buildSearchUrls({
      name: "iPhone 14 Pro",
      brand: "Apple",
      model: "iPhone 14 Pro",
      variant: null,
      ean: null,
      categoryId: "smartphones",
      source: "manual",
      confidence: 0.5,
    });
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((u) => u.includes("fnac.com"))).toBe(true);
  });
  it("retourne un tableau vide sans brand ni model", () => {
    const urls = buildSearchUrls({
      name: "Inconnu",
      brand: "",
      model: "",
      variant: null,
      ean: null,
      categoryId: "autre",
      source: "manual",
      confidence: 0.3,
    });
    expect(urls.length).toBe(0);
  });
});

// ── lookupProduct — comportement sans réseau ──────────────────────────────────

describe("lookupProduct — entrée invalide", () => {
  it("retourne identification_failed si l'EAN est malformé", async () => {
    const r = await lookupProduct({ ean: "INVALIDE" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("identification_failed");
  });

  it("retourne identification_failed si aucun input", async () => {
    const r = await lookupProduct({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("identification_failed");
  });
});

describe("lookupProduct — référence textuelle", () => {
  it("retourne un résultat low_confidence pour une référence courte", async () => {
    // La référence textuelle seule a une confiance de 0.5 (< 0.6)
    const r = await lookupProduct({ reference: "iPhone 14 Pro 128GB" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("low_confidence");
    if (!r.ok) expect(r.partial?.identity?.name).toBe("iPhone 14 Pro 128GB");
  });
});

// ── Règles métier sur le prix ─────────────────────────────────────────────────

describe("règles prix neuf", () => {
  it("ne fabrique jamais un prix — retourne confidence:manual si introuvable", async () => {
    // Produit fictif inexistant dans aucune base
    const r = await lookupProduct({ reference: "ProduitFictif XYZ-9999 Inexistant" });
    // Résultat attendu : low_confidence (confidence 0.5) OU prix null + confidence manual
    if (r.ok) {
      expect(r.price.priceEUR).toBeNull(); // jamais un prix inventé
      expect(r.price.confidence).toBe("manual");
    } else {
      expect(["low_confidence", "identification_failed", "price_not_found"]).toContain(r.reason);
    }
  });
});
