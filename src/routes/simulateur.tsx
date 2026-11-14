import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { computeP2P, defaultP2PConfig, type CategoryId, type ConditionId } from "@/lib/pricing/p2p";
import { formatEUR } from "@/lib/pricing";

export const Route = createFileRoute("/simulateur")({
  head: () => ({
    meta: [
      { title: "Simulateur de prix plafond — Moins que rien" },
      { name: "description", content: "Calculez le prix maximum autorisé d'un objet d'occasion entre particuliers." },
      { property: "og:title", content: "Simulateur de prix plafond — Moins que rien" },
      { property: "og:description", content: "Valeur neuve, catégorie, ancienneté, vétusté et garantie." },
    ],
  }),
  component: Simulateur,
});

const field = "w-full rounded-xl border border-input bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring";
const pct = (v: number) => `${Math.round(v * 100)} %`;

function Simulateur() {
  const cfg = defaultP2PConfig;
  const [value, setValue] = useState(800);
  const [category, setCategory] = useState<CategoryId>("informatique");
  const [age, setAge] = useState(2);
  const [condition, setCondition] = useState<ConditionId>("tres-bon");
  const [warranty, setWarranty] = useState(false);
  const [days, setDays] = useState(90);

  const r = useMemo(
    () => computeP2P({ referenceNewValue: value, category, ageYears: age, condition, verifiedWarrantyDaysLeft: warranty ? days : null }, cfg),
    [value, category, age, condition, warranty, days, cfg],
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 md:px-8 lg:grid-cols-[1fr_1fr]">
      <div className="fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Particuliers</p>
        <h1 className="mt-2 text-4xl md:text-5xl">Simulateur de prix plafond</h1>
        <div className="mt-6 flex gap-3 rounded-2xl border border-border bg-secondary/60 p-4 text-sm">
          <Info className="h-5 w-5 shrink-0 text-primary" />
          <p><strong>Identification automatique du produit indisponible.</strong> Aucune source fiable de prix neufs n'est connectée : la valeur neuve doit être saisie et justifiée (facture, fiche fabricant).</p>
        </div>
        <div className="mt-6 grid gap-5 rounded-[2rem] bg-card p-6 shadow-soft">
          <label className="grid gap-2 text-sm">Valeur neuve de référence (€)<input type="number" min={0} className={field} value={value} onChange={(e) => setValue(+e.target.value)} /></label>
          <label className="grid gap-2 text-sm">Catégorie
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
              {cfg.categories.map((c) => <option key={c.id} value={c.id}>{c.label} — {pct(c.startRate)}</option>)}
            </select>
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">Âge (années)<input type="number" min={0} className={field} value={age} onChange={(e) => setAge(+e.target.value)} /></label>
            <label className="grid gap-2 text-sm">État réel
              <select className={field} value={condition} onChange={(e) => setCondition(e.target.value as ConditionId)}>
                {cfg.conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={warranty} onChange={(e) => setWarranty(e.target.checked)} className="h-4 w-4 accent-primary" />Garantie transférable avec justificatif</label>
          {warranty && <label className="grid gap-2 text-sm">Jours de garantie restants<input type="number" min={0} className={field} value={days} onChange={(e) => setDays(+e.target.value)} /></label>}
        </div>
      </div>

      <div className="fade-up lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[2rem] bg-foreground p-8 text-background shadow-soft">
          <p className="text-sm opacity-70">Prix maximum autorisé</p>
          <p className="mt-1 font-display text-6xl font-semibold text-primary-glow">{formatEUR(r.maxPrice)}</p>
          <ul className="mt-6 space-y-2 text-sm">
            {r.steps.map((s, i) => (
              <li key={s.label} className="flex justify-between gap-4 border-b border-background/15 pb-2">
                <span>{i > 0 && "× "}{s.label}{s.isHypothesis && <span className="ml-2 rounded bg-sun px-1.5 text-xs font-semibold text-foreground">hypothèse</span>}</span>
                <span className="font-semibold">{i === 0 ? formatEUR(s.value) : s.value.toFixed(2)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-4">
              <span>× Majoration{r.surcharge ? ` (${r.surcharge.label})` : " : aucune"}</span>
              <span className="font-semibold">{r.surcharge ? `+${pct(r.surcharge.rate)}` : "—"}</span>
            </li>
          </ul>
        </div>
        {r.usesHypotheses && (
          <div className="mt-4 flex gap-3 rounded-2xl border border-sun bg-sun/20 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>Les coefficients d'ancienneté et de vétusté sont des <strong>hypothèses de travail</strong> en attendant que vous les fixiez. Les taux de catégorie et les majorations sont ceux que vous avez définis.</p>
          </div>
        )}
      </div>
    </div>
  );
}
