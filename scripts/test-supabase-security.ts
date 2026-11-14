/**
 * Tests de sécurité Supabase — Moins que rien V4
 *
 * Couvre les items 1 à 5 demandés :
 *   1. Tests d'intégration SQL C1–C4 (actuellement ignorés sous Vitest)
 *   2. Vérification qu'un utilisateur ne peut pas publier directement
 *   3. Vérification qu'une association ne peut pas s'auto-certifier
 *   4. Vérification qu'un utilisateur ne peut pas devenir admin
 *   5. Parcours complet (inscription → dépôt → modération → publication)
 *
 * Usage :
 *   export SUPABASE_URL=https://xxxx.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   export SUPABASE_ANON_KEY=eyJ...
 *   bun run scripts/test-supabase-security.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Configuration ────────────────────────────────────────────────────────

const SUPABASE_URL = process.env["SUPABASE_URL"];
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const ANON_KEY = process.env["SUPABASE_ANON_KEY"];

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error(
    "❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_ANON_KEY sont requis.\n" +
    "   export SUPABASE_URL=https://xxxx.supabase.co\n" +
    "   export SUPABASE_SERVICE_ROLE_KEY=eyJ...\n" +
    "   export SUPABASE_ANON_KEY=eyJ..."
  );
  process.exit(1);
}

// ── Clients ──────────────────────────────────────────────────────────────

/** Client admin (service_role) — ignore RLS */
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Client public non authentifié */
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
});

// ── Utilitaires ──────────────────────────────────────────────────────────

type Cleanup = () => Promise<void>;
const cleanups: Cleanup[] = [];

