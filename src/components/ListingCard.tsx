import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { formatEUR } from "@/lib/pricing";
import type { Listing } from "@/lib/data";

export function ListingCard({ l }: { l: Listing }) {
  const saving = l.newPrice ? Math.round((1 - l.price / l.newPrice) * 100) : null;
  return (
    <Link to="/annonce/$id" params={{ id: l.id }} className="group block fade-up">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
        <img src={l.image} alt={l.title} loading="lazy" width={816} height={816} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        {saving !== null && (
          <span className="absolute left-3 top-3 rounded-full bg-sun px-2.5 py-1 text-xs font-bold text-foreground">−{saving}% vs neuf</span>
        )}
        {l.price === 0 && <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">Don</span>}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <h3 className="font-sans text-[15px] font-medium leading-snug">{l.title}</h3>
        <p className="shrink-0 font-display text-lg font-semibold text-primary">{formatEUR(l.price)}</p>
      </div>
      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{l.city} · {l.posted}</p>
    </Link>
  );
}
