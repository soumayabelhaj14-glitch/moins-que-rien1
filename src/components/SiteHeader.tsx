import { Link } from "@tanstack/react-router";
import { Plus, User } from "lucide-react";
import { spaces, type SpaceSlug } from "@/lib/data";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function SiteHeader() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 md:px-8">
        <Link to="/" className="flex items-baseline gap-1 font-display text-2xl font-semibold tracking-tight">
          moins<span className="text-primary">que</span>rien<span className="text-primary">.</span>
        </Link>
        <nav className="hidden flex-1 gap-1 lg:flex">
          {(Object.keys(spaces) as SpaceSlug[]).map((s) => (
            <Link key={s} to="/espace/$slug" params={{ slug: s }} className="rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground" activeProps={{ className: "bg-muted text-foreground" }}>
              {spaces[s].title}
            </Link>
          ))}
        </nav>
        <Link to="/simulateur" className="ml-auto hidden rounded-full px-3 py-2 text-sm font-medium text-primary hover:bg-muted sm:block">Simulateur</Link>
        {userEmail ? (
          <Link to="/mon-compte" className="hidden items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-muted sm:inline-flex">
            <User className="h-4 w-4" /> Mon compte
          </Link>
        ) : (
          <Link to="/connexion" className="hidden rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-muted sm:block">
            Se connecter
          </Link>
        )}
        <Link to="/deposer" className="inline-flex items-center gap-2 rounded-full bg-warm px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.03]">
          <Plus className="h-4 w-4" /> Déposer
        </Link>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
        {(Object.keys(spaces) as SpaceSlug[]).map((s) => (
          <Link key={s} to="/espace/$slug" params={{ slug: s }} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm" activeProps={{ className: "bg-foreground text-background" }}>
            {spaces[s].title}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-secondary/50">
      <div className="mx-auto max-w-7xl px-4 py-12 text-sm text-muted-foreground md:px-8">
        <p className="font-display text-xl text-foreground">moins<span className="text-primary">que</span>rien.</p>
        <p className="mt-2 max-w-md">La marketplace française où les prix sont plafonnés pour que tout trouve preneur, vite.</p>
      </div>
    </footer>
  );
}
