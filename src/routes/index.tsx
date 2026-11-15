import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search, ShieldCheck, Gauge, Heart } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { listings as staticListings, spaces, type SpaceSlug } from "@/lib/data";
import { ListingCard } from "@/components/ListingCard";
import { getListingsFn } from "@/fns/get-listings";
import type { PublicListing } from "@/fns/get-listings";
import type { Listing } from "@/lib/data";
import { formatEUR } from "@/lib/pricing";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Moins que rien — la marketplace aux prix plafonnés" },
      { name: "description", content: "Achetez et vendez d'occasion à prix calculés et plafonnés. Particuliers, déstockage pro, dons et associations." },
      { property: "og:title", content: "Moins que rien — la marketplace aux prix plafonnés" },
      { property: "og:description", content: "Vendez vite, à prix exceptionnellement bas, calculés par la plateforme." },
    ],
  }),

  /**
   * Loader SSR : charge les annonces publiées depuis Supabase.
   * En cas d'erreur ou de liste vide, le composant affiche les démos statiques.
   */
  loader: async () => {
    try {
      const result = await getListingsFn({ data: { limit: 8 } });
      return { dbListings: result.listings, dbError: result.error };
    } catch {
      return { dbListings: [] as PublicListing[], dbError: "Impossible de joindre Supabase." };
    }
  },

  component: Index,
});

/** Converti une annonce Supabase en objet compatible avec ListingCard. */
function dbToListing(l: PublicListing): Listing {
  return {
    id: l.id,
    space: l.mode === "don" || l.mode === "don_association"
      ? "dons"
      : l.mode === "pro" ? "destockage"
      : l.mode === "vehicule" ? "vehicules"
      : "particuliers",
    title: l.title,
    price: l.price ?? 0,
    cap: l.cap ?? 0,
    ...(l.newPrice != null ? { newPrice: l.newPrice } : {}),
    city: "",
    // Utilise la première photo téléchargée (URL signée Supabase Storage).
    // Si aucune photo n'est disponible, affiche le placeholder générique.
    image: l.imageUrl ?? hero,
    condition: l.condition,
    seller: "",
    description: "",
    posted: new Date(l.created_at).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long",
    }),
  };
}

function Index() {
  const { dbListings, dbError } = Route.useLoaderData();

  // Utilise les annonces Supabase si disponibles, sinon les démos statiques
  const hasRealListings = dbListings.length > 0;
  const displayListings: Listing[] = hasRealListings
    ? dbListings.map(dbToListing)
    : staticListings;

  return (
    <div>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 md:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div className="fade-up flex flex-col justify-center">
          <span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-secondary-foreground">Prix plafonnés par la plateforme</span>
          <h1 className="mt-5 text-5xl font-medium leading-[1.02] md:text-7xl">
            Tout part, <em className="text-primary">pour presque rien.</em>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">Votre annonce dort depuis des semaines ? Ici, chaque prix est calculé et plafonné. Résultat : ça se vend, vite.</p>
          <form className="mt-8 flex max-w-lg items-center gap-2 rounded-full border border-border bg-card p-2 shadow-soft">
            <Search className="ml-3 h-5 w-5 text-muted-foreground" />
            <input placeholder="Canapé, vélo, lot de chaises…" className="flex-1 bg-transparent px-2 py-2 outline-none" />
            <button type="button" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background">Chercher</button>
          </form>
        </div>
        <div className="relative fade-up">
          <img src={hero} alt="Intérieur chaleureux avec fauteuil vintage" width={1600} height={1008} className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-soft lg:aspect-auto lg:h-[560px]" />
          <div className="absolute -bottom-6 left-6 rounded-2xl bg-card p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">Fauteuil bergère</p>
            <p className="font-display text-2xl font-semibold text-accent">Gratuit</p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-4 md:px-8">
        <h2 className="text-3xl md:text-4xl">Cinq espaces, une règle : <span className="text-primary">le juste petit prix.</span></h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(spaces) as SpaceSlug[]).map((s) => (
            <Link key={s} to="/espace/$slug" params={{ slug: s }} className="group relative overflow-hidden rounded-2xl bg-card p-5 shadow-soft transition hover:-translate-y-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{spaces[s].tagline}</p>
              <p className="mt-6 font-display text-2xl">{spaces[s].title}</p>
              <ArrowRight className="mt-4 h-5 w-5 text-primary transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-4 md:px-8">
        <div className="flex items-end justify-between">
          <h2 className="text-3xl md:text-4xl">Fraîchement déposé</h2>
          <Link to="/espace/$slug" params={{ slug: "particuliers" }} className="text-sm font-semibold text-primary">Tout voir →</Link>
        </div>

        {/* Avertissement explicite quand des données fictives sont affichées */}
        {!hasRealListings && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-1.5 text-sm text-amber-800 dark:text-amber-300">
            <span>⚠️</span>
            <span>
              <strong>Données de démonstration</strong> — aucune annonce réelle publiée pour l&apos;instant.
              {dbError && <span className="ml-1 text-xs opacity-70">({dbError})</span>}
            </span>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {displayListings.slice(0, 4).map((l) => <ListingCard key={l.id} l={l} />)}

          {/* ── Espace publicitaire natif — simulation ── */}
          <div className="relative col-span-1 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <span className="absolute right-2 top-2 z-10 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">Sponsorisé</span>
            {/* Visuel publicitaire */}
            <div className="relative flex h-44 items-center justify-center bg-gradient-to-br from-orange-500 to-amber-400">
              <div className="text-center text-white px-4">
                <p className="text-3xl font-bold leading-tight">Brocante<br/>du Marais</p>
                <p className="mt-1 text-sm font-medium opacity-90">Paris 3e · Chaque samedi</p>
              </div>
              <div className="absolute bottom-3 right-3 text-4xl">🛋️</div>
            </div>
            {/* Contenu */}
            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="text-sm font-semibold text-foreground leading-snug">
                Trouvez des pépites chez nos vendeurs partenaires
              </p>
              <p className="text-xs text-muted-foreground">
                Meubles, vaisselle, livres, vêtements — des centaines de stands chaque semaine.
              </p>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="mt-auto inline-block rounded-full bg-orange-500 px-4 py-1.5 text-center text-xs font-semibold text-white hover:bg-orange-600 transition"
              >
                Voir les stands →
              </a>
            </div>
          </div>

          {displayListings.slice(4).map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      </section>

      <section className="mx-auto mt-24 grid max-w-7xl gap-6 px-4 md:grid-cols-3 md:px-8">
        {[
          { i: Gauge, t: "Prix calculé", d: "Prix neuf, âge, état : notre moteur fixe un plafond infranchissable." },
          { i: ShieldCheck, t: "Vendeurs vérifiés", d: "SIRET pour les pros, agrément pour les associations." },
          { i: Heart, t: "Rien ne se perd", d: "Ce qui ne se vend pas se donne, et peut rejoindre une association." },
        ].map(({ i: I, t, d }) => (
          <div key={t} className="rounded-2xl border border-border p-6">
            <I className="h-6 w-6 text-primary" />
            <p className="mt-4 font-display text-xl">{t}</p>
            <p className="mt-2 text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
