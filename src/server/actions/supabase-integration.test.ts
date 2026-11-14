/**
 * Tests d'intégration Supabase — « Moins que rien »
 *
 * CES TESTS NÉCESSITENT UNE VRAIE BASE SUPABASE DE TEST.
 * Ils sont ignorés en l'absence des variables d'environnement Supabase.
 *
 * Pour les exécuter :
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=eyJ... \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   bun run test src/server/actions/supabase-integration.test.ts
 *
 * Couverture :
 *   I1 — RLS anon : seules les annonces publiées sont visibles
 *   I2 — donations_public view : pas de PII exposée
 *   I3 — reserve_donation() RPC : flux nominal avec deux utilisateurs authentifiés
 *   I4 — reserve_donation() RPC : double réservation atomiquement bloquée
 *   I5 — reserve_donation() RPC : don associatif refusé si association non vérifiée
 *   I6 — reserve_donation() RPC : refus si l'appelant n'est pas représentant de l'association
 *
 * Règles :
 *   - Toute erreur de setup fait ÉCHOUER le test (pas de console.warn + return)
 *   - Les données créées sont supprimées dans afterAll
 *   - Deux utilisateurs authentifiés distincts sont utilisés (user_a = donneur, user_b = bénéficiaire)
 *   - Les codes d'erreur exacts retournés par le RPC sont vérifiés
 *
 * Ne commande aucun service payant. Ne déploie rien en production.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase.types";

// ── Prérequis ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env["VITE_SUPABASE_URL"] ?? "";
const SUPABASE_ANON_KEY = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

const HAS_SUPABASE =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY.length > 20 &&
  SERVICE_ROLE_KEY.length > 20;

// Client admin (service_role) — utilisé uniquement pour setup/teardown
const admin = HAS_SUPABASE
  ? createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// Client anon — simule un visiteur non connecté
const anon = HAS_SUPABASE
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// ── Types RPC ─────────────────────────────────────────────────────────────────

type RpcResult = {
  ok: boolean;
  donation_id?: string;
  error?: string;
  code?: string;
};

// ── État partagé entre suites ─────────────────────────────────────────────────

/** Utilisateurs créés pour les tests — supprimés dans afterAll */
const createdUserIds: string[] = [];
/** Annonces créées pour les tests — supprimées dans afterAll */
const createdListingIds: string[] = [];
/** IDs d'associations créées — supprimées dans afterAll */
const createdAssocIds: string[] = [];

let userA: { id: string; accessToken: string } | null = null; // donneur
let userB: { id: string; accessToken: string } | null = null; // bénéficiaire
let donListingId: string | null = null;
let donAssoListingId: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Crée un utilisateur de test et retourne son ID + access token. */
async function createTestUser(label: string): Promise<{ id: string; accessToken: string }> {
  if (!admin) throw new Error("admin client non initialisé");
  const email = `mqr-test-${label}-${Date.now()}@test.invalid`;
  const password = "TestPassword123!";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${label}) échoué : ${error?.message}`);

  createdUserIds.push(data.user.id);

  // Obtenir un vrai access token via sign-in
  const anonClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session) {
    throw new Error(`signIn(${label}) échoué : ${signInError?.message}`);
  }

  return { id: data.user.id, accessToken: session.session.access_token };
}

/** Client Supabase authentifié avec le token d'un utilisateur de test. */
function authedClient(accessToken: string) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Appelle reserve_donation() via le client admin (côté serveur, comme le fait reserve-donation.ts). */
async function callReserve(params: {
  listingId: string;
  userId: string;
  associationId?: string;
}): Promise<RpcResult> {
  if (!admin) throw new Error("admin client non initialisé");
  // reserve_donation n'est pas encore dans les types générés — cast nécessaire
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("reserve_donation", {
    p_listing_id: params.listingId,
    p_user_id: params.userId,
    p_association_id: params.associationId ?? null,
  });
  if (error) throw new Error(`reserve_donation RPC error : ${error.message}`);
  return data as unknown as RpcResult;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP GLOBAL — créer les utilisateurs et les annonces de test
// ═══════════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  if (!HAS_SUPABASE || !admin) return;

  // Créer deux utilisateurs authentifiés
  [userA, userB] = await Promise.all([
    createTestUser("user-a"),
    createTestUser("user-b"),
  ]);

  // Annonce don gratuit (mode = 'don') en état published
  const { data: l1, error: e1 } = await admin
    .from("listings")
    .insert({
      seller_id: userA.id,
      title: "[TEST-MQR] Don immédiat — à supprimer",
      category: "informatique",
      condition: "bon",
      mode: "don",
      status: "published",
      asked_price_eur: null,
    })
    .select("id")
    .single();
  if (e1 || !l1) throw new Error(`Création annonce don échouée : ${e1?.message}`);
  donListingId = l1.id;
  createdListingIds.push(l1.id);

  // Ligne donations initiale 'open'
  const { error: de1 } = await admin
    .from("donations")
    .insert({ listing_id: l1.id, status: "open" });
  if (de1) throw new Error(`Création donations open échouée : ${de1.message}`);

  // Annonce don associatif (mode = 'don_association') en état published
  const { data: l2, error: e2 } = await admin
    .from("listings")
    .insert({
      seller_id: userA.id,
      title: "[TEST-MQR] Don associatif — à supprimer",
      category: "vetements",
      condition: "bon",
      mode: "don_association",
      status: "published",
      asked_price_eur: null,
    })
    .select("id")
    .single();
  if (e2 || !l2) throw new Error(`Création annonce don_association échouée : ${e2?.message}`);
  donAssoListingId = l2.id;
  createdListingIds.push(l2.id);

  const { error: de2 } = await admin
    .from("donations")
    .insert({ listing_id: l2.id, status: "open" });
  if (de2) throw new Error(`Création donations open (asso) échouée : ${de2.message}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEARDOWN — nettoyer toutes les données créées
