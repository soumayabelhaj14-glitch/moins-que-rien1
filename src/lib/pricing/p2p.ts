// Moteur de valorisation — ventes entre particuliers (P2P).
// Esprit : braderie — les plafonds sont volontairement inférieurs aux autres sites de petites annonces.
// Formule : valeur neuve × coef. ancienneté × coef. vétusté × (1 + majoration)
//           Pour jouets/livres : plafond FIXE indépendant du prix neuf.
//           Pour électroménager/outillage : max(formule, warrantyOverrideRate × prix neuf) si garantie active.

export type CategoryId =
  | "smartphones"
  | "informatique"
  | "tv-audio"
  | "electromenager"
  | "meubles"
  | "vetements"
  | "outillage"
  | "jouets"
  | "livres"
  | "livres-universitaires";

export type ConditionId =
  | "neuf-jamais-utilise"
  | "comme-neuf"
  | "tres-bon"
  | "bon"
  | "usage"
  | "defauts";

export type Category = {
  id: CategoryId;
  label: string;
  /** Toujours 1.0 — les coefs d'ancienneté et de vétusté portent toute la dépréciation. */
  startRate: number;
  /** Coefficient d'ancienneté par âge en années révolues (index = âge). Dernière valeur réutilisée au-delà. */
  ageCoefficients: number[];
  ageIsHypothesis: boolean;
  /**
   * Électroménager / Outillage uniquement.
   * Si garantie active (≥ warrantyMinDays) : plafond = max(formule, prixNeuf × warrantyOverrideRate).
   * Garantit que la garantie augmente toujours la valeur.
   */
  warrantyOverrideRate?: number;
  /**
   * Jouets / Livres : plafond fixe par état, indépendant du prix neuf (braderie).
   * Prend le pas sur toute autre règle.
   */
  fixedPrices?: Partial<Record<ConditionId, number>>;
};

export type Condition = {
  id: ConditionId;
  label: string;
  coefficient: number;
  isHypothesis: boolean;
};

export type P2PConfig = {
  categories: Category[];
  conditions: Condition[];
  surcharges: {
    newNeverUsedNoWarranty: number;
    likeNewNoWarranty: number;
    verifiedWarranty: number;
  };
  /** Durée minimale de garantie restante (jours) pour la majoration / l'override. */
  warrantyMinDays: number;
};

