/**
 * Route /deposer — Formulaire de dépôt d'annonce.
 *
 * SÉCURITÉ :
 *   - La valeur neuve de référence est recherchée automatiquement côté serveur.
 *   - Le vendeur ne peut pas saisir ni modifier la valeur de référence.
 *   - Le plafond affiché côté client est indicatif uniquement ;
 *     le plafond définitif est calculé et validé par submitListingFn (server action).
 *   - Si le serveur ne trouve pas de source fiable, l'annonce passe en
 *     `pending_price_review` et un administrateur doit valider le prix neuf.
 *   - L'âge et la garantie déclarés par le vendeur sont des informations
 *     NON VÉRIFIÉES automatiquement. Elles sont stockées telles quelles et
 *     affichées avec un avertissement ; la modération peut les contester.
 *
 * MOTEUR :
 *   Particuliers  → computeP2P  (src/lib/pricing/p2p.ts)
 *   Professionnels → computePro  (src/lib/pricing/pro.ts)
 *   Véhicules     → computeVehicle (src/lib/pricing/vehicle.ts)
 *   Dons          → aucun plafond (prix = 0)
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Info, AlertCircle, Loader2 } from "lucide-react";
import { defaultP2PConfig, type CategoryId, type ConditionId } from "@/lib/pricing/p2p";
import { defaultProConfig } from "@/lib/pricing/pro";
import { defaultVehicleConfig } from "@/lib/pricing/vehicle";
import { formatEUR } from "@/lib/pricing";
import { submitListingFn, type SubmitListingInput } from "@/fns/submit-listing";
import { uploadPhotoFn } from "@/fns/upload-photo";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/deposer")({
  head: () => ({
    meta: [
      { title: "Déposer une annonce — Moins que rien" },
      { name: "description", content: "Calculez le prix plafonné de votre objet et publiez votre annonce." },
      { property: "og:title", content: "Déposer une annonce — Moins que rien" },
      { property: "og:description", content: "Notre moteur calcule le prix maximum autorisé." },
    ],
  }),
  component: Deposer,
});

type Mode = "particulier" | "pro" | "vehicule" | "don" | "don_asso";

/** Association vérifiée appartenant à l'utilisateur connecté */
type UserAssociation = { id: string; name: string; verified_at: string };

const field = "w-full rounded-xl border border-input bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring";