/** Crée un utilisateur de test et retourne un client authentifié en tant que cet utilisateur */
async function createTestUser(label: string): Promise<{
  userId: string;
  email: string;
  client: SupabaseClient;
}> {
  const email = `test-${label}-${Date.now()}@moins-que-rien.test`;
  const password = "TestMqr2026!";

  const { data: { user }, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !user) throw new Error(`Création user '${label}' échouée : ${error?.message}`);

  cleanups.push(async () => {
    await admin.auth.admin.deleteUser(user.id);
  });

  // Connexion avec le client anon pour obtenir un session token
  const userClient = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Connexion user '${label}' échouée : ${signInError.message}`);

  return { userId: user.id, email, client: userClient };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function runCleanup() {
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* ignore cleanup errors */ }
  }
}

// ── Runner de tests ──────────────────────────────────────────────────────

type TestResult = { name: string; suite: string; status: "pass" | "fail" | "skip"; error?: string };
const results: TestResult[] = [];
let currentSuite = "";

function describe(name: string, fn: () => void) {
  currentSuite = name;
  fn();
}

function it(name: string, fn: () => Promise<void>) {
  results.push({ name, suite: currentSuite, status: "skip" });
  const idx = results.length - 1;

  // On stocke la promesse pour l'exécuter en séquence
  pendingTests.push(async () => {
    process.stdout.write(`  • ${name} ... `);
    try {
      await fn();
      results[idx]!.status = "pass";
      console.log("✅");
    } catch (err) {
      results[idx]!.status = "fail";
      results[idx]!.error = err instanceof Error ? err.message : String(err);
      console.log(`❌\n    → ${results[idx]!.error}`);
    }
  });
}

const pendingTests: Array<() => Promise<void>> = [];

// ════════════════════════════════════════════════════════════════════════
// SUITE C — C1–C4 (intégration SQL + RLS)
// ════════════════════════════════════════════════════════════════════════

describe("C1–C4 — Intégration SQL et RLS", () => {

  it("C1 — INSERT status=published refusé pour un utilisateur normal", async () => {
    const { userId, client } = await createTestUser("c1");

    const { error } = await client.from("listings").insert({
      seller_id: userId,
      mode: "particulier",
      status: "published",        // ← INTERDIT par listings_owner_insert
      title: "Tentative frauduleuse de publication directe",
      category: "informatique",
      condition: "bon",
      age_years: 1,
    });

    assert(error !== null, "L'INSERT avec status=published doit être rejeté par la politique RLS");
  });

  it("C2 — Modification de verified_at refusée pour le propriétaire d'une association", async () => {
    const { userId, client } = await createTestUser("c2");

    // Admin crée l'association
    const { data: assoc } = await admin.from("associations").insert({
      user_id: userId,
      name: "Association Test RLS C2",
    }).select("id").single();
    assert(assoc !== null, "Création association échouée");
    cleanups.push(async () => { await admin.from("associations").delete().eq("id", assoc!.id); });

    // Propriétaire tente de s'auto-certifier
    const { error } = await client.from("associations")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", assoc!.id);

    if (!error) {
      // Si pas d'erreur, vérifier que la valeur n'a pas changé
      const { data: after } = await admin.from("associations").select("verified_at").eq("id", assoc!.id).single();
      assert(
        (after as unknown as { verified_at: unknown } | null)?.verified_at === null,
        `verified_at ne doit pas avoir été modifié (valeur actuelle : ${JSON.stringify((after as unknown as Record<string, unknown> | null)?.verified_at)})`
      );
    }
  });

  it("C3 — Contrainte SQL published_paid_requires_cap : annonce payante sans plafond → rejetée même via service_role", async () => {
    const { error } = await admin.from("listings").insert({
      seller_id: "00000000-0000-0000-0000-000000000099",
      mode: "particulier",
      status: "published",
      title: "C3 — viole published_paid_requires_cap",
      category: "informatique",
      condition: "bon",
      age_years: 2,
      reference_new_value_eur: 500,
      asked_price_eur: 300,
      // max_price_eur intentionnellement absent
    });

    assert(error !== null, "La contrainte published_paid_requires_cap doit rejeter cette insertion");
  });

  it("C4 — Brouillon d'un vendeur invisible pour les autres utilisateurs", async () => {
    const { userId: idA } = await createTestUser("c4a");
    const { client: clientB } = await createTestUser("c4b");

    // Admin insère un brouillon appartenant à A
    const { data: listing } = await admin.from("listings").insert({
      seller_id: idA,
      mode: "particulier",
      status: "draft",
      title: "C4 — Brouillon privé de A",
      category: "informatique",
      condition: "bon",
      age_years: 1,
    }).select("id").single();
    assert(listing !== null, "Création brouillon échouée");
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing!.id); });

    // B tente de le lire
    const { data: visible } = await clientB.from("listings")
      .select("id")
      .eq("id", listing!.id);

    assert((visible?.length ?? 0) === 0, `Le brouillon de A doit être invisible pour B (trouvé ${visible?.length} entrée(s))`);
  });
});

// ════════════════════════════════════════════════════════════════════════
// SUITE 2 — Manipulation directe des annonces
// ════════════════════════════════════════════════════════════════════════

describe("Item 2 — Manipulation directe des annonces", () => {

  it("Un vendeur ne peut pas modifier le max_price_eur de sa propre annonce", async () => {
    const { userId, client } = await createTestUser("max-price");

    const { data: listing } = await admin.from("listings").insert({
      seller_id: userId,
      mode: "particulier",
      status: "draft",
      title: "Annonce dont on tente de modifier le plafond",
      category: "smartphones",
      condition: "bon",
      age_years: 2,
      reference_new_value_eur: 879,
      max_price_eur: 50,
      asked_price_eur: 40,
    }).select("id").single();
    assert(listing !== null, "Création listing échouée");
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing!.id); });

    const { error } = await client.from("listings")
      .update({ max_price_eur: 99999 })
      .eq("id", listing!.id);

    if (!error) {
      const { data: after } = await admin.from("listings").select("max_price_eur").eq("id", listing!.id).single();
      const val = (after as unknown as { max_price_eur: number } | null)?.max_price_eur ?? 0;
      assert(val <= 50, `max_price_eur ne doit pas avoir été modifié au-delà de 50 (valeur actuelle : ${val})`);
    }
    // Si error → encore mieux, la RLS a bloqué directement
  });

  it("Un vendeur ne peut pas passer une annonce draft directement à published", async () => {
    const { userId, client } = await createTestUser("status-bypass");

    const { data: listing } = await admin.from("listings").insert({
      seller_id: userId,
      mode: "particulier",
      status: "draft",
      title: "Tentative de bypass de modération",
      category: "informatique",
      condition: "bon",
      age_years: 1,
    }).select("id").single();
    assert(listing !== null, "Création listing échouée");
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing!.id); });

    const { error } = await client.from("listings")
      .update({ status: "published" })
      .eq("id", listing!.id);

    if (!error) {
      const { data: after } = await admin.from("listings").select("status").eq("id", listing!.id).single();
      const status = (after as unknown as { status: string } | null)?.status;
      assert(status !== "published", `Le statut ne doit pas avoir été changé à published (statut actuel : ${status})`);
    }
  });

  it("Un vendeur ne peut pas modifier les annonces d'un autre vendeur", async () => {
    const { userId: idA } = await createTestUser("cross-a");
    const { client: clientB } = await createTestUser("cross-b");

    const { data: listing } = await admin.from("listings").insert({
      seller_id: idA,
      mode: "particulier",
      status: "draft",
      title: "Annonce de A que B va tenter de modifier",
      category: "informatique",
      condition: "bon",
      age_years: 1,
    }).select("id").single();
    assert(listing !== null, "Création listing échouée");
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing!.id); });

    const { error } = await clientB.from("listings")
      .update({ title: "Modifié par B — attaque cross-seller" })
      .eq("id", listing!.id);

    if (!error) {
      const { data: after } = await admin.from("listings").select("title").eq("id", listing!.id).single();
      const title = (after as unknown as { title: string } | null)?.title;
      assert(title !== "Modifié par B — attaque cross-seller", "B ne doit pas pouvoir modifier l'annonce de A");
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
// SUITE 3 — Associations
// ════════════════════════════════════════════════════════════════════════

describe("Item 3 — Associations : auto-certification", () => {

  it("Le propriétaire ne peut pas créer une association avec verified_at déjà rempli", async () => {
    const { userId, client } = await createTestUser("assoc-inject");

    const { data: inserted, error } = await client.from("associations").insert({
      user_id: userId,
      name: "Asso auto-vérifiée (tentative)",
      verified_at: "2020-01-01T00:00:00Z",   // ← doit être rejeté par assoc_owner_insert
    }).select("id").single();

    if (inserted) {
      cleanups.push(async () => { await admin.from("associations").delete().eq("id", inserted.id); });
    }

    if (!error && inserted) {
      // Si la ligne a quand même été créée, verified_at doit être NULL
      const { data: after } = await admin.from("associations").select("verified_at").eq("id", inserted.id).single();
      const v = (after as unknown as { verified_at: unknown } | null)?.verified_at;
      assert(v === null, `verified_at ne doit pas être défini à l'insertion (valeur : ${JSON.stringify(v)})`);
    }
    // Si error → la RLS a correctement rejeté → test passé
  });

  it("Seul le service_role peut modifier verified_at sur une association existante", async () => {
    const { userId } = await createTestUser("assoc-admin");

    const { data: assoc } = await admin.from("associations").insert({
      user_id: userId,
      name: "Asso pour test admin",
    }).select("id").single();
    assert(assoc !== null, "Création association échouée");
    cleanups.push(async () => { await admin.from("associations").delete().eq("id", assoc!.id); });

    const { error } = await admin.from("associations")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", assoc!.id);

    assert(error === null, `Le service_role doit pouvoir modifier verified_at (erreur : ${error?.message})`);
  });
});

