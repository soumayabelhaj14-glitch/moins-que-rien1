import { createFileRoute, notFound } from "@tanstack/react-router";
import { listings, spaces, type SpaceSlug } from "@/lib/data";
import { ListingCard } from "@/components/ListingCard";

export const Route = createFileRoute("/espace/$slug")({
  loader: ({ params }: { params: { slug: string } }) => {
    const space = spaces[params.slug as SpaceSlug];
    if (!space) throw notFound();
    return { slug: params.slug as SpaceSlug, space };
  },
  head: ({ loaderData }: { loaderData?: { slug: SpaceSlug; space: (typeof spaces)[SpaceSlug] } }) => {
    const t = loaderData ? `${loaderData.space.title} — Moins que rien` : "Espace — Moins que rien";
    const d = loaderData?.space.desc ?? "Annonces à prix plafonnés.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }] };
  },
  component: SpacePage,
});

function SpacePage() {
  const { slug, space } = Route.useLoaderData();
  const items = listings.filter((l) => l.space === slug);
  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <section className="relative mt-8 overflow-hidden rounded-[2rem]">
        <img src={space.image} alt="" width={816} height={816} className="h-64 w-full object-cover md:h-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 to-transparent" />
        <div className="absolute bottom-0 p-6 text-background md:p-10 fade-up">
          <p className="text-xs uppercase tracking-widest opacity-80">{space.tagline}</p>
          <h1 className="mt-2 text-4xl md:text-6xl">{space.title}</h1>
          <p className="mt-3 max-w-xl opacity-90">{space.desc}</p>
        </div>
      </section>
      <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {items.map((l) => <ListingCard key={l.id} l={l} />)}
      </div>
      {items.length === 0 && <p className="mt-10 text-muted-foreground">Aucune annonce pour l'instant.</p>}
    </div>
  );
}
