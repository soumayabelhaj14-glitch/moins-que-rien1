/**
 * Tests d'INTÉGRATION — submit-listing + RLS Supabase
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CLASSIFICATION DES TESTS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * CATÉGORIE B — Tests d'intégration partielle (ce fichier, section B)
 *   Appellent processListingSubmission() (fonction pure exportée) avec
 *   un client Supabase mocké mais une logique métier réelle
 *   (calcul de prix, vérification des seuils, règles de validation).
 *   Peuvent tourner en CI sans aucune base de données.
 *   ⚠️  submitListingFn n'est PAS appelée ici : elle nécessite le contexte
 *       AsyncLocalStorage de TanStack Start, absent sous Vitest.
 *
 * CATÉGORIE C — Tests d'intégration complète (ce fichier, section C)
 *   Nécessitent une vraie base Supabase (locale ou Cloud).
 *   IGNORÉS en CI si SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY ne sont pas définis.
 *   Testent : RLS, contraintes SQL, transitions de statut, isolation multi-utilisateurs.
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processListingSubmission } from "@/server/actions/submit-listing";
import type { SubmitListingInput } from "@/server/actions/submit-listing";
import type { getSupabaseAdmin } from "@/lib/supabase";

// ── Utilitaires ─────────────────────────────────────────────────────────

const hasSupabaseEnv =
  !!process.env["SUPABASE_URL"] &&
  !!process.env["SUPABASE_SERVICE_ROLE_KEY"] &&
  !!process.env["SUPABASE_ANON_KEY"];

/** Wrapper pour ignorer proprement les tests nécessitant Supabase */
function itRequiresSupabase(name: string, fn: () => Promise<void>) {
  if (!hasSupabaseEnv) {
    it.skip(`[NÉCESSITE SUPABASE] ${name}`, fn);
  } else {
    it(name, fn);
  }
}

// ── Mock du module price-search ──────────────────────────────────────────

vi.mock("@/lib/product-lookup/price-search", () => ({
  searchNewPrice: vi.fn().mockResolvedValue({
    priceEUR: 879,
    source: "ean-search.org (EAN: 3614273705899)",
    fetchedAt: new Date().toISOString(),
    confidence: "exact",
  }),
}));

// ── Fabrique d'un mock Supabase admin ───────────────────────────────────

function makeMockSupabase(
  overrides: { insertData?: { id: string } | null; insertError?: { message: string } | null } = {},
): ReturnType<typeof getSupabaseAdmin> {
  const inserted = overrides.insertData ?? { id: "listing-real-test-01" };
  const insertError = overrides.insertError ?? null;

  const mockInsertChain = {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: inserted, error: insertError }),
    }),
  };

  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue(mockInsertChain),
    }),
  } as unknown as ReturnType<typeof getSupabaseAdmin>;
}

// ════════════════════════════════════════════════════════════════════════
// SECTION B — Tests d'intégration partielle (Supabase mocké)
// ════════════════════════════════════════════════════════════════════════

