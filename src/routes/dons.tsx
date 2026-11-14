/**
 * Page des dons — « Moins que rien »
 *
 * Affiche les véritables dons publiés dans Supabase.
 * La réservation est enregistrée en base via reserveDonationFn (action serveur authentifiée).
 * Atomicité : vérification d'existence + insert en deux étapes protégées côté serveur.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getDonationsFn, type PublicDon } from "@/server/actions/get-donations";
import { reserveDonationFn } from "@/server/actions/reserve-donation";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/dons")({
  head: () => ({
    meta: [
      { title: "Dons — Moins que rien" },
      {
        name: "description",
        content:
          "Objets offerts gratuitement, disponibles pour tous ou réservés aux associations vérifiées.",
      },
    ],
  }),

  loader: async () => {
    try {
      const result = await getDonationsFn({ data: { limit: 40 } });
      return { dons: result.dons, dbError: result.error };
    } catch {
      return { dons: [] as PublicDon[], dbError: "Impossible de joindre Supabase." };
    }
  },

  component: DonsPage,
});

type DonFilter = "tous" | "don" | "don_association";

const conditionLabel: Record<string, string> = {
  "neuf-jamais-utilise": "Neuf jamais utilisé",
  "comme-neuf": "Comme neuf",
  "tres-bon": "Très bon état",
  "bon": "Bon état",
  "usage": "Usagé",
  "defauts": "Avec défauts",
  "neuf-emballe": "Neuf emballé",
  "neuf-deballe": "Neuf déballé",
  "occasion": "Occasion",
  "excellent": "Excellent état",
  "moyen": "État moyen",
};

function DonCard({
  don,
  onReserved,
}: {
  don: PublicDon;
  onReserved: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(don.isReserved);

  async function handleReserve() {
    setError(null);
    setLoading(true);
    try {
      // Récupérer la session en cours
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Connectez-vous pour réserver ce don.");
        setLoading(false);
        return;
      }

      const result = await reserveDonationFn({
        headers: { Authorization: `Bearer ${session.access_token}` },
        data: { listingId: don.id },
      });

      if (!result.ok) {
        setError(result.error);
      } else {
        setDone(true);
        onReserved(don.id);
      }
    } catch (e) {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  const isAssociation = don.mode === "don_association";

  return (
    <article className="bg-card border rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm leading-snug">{don.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {conditionLabel[don.condition] ?? don.condition}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
            isAssociation
              ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
              : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          }`}
        >
          {isAssociation ? "Associations" : "Don immédiat"}
        </span>
      </div>

      {don.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{don.description}</p>
      )}

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          Publié le {new Date(don.created_at).toLocaleDateString("fr-FR")}
        </span>

        {done ? (
          <span className="text-xs text-green-600 font-medium">✅ Réservé — le donateur vous contactera</span>
        ) : (
          <button
            onClick={handleReserve}
            disabled={loading}
            className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60 ${
              isAssociation
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
            title={
              isAssociation
                ? "Réservé aux associations vérifiées"
                : "Je souhaite récupérer cet objet"
            }
          >
            {loading ? "Réservation…" : isAssociation ? "Réserver (association)" : "Je le prends"}
          </button>
        )}
      </div>
    </article>
  );
}

function DonsPage() {
  const { dons: initialDons, dbError } = Route.useLoaderData();
  const [dons, setDons] = useState<PublicDon[]>(initialDons);
  const [filter, setFilter] = useState<DonFilter>("tous");

  function handleReserved(id: string) {
    setDons((prev: PublicDon[]) => prev.map((d: PublicDon) => d.id === id ? { ...d, isReserved: true } : d));
  }

  const filtered = dons.filter((d: PublicDon) => {
    if (filter === "tous") return true;
    return d.mode === filter;
  });

  const countImmediat = dons.filter((d: PublicDon) => d.mode === "don").length;
  const countAssociation = dons.filter((d: PublicDon) => d.mode === "don_association").length;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* En-tête */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Dons & solidarité</h1>
        <p className="text-muted-foreground">
          Des objets offerts gratuitement. Certains sont réservés aux associations
          vérifiées par « Moins que rien ».
        </p>
        {dbError && (
          <p className="text-xs text-destructive">
            Connexion indisponible : {dbError}
          </p>
        )}
      </header>

      {/* Explication du fonctionnement */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-1">
          <div className="font-semibold text-sm flex items-center gap-2">
            <span>🎁</span> Dons immédiats
          </div>
          <p className="text-sm text-muted-foreground">
            Accessibles à toute personne connectée. Premier arrivé, premier servi.
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-xl p-4 space-y-1">
          <div className="font-semibold text-sm flex items-center gap-2">
            <span>🏛️</span> Dons réservés aux associations
          </div>
          <p className="text-sm text-muted-foreground">
            Réservés aux associations vérifiées par l&apos;administration de la plateforme.
          </p>
        </div>
      </section>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {(["tous", "don", "don_association"] as DonFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
              filter === f
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            {f === "tous"
              ? `Tous (${dons.length})`
              : f === "don"
              ? `Dons immédiats (${countImmediat})`
              : `Associations (${countAssociation})`}
          </button>
        ))}
      </div>

      {/* Liste des dons */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-4">📭</p>
          <p className="font-medium">Aucun don disponible pour le moment.</p>
          <p className="text-sm mt-1">Revenez bientôt ou déposez une annonce don.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((don: PublicDon) => (
            <DonCard key={don.id} don={don} onReserved={handleReserved} />
          ))}
        </div>
      )}
    </main>
  );
}