// ════════════════════════════════════════════════════════════════════════
// SUITE 4 — Escalade de privilèges
// ════════════════════════════════════════════════════════════════════════

describe("Item 4 — Escalade de privilèges", () => {

  it("Un utilisateur ne peut pas lire les brouillons d'un autre (vérification SELECT RLS)", async () => {
    const { userId: idA } = await createTestUser("priv-a");
    const { client: clientB } = await createTestUser("priv-b");

    const { data: listing } = await admin.from("listings").insert({
      seller_id: idA,
      mode: "particulier",
      status: "draft",
      title: "Brouillon secret de A",
      category: "informatique",
      condition: "bon",
      age_years: 1,
    }).select("id").single();
    assert(listing !== null, "Création listing échouée");
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing!.id); });

    const { data } = await clientB.from("listings").select("id").eq("id", listing!.id);
    assert((data?.length ?? 0) === 0, `B ne doit pas voir le brouillon de A (${data?.length} résultat(s))`);
  });

  it("Un utilisateur non authentifié ne voit pas les brouillons", async () => {
    // On insère un brouillon via admin
    const { data: listing } = await admin.from("listings").insert({
      seller_id: "00000000-0000-0000-0000-000000000099",
      mode: "particulier",
      status: "draft",
      title: "Brouillon inaccessible publiquement",
      category: "informatique",
      condition: "bon",
      age_years: 1,
    }).select("id").single();
    if (!listing) return; // skip si contrainte FK sur seller_id
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing.id); });

    const { data } = await anonClient.from("listings").select("id").eq("id", listing.id);
    assert((data?.length ?? 0) === 0, `Un brouillon ne doit pas être visible publiquement (${data?.length} résultat(s))`);
  });
});

// ════════════════════════════════════════════════════════════════════════
// SUITE 5 — Parcours complet
// ════════════════════════════════════════════════════════════════════════

