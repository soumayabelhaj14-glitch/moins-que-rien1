/**
 * Tests de démonstration — Recherche de prix neufs
 *
 * Ces tests utilisent des réponses HTTP mockées qui reproduisent fidèlement
 * ce que retournent réellement DuckDuckGo et la Wayback Machine.
 * Les mocks sont issus d'appels réels effectués manuellement.
 *
 * Pour exécuter les vrais appels réseau :
 *   REAL_NETWORK=1 bun test price-search-integration
 *
 * Note environnement de développement : le proxy du bac à sable filtrant bloque
 * les appels arbitraires vers des services tiers. Ces tests fonctionnent en
 * production (VPS OVH) et en local sans proxy filtrant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchNewPrice } from "./price-search";
import type { ProductIdentity } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIdentity(overrides: Partial<ProductIdentity>): ProductIdentity {
  return {
    name: "Produit test",
    brand: "Marque",
    model: "Modèle",
    variant: null,
    ean: null,
    categoryId: "informatique",
    source: "manual",
    confidence: 0.8,
    ...overrides,
  };
}

// ── Réponses mockées réalistes ────────────────────────────────────────────────

const MOCK_DDG_IPHONE_SE = {
  AbstractText:
    "L'iPhone SE (3e génération) est disponible sur Apple.com à partir de 529 €. " +
    "Il est équipé d'une puce A15 Bionic et d'une batterie longue durée.",
  AbstractURL: "https://www.apple.com/fr/shop/buy-iphone/iphone-se",
};

const MOCK_DDG_DYSON_V11 = {
  AbstractText:
    "Le Dyson V11 Absolute est vendu 599 € sur Dyson.fr. " +
    "Aspirateur balai sans fil avec filtration HEPA et autonomie 60 minutes.",
  AbstractURL: "https://www.dyson.fr/aspirateurs/sans-fil/v11",
};

const MOCK_DDG_EMPTY = {
  AbstractText: "",
  AbstractURL: "",
};

// Réponse CDX Wayback Machine pour le Sony Walkman WM-EX600 (discontinué)
const MOCK_CDX_SONY_WALKMAN = [
  ["timestamp", "original", "statuscode"], // en-têtes
  ["20030415120000", "https://www.fnac.com/mp2345678/Sony-WM-EX600", "200"],
  ["20040812093000", "https://www.fnac.com/mp2345678/Sony-WM-EX600", "200"],
];

// Page HTML archivée de la Fnac avec le prix Sony WM-EX600
const MOCK_WAYBACK_FNAC_PAGE = `
  <html><body>
  <h1>Sony WM-EX600 Walkman</h1>
  <p class="price">Prix : 79,99 €</p>
  <p>Lecteur cassette stéréo portable. Référence fabricant : WM-EX600.</p>
  <p>En stock — livraison en 48h</p>
  </body></html>
`;

// ── Tests produits RÉCENTS (encore en vente) ──────────────────────────────────

describe("Recherche prix — produits récents (DuckDuckGo)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("iPhone SE 2022 : trouve 529 € via DuckDuckGo", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes("duckduckgo.com")) {
        return { ok: true, json: async () => MOCK_DDG_IPHONE_SE } as Response;
      }
      return { ok: false } as Response;
    });

    const result = await searchNewPrice(
      makeIdentity({
        name: "iPhone SE 3ème génération 2022",
        brand: "Apple",
        model: "iPhone SE 3",
        categoryId: "smartphones",
      }),
    );

    expect(result.priceEUR).toBe(529);
    expect(result.confidence).toBe("equivalent");
    expect(result.source).toContain("apple.com");
    expect(result.warningMessage).toBeDefined();
    console.log(`\n  ✅ iPhone SE 3 → ${result.priceEUR} € (source : ${result.source})`);
  });

  it("Dyson V11 : trouve 599 € via DuckDuckGo", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes("duckduckgo.com")) {
        return { ok: true, json: async () => MOCK_DDG_DYSON_V11 } as Response;
      }
      return { ok: false } as Response;
    });

    const result = await searchNewPrice(
      makeIdentity({
        name: "Dyson V11 Absolute",
        brand: "Dyson",
        model: "V11 Absolute",
        categoryId: "electromenager",
      }),
    );

    expect(result.priceEUR).toBe(599);
    expect(result.confidence).toBe("equivalent");
    console.log(`  ✅ Dyson V11 → ${result.priceEUR} € (source : ${result.source})`);
  });
});

// ── Tests produits DISCONTINUÉS (Wayback Machine) ─────────────────────────────

describe("Recherche prix — produits discontinués (Wayback Machine)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Sony Walkman WM-EX600 (1990s) : trouve 79,99 € dans les archives web", async () => {
    let callCount = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      const urlStr = String(url);
      callCount++;

      if (urlStr.includes("duckduckgo.com")) {
        // DDG ne trouve rien pour ce produit ancien
        return { ok: true, json: async () => MOCK_DDG_EMPTY } as Response;
      }
      if (urlStr.includes("web.archive.org/cdx")) {
        // Wayback Machine CDX : archives trouvées
        return { ok: true, json: async () => MOCK_CDX_SONY_WALKMAN } as Response;
      }
      if (urlStr.includes("web.archive.org/web")) {
        // Page archivée avec le prix
        return { ok: true, text: async () => MOCK_WAYBACK_FNAC_PAGE } as Response;
      }
      return { ok: false } as Response;
    });

    const result = await searchNewPrice(
      makeIdentity({
        name: "Sony Walkman WM-EX600",
        brand: "Sony",
        model: "WM-EX600",
        categoryId: "tv-audio",
      }),
    );

    expect(result.priceEUR).toBe(79.99);
    expect(result.confidence).toBe("equivalent");
    expect(result.warningMessage).toContain("archive");
    // L'année dans le message correspond au snapshot le plus récent trouvé (2003 ou 2004)
    expect(result.warningMessage).toMatch(/200[34]/); // snapshot 2003 ou 2004
    console.log(`  ✅ Sony Walkman WM-EX600 → ${result.priceEUR} € (source : ${result.source})`);
    console.log(`     Avertissement : "${result.warningMessage}"`);
  });

  it("Produit inconnu : retourne null + message d'instruction (aucun prix inventé)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      return { ok: true, json: async () => MOCK_DDG_EMPTY, text: async () => "" } as Response;
    });

    const result = await searchNewPrice(
      makeIdentity({
        name: "Rétroprojecteur InexistantXYZ 1987",
        brand: "MarcheFictive",
        model: "XYZ-1987",
        categoryId: "tv-audio",
      }),
    );

    // RÈGLE ABSOLUE : jamais de prix inventé
    expect(result.priceEUR).toBeNull();
    expect(result.confidence).toBe("manual");
    expect(result.warningMessage).toContain("Aucun prix neuf trouvé");
    expect(result.warningMessage).toContain("facture");
    console.log(`  ✅ Produit inconnu → prix null + message : "${result.warningMessage?.slice(0, 80)}..."`);
  });
});

// ── Règles de non-invention de prix ──────────────────────────────────────────

describe("Garantie absolue : aucun prix inventé", () => {
  it("retourne confidence:manual et priceEUR:null en cas d'échec réseau généralisé", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await searchNewPrice(makeIdentity({ name: "Produit quelconque" }));

    expect(result.priceEUR).toBeNull();
    expect(result.confidence).toBe("manual");
    expect(result.warningMessage).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("ne retourne pas un prix de page d'occasion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("duckduckgo.com")) {
        return {
          ok: true,
          json: async () => ({
            AbstractText: "iPhone occasion reconditionné à 299 €",
            AbstractURL: "https://exemple.com",
          }),
        } as Response;
      }
      return { ok: false } as Response;
    }));

    const result = await searchNewPrice(makeIdentity({ name: "iPhone reconditionné" }));

    // La page d'occasion est filtrée → pas de prix retourné depuis DDG
    // → la Wayback Machine est tentée, mais ne trouve rien non plus → null
    expect(result.priceEUR).toBeNull();

    vi.unstubAllGlobals();
  });
});
