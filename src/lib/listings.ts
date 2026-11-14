/**
 * Service de gestion des annonces — « Moins que rien »
 *
 * Toutes les mutations passent par des server functions TanStack Start
 * qui calculent le plafond de prix côté serveur avant d'insérer en base.
 * Le client ne peut jamais forcer un prix supérieur au plafond.
 */

import { supabase } from "./supabase";
import type { Database } from "./supabase.types";

export type Listing = Database["public"]["Tables"]["listings"]["Row"];
export type ListingInsert = Database["public"]["Tables"]["listings"]["Insert"];

// ── Lecture ───────────────────────────────────────────────────────────────────

/** Récupère une annonce publiée par son ID. */
export async function getListing(id: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from("listings")
    .select("*, listing_photos(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error) return null;
  return data as Listing;
}

/** Récupère la liste des annonces publiées, avec filtres optionnels. */
export type ListingFilter = {
  category?: string;
  mode?: Listing["mode"];
  maxPrice?: number;
  page?: number;
  pageSize?: number;
};

export async function getListings(filter: ListingFilter = {}): Promise<{ listings: Listing[]; total: number }> {
  const { page = 1, pageSize = 20, category, mode, maxPrice } = filter;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("listings")
    .select("*, listing_photos(*)", { count: "exact" })
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category) query = query.eq("category", category);
  if (mode) query = query.eq("mode", mode);
  if (maxPrice) query = query.lte("asked_price_eur", maxPrice);

  const { data, count, error } = await query;
  if (error) return { listings: [], total: 0 };
  return { listings: (data ?? []) as Listing[], total: count ?? 0 };
}

/** Récupère les annonces d'un vendeur (toutes, y compris brouillons). */
export async function getMyListings(sellerId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select("*, listing_photos(*)")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as Listing[];
}

// ── Écriture ──────────────────────────────────────────────────────────────────

/**
 * Soumet une annonce pour modération.
 *
 * IMPORTANT : le max_price_eur est toujours calculé côté serveur
 * via la server action `submitListingAction` (voir src/actions/listings.ts).
 * Cette fonction est réservée aux opérations de lecture/affichage côté client.
 */
export async function withdrawListing(listingId: string, sellerId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("listings")
    .update({ status: "withdrawn" })
    .eq("id", listingId)
    .eq("seller_id", sellerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Dons ──────────────────────────────────────────────────────────────────────

export type Donation = Database["public"]["Tables"]["donations"]["Row"];

/** Récupère les dons disponibles (statut "open"). */
export async function getOpenDonations(): Promise<Donation[]> {
  const { data, error } = await supabase
    .from("donations")
    .select("*, listings(*)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as Donation[];
}

/** Réserve un don pour un bénéficiaire pendant 48h. */
export async function reserveDonation(
  donationId: string,
  beneficiaryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const reservedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("donations")
    .update({
      status: "reserved",
      beneficiary_id: beneficiaryId,
      reserved_until: reservedUntil,
    })
    .eq("id", donationId)
    .eq("status", "open"); // Évite les race conditions

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Réserve un don pour une association vérifiée. */
export async function reserveDonationForAssociation(
  donationId: string,
  associationId: string,
): Promise<{ ok: boolean; error?: string }> {
  // Vérifier que l'association est vérifiée (verified_at non null)
  const { data: assoc } = await supabase
    .from("associations")
    .select("id, verified_at")
    .eq("id", associationId)
    .single();

  if (!assoc?.verified_at) {
    return { ok: false, error: "Cette association n'est pas encore vérifiée par l'équipe." };
  }

  const reservedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 jours

  const { error } = await supabase
    .from("donations")
    .update({
      status: "reserved",
      association_id: associationId,
      reserved_until: reservedUntil,
    })
    .eq("id", donationId)
    .eq("status", "open");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