function Deposer() {
  const navigate = useNavigate();

  /* ── État de soumission ─────────────────────────────────── */
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ listingId: string; pendingPriceReview: boolean } | null>(null);

  /* ── Photos ──────────────────────────────────────────────── */
  const [photos, setPhotos] = useState<{ url: string; uploading: boolean; error?: string }[]>([]);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  /* ── Mode ─────────────────────────────────────────────────── */
  const [mode, setMode] = useState<Mode>("particulier");

  /* ── Associations de l'utilisateur (pour don_asso) ──────── */
  const [userAssociations, setUserAssociations] = useState<UserAssociation[]>([]);
  const [assocLoading, setAssocLoading] = useState(false);
  const [selectedAssocId, setSelectedAssocId] = useState<string>("");

  useEffect(() => {
    if (mode !== "don_asso") return;
    setAssocLoading(true);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setAssocLoading(false); return; }
      const { data } = await supabase
        .from("associations")
        .select("id, name, verified_at")
        .eq("user_id", session.user.id)
        .not("verified_at", "is", null)
        .order("name");
      setUserAssociations((data ?? []) as UserAssociation[]);
      if (data && data.length === 1) setSelectedAssocId(data[0]!.id);
      setAssocLoading(false);
    });
  }, [mode]);

  /* ── Champs communs ──────────────────────────────────────── */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ean, setEan] = useState("");
  const [reference, setReference] = useState("");

  /* ── Particulier (P2P) ───────────────────────────────────── */
  const p2pCfg = defaultP2PConfig;
  const [p2pCategory, setP2pCategory] = useState<CategoryId>("informatique");
  const [p2pAge, setP2pAge] = useState(2);
  const [p2pCondition, setP2pCondition] = useState<ConditionId>("bon");
  // Garantie déclarée par le vendeur — NON VÉRIFIÉE automatiquement
  const [p2pWarranty, setP2pWarranty] = useState(false);
  const [p2pWarrantyDays, setP2pWarrantyDays] = useState(90);

  /* ── Professionnel ───────────────────────────────────────── */
  const proCfg = defaultProConfig;
  const [proCategory, setProCategory] = useState(proCfg.categories[0]?.id ?? "");
  const [proStockAge, setProStockAge] = useState(1);
  const [proCondition, setProCondition] = useState(proCfg.conditions[0]?.id ?? "");
  const [proQty, setProQty] = useState(1);

  /* ── Véhicule ────────────────────────────────────────────── */
  const vehCfg = defaultVehicleConfig;
  const [vehType, setVehType] = useState(vehCfg.types[0]?.id ?? "");
  const [vehAge, setVehAge] = useState(3);
  const [vehKm, setVehKm] = useState(80_000);
  const [vehCondition, setVehCondition] = useState(vehCfg.conditions[0]?.id ?? "");

  /* ── Prix vendeur ────────────────────────────────────────── */
  const [askingPrice, setAskingPrice] = useState<number | "">("");

  /* ── Plafond indicatif côté client ──────────────────────────
   * ATTENTION : ce plafond est uniquement indicatif pour l'interface.
   * Le plafond DÉFINITIF est calculé côté serveur par submitListingFn,
   * à partir du prix neuf trouvé automatiquement (jamais fourni par le client).
   * ─────────────────────────────────────────────────────────── */
  /**
   * Le plafond indicatif côté client est SUPPRIMÉ.
   * Il n'existe aucune valeur neuve de référence côté client avant soumission :
   * seul le serveur effectue la recherche automatique du prix neuf.
   * Cette variable est conservée en tant que null pour ne pas modifier le JSX.
   */
  const capResult = null;

  const asking = typeof askingPrice === "number" ? askingPrice : 0;

  /* ── Upload de photos (après création de l'annonce) ─────── */
  async function handlePhotoSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    listingId: string,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploadError(null);

    const idx = photos.length;
    setPhotos((prev) => [...prev, { url: "", uploading: true }]);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setPhotos((prev) => prev.map((p, i) => i === idx ? { ...p, uploading: false, error: "Non connecté" } : p));
      return;
    }

    // Lire en base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const result = await uploadPhotoFn({
          headers: { Authorization: `Bearer ${session.access_token}` },
          data: { listingId, fileBase64: base64, fileName: file.name },
        });
        if (result.ok) {
          setPhotos((prev) => prev.map((p, i) => i === idx ? { url: result.signedUrl, uploading: false } : p));
        } else {
          setPhotos((prev) => prev.map((p, i) => i === idx ? { ...p, uploading: false, error: result.error } : p));
          setPhotoUploadError(result.error);
        }
      } catch {
        setPhotos((prev) => prev.map((p, i) => i === idx ? { ...p, uploading: false, error: "Erreur réseau" } : p));
      }
    };
    reader.readAsDataURL(file);
  }

  /* ── Soumission réelle ───────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim() || title.trim().length < 5) {
      setSubmitError("Le titre doit comporter au moins 5 caractères.");
      return;
    }

    setSubmitting(true);
    try {
      // Récupérer le token de session Supabase pour l'authentification côté serveur.
      // submitListingFn (TanStack Start server function) lit l'en-tête Authorization: Bearer.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSubmitError("Vous devez être connecté pour déposer une annonce.");
        setSubmitting(false);
        return;
      }

      const result = await submitListingFn({
        headers: { Authorization: `Bearer ${session.access_token}` },
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          category: mode === "particulier" ? p2pCategory
            : mode === "pro" ? proCategory
            : mode === "vehicule" ? vehType
            : "don",
          condition: mode === "particulier" ? p2pCondition
            : mode === "pro" ? (proCondition as SubmitListingInput["condition"])
            : mode === "vehicule" ? (vehCondition as SubmitListingInput["condition"])
            : "bon",
          ageYears: mode === "particulier" ? p2pAge
            : mode === "pro" ? proStockAge
            : mode === "vehicule" ? vehAge
            : 0,
          ean: ean.trim() || undefined,
          reference: reference.trim() || undefined,
          mode: mode === "don_asso" ? "don_association" : mode === "don" ? "don" : mode,
          associationId: mode === "don_asso" ? selectedAssocId || undefined : undefined,
          askedPriceEur: mode !== "don" && mode !== "don_asso" && asking > 0 ? asking : undefined,
          // Garantie : déclarée par le vendeur, NON vérifiée automatiquement
          // Elle sera contrôlée par un modérateur avant publication
          verifiedWarrantyDaysLeft: mode === "particulier" && p2pWarranty ? p2pWarrantyDays : null,
          // Pro : quantité réelle du lot
          quantity: mode === "pro" ? proQty : undefined,
          // Véhicule : kilométrage réel saisi par le vendeur
          km: mode === "vehicule" ? vehKm : undefined,
        },
      });

      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      setSubmitted({ listingId: result.listingId, pendingPriceReview: result.pendingPriceReview });
    } catch (err) {
      setSubmitError("Une erreur réseau s'est produite. Veuillez réessayer.");
      console.error("[deposer] submitListingFn error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Écran de confirmation ───────────────────────────────── */
  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-16 pb-16 text-center">
        <div className="rounded-[2rem] bg-card p-8 shadow-soft">
          <div className="text-5xl mb-4">{submitted.pendingPriceReview ? "🔍" : "✅"}</div>
          <h2 className="text-2xl font-semibold mb-3">
            {submitted.pendingPriceReview ? "Annonce soumise — validation en cours" : "Annonce soumise avec succès"}
          </h2>
          {submitted.pendingPriceReview ? (
            <p className="text-muted-foreground text-sm">
              Aucune source automatique fiable n'a été trouvée pour le prix neuf de votre objet.
              Un administrateur va valider le prix de référence avant que votre annonce soit publiée.
              Vous serez notifié par e-mail.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Votre annonce est en cours de modération. Elle sera publiée après vérification.
            </p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Référence : {submitted.listingId}</p>

          {/* Upload de photos après soumission */}
          <div className="mt-6 text-left border-t pt-5">
            <p className="text-sm font-medium mb-2">📷 Ajouter des photos (optionnel, max 5)</p>
            {photos.map((p, i) => (
              <div key={i} className="text-xs mb-1 flex items-center gap-2">
                {p.uploading ? (
                  <span className="text-muted-foreground">Envoi…</span>
                ) : p.error ? (
                  <span className="text-destructive">{p.error}</span>
                ) : (
                  <img src={p.url} alt={`Photo ${i + 1}`} className="h-12 w-12 object-cover rounded" />
                )}
              </div>
            ))}
            {photoUploadError && (
              <p className="text-xs text-destructive mb-2">{photoUploadError}</p>
            )}
            {photos.length < 5 && (
              <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition">
                <span>+ Ajouter une photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => handlePhotoSelect(e, submitted.listingId)}
                />
              </label>
            )}
          </div>

          <button
            className="mt-6 rounded-full bg-foreground text-background px-6 py-2 text-sm font-medium"
            onClick={() => navigate({ to: "/" })}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  /* ── Rendu principal ─────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 md:px-8">
      <h1 className="text-4xl md:text-5xl fade-up">Déposer une annonce</h1>
      <p className="mt-3 text-muted-foreground">
        Le prix neuf est recherché automatiquement côté serveur. Le plafond définitif vous est communiqué après validation.
      </p>

      {/* Avertissement garantie / ancienneté */}
      <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 text-sm text-amber-900 dark:text-amber-200">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
        <p>
          <strong>Informations non vérifiées automatiquement :</strong> l'âge de l'objet et la garantie que vous déclarez
          sont enregistrés tels quels. Ils seront vérifiés par un modérateur avant publication.
          Toute fausse déclaration entraîne le rejet de l'annonce.
        </p>
      </div>

      {/* Sélecteur de mode */}
      <div className="mt-8 flex flex-wrap gap-2">
        {(["particulier", "pro", "vehicule", "don", "don_asso"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setAskingPrice(""); }}
            className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
              mode === m ? "bg-foreground text-background" : "border border-border hover:bg-muted"
            }`}
          >
            {m === "pro" ? "Déstockage pro" : m === "vehicule" ? "Véhicule" : m === "don" ? "Don immédiat" : m === "don_asso" ? "Don association" : "Particulier"}
          </button>
        ))}
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="mt-8 grid gap-5 rounded-[2rem] bg-card p-6 shadow-soft md:p-8">
        {/* Titre */}
        <label className="grid gap-2 text-sm">
          Titre de l'annonce <span className="text-destructive">*</span>
          <input
            className={field}
            placeholder="Ex : Canapé 3 places velours vert, vélo de ville…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={5}
            maxLength={120}
          />
        </label>

        {/* Description */}
        <label className="grid gap-2 text-sm">
          Description (optionnelle)
          <textarea
            className={`${field} min-h-[80px] resize-y`}
            placeholder="État détaillé, accessoires inclus, raison de la vente…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>

        {/* Identification du produit */}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Code-barres EAN / UPC (recommandé)
            <input
              className={field}
              placeholder="Ex : 3614273705899"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              maxLength={14}
              inputMode="numeric"
            />
            <span className="text-xs text-muted-foreground">
              Permet l'identification automatique du produit et améliore la fiabilité du prix trouvé.
            </span>
          </label>
          <label className="grid gap-2 text-sm">
            Référence fabricant (optionnelle)
            <input
              className={field}
              placeholder="Ex : MQ773LL/A"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={80}
            />
          </label>
        </div>

        {/* Note sécurité : valeur neuve non saisissable */}
        {mode !== "don" && (
          <div className="flex gap-3 rounded-2xl border border-border bg-secondary/60 p-4 text-sm">
            <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <p>
              <strong>Valeur neuve calculée automatiquement.</strong> Le serveur recherche le prix neuf
              de votre objet (EAN, référence, titre). Vous ne pouvez pas le modifier.
              Si aucune source fiable n'est disponible, l'annonce sera soumise à une vérification administrative.
            </p>
          </div>
        )}

        {/* ── Champs spécifiques au mode ── */}
        {mode === "particulier" && (
          <>
            <label className="grid gap-2 text-sm">
              Catégorie
              <select className={field} value={p2pCategory} onChange={(e) => setP2pCategory(e.target.value as CategoryId)}>
                {p2pCfg.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Âge (années) — déclaratif
                <input type="number" min={0} max={50} className={field} value={p2pAge} onChange={(e) => setP2pAge(+e.target.value)} />
                <span className="text-xs text-muted-foreground">Non vérifié automatiquement — soumis à modération.</span>
              </label>
              <label className="grid gap-2 text-sm">
                État réel
                <select className={field} value={p2pCondition} onChange={(e) => setP2pCondition(e.target.value as ConditionId)}>
                  {p2pCfg.conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={p2pWarranty} onChange={(e) => setP2pWarranty(e.target.checked)} className="h-4 w-4 accent-primary" />
              Garantie transférable avec justificatif — déclaratif, vérifié par modération
            </label>
            {p2pWarranty && (
              <label className="grid gap-2 text-sm">
                Jours de garantie restants (déclaratif)
                <input type="number" min={0} className={field} value={p2pWarrantyDays} onChange={(e) => setP2pWarrantyDays(+e.target.value)} />
                <span className="text-xs text-muted-foreground">
                  Non vérifié automatiquement. Un justificatif (bon de garantie, facture) sera demandé lors de la modération.
                </span>
              </label>
            )}
          </>
        )}

        {mode === "pro" && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Catégorie
                <select className={field} value={proCategory} onChange={(e) => setProCategory(e.target.value)}>
                  {proCfg.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                État
                <select className={field} value={proCondition} onChange={(e) => setProCondition(e.target.value)}>
                  {proCfg.conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Ancienneté du stock (années) — déclaratif
                <input type="number" min={0} className={field} value={proStockAge} onChange={(e) => setProStockAge(+e.target.value)} />
                <span className="text-xs text-muted-foreground">Non vérifié automatiquement — soumis à modération.</span>
              </label>
              <label className="grid gap-2 text-sm">
                Quantité
                <input type="number" min={1} className={field} value={proQty} onChange={(e) => setProQty(+e.target.value)} />
              </label>
            </div>
          </>
        )}

        {mode === "vehicule" && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Type de véhicule
                <select className={field} value={vehType} onChange={(e) => setVehType(e.target.value)}>
                  {vehCfg.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                État
                <select className={field} value={vehCondition} onChange={(e) => setVehCondition(e.target.value)}>
                  {vehCfg.conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Âge (années) — déclaratif
                <input type="number" min={0} className={field} value={vehAge} onChange={(e) => setVehAge(+e.target.value)} />
                <span className="text-xs text-muted-foreground">Vérifiable via carte grise lors de la modération.</span>
              </label>
              <label className="grid gap-2 text-sm">
                Kilométrage — déclaratif
                <input type="number" min={0} className={field} value={vehKm} onChange={(e) => setVehKm(+e.target.value)} />
                <span className="text-xs text-muted-foreground">Vérifiable via carnet d'entretien ou contrôle technique.</span>
              </label>
            </div>
          </>
        )}

        {/* Don immédiat : message simple */}
        {mode === "don" && (
          <div className="flex gap-3 rounded-2xl border border-border bg-secondary/60 p-4 text-sm">
            <Info className="h-5 w-5 shrink-0 text-primary" />
            <p>Les dons sont gratuits. Aucun prix n'est calculé. L'objet sera visible dans l'espace « Dons immédiats ».</p>
          </div>
        )}

        {/* Don association : sélection de l'association vérifiée */}
        {mode === "don_asso" && (
          <div className="rounded-2xl border border-border bg-secondary/60 p-4 text-sm space-y-3">
            <div className="flex gap-3">
              <Info className="h-5 w-5 shrink-0 text-primary" />
              <p>Ce don est réservé aux associations vérifiées (loi AGEC). Seules vos associations dont la vérification a été validée par l'administration sont listées ci-dessous.</p>
            </div>
            {assocLoading ? (
              <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de vos associations…</p>
            ) : userAssociations.length === 0 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950 p-3 text-amber-800 dark:text-amber-200">
                <p className="font-medium">Aucune association vérifiée trouvée.</p>
                <p className="mt-1 text-xs">Votre association doit être déclarée et vérifiée par l'administration avant de pouvoir déposer un don associatif. Contactez l'administration pour plus d'informations.</p>
              </div>
            ) : (
              <label className="grid gap-2">
                Votre association
                <select
                  className={field}
                  value={selectedAssocId}
                  onChange={(e) => setSelectedAssocId(e.target.value)}
                  required
                >
                  <option value="">— Sélectionnez une association —</option>
                  {userAssociations.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Seules vos associations vérifiées sont listées. Vous ne pouvez pas sélectionner une association dont vous n'êtes pas le représentant déclaré.</p>
              </label>
            )}
          </div>
        )}

        {/* ── Prix vendeur ── */}
        {mode !== "don" && (
          <div className="rounded-2xl bg-secondary p-5">
            <p className="text-sm text-muted-foreground">Plafond de vente — calculé par le serveur après identification du produit</p>
            <p className="font-display text-3xl font-semibold text-primary">
              —
              <span className="text-sm font-normal text-muted-foreground ml-2">connu après soumission</span>
            </p>
            <label className="mt-4 grid gap-2 text-sm">
              Votre prix de vente (€)
              <input
                type="number"
                min={0}
                className={field}
                value={askingPrice === "" ? "" : askingPrice}
                onChange={(e) => setAskingPrice(e.target.value === "" ? "" : +e.target.value)}
                placeholder="Laissez vide pour proposer au plafond"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              Le serveur vérifiera que votre prix ne dépasse pas le plafond calculé.
              Si votre prix dépasse le plafond réel, la soumission sera refusée.
            </p>
          </div>
        )}

        {/* Erreur de soumission */}
        {submitError && (
          <div className="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{submitError}</p>
          </div>
        )}

        {/* Bouton publier */}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-warm py-3.5 font-semibold text-primary-foreground shadow-glow transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Envoi en cours…" : "Soumettre l'annonce"}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          Votre annonce sera examinée avant publication. Le prix neuf est vérifié automatiquement côté serveur.
        </p>
      </form>
    </div>
  );
}
