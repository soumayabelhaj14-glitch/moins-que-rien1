/**
 * Server action : réservation atomique d'un don.
 *
 * SÉCURITÉ :
 *  - Authentification vérifiée via le jeton Bearer (Authorization header).
 *  - L'atomicité et les droits sont garantis par la fonction PostgreSQL
 *    SECURITY DEFINER reserve_donation() : un seul UPDATE conditionnel
 *    (WHERE status = 'open') exécuté dans une transaction lockée.
 *  - Le client ne peut JAMAIS insérer ou mettre à jour la table donations
 *    directement : la RLS interdit tout accès direct (revoke all).
 *  - Dons d'association : seules les associations vérifiées par un admin
 *    (verified_at IS NOT NULL) peuvent réserver.
 *  - L'utilisateur doit être le représentant déclaré de l'association.
 *
 * Ne commande aucun service payant. Ne déploie rien en production.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase.types";

export type ReserveDonationInput = {
  listingId: string;
  /** Pour un don d'association, fournir l'ID de l'association (vérifiée). */
  associationId?: string;
};

export type ReserveDonationResult =
  | { ok: true; donationId: string }
  | { ok: false; error: string; code: "auth" | "not_found" | "already_reserved" | "not_verified_assoc" | "db" };

export const reserveDonationFn = createServerFn({ method: "POST" })
  .validator((data: ReserveDonationInput) => data)
  .handler(async ({ data, context }): Promise<ReserveDonationResult> => {
    // ── 1. Authentification ──────────────────────────────────────────────────
    const authHeader = (context as { request: Request }).request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return { ok: false, error: "Authentification requise.", code: "auth" };
    }

    // Vérifier le token via un client Supabase public
    const supabasePublic = createClient<Database>(
      process.env["VITE_SUPABASE_URL"]!,
      process.env["VITE_SUPABASE_ANON_KEY"]!,
    );
    const { data: { user }, error: authError } = await supabasePublic.auth.getUser(token);
    if (authError || !user) {
      return { ok: false, error: "Session invalide ou expirée.", code: "auth" };
    }

    const userId = user.id;
    const supabaseAdmin = getSupabaseAdmin();

    // ── 2. Déléguer entièrement à la fonction SECURITY DEFINER ───────────────
    //
    // La fonction reserve_donation() est une fonction PostgreSQL SECURITY DEFINER :
    //   - Elle s'exécute avec les droits du propriétaire du schéma (service_role).
    //   - Elle vérifie l'existence de l'annonce, les droits de l'association,
    //     et effectue l'UPDATE atomique WHERE status = 'open'.
    //   - Elle est la SEULE voie d'écriture dans donations pour un client.
    //   - Le client ne peut pas contourner en appelant directement la table
    //     (revoke all on donations from anon, authenticated).
    //
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: rpcError } = await (supabaseAdmin as any)
      .rpc("reserve_donation", {
        p_listing_id: data.listingId,
        p_user_id: userId,
        p_association_id: data.associationId ?? null,
      });

    if (rpcError) {
      console.error("[reserve-donation] RPC error:", rpcError.message);
      return { ok: false, error: "Erreur lors de la réservation.", code: "db" };
    }

    // La fonction retourne un objet JSON { ok, donation_id?, error?, code? }
    type RpcResult = { ok: boolean; donation_id?: string; error?: string; code?: string };
    const res = result as unknown as RpcResult;

    if (!res.ok) {
      const code = (res.code ?? "db") as ReserveDonationResult extends { ok: false; code: infer C } ? C : never;
      return {
        ok: false,
        error: res.error ?? "Erreur inconnue.",
        code,
      };
    }

    if (!res.donation_id) {
      return { ok: false, error: "Réservation confirmée mais ID manquant.", code: "db" };
    }

    return { ok: true, donationId: res.donation_id };
  });
