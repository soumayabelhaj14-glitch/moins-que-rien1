import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/mon-compte")({
  component: MonCompte,
});

function MonCompte() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/connexion" });
      } else {
        setEmail(session.user.email ?? null);
      }
      setLoading(false);
    });
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 md:px-8">
        <h1 className="font-display text-3xl font-bold text-foreground">
          Mon compte
        </h1>
        <p className="mt-2 text-muted-foreground">Connecté en tant que</p>
        <p className="mt-1 font-medium text-foreground">{email}</p>

        <button
          onClick={handleSignOut}
          className="mt-8 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Se déconnecter
        </button>
      </main>
    </div>
  );
}
