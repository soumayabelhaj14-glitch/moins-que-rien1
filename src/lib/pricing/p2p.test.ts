import { describe, expect, it } from "vitest";
import { computeP2P, defaultP2PConfig, type P2PConfig } from "./p2p";

// Config neutre : coefficients d'ancienneté/vétusté à 1 pour isoler les règles du client.
const neutral: P2PConfig = {
  ...defaultP2PConfig,
  categories: defaultP2PConfig.categories.map((c) => ({ ...c, ageCoefficients: [1] })),
  conditions: defaultP2PConfig.conditions.map((c) => ({ ...c, coefficient: 1 })),
};
const base = { referenceNewValue: 1000, ageYears: 0, condition: "bon" as const, verifiedWarrantyDaysLeft: null };

describe("taux de départ par catégorie", () => {
  it.each([
    ["smartphones", 150], ["informatique", 150], ["tv-audio", 120], ["electromenager", 150], ["meubles", 120],
    ["vetements", 100], ["outillage", 180], ["jouets", 120], ["livres", 100],
  ] as const)("%s : 1000 € → %i €", (category, expected) => {
    expect(computeP2P({ ...base, category }, neutral).maxPrice).toBe(expected);
  });
});

describe("majorations exclusives", () => {
  it("neuf jamais utilisé hors garantie : +10 %", () => {
    expect(computeP2P({ ...base, category: "informatique", condition: "neuf-jamais-utilise" }, neutral).maxPrice).toBe(165);
  });
  it("comme neuf hors garantie : +5 %", () => {
    expect(computeP2P({ ...base, category: "informatique", condition: "comme-neuf" }, neutral).maxPrice).toBe(157);
  });
  it("garantie vérifiée > 1 mois : +7 %", () => {
    expect(computeP2P({ ...base, category: "informatique", verifiedWarrantyDaysLeft: 60 }, neutral).maxPrice).toBe(160);
  });
  it("neuf + garantie : une seule majoration (+7 %), pas de cumul", () => {
    expect(computeP2P({ ...base, category: "informatique", condition: "neuf-jamais-utilise", verifiedWarrantyDaysLeft: 200 }, neutral).maxPrice).toBe(160);
  });
  it("garantie de moins d'un mois : non prise en compte", () => {
    expect(computeP2P({ ...base, category: "informatique", verifiedWarrantyDaysLeft: 20 }, neutral).maxPrice).toBe(150);
  });
});

it("ancienneté et vétusté s'appliquent successivement", () => {
  const cfg: P2PConfig = {
    ...neutral,
    categories: neutral.categories.map((c) => ({ ...c, ageCoefficients: [1, 0.5] })),
    conditions: neutral.conditions.map((c) => (c.id === "bon" ? { ...c, coefficient: 0.8 } : c)),
  };
  expect(computeP2P({ ...base, category: "informatique", ageYears: 1 }, cfg).maxPrice).toBe(60);
});

// ── Calibration de référence ─────────────────────────────────────────────────
// Exemple fourni par le propriétaire : ordinateur 1 000 €, 6 ans, bon état → ~70 €.
// Ce test documente la cible ; ajuster les coefficients dans p2p.ts, pas ici.
it("calibration informatique : 1 000 € × 6 ans × bon état ≈ 70 €", () => {
  const result = computeP2P(
    { referenceNewValue: 1000, category: "informatique", ageYears: 6, condition: "bon", verifiedWarrantyDaysLeft: null },
    defaultP2PConfig,
  );
  // Tolérance ±5 € pour permettre un ajustement fin des coefficients sans casser le test.
  expect(result.maxPrice).toBeGreaterThanOrEqual(65);
  expect(result.maxPrice).toBeLessThanOrEqual(75);
});