// ═══════════════════════════════════════════════════════════════════════════════

afterAll(async () => {
  if (!admin) return;

  // Supprimer dans l'ordre FK : donations → listings → associations → users
  for (const id of createdListingIds) {
    await admin.from("donations").delete().eq("listing_id", id);
    await admin.from("listings").delete().eq("id", id);
  }
  for (const id of createdAssocIds) {
    await admin.from("associations").delete().eq("id", id);
  }
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// I1 — RLS anon : seules les annonces publiées sont visibles
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_SUPABASE)("I1 — RLS anon : visibilité des annonces", () => {
  it("retourne les annonces publiées sans authentification", async () => {
    const { data, error } = await anon!
      .from("listings")
      .select("id, status")
      .limit(5);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // Toutes les lignes visibles doivent avoir status = 'published'
    for (const row of data ?? []) {
      expect(row.status).toBe("published");
    }
  });

  it("ne retourne pas les annonces non publiées de l'utilisateur de test", async () => {
    if (!userA) throw new Error("userA non initialisé — setup échoué");

    // L'annonce de test est published, les brouillons du vendeur ne doivent pas apparaître
    const { data, error } = await anon!
      .from("listings")
      .select("id, status")
      .eq("seller_id", userA.id)
      .neq("status", "published")
      .limit(5);

    expect(error).toBeNull();
    // La RLS filtre les lignes non published → résultat vide
    expect(data?.length ?? 0).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I2 — donations_public view : pas d'identifiant bénéficiaire exposé
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_SUPABASE)("I2 — donations_public : aucune PII exposée", () => {
  it("donations_public ne contient pas de colonne beneficiary_id", async () => {
    if (!donListingId) throw new Error("donListingId non initialisé — setup échoué");

    const { data, error } = await anon!
      .from("donations_public" as "donations")
      .select("*")
      .eq("listing_id", donListingId)
      .limit(1);

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // La vue ne doit exposer ni beneficiary_id ni association_id
    const row = data?.[0] as Record<string, unknown> | undefined;
    if (row) {
      expect(Object.keys(row)).not.toContain("beneficiary_id");
      expect(Object.keys(row)).not.toContain("association_id");
    }
  });

  it("un client anon ne peut pas lire directement la table donations", async () => {
    if (!donListingId) throw new Error("donListingId non initialisé — setup échoué");

    // Après REVOKE ALL ON donations FROM anon, cette requête doit échouer
    const { data, error } = await anon!
      .from("donations")
      .select("beneficiary_id")
      .eq("listing_id", donListingId)
      .limit(1);

    // On attend soit une erreur (permission refusée), soit zéro ligne (RLS vide)
    const isBlocked = error !== null || (data?.length ?? 0) === 0;
    expect(isBlocked).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I3 — reserve_donation() : flux nominal
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_SUPABASE)("I3 — reserve_donation() : flux nominal", () => {
  it("userB réserve le don de userA avec succès", async () => {
    if (!donListingId || !userB) throw new Error("Setup échoué — données manquantes");

    const result = await callReserve({ listingId: donListingId, userId: userB.id });

    expect(result.ok).toBe(true);
    expect(result.donation_id).toBeDefined();
    expect(typeof result.donation_id).toBe("string");
  });

  it("la ligne donations passe bien à status='reserved' après la réservation", async () => {
    if (!donListingId) throw new Error("donListingId non initialisé — setup échoué");

    const { data, error } = await admin!
      .from("donations")
      .select("status, beneficiary_id")
      .eq("listing_id", donListingId)
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("reserved");
    expect(data?.beneficiary_id).toBe(userB!.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I4 — reserve_donation() : double réservation bloquée atomiquement
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_SUPABASE)("I4 — reserve_donation() : anti-doublon atomique", () => {
  it("une deuxième réservation retourne code='already_reserved'", async () => {
    if (!donListingId || !userB) throw new Error("Setup échoué — données manquantes");

    // La réservation de I3 a déjà eu lieu ; tenter à nouveau doit échouer
    const result = await callReserve({ listingId: donListingId, userId: userB.id });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("already_reserved");
    expect(typeof result.error).toBe("string");
  });

  it("un tiers (userA) ne peut pas non plus réserver le même don", async () => {
    if (!donListingId || !userA) throw new Error("Setup échoué — données manquantes");

    const result = await callReserve({ listingId: donListingId, userId: userA.id });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("already_reserved");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I5 — reserve_donation() : don associatif, association non vérifiée
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_SUPABASE)("I5 — reserve_donation() : association non vérifiée refusée", () => {
  let unverifiedAssocId: string | null = null;

  beforeAll(async () => {
    if (!admin || !userB) throw new Error("Setup échoué — admin ou userB manquant");

    const { data, error } = await admin
      .from("associations")
      .insert({
        user_id: userB.id,
        name: "[TEST-MQR] Association non vérifiée",
        siret: "12345678901234",
        verified_at: null,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Création association non vérifiée échouée : ${error?.message}`);
    unverifiedAssocId = data.id;
    createdAssocIds.push(data.id);
  });

  it("retourne code='not_verified_assoc' pour une association avec verified_at null", async () => {
    if (!donAssoListingId || !userB || !unverifiedAssocId) {
      throw new Error("Setup échoué — données manquantes");
    }

    const result = await callReserve({
      listingId: donAssoListingId,
      userId: userB.id,
      associationId: unverifiedAssocId,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("not_verified_assoc");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I6 — reserve_donation() : appelant non représentant de l'association
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_SUPABASE)("I6 — reserve_donation() : imposture d'association refusée", () => {
  let verifiedAssocId: string | null = null;

  beforeAll(async () => {
    if (!admin || !userB) throw new Error("Setup échoué — admin ou userB manquant");

    // Association VÉRIFIÉE appartenant à userB
    const { data, error } = await admin
      .from("associations")
      .insert({
        user_id: userB.id,
        name: "[TEST-MQR] Association vérifiée",
        siret: "98765432109876",
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(`Création association vérifiée échouée : ${error?.message}`);
    verifiedAssocId = data.id;
    createdAssocIds.push(data.id);

    // Réinitialiser le don associatif pour ce test
    // (s'il a déjà été réservé dans un test précédent, on crée une nouvelle annonce)
    const { data: l3, error: e3 } = await admin
      .from("listings")
      .insert({
        seller_id: userA!.id,
        title: "[TEST-MQR] Don associatif I6 — à supprimer",
        category: "vetements",
        condition: "bon",
        mode: "don_association",
        status: "published",
        asked_price_eur: null,
      })
      .select("id")
      .single();

    if (e3 || !l3) throw new Error(`Création annonce don_asso I6 échouée : ${e3?.message}`);
    createdListingIds.push(l3.id);

    const { error: de3 } = await admin
      .from("donations")
      .insert({ listing_id: l3.id, status: "open" });
    if (de3) throw new Error(`Création donations open I6 échouée : ${de3.message}`);

    // Remplacer donAssoListingId localement pour ce describe
    donAssoListingId = l3.id;
  });

  it("userA ne peut pas réserver avec l'association de userB (code='auth')", async () => {
    if (!donAssoListingId || !userA || !verifiedAssocId) {
      throw new Error("Setup échoué — données manquantes");
    }

    // userA tente de se faire passer pour un représentant de l'association de userB
    const result = await callReserve({
      listingId: donAssoListingId,
      userId: userA.id,
      associationId: verifiedAssocId,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("auth");
  });

  it("userB (vrai représentant) peut réserver avec son association", async () => {
    if (!donAssoListingId || !userB || !verifiedAssocId) {
      throw new Error("Setup échoué — données manquantes");
    }

    const result = await callReserve({
      listingId: donAssoListingId,
      userId: userB.id,
      associationId: verifiedAssocId,
    });

    expect(result.ok).toBe(true);
    expect(result.donation_id).toBeDefined();
  });
});
