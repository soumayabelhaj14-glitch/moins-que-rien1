/**
 * Client Supabase typé pour « Moins que rien »
 *
 * Usage côté client (navigateur) : import { supabase } from "@/lib/supabase"
 * Usage côté serveur (loaders) : import { supabaseAdmin } from "@/lib/supabase"
 *
 * supabaseAdmin utilise la clé SERVICE_ROLE — ne jamais l'exposer au navigateur.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase.types";

// --- Variables d'environnement ---
const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string;
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis dans .env",
  );
}

/**
 * Client public — utilise la clé anonyme.
 * Soumis aux règles RLS (Row Level Security).
 * Sûr à exposer dans le navigateur.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Client admin — utilise la SERVICE_ROLE key.
 * Contourne les règles RLS. À utiliser UNIQUEMENT dans les loaders/actions
 * côté serveur (TanStack Start server functions).
 * Ne JAMAIS exposer cette clé dans le bundle client.
 */
export function getSupabaseAdmin() {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY est requis pour les opérations admin",
    );
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
