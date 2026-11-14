import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MapPin, ShieldCheck, MessageCircle } from "lucide-react";
import { getListing, spaces } from "@/lib/data";
import { formatEUR } from "@/lib/pricing";

export const Route = createFileRoute("/annonce/$id")({
  loader: ({ params }: { params: { id: string } }) => {
    const l = getListing(params.id);
    if (!l) throw notFound();
    return l;
  },
  head: ({ loaderData }: { loaderData: ReturnType<typeof getListing> }) => {
    const t = loaderData ? `${loaderData.title} — Moins que rien` : "Annonce — Moins que rien";
    const d = loaderData?.description ?? "Annonce à prix plafonné.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }] };
  },
  component: ListingPage,
});

function ListingPage() {
  const l = Route.useLoaderData();
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-8 md:px-8 lg:grid-cols-[1.4fr_1fr]">
      <img src={l.image} alt={l.title} width={816} height={816} className="aspect-square w-full rounded-[2rem] object-cover shadow-soft fade-up" />
      <div className="fade-up lg:sticky lg:top-24 lg:self-start">
        <Link to="/espace/$slug" params={{ slug: l.space }} className="text-xs font-semibold uppercase tracking-widest text-primary">{spaces[l.space as keyof typeof spaces]?.title}</Link>
        <h1 className="mt-3 text-4xl leading-tight">{l.title}</h1>
        <p className="mt-2 flex items-center gap-1 text-muted-foreground"><MapPin className="h-4 w-4" />{l.city} · {l.posted}</p>
        <div className="mt-6 rounded-2xl bg-card p-6 shadow-soft">
          <p className="font-display text-5xl font-semibold text-primary">{formatEUR(l.price)}</p>
          {l.cap > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground"><span>Prix fixé</span><span>Plafond {formatEUR(l.cap)}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-warm" style={{ width: `${(l.price / l.cap) * 100}%` }} /></div>
              {l.newPrice && <p className="mt-2 text-sm text-muted-foreground">Prix neuf estimé : <s>{formatEUR(l.newPrice)}</s></p>}
            </div>
          )}
          <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-warm py-3.5 font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.02]">
            <MessageCircle className="h-5 w-5" /> {l.price === 0 ? "Je le veux" : "Contacter le vendeur"}
          </button>
        </div>
        <div className="mt-6 space-y-3">
          <p><span className="text-muted-foreground">État :</span> {l.condition}</p>
          <p className="leading-relaxed">{l.description}</p>
          <p className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-accent" />{l.seller}</p>
        </div>
      </div>
    </div>
  );
}
