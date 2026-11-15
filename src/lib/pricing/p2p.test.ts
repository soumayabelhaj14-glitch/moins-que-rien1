import { describe, expect, it } from "vitest";
import { computeP2P, defaultP2PConfig, type P2PConfig } from "./p2p";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Config neutre : tous les coefs d'ancienneté et vétusté à 1 pour isoler une règle précise. */
const neutral: P2PConfig = {
  ...defaultP2PConfig,
  categories: defaultP2PConfig.categories.map((c) => ({
    ...c,
    // Préserver fixedPrices et warrantyOverrideRate — seuls les coefs doivent être neutres.
    ageCoefficients: [1],
  })),
  conditions: defaultP2PConfig.conditions.map((c) => ({ ...c, coefficient: 1 })),
};

const base = {
  referenceNewValue: 1000,
  ageYears: 0,
  condition: "bon" as const,
  verifiedWarrantyDaysLeft: null,
};

// ── Ancres métier (braderie) ─────────────────────────────────────────────────
// Ces tests documentent les plafonds cibles fournis par le propriétaire.
// Ajuster les coefficients dans p2p.ts, jamais les seuils ici.

describe("ancres smartphones", () => {
  it("100 € neuf, 2 ans, bon état → ≤ 40 €", () => {
    const r = computeP2P(
      { referenceNewValue: 100, category: "smartphones", ageYears: 2, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBeLessThanOrEqual(40);
    expect(r.maxPrice).toBeGreaterThanOrEqual(35);
  });
});

describe("ancres informatique", () => {
  it("1 200 € neuf, 2 ans, bon état → autour de 300 €", () => {
    const r = computeP2P(
      { referenceNewValue: 1200, category: "informatique", ageYears: 2, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBeGreaterThanOrEqual(285);
    expect(r.maxPrice).toBeLessThanOrEqual(315);
  });
  it("calibration : 1 000 € × 6 ans × bon état ≈ 70 €", () => {
    const r = computeP2P(
      { referenceNewValue: 1000, category: "informatique", ageYears: 6, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBeGreaterThanOrEqual(65);
    expect(r.maxPrice).toBeLessThanOrEqual(75);
  });
});

describe("ancres tv-audio", () => {
  it("100 € neuf, 2 ans, bon état → autour de 45 €", () => {
    const r = computeP2P(
      { referenceNewValue: 100, category: "tv-audio", ageYears: 2, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBeGreaterThanOrEqual(40);
    expect(r.maxPrice).toBeLessThanOrEqual(50);
  });
});

describe("ancres électroménager", () => {
  it("300 € neuf, 2 ans, bon état, sans garantie → autour de 40 €", () => {
    const r = computeP2P(
      { referenceNewValue: 300, category: "electromenager", ageYears: 2, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBeGreaterThanOrEqual(35);
    expect(r.maxPrice).toBeLessThanOrEqual(45);
    expect(r.warrantyOverrideApplied).toBe(false);
  });
  it("100 € neuf, 2 ans, bon état, avec garantie ≥ 1 mois → relevé à 45 % du prix neuf = 45 €", () => {
    // À 2 ans, la formule donne 100 × 0.19 × 0.70 ≈ 13 € < 45 € → override s'applique.
    const r = computeP2P(
      { referenceNewValue: 100, category: "electromenager", ageYears: 2, condition: "bon", verifiedWarrantyDaysLeft: 60 },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBe(45);
    expect(r.warrantyOverrideApplied).toBe(true);
  });
  it("garantie active hausse toujours la valeur vs sans garantie", () => {
    const noWarranty = computeP2P(
      { referenceNewValue: 300, category: "electromenager", ageYears: 2, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    const withWarranty = computeP2P(
      { referenceNewValue: 300, category: "electromenager", ageYears: 2, condition: "bon", verifiedWarrantyDaysLeft: 60 },
      defaultP2PConfig,
    );
    expect(withWarranty.maxPrice).toBeGreaterThan(noWarranty.maxPrice);
  });
});

describe("ancres meubles (coef plat)", () => {
  it("500 € neuf, bon état, tout âge → autour de 50 €", () => {
    for (const age of [0, 2, 5, 10, 20]) {
      const r = computeP2P(
        { referenceNewValue: 500, category: "meubles", ageYears: age, condition: "bon", verifiedWarrantyDaysLeft: null },
        defaultP2PConfig,
      );
      expect(r.maxPrice).toBeGreaterThanOrEqual(45);
      expect(r.maxPrice).toBeLessThanOrEqual(60);
    }
  });
  it("prix identique à tout âge (coef plat)", () => {
    const r0 = computeP2P({ referenceNewValue: 500, category: "meubles", ageYears: 0, condition: "bon", verifiedWarrantyDaysLeft: null }, defaultP2PConfig);
    const r10 = computeP2P({ referenceNewValue: 500, category: "meubles", ageYears: 10, condition: "bon", verifiedWarrantyDaysLeft: null }, defaultP2PConfig);
    expect(r0.maxPrice).toBe(r10.maxPrice);
  });
});

describe("ancres outillage", () => {
  it("300 € neuf, 3 ans, bon état, sans garantie → autour de 30 €", () => {
    const r = computeP2P(
      { referenceNewValue: 300, category: "outillage", ageYears: 3, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBeGreaterThanOrEqual(25);
    expect(r.maxPrice).toBeLessThanOrEqual(35);
    expect(r.warrantyOverrideApplied).toBe(false);
  });
  it("avec garantie ≥ 1 mois : override 45 % si supérieur à la formule", () => {
    const r = computeP2P(
      { referenceNewValue: 300, category: "outillage", ageYears: 3, condition: "bon", verifiedWarrantyDaysLeft: 60 },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBe(135); // 300 × 0.45 = 135
    expect(r.warrantyOverrideApplied).toBe(true);
  });
});

// ── Prix fixes : jouets ───────────────────────────────────────────────────────
describe("jouets — prix fixes (braderie)", () => {
  it.each([
    ["neuf-jamais-utilise" as const, 20],
    ["comme-neuf" as const, 15],
    ["tres-bon" as const, 15],
    ["bon" as const, 10],
    ["usage" as const, 10],
    ["defauts" as const, 5],
  ])("état %s → %i €", (condition, expected) => {
    const r = computeP2P(
      { referenceNewValue: 100, category: "jouets", ageYears: 2, condition, verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBe(expected);
    expect(r.isFixedPrice).toBe(true);
  });
  it("prix identique quel que soit le prix neuf", () => {
    const r100 = computeP2P({ referenceNewValue: 100, category: "jouets", ageYears: 0, condition: "bon", verifiedWarrantyDaysLeft: null }, defaultP2PConfig);
    const r500 = computeP2P({ referenceNewValue: 500, category: "jouets", ageYears: 0, condition: "bon", verifiedWarrantyDaysLeft: null }, defaultP2PConfig);
    expect(r100.maxPrice).toBe(r500.maxPrice);
  });
});

// ── Prix fixes : livres ───────────────────────────────────────────────────────
describe("livres — prix fixes (braderie)", () => {
  it("livre standard, bon état → 2 €", () => {
    const r = computeP2P(
      { referenceNewValue: 25, category: "livres", ageYears: 1, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBe(2);
    expect(r.isFixedPrice).toBe(true);
  });
  it("livre standard, défauts → 1 €", () => {
    const r = computeP2P(
      { referenceNewValue: 25, category: "livres", ageYears: 1, condition: "defauts", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBe(1);
  });
  it("livre universitaire, bon état → 5 €", () => {
    const r = computeP2P(
      { referenceNewValue: 50, category: "livres-universitaires", ageYears: 1, condition: "bon", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBe(5);
    expect(r.isFixedPrice).toBe(true);
  });
  it("livre universitaire, défauts → 3 €", () => {
    const r = computeP2P(
      { referenceNewValue: 50, category: "livres-universitaires", ageYears: 1, condition: "defauts", verifiedWarrantyDaysLeft: null },
      defaultP2PConfig,
    );
    expect(r.maxPrice).toBe(3);
  });
});

// ── Majorations exclusives (catégories sans warrantyOverrideRate) ─────────────
describe("majorations exclusives", () => {
  it("neuf jamais utilisé hors garantie : +10 %", () => {
    expect(
      computeP2P({ ...base, category: "informatique", condition: "neuf-jamais-utilise" }, neutral).maxPrice,
    ).toBe(1100);
  });
  it("comme neuf hors garantie : +5 %", () => {
    expect(
      computeP2P({ ...base, category: "informatique", condition: "comme-neuf" }, neutral).maxPrice,
    ).toBe(1050);
  });
  it("garantie vérifiée > 1 mois : +7 %", () => {
    expect(
      computeP2P({ ...base, category: "informatique", verifiedWarrantyDaysLeft: 60 }, neutral).maxPrice,
    ).toBe(1070);
  });
  it("neuf + garantie : une seule majoration (+7 %), pas de cumul", () => {
    expect(
      computeP2P({ ...base, category: "informatique", condition: "neuf-jamais-utilise", verifiedWarrantyDaysLeft: 200 }, neutral).maxPrice,
    ).toBe(1070);
  });
  it("garantie de moins d'un mois : non prise en compte", () => {
    expect(
      computeP2P({ ...base, category: "informatique", verifiedWarrantyDaysLeft: 20 }, neutral).maxPrice,
    ).toBe(1000);
  });
});

// ── Ancienneté × vétusté ─────────────────────────────────────────────────────
it("ancienneté et vétusté s'appliquent successivement", () => {
  const cfg: P2PConfig = {
    ...neutral,
    categories: neutral.categories.map((c) => ({ ...c, ageCoefficients: [1, 0.5] })),
    conditions: neutral.conditions.map((c) => (c.id === "bon" ? { ...c, coefficient: 0.8 } : c)),
  };
  expect(computeP2P({ ...base, category: "informatique", ageYears: 1 }, cfg).maxPrice).toBe(400);
});
