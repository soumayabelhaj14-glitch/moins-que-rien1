/**
 * Helpers d'authentification — « Moins que rien »
 *
 * Encapsule les appels Supabase Auth pour :
 *   - inscription par e-mail
 *   - connexion par e-mail
 *   - déconnexion
 *   - récupération de la session courante
 *   - récupération du profil utilisateur
 */

import { supabase } from "./supabase";
import type { Database } from "./supabase.types";

export type UserProfile = Database["public"]["Tables"]["profiles"]["Row"];

// ── Inscription ───────────────────────────────────────────────────────────────

export type SignUpParams = {
  email: string;
  password: string;
  displayName: string;
};

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function signUp({ email, password, displayName }: SignUpParams): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      // L'URL de confirmation d'email est configurée dans Supabase > Auth > URL Configuration
      emailRedirectTo: `${window.location.origin}/auth/confirm`,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data.user) return { ok: false, error: "Inscription échouée — veuillez réessayer." };
  return { ok: true, userId: data.user.id };
}

// ── Connexion ─────────────────────────────────────────────────────────────────

export type SignInParams = {
  email: string;
  password: string;
};

export async function signIn({ email, password }: SignInParams): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: "Email ou mot de passe incorrect." };
  if (!data.user) return { ok: false, error: "Connexion échouée — veuillez réessayer." };
  return { ok: true, userId: data.user.id };
}

// ── Déconnexion ───────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// ── Session ───────────────────────────────────────────────────────────────────

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

// ── Profil ────────────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data;
}

export async function updateUserProfile(
  userId: string,
  updates: Database["public"]["Tables"]["profiles"]["Update"],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Réinitialisation de mot de passe ─────────────────────────────────────────

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