describe("B — Intégration partielle : logique réelle, Supabase mocké", () => {
  const USER_ID = "user-seller-01";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("B1 — EAN fourni → confiance exact → statut pending_review (pas pending_price_review)", async () => {
    // searchNewPrice est mocké globalement → confidence:"exact", priceEUR:879
    const input: SubmitListingInput = {
      title: "iPhone SE 3ème génération 64Go",
      category: "smartphones",
      condition: "bon",
      ageYears: 2,
      mode: "particulier",
      ean: "3614273705899",
      // Pas de prix demandé : on teste uniquement la confiance, pas le plafond
      // (computeP2P donne ~50 € pour 879 × 0.15 × ageCoef(2) × cond(bon))
      verifiedWarrantyDaysLeft: null,
    };

    const result = await processListingSubmission(input, USER_ID, makeMockSupabase());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pendingPriceReview).toBe(false); // confiance exact (0.9) > seuil (0.75)
      expect(result.maxPriceEur).toBeGreaterThan(0);
      expect(result.listingId).toBe("listing-real-test-01");
    }
  });

  it("B2 — Sans EAN + source non fiable → pending_price_review", async () => {
    const { searchNewPrice } = await import("@/lib/product-lookup/price-search");
    vi.mocked(searchNewPrice).mockResolvedValueOnce({
      priceEUR: null,
      source: "aucune source",
      fetchedAt: new Date().toISOString(),
      confidence: "manual",
      warningMessage: "Aucun prix trouvé.",
    });

    const input: SubmitListingInput = {
      title: "Gadget artisanal inconnu XJ-900",
      category: "autre",
      condition: "bon",
      ageYears: 1,
      mode: "particulier",
      askedPriceEur: 50,
      verifiedWarrantyDaysLeft: null,
    };

    const result = await processListingSubmission(input, USER_ID, makeMockSupabase());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pendingPriceReview).toBe(true);  // aucune source → admin requis
      expect(result.maxPriceEur).toBeNull();          // pas de plafond sans source fiable
    }
  });

  it("B3 — Prix demandé > plafond → rejet price_cap_exceeded", async () => {
    const { searchNewPrice } = await import("@/lib/product-lookup/price-search");
    vi.mocked(searchNewPrice).mockResolvedValueOnce({
      priceEUR: 500,
      source: "ean-search.org",
      fetchedAt: new Date().toISOString(),
      confidence: "exact",
    });

    const input: SubmitListingInput = {
      title: "Aspirateur Dyson V8 complet",
      category: "electromenager",
      condition: "bon",
      ageYears: 2,
      mode: "particulier",
      askedPriceEur: 9999, // clairement au-dessus du plafond
      verifiedWarrantyDaysLeft: null,
    };

    const result = await processListingSubmission(input, USER_ID, makeMockSupabase());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("price_cap_exceeded");
    }
  });

  it("B4 — Titre trop court → rejet validation (avant toute requête DB)", async () => {
    const input: SubmitListingInput = {
      title: "TV",   // < 5 caractères
      category: "tv-audio",
      condition: "bon",
      ageYears: 3,
      mode: "particulier",
      verifiedWarrantyDaysLeft: null,
    };

    const mockSupabase = makeMockSupabase();
    const result = await processListingSubmission(input, USER_ID, mockSupabase);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("validation");
    }
    // La DB ne doit pas être appelée pour une erreur de validation
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("B5 — Mode don → pas de plafond requis, pendingPriceReview peut être true", async () => {
    const { searchNewPrice } = await import("@/lib/product-lookup/price-search");
    vi.mocked(searchNewPrice).mockResolvedValueOnce({
      priceEUR: null,
      source: "aucune source",
      fetchedAt: new Date().toISOString(),
      confidence: "manual",
      warningMessage: "Aucun prix trouvé.",
    });

    const input: SubmitListingInput = {
      title: "Vieille cafetière italienne",
      category: "electromenager",
      condition: "usage",
      ageYears: 8,
      mode: "don",
      verifiedWarrantyDaysLeft: null,
    };

    // Les dons passent même sans source fiable (pas de vérification de plafond)
    const result = await processListingSubmission(input, USER_ID, makeMockSupabase());

    expect(result.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// SECTION C — Tests d'intégration complète (nécessitent Supabase réel)
// ════════════════════════════════════════════════════════════════════════

describe("C — Intégration complète : RLS et contraintes SQL (nécessite Supabase)", () => {
  /**
   * Ces tests sont IGNORÉS si les variables d'environnement Supabase ne sont pas définies.
   * Pour les exécuter localement :
   *   export SUPABASE_URL=https://xxxx.supabase.co
   *   export SUPABASE_SERVICE_ROLE_KEY=eyJ...
   *   export SUPABASE_ANON_KEY=eyJ...
   *   bun run test
   */

  itRequiresSupabase("C1 — RLS: un utilisateur ne peut pas insérer status=published directement", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_ANON_KEY"]!,
    );

    // Cette tentative doit être REJETÉE par la politique RLS listings_owner_insert
    const { error } = await anonClient.from("listings").insert({
      seller_id: "00000000-0000-0000-0000-000000000001",
      mode: "particulier",
      status: "published",  // ← doit être interdit par RLS
      title: "Tentative de publication directe",
      category: "informatique",
      condition: "bon",
    });

    expect(error).not.toBeNull();
  });

  itRequiresSupabase("C2 — RLS: un utilisateur ne peut pas modifier verified_at d'une association", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const serviceRole = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      { auth: { persistSession: false } },
    );
    const anonClient = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_ANON_KEY"]!,
    );

    // Créer une association de test via service_role
    const { data: assoc } = await serviceRole.from("associations").insert({
      user_id: "00000000-0000-0000-0000-000000000001",
      name: "Association Test RLS",
    }).select("id").single();

    if (!assoc) return;

    // Tenter de modifier verified_at via le client normal (doit échouer)
    const { error } = await anonClient.from("associations")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", assoc.id);

    expect(error).not.toBeNull();

    // Nettoyer
    await serviceRole.from("associations").delete().eq("id", assoc.id);
  });

  itRequiresSupabase("C3 — Contrainte SQL: annonce payante publiée sans plafond → rejet", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const serviceRole = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      { auth: { persistSession: false } },
    );

    // Même le service_role ne peut pas violer published_paid_requires_cap
    const { error } = await serviceRole.from("listings").insert({
      seller_id: "00000000-0000-0000-0000-000000000001",
      mode: "particulier",
      status: "published",
      title: "Annonce payante sans plafond — doit échouer",
      category: "informatique",
      condition: "bon",
      age_years: 2,
      // max_price_eur intentionnellement absent → contrainte published_paid_requires_cap doit rejeter
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/published_paid_requires_cap|constraint/i);
  });

  itRequiresSupabase("C4 — Isolation multi-utilisateurs : un vendeur ne voit pas les brouillons d'un autre", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const serviceRole = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      { auth: { persistSession: false } },
    );

    // Créer un brouillon appartenant à l'utilisateur 1
    const { data: listing } = await serviceRole.from("listings").insert({
      seller_id: "00000000-0000-0000-0000-000000000001",
      mode: "particulier",
      status: "draft",
      title: "Brouillon privé utilisateur 1",
      category: "informatique",
      condition: "bon",
      age_years: 1,
    }).select("id").single();

    if (!listing) return;

    // L'utilisateur anonyme ne doit pas voir ce brouillon
    const anonClient = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_ANON_KEY"]!,
    );

    const { data: visible } = await anonClient.from("listings")
      .select("id")
      .eq("id", listing.id);

    expect(visible).toHaveLength(0);

    // Nettoyer
    await serviceRole.from("listings").delete().eq("id", listing.id);
  });
});