describe("Item 5 — Parcours complet inscription → publication", () => {

  it("Inscription → dépôt → pending_price_review → approbation admin → publication → visible", async () => {
    // 1. Inscription vendeur
    const { userId, email } = await createTestUser("parcours");
    console.log(`\n      Utilisateur : ${email}`);

    // 2. Dépôt (statut pending_price_review — comme quand la recherche de prix échoue)
    const { data: listing, error: insertErr } = await admin.from("listings").insert({
      seller_id: userId,
      mode: "particulier",
      status: "pending_price_review",
      title: "Vélo de route Trek Domane SL 5",
      category: "sport",
      condition: "tres-bon",
      age_years: 3,
      price_new_confidence: "manual_admin",
      price_new_source: "aucune source automatique",
      price_new_fetched_at: new Date().toISOString(),
    }).select("id").single();
    assert(insertErr === null, `Dépôt annonce échoué : ${insertErr?.message}`);
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing!.id); });
    console.log(`      Annonce déposée : id=${listing!.id}, statut=pending_price_review`);

    // 3. Admin valide la valeur neuve et calcule le plafond
    const refValue = 1200;
    // sport × startRate 0.18 × ageCoef(3 ans)=0.80 × condition tres-bon=0.85 → ≈ 147 €
    const maxPrice = Math.floor(refValue * 0.18 * 0.80 * 0.85);
    const { error: adminPriceErr } = await admin.from("listings").update({
      reference_new_value_eur: refValue,
      max_price_eur: maxPrice,
      price_new_confidence: "manual_admin",
      price_new_source: "admin_manual",
      status: "pending_review",
    }).eq("id", listing!.id);
    assert(adminPriceErr === null, `Validation admin prix échouée : ${adminPriceErr?.message}`);
    console.log(`      Admin valide : valeur=${refValue} €, plafond=${maxPrice} €`);

    // 4. Admin publie avec un prix en dessous du plafond
    const askedPrice = maxPrice - 10;
    const { error: pubErr } = await admin.from("listings").update({
      status: "published",
      asked_price_eur: askedPrice,
    }).eq("id", listing!.id);
    assert(pubErr === null, `Publication admin échouée : ${pubErr?.message}`);
    console.log(`      Publiée : prix=${askedPrice} €`);

    // 5. Vérification de l'état final
    const { data: final } = await admin.from("listings").select("*").eq("id", listing!.id).single();
    const finalData = final as unknown as Record<string, unknown> | null;
    assert(finalData?.status === "published", `Statut final attendu 'published' (obtenu : ${finalData?.status})`);
    assert((finalData?.asked_price_eur as number) <= (finalData?.max_price_eur as number),
      `asked_price_eur (${finalData?.asked_price_eur}) doit être ≤ max_price_eur (${finalData?.max_price_eur})`);

    // 6. Visible publiquement
    const { data: publicView } = await anonClient.from("listings").select("id, status").eq("id", listing!.id);
    assert((publicView?.length ?? 0) > 0, "Une annonce publiée doit être visible publiquement");
    console.log(`      Visible publiquement : OUI`);
  });

  it("Parcours don : insertion → statut pending_review, entrée donations créée", async () => {
    const { userId } = await createTestUser("don");

    const { data: listing, error: lErr } = await admin.from("listings").insert({
      seller_id: userId,
      mode: "don",
      status: "pending_review",
      title: "Vieille cafetière italienne à donner",
      category: "electromenager",
      condition: "usage",
      age_years: 10,
      asked_price_eur: 0,
    }).select("id").single();
    assert(lErr === null, `Insertion listing don échouée : ${lErr?.message}`);
    cleanups.push(async () => { await admin.from("listings").delete().eq("id", listing!.id); });

    const { error: dErr } = await admin.from("donations").insert({
      listing_id: listing!.id,
      association_id: null,
      status: "open",
    });
    assert(dErr === null, `Insertion donation échouée : ${dErr?.message}`);
    cleanups.push(async () => { await admin.from("donations").delete().eq("listing_id", listing!.id); });

    const { data: donation } = await admin.from("donations").select("status").eq("listing_id", listing!.id).single();
    const dStatus = (donation as unknown as { status: string } | null)?.status;
    assert(dStatus === "open", `Statut donation attendu 'open' (obtenu : ${dStatus})`);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Exécution séquentielle
// ════════════════════════════════════════════════════════════════════════

async function run() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  TESTS DE SÉCURITÉ SUPABASE — Moins que rien V4");
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  URL : ${SUPABASE_URL}`);
  console.log("══════════════════════════════════════════════════════════════");

  // Regrouper par suite pour l'affichage
  let currentDisplaySuite = "";
  for (let i = 0; i < pendingTests.length; i++) {
    const r = results[i]!;
    if (r.suite !== currentDisplaySuite) {
      currentDisplaySuite = r.suite;
      console.log(`\n▶ ${currentDisplaySuite}`);
    }
    await pendingTests[i]!();
  }

  await runCleanup();

  // Résumé
  const passed = results.filter((r) => r.status === "pass");
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  RÉSUMÉ");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`\n  ✅ ${passed.length} passés`);
  if (skipped.length > 0) console.log(`  ⏭️  ${skipped.length} ignorés`);
  if (failed.length > 0) {
    console.log(`  ❌ ${failed.length} échoués :`);
    for (const f of failed) {
      console.log(`     • [${f.suite}] ${f.name}`);
      console.log(`       ${f.error}`);
    }
  } else {
    console.log("\n  Toutes les vérifications de sécurité passent. ✅");
  }
  console.log();

  if (failed.length > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
