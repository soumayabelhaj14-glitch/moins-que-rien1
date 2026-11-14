/**
 * Server action : charge les dons publiés depuis Supabase.
 */

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase.types";

export type PublicDon = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  condition: string;
  mode: "don" | "don_association";
  created_at: string;
  /** null si aucune réservation active */
  isReserved: boolean;
};

export const getDonationsFn = createServerFn({ method: "GET" })
  .validator((data: { limit?: number } | void) => data ?? {})
  .handler(async ({ data }): Promise<{ dons: PublicDon[]; error: string | null }> => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const supabaseAnonKey = process.env["VITE_SUPABASE_ANON_KEY"];

    if (!supabaseUrl || !supabaseAnonKey) {
      return { dons: [], error: "Configuration Supabase manquante." };
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
    const limit = data?.limit ?? 20;

    // Charger les annonces de type don publiées
    const { data: rows, error } = await supabase
      .from("listings")
      .select(`
        id,
        title,
        description,
        category,
        condition,
        mode,
        created_at,
        donations (
          id,
          status
        )
      `)
      .in("mode", ["don", "don_association"])
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[get-donations] Supabase error:", error.message);
      return { dons: [], error: "Impossible de charger les dons." };
    }

    const dons: PublicDon[] = (rows ?? []).map((row) => {
      const donations = Array.isArray(row.donations) ? row.donations : [];
      const hasActiveReservation = donations.some(
        (d) => d.status === "reserved" || d.status === "completed"
      );
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        condition: row.condition,
        mode: row.mode as "don" | "don_association",
        created_at: row.created_at,
        isReserved: hasActiveReservation,
      };
    });

    return { dons, error: null };
  });
