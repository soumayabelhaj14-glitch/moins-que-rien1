// Moteur véhicules — distinct. Toutes les valeurs sont des HYPOTHÈSES configurables.
// Formule : cote de référence justifiée × taux véhicule × coef. ancienneté × coef. kilométrage × coef. état

export type VehicleConfig = {
  types: { id: string; label: string; startRate: number }[];
  ageCoefficients: number[]; // index = âge en années
  mileageTiers: { minKm: number; coefficient: number }[];
  conditions: { id: string; label: string; coefficient: number }[];
};

export const defaultVehicleConfig: VehicleConfig = {
  types: [
    { id: "velo", label: "Vélo / VAE", startRate: 0.5 },
    { id: "deux-roues", label: "Scooter / moto", startRate: 0.5 },
    { id: "voiture", label: "Voiture", startRate: 0.5 },
    { id: "utilitaire", label: "Utilitaire", startRate: 0.5 },
  ],
  ageCoefficients: [1, 0.95, 0.9, 0.85, 0.8, 0.75],
  mileageTiers: [{ minKm: 0, coefficient: 1 }, { minKm: 100000, coefficient: 0.9 }, { minKm: 150000, coefficient: 0.8 }, { minKm: 200000, coefficient: 0.7 }],
  conditions: [
    { id: "excellent", label: "Excellent", coefficient: 1 },
    { id: "bon", label: "Bon", coefficient: 0.9 },
    { id: "moyen", label: "Moyen / réparations à prévoir", coefficient: 0.7 },
  ],
};

export type VehicleInput = { referenceValue: number; type: string; ageYears: number; km: number; condition: string };

export function computeVehicle(input: VehicleInput, cfg: VehicleConfig) {
  const t = cfg.types.find((x) => x.id === input.type) ?? cfg.types[0];
  const cond = cfg.conditions.find((c) => c.id === input.condition) ?? cfg.conditions[0];
  if (!t || !cond) throw new Error("Barème véhicule incomplet");
  const age = Math.max(0, Math.floor(input.ageYears));
  const ageCoef = cfg.ageCoefficients[Math.min(age, cfg.ageCoefficients.length - 1)] ?? 1;
  const km = [...cfg.mileageTiers].sort((a, b) => a.minKm - b.minKm).filter((m) => input.km >= m.minKm).pop()?.coefficient ?? 1;
  const value = Math.max(0, input.referenceValue);
  return {
    maxPrice: Math.floor(value * t.startRate * ageCoef * km * cond.coefficient),
    steps: [
      { label: "Cote de référence (justifiée)", value, money: true },
      { label: `Taux véhicule (${t.label})`, value: t.startRate },
      { label: `Ancienneté (${age} an${age > 1 ? "s" : ""})`, value: ageCoef },
      { label: `Kilométrage (${input.km.toLocaleString("fr-FR")} km)`, value: km },
      { label: `État (${cond.label})`, value: cond.coefficient },
    ],
  };
}
