// Moteur de valorisation — ventes entre particuliers (P2P).
// Indépendant de l'interface : toutes les valeurs viennent d'une configuration injectée.
// Formule : valeur neuve × taux catégorie × coef. ancienneté × coef. vétusté × (1 + majoration unique)

export type CategoryId =
  | "smartphones" | "informatique" | "tv-audio" | "electromenager" | "meubles"
  | "vetements" | "outillage" | "jouets" | "livres";

export type ConditionId = "neuf-jamais-utilise" | "comme-neuf" | "tres-bon" | "bon" | "usage" | "defauts";

export type Category = {
  id: CategoryId;
  label: string;
  /** Taux de départ validé par le client. */
  startRate: number;
  /** Coefficient d'ancienneté par âge en années révolues (index = âge). Dernière valeur réutilisée au-delà. */
  ageCoefficients: number[];
  ageIsHypothesis: boolean;
};

export type Condition = { id: ConditionId; label: string; coefficient: number; isHypothesis: boolean };

export type P2PConfig = {
  categories: Category[];
  conditions: Condition[];
  surcharges: { newNeverUsedNoWarranty: number; likeNewNoWarranty: number; verifiedWarranty: number };
  /** Durée minimale de garantie restante (jours) pour la majoration. */
  warrantyMinDays: number;
};

// Taux de départ : fournis par le client (définitifs).
// Coefficients d'ancienneté et de vétusté : HYPOTHÈSES de travail, à compléter dans l'administration.
const H_AGE = [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35];
export const defaultP2PConfig: P2PConfig = {
  categories: [
    { id: "smartphones", label: "Smartphones et tablettes", startRate: 0.15, ageCoefficients: [1, 0.75, 0.55, 0.4, 0.3], ageIsHypothesis: true },
    // Calibration : 1 000 € × 15 % × 0,667 × 0,70 (bon état) ≈ 70 € à 6 ans — cible indicative validée.
    { id: "informatique", label: "Informatique", startRate: 0.15, ageCoefficients: [1, 0.90, 0.80, 0.73, 0.70, 0.68, 0.667], ageIsHypothesis: true },
    { id: "tv-audio", label: "Téléviseurs, audio et vidéo", startRate: 0.12, ageCoefficients: H_AGE, ageIsHypothesis: true },
    { id: "electromenager", label: "Électroménager", startRate: 0.15, ageCoefficients: H_AGE, ageIsHypothesis: true },
    { id: "meubles", label: "Meubles et décoration", startRate: 0.12, ageCoefficients: [1, 0.9, 0.82, 0.75, 0.68, 0.62, 0.56], ageIsHypothesis: true },
    { id: "vetements", label: "Vêtements et chaussures", startRate: 0.1, ageCoefficients: [1, 0.8, 0.65, 0.5], ageIsHypothesis: true },
    { id: "outillage", label: "Outillage et bricolage", startRate: 0.18, ageCoefficients: [1, 0.9, 0.8, 0.72, 0.65, 0.58], ageIsHypothesis: true },
    { id: "jouets", label: "Jouets et loisirs", startRate: 0.12, ageCoefficients: H_AGE, ageIsHypothesis: true },
    { id: "livres", label: "Livres", startRate: 0.1, ageCoefficients: [1, 0.9, 0.85, 0.8], ageIsHypothesis: true },
  ],
  conditions: [
    { id: "neuf-jamais-utilise", label: "Neuf, jamais utilisé", coefficient: 1, isHypothesis: true },
    { id: "comme-neuf", label: "Comme neuf", coefficient: 0.95, isHypothesis: true },
    { id: "tres-bon", label: "Très bon état", coefficient: 0.85, isHypothesis: true },
    { id: "bon", label: "Bon état", coefficient: 0.7, isHypothesis: true },
    { id: "usage", label: "État d'usage", coefficient: 0.5, isHypothesis: true },
    { id: "defauts", label: "Défauts importants", coefficient: 0.3, isHypothesis: true },
  ],
  // Majorations fournies par le client (définitives), exclusives.
  surcharges: { newNeverUsedNoWarranty: 0.1, likeNewNoWarranty: 0.05, verifiedWarranty: 0.07 },
  warrantyMinDays: 31,
};

export type P2PInput = {
  /** Valeur neuve de référence, saisie et justifiée (aucune recherche automatique connectée). */
  referenceNewValue: number;
  category: CategoryId;
  ageYears: number;
  condition: ConditionId;
  /** Garantie vérifiée (facture/contrat), transférable, jours restants. null = pas de garantie vérifiée. */
  verifiedWarrantyDaysLeft: number | null;
};

export type P2PResult = {
  maxPrice: number;
  steps: { label: string; value: number; isHypothesis: boolean }[];
  surcharge: { label: string; rate: number } | null;
  usesHypotheses: boolean;
};

export function computeP2P(input: P2PInput, config: P2PConfig = defaultP2PConfig): P2PResult {
  const cat = config.categories.find((c) => c.id === input.category);
  const cond = config.conditions.find((c) => c.id === input.condition);
  if (!cat || !cond) throw new Error("Catégorie ou état inconnu");
  const value = Math.max(0, input.referenceNewValue);
  const age = Math.max(0, Math.floor(input.ageYears));
  const ageCoef = cat.ageCoefficients[Math.min(age, cat.ageCoefficients.length - 1)] ?? 1;

  const hasWarranty = input.verifiedWarrantyDaysLeft !== null && input.verifiedWarrantyDaysLeft >= config.warrantyMinDays;
  let surcharge: P2PResult["surcharge"] = null;
  if (hasWarranty) surcharge = { label: "Garantie vérifiée et transférable (> 1 mois)", rate: config.surcharges.verifiedWarranty };
  else if (input.condition === "neuf-jamais-utilise") surcharge = { label: "Neuf, jamais utilisé, hors garantie", rate: config.surcharges.newNeverUsedNoWarranty };
  else if (input.condition === "comme-neuf") surcharge = { label: "Comme neuf, hors garantie", rate: config.surcharges.likeNewNoWarranty };

  const raw = value * cat.startRate * ageCoef * cond.coefficient * (1 + (surcharge?.rate ?? 0));
  return {
    maxPrice: Math.floor(raw),
    steps: [
      { label: "Valeur neuve de référence", value, isHypothesis: false },
      { label: `Taux catégorie (${cat.label})`, value: cat.startRate, isHypothesis: false },
      { label: `Coefficient d'ancienneté (${age} an${age > 1 ? "s" : ""})`, value: ageCoef, isHypothesis: cat.ageIsHypothesis },
      { label: `Coefficient de vétusté (${cond.label})`, value: cond.coefficient, isHypothesis: cond.isHypothesis },
    ],
    surcharge,
    usesHypotheses: cat.ageIsHypothesis || cond.isHypothesis,
  };
}