export const defaultP2PConfig: P2PConfig = {
  categories: [
    // Smartphones : 100 € neuf, 2 ans, bon état → 40 €
    {
      id: "smartphones",
      label: "Smartphones et tablettes",
      startRate: 1.0,
      ageCoefficients: [1.0, 0.76, 0.571, 0.42, 0.30, 0.21, 0.14],
      ageIsHypothesis: false,
    },
    // Informatique : 1 200 € neuf, 2 ans, bon état → 300 €
    // Calibration : 1 000 € × 6 ans × bon état ≈ 70 € (ageCoef[6] = 0.10 → 1 000 × 0.10 × 0.70 = 70)
    {
      id: "informatique",
      label: "Informatique",
      startRate: 1.0,
      ageCoefficients: [1.0, 0.57, 0.357, 0.25, 0.17, 0.12, 0.10],
      ageIsHypothesis: false,
    },
    // TV / Audio : 100 € neuf, 2 ans, bon état → 45 € — courbe progressive (pas de plateau)
    {
      id: "tv-audio",
      label: "Téléviseurs, audio et vidéo",
      startRate: 1.0,
      ageCoefficients: [0.90, 0.75, 0.643, 0.46, 0.30, 0.18, 0.10],
      ageIsHypothesis: false,
    },
    // Électroménager : sans garantie à 2 ans, bon état → 40 €/300 €
    //                  avec garantie (≥ 1 mois) : max(formule, 45 % du prix neuf)
    {
      id: "electromenager",
      label: "Électroménager",
      startRate: 1.0,
      ageCoefficients: [0.80, 0.55, 0.190, 0.14, 0.09, 0.07],
      ageIsHypothesis: false,
      warrantyOverrideRate: 0.45,
    },
    // Meubles : 500 € → 50 € bon état, À TOUT ÂGE (ageCoef constant = 0.143)
    {
      id: "meubles",
      label: "Meubles et décoration",
      startRate: 1.0,
      ageCoefficients: [0.143],
      ageIsHypothesis: false,
    },
    // Vêtements : braderie, dépréciation rapide
    {
      id: "vetements",
      label: "Vêtements et chaussures",
      startRate: 1.0,
      ageCoefficients: [0.80, 0.50, 0.214, 0.15, 0.10],
      ageIsHypothesis: true,
    },
    // Outillage : sans garantie à 3 ans, bon état → 30 €/300 €
    //             avec garantie (≥ 1 mois) : max(formule, 45 % du prix neuf)
    {
      id: "outillage",
      label: "Outillage et bricolage",
      startRate: 1.0,
      ageCoefficients: [0.80, 0.55, 0.30, 0.143, 0.10, 0.07],
      ageIsHypothesis: false,
      warrantyOverrideRate: 0.45,
    },
    // Jouets : prix fixe par état (braderie — indépendant du prix neuf)
    {
      id: "jouets",
      label: "Jouets et loisirs",
      startRate: 1.0,
      ageCoefficients: [1.0],
      ageIsHypothesis: false,
      fixedPrices: {
        "neuf-jamais-utilise": 20,
        "comme-neuf": 15,
        "tres-bon": 15,
        "bon": 10,
        "usage": 10,
        "defauts": 5,
      },
    },
    // Livres standard : prix fixe 2 €
    {
      id: "livres",
      label: "Livres",
      startRate: 1.0,
      ageCoefficients: [1.0],
      ageIsHypothesis: false,
      fixedPrices: {
        "neuf-jamais-utilise": 2,
        "comme-neuf": 2,
        "tres-bon": 2,
        "bon": 2,
        "usage": 2,
        "defauts": 1,
      },
    },
    // Livres universitaires : prix fixe 5 €
    {
      id: "livres-universitaires",
      label: "Livres universitaires",
      startRate: 1.0,
      ageCoefficients: [1.0],
      ageIsHypothesis: false,
      fixedPrices: {
        "neuf-jamais-utilise": 5,
        "comme-neuf": 5,
        "tres-bon": 5,
        "bon": 5,
        "usage": 5,
        "defauts": 3,
      },
    },
  ],
  conditions: [
    { id: "neuf-jamais-utilise", label: "Neuf, jamais utilisé", coefficient: 1.0, isHypothesis: false },
    { id: "comme-neuf", label: "Comme neuf", coefficient: 0.95, isHypothesis: false },
    { id: "tres-bon", label: "Très bon état", coefficient: 0.85, isHypothesis: false },
    { id: "bon", label: "Bon état", coefficient: 0.70, isHypothesis: false },
    { id: "usage", label: "État d'usage", coefficient: 0.50, isHypothesis: false },
    { id: "defauts", label: "Défauts importants", coefficient: 0.30, isHypothesis: false },
  ],
  // Majorations (non applicables aux catégories avec warrantyOverrideRate)
  surcharges: {
    newNeverUsedNoWarranty: 0.1,
    likeNewNoWarranty: 0.05,
    verifiedWarranty: 0.07,
  },
  warrantyMinDays: 31,
};

export type P2PInput = {
  /** Valeur neuve de référence, saisie et justifiée. */
  referenceNewValue: number;
  category: CategoryId;
  ageYears: number;
  condition: ConditionId;
  /** Garantie vérifiée (facture/contrat), transférable, jours restants. null = pas de garantie. */
  verifiedWarrantyDaysLeft: number | null;
};

