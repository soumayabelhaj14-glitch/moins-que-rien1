// Moteur professionnels (B2C/B2B) — distinct des particuliers. Toutes les valeurs sont des HYPOTHÈSES configurables.
// Formule : valeur de référence HT × taux catégorie pro × coef. ancienneté du stock × coef. état × coef. volume

export type ProConfig = {
  categories: { id: string; label: string; startRate: number }[];
  stockAgeCoefficients: number[]; // index = années depuis l'entrée en stock
  conditions: { id: string; label: string; coefficient: number }[];
  volumeTiers: { minQty: number; coefficient: number }[]; // trié par minQty croissant
};

export const defaultProConfig: ProConfig = {
  categories: [
    { id: "mobilier-bureau", label: "Mobilier de bureau", startRate: 0.2 },
    { id: "materiel-info", label: "Matériel informatique", startRate: 0.2 },
    { id: "fins-de-serie", label: "Fins de série / invendus neufs", startRate: 0.3 },
    { id: "equipement-pro", label: "Équipement professionnel", startRate: 0.25 },
  ],
  stockAgeCoefficients: [1, 0.85, 0.7, 0.6],
  conditions: [
    { id: "neuf-emballe", label: "Neuf sous emballage", coefficient: 1 },
    { id: "neuf-deballe", label: "Neuf déballé", coefficient: 0.9 },
    { id: "occasion", label: "Occasion", coefficient: 0.7 },
    { id: "defauts", label: "Avec défauts", coefficient: 0.4 },
  ],
  volumeTiers: [{ minQty: 1, coefficient: 1 }, { minQty: 10, coefficient: 0.9 }, { minQty: 50, coefficient: 0.8 }],
};

export type ProInput = { referenceValueHT: number; category: string; stockAgeYears: number; condition: string; quantity: number };

export function computePro(input: ProInput, cfg: ProConfig) {
  const cat = cfg.categories.find((c) => c.id === input.category) ?? cfg.categories[0];
  const cond = cfg.conditions.find((c) => c.id === input.condition) ?? cfg.conditions[0];
  if (!cat || !cond) throw new Error("Barème professionnel incomplet");
  const age = Math.max(0, Math.floor(input.stockAgeYears));
  const ageCoef = cfg.stockAgeCoefficients[Math.min(age, cfg.stockAgeCoefficients.length - 1)] ?? 1;
  const tier = [...cfg.volumeTiers].sort((a, b) => a.minQty - b.minQty).filter((t) => input.quantity >= t.minQty).pop();
  const volCoef = tier?.coefficient ?? 1;
  const value = Math.max(0, input.referenceValueHT);
  return {
    maxPrice: Math.floor(value * cat.startRate * ageCoef * cond.coefficient * volCoef),
    steps: [
      { label: "Valeur de référence HT (justifiée)", value, money: true },
      { label: `Taux catégorie (${cat.label})`, value: cat.startRate },
      { label: `Ancienneté du stock (${age} an${age > 1 ? "s" : ""})`, value: ageCoef },
      { label: `État (${cond.label})`, value: cond.coefficient },
      { label: `Volume (${input.quantity} unité${input.quantity > 1 ? "s" : ""})`, value: volCoef },
    ],
  };
}
