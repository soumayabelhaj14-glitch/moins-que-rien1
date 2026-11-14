/**
 * Page de connexion et d'inscription — « Moins que rien »
 *
 * Deux onglets : connexion et création de compte.
 * Utilise Supabase Auth via src/lib/auth.ts.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn, signUp, requestPasswordReset } from "@/lib/auth";

export const Route = createFileRoute("/connexion")({
  head: () => ({
    meta: [
      { title: "Connexion — Moins que rien" },
      { name: "description", content: "Connectez-vous ou créez votre compte." },
    ],
  }),
  component: ConnexionPage,
});

type Tab = "connexion" | "inscription";

function ConnexionPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("connexion");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Formulaire connexion
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Formulaire inscription
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [regName, setRegName] = useState("");

  // Réinitialisation mot de passe
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await signIn({ email: loginEmail, password: loginPassword });
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await navigate({ to: "/mon-compte" });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (regPassword !== regPassword2) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (regPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setIsLoading(true);
    const result = await signUp({ email: regEmail, password: regPassword, displayName: regName });
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess("Compte créé ! Vérifiez votre e-mail pour confirmer votre inscription.");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await requestPasswordReset(resetEmail);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Erreur lors de la demande.");
      return;
    }
    setSuccess("Un lien de réinitialisation a été envoyé à votre adresse e-mail.");
    setShowReset(false);
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="bg-card border rounded-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-4xl">✅</div>
          <p className="text-foreground font-medium">{success}</p>
          <button
            onClick={() => { setSuccess(null); setTab("connexion"); }}
            className="text-sm text-muted-foreground underline"
          >
            Retour à la connexion
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-card border rounded-xl p-8 max-w-sm w-full space-y-6">
        {/* Logo / titre */}
        <div className="text-center">
          <span className="text-2xl font-bold tracking-tight">Moins que rien</span>
          <p className="text-sm text-muted-foreground mt-1">La marketplace du prix juste</p>
        </div>

        {/* Onglets */}
        <div className="flex border rounded-lg overflow-hidden">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === "connexion" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => { setTab("connexion"); setError(null); }}
          >
            Connexion
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === "inscription" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => { setTab("inscription"); setError(null); }}
          >
            Créer un compte
          </button>
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Formulaire connexion */}
        {tab === "connexion" && !showReset && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="login-email">Adresse e-mail</label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="login-password">Mot de passe</label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? "Connexion…" : "Se connecter"}
            </button>
            <button
              type="button"
              onClick={() => setShowReset(true)}
              className="w-full text-sm text-muted-foreground underline"
            >
              Mot de passe oublié ?
            </button>
          </form>
        )}

        {/* Formulaire réinitialisation mot de passe */}
        {tab === "connexion" && showReset && (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Saisissez votre adresse e-mail. Vous recevrez un lien pour choisir un nouveau mot de passe.
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="reset-email">Adresse e-mail</label>
              <input
                id="reset-email"
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? "Envoi…" : "Envoyer le lien"}
            </button>
            <button
              type="button"
              onClick={() => { setShowReset(false); setError(null); }}
              className="w-full text-sm text-muted-foreground underline"
            >
              Retour
            </button>
          </form>
        )}

        {/* Formulaire inscription */}
        {tab === "inscription" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="reg-name">Prénom ou pseudo</label>
              <input
                id="reg-name"
                type="text"
                required
                minLength={2}
                maxLength={60}
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="reg-email">Adresse e-mail</label>
              <input
                id="reg-email"
                type="email"
                required
                autoComplete="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="reg-password">Mot de passe</label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="reg-password2">Confirmer le mot de passe</label>
              <input
                id="reg-password2"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={regPassword2}
                onChange={(e) => setRegPassword2(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? "Création du compte…" : "Créer mon compte"}
            </button>
          </form>
        )}

        <p className="text-xs text-muted-foreground text-center">
          En vous inscrivant, vous acceptez les{" "}
          <a href="/cgu" className="underline">conditions générales d'utilisation</a>.
        </p>
      </div>
    </main>
  );
}