export type P2PResult = {
  maxPrice: number;
  steps: { label: string; value: number; isHypothesis: boolean }[];
  surcharge: { label: string; rate: number } | null;
  usesHypotheses: boolean;
  /** true pour jouets et livres : plafond fixe, indépendant du prix neuf. */
  isFixedPrice: boolean;
  /** true quand la garantie a relevé le plafond au-dessus de la formule âge/état. */
  warrantyOverrideApplied: boolean;
};

export function computeP2P(
  input: P2PInput,
  config: P2PConfig = defaultP2PConfig,
): P2PResult {
  const cat = config.categories.find((c) => c.id === input.category);
  const cond = config.conditions.find((c) => c.id === input.condition);
  if (!cat || !cond) throw new Error("Catégorie ou état inconnu");

  const value = Math.max(0, input.referenceNewValue);
  const age = Math.max(0, Math.floor(input.ageYears));

  // ── Cas prix fixe (jouets, livres) ───────────────────────────────────────────
  if (cat.fixedPrices) {
    const fixed =
      cat.fixedPrices[input.condition] ??
      cat.fixedPrices["usage"] ??
      cat.fixedPrices["defauts"] ??
      1;
    return {
      maxPrice: fixed,
      steps: [
        { label: `Prix fixe catégorie (${cat.label})`, value: fixed, isHypothesis: false },
      ],
      surcharge: null,
      usesHypotheses: false,
      isFixedPrice: true,
      warrantyOverrideApplied: false,
    };
  }

  // ── Calcul standard ───────────────────────────────────────────────────────────
  const ageCoef =
    cat.ageCoefficients[Math.min(age, cat.ageCoefficients.length - 1)] ?? 1;

  const hasWarranty =
    input.verifiedWarrantyDaysLeft !== null &&
    input.verifiedWarrantyDaysLeft >= config.warrantyMinDays;

  // Majorations exclusives (uniquement pour les catégories SANS warrantyOverrideRate)
  let surcharge: P2PResult["surcharge"] = null;
  if (!cat.warrantyOverrideRate) {
    if (hasWarranty) {
      surcharge = {
        label: "Garantie vérifiée et transférable (> 1 mois)",
        rate: config.surcharges.verifiedWarranty,
      };
    } else if (input.condition === "neuf-jamais-utilise") {
      surcharge = {
        label: "Neuf, jamais utilisé, hors garantie",
        rate: config.surcharges.newNeverUsedNoWarranty,
      };
    } else if (input.condition === "comme-neuf") {
      surcharge = {
        label: "Comme neuf, hors garantie",
        rate: config.surcharges.likeNewNoWarranty,
      };
    }
  }

  const raw =
    value * cat.startRate * ageCoef * cond.coefficient * (1 + (surcharge?.rate ?? 0));
  let maxPrice = Math.floor(raw);

  // ── Garantie override électroménager / outillage ──────────────────────────────
  // max(formule, warrantyOverrideRate × prixNeuf) → la garantie augmente toujours la valeur.
  let warrantyOverrideApplied = false;
  if (cat.warrantyOverrideRate && hasWarranty) {
    const warrantyFloor = Math.floor(value * cat.warrantyOverrideRate);
    if (warrantyFloor > maxPrice) {
      maxPrice = warrantyFloor;
      warrantyOverrideApplied = true;
    }
  }

  return {
    maxPrice,
    steps: [
      { label: "Valeur neuve de référence", value, isHypothesis: false },
      { label: `Coefficient d'ancienneté (${age} an${age > 1 ? "s" : ""})`, value: ageCoef, isHypothesis: cat.ageIsHypothesis },
      { label: `Coefficient de vétusté (${cond.label})`, value: cond.coefficient, isHypothesis: cond.isHypothesis },
    ],
    surcharge,
    usesHypotheses: cat.ageIsHypothesis || cond.isHypothesis,
    isFixedPrice: false,
    warrantyOverrideApplied,
  };
}
