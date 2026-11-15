/**
 * Server action : upload d'une photo d'annonce vers Supabase Storage.
 *
 * Flux :
 *  1. L'utilisateur sélectionne une image dans le formulaire de dépôt.
 *  2. Le client envoie le fichier (base64) + l'ID de l'annonce au serveur.
 *  3. Le serveur vérifie l'authentification et l'appartenance de l'annonce.
 *  4. Le serveur uploade dans le bucket "photos/{listingId}/{filename}" via service_role.
 *  5. Le chemin est enregistré dans listing_photos.
 *  6. Une URL signée (1 heure) est renvoyée pour affichage immédiat.
 *
 * Limites :
 *  - Taille max : 5 Mo par fichier (enforced par le bucket).
 *  - Formats acceptés : JPEG, PNG, WebP.
 *  - 1 annonce peut avoir jusqu'à 5 photos.
 *
 * Sécurité :
 *  - Authentification vérifiée via Bearer token.
 *  - L'annonce doit appartenir à l'utilisateur.
 *  - L'annonce doit être en statut draft/pending (pas published).
 *  - Upload via service_role uniquement côté serveur.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase.types";

const MAX_PHOTOS_PER_LISTING = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo

export type UploadPhotoInput = {
  listingId: string;
  /** Contenu du fichier encodé en base64 (data URL ou raw base64) */
  fileBase64: string;
  /** Nom du fichier original (pour conserver l'extension) */
  fileName: string;
  /** true si cette photo doit devenir la photo principale */
  isMain?: boolean;
};

export type UploadPhotoResult =
  | { ok: true; photoId: string; signedUrl: string }
  | { ok: false; error: string; code: "auth" | "not_found" | "limit" | "size" | "format" | "db" };

export const uploadPhotoFn = createServerFn({ method: "POST" })
  .validator((data: UploadPhotoInput) => data)
  .handler(async ({ data, context }): Promise<UploadPhotoResult> => {
    // ── 1. Authentification ──────────────────────────────────────────────────
    const authHeader = (context as unknown as { request: Request }).request.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return { ok: false, error: "Authentification requise.", code: "auth" };
    }

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

    // ── 2. Vérifier l'annonce ────────────────────────────────────────────────
    const { data: listing, error: listingError } = await supabaseAdmin
      .from("listings")
      .select("id, seller_id, status")
      .eq("id", data.listingId)
      .single();

    if (listingError || !listing) {
      return { ok: false, error: "Annonce introuvable.", code: "not_found" };
    }
    if (listing.seller_id !== userId) {
      return { ok: false, error: "Cette annonce ne vous appartient pas.", code: "auth" };
    }
    if (!["draft", "pending_review", "pending_price_review"].includes(listing.status)) {
      return {
        ok: false,
        error: "Impossible d'ajouter des photos à une annonce déjà publiée ou archivée.",
        code: "not_found",
      };
    }

    // ── 3. Vérifier le nombre de photos existantes ───────────────────────────
    const { count } = await supabaseAdmin
      .from("listing_photos")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", data.listingId);

    if ((count ?? 0) >= MAX_PHOTOS_PER_LISTING) {
      return {
        ok: false,
        error: `Maximum ${MAX_PHOTOS_PER_LISTING} photos par annonce.`,
        code: "limit",
      };
    }

    // ── 4. Décoder et valider le fichier ─────────────────────────────────────
    // Accepter les data URL ("data:image/jpeg;base64,...") et le raw base64
    const base64Data = data.fileBase64.includes(",")
      ? data.fileBase64.split(",")[1]!
      : data.fileBase64;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, "base64");
    } catch {
      return { ok: false, error: "Fichier invalide.", code: "format" };
    }

    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: `Le fichier dépasse la limite de 5 Mo (taille reçue : ${(buffer.byteLength / 1024 / 1024).toFixed(1)} Mo).`,
        code: "size",
      };
    }

    // Détecter le type MIME depuis les magic bytes
    const mime = detectMime(buffer);
    if (!mime) {
      return {
        ok: false,
        error: "Format non accepté. Utilisez JPEG, PNG ou WebP.",
        code: "format",
      };
    }

    // ── 5. Upload vers Supabase Storage ─────────────────────────────────────
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
    const storagePath = `${data.listingId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from("photos")
      .upload(storagePath, buffer, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      console.error("[upload-photo] Storage upload:", uploadError.message);
      return { ok: false, error: "Échec de l'upload.", code: "db" };
    }

    // ── 6. Enregistrer en base ───────────────────────────────────────────────
    const isMain = data.isMain ?? (count ?? 0) === 0; // première photo = principale

    const { data: photo, error: dbError } = await supabaseAdmin
      .from("listing_photos")
      .insert({
        listing_id: data.listingId,
        storage_path: storagePath,
        is_main: isMain,
        position: count ?? 0,
      })
      .select("id")
      .single();

    if (dbError || !photo) {
      // Nettoyage Storage en cas d'échec DB
      await supabaseAdmin.storage.from("photos").remove([storagePath]);
      return { ok: false, error: "Erreur d'enregistrement.", code: "db" };
    }

    // ── 7. Générer une URL signée (1h) ───────────────────────────────────────
    const { data: signedData, error: signedError } = await supabaseAdmin
      .storage
      .from("photos")
      .createSignedUrl(storagePath, 3600);

    if (signedError || !signedData?.signedUrl) {
      return {
        ok: false,
        error: "Photo enregistrée mais URL de prévisualisation indisponible.",
        code: "db",
      };
    }

    return { ok: true, photoId: photo.id, signedUrl: signedData.signedUrl };
  });

/** Détecte le type MIME depuis les premiers octets (magic bytes). */
function detectMime(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
