/**
 * Server action : récupère les annonces publiées depuis Supabase.
 *
 * Utilise le client public Supabase (anon key) — les RLS permettent
 * la lecture des annonces `published` sans authentification.
 */

import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase.types";

/** Annonce telle que renvoyée au client (sous-ensemble de la Row DB). */
export type PublicListing = {
  id: string;
  title: string;
  /** Prix vendeur en €. null si don. */
  price: number | null;
  /** Plafond calculé par le moteur de prix. null si don. */
  cap: number | null;
  /** Prix neuf de référence utilisé pour le calcul du plafond. */
  newPrice: number | null;
  mode: "particulier" | "pro" | "vehicule" | "don" | "don_association";
  category: string;
  condition: string;
  created_at: string;
  /** URL de la première photo — null tant qu'aucune photo n'est attachée. */
  imageUrl: string | null;
};

/**
 * Charge les N annonces `published` les plus récentes.
 * @param limit - Nombre maximum d'annonces à renvoyer (défaut: 8)
 */
export const getListingsFn = createServerFn({ method: "GET" })
  .validator((data: { limit?: number } | void) => data ?? {})
  .handler(async ({ data }): Promise<{ listings: PublicListing[]; error: string | null }> => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const supabaseAnonKey = process.env["VITE_SUPABASE_ANON_KEY"];

    if (!supabaseUrl || !supabaseAnonKey) {
      return { listings: [], error: "Configuration Supabase manquante côté serveur." };
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

    const limit = data?.limit ?? 8;

    const { data: rows, error } = await supabase
      .from("listings")
      .select(`
        id,
        title,
        asked_price_eur,
        max_price_eur,
        reference_new_value_eur,
        mode,
        category,
        condition,
        created_at,
        listing_photos ( storage_path, position, is_main )
      `)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[get-listings] Supabase error:", error.message);
      return { listings: [], error: "Impossible de charger les annonces." };
    }

    // Client admin pour les URLs signées (accès Storage privé)
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const supabaseAdmin: SupabaseClient<Database> | null =
      supabaseUrl && serviceKey
        ? createClient<Database>(supabaseUrl, serviceKey)
        : null;

    const listings: PublicListing[] = await Promise.all(
      (rows ?? []).map(async (row) => {
        // Trier les photos : photo principale d'abord, puis par position
        const photos = Array.isArray(row.listing_photos)
          ? [...row.listing_photos].sort((a, b) => {
              if (a.is_main && !b.is_main) return -1;
              if (!a.is_main && b.is_main) return 1;
              return (a.position ?? 0) - (b.position ?? 0);
            })
          : [];
        const firstPhoto = photos[0] ?? null;

        let imageUrl: string | null = null;
        if (firstPhoto?.storage_path && supabaseAdmin) {
          const { data: signed } = await supabaseAdmin.storage
            .from("photos")
            .createSignedUrl(firstPhoto.storage_path, 3600);
          imageUrl = signed?.signedUrl ?? null;
        }

        return {
          id: row.id,
          title: row.title,
          price: row.asked_price_eur,
          cap: row.max_price_eur,
          newPrice: row.reference_new_value_eur,
          mode: row.mode,
          category: row.category,
          condition: row.condition,
          created_at: row.created_at,
          imageUrl,
        };
      }),
    );

    return { listings, error: null };
  });
