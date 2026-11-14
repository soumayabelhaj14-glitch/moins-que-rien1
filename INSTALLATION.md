# Installation — Moins que rien

Procédure complète pour un développeur indépendant.

## Prérequis

- **Bun** ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
- **Node.js** ≥ 20 (pour compatibilité Nitro/TanStack Start)
- Un projet **Supabase Cloud** (plan gratuit suffisant pour les tests)

---

## 1. Cloner et installer

```bash
unzip moins-que-rien-v6.zip
cd moins-que-rien-main
bun install
```

---

## 2. Variables d'environnement

Copier `.env.example` en `.env.local` :

```bash
cp .env.example .env.local
```

Renseigner les valeurs depuis le dashboard Supabase (Settings → API) :

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...  # clé anon publique
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # clé service_role (NE PAS exposer côté client)
```

---

## 3. Appliquer le schéma SQL

Dans le **SQL Editor** du dashboard Supabase :

1. Ouvrir `supabase/schema.sql`
2. Copier-coller et exécuter

> Le schéma est idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).  
> Il peut être ré-exécuté sans risque sur une base vide.

**Bucket Storage :** le schéma crée automatiquement le bucket `photos`.  
Vérifier dans Storage → Buckets que `photos` apparaît.

---

## 4. Lancer en développement

```bash
bun run dev
# → http://localhost:3000
```

---

## 5. Vérifier la compilation TypeScript

```bash
bunx tsc --noEmit
# → 0 erreurs attendu
```

---

## 6. Exécuter les tests

```bash
# Tests unitaires et d'intégration (sans Supabase réel)
bun run test
# → 90 passed | 4 skipped

# Tests de sécurité (nécessite Supabase configuré avec comptes de test)
bun run test:security

# Tests de recherche de prix réels (nécessite accès réseau externe)
bun run test:prices
```

Les 4 tests "skipped" (C1–C4) nécessitent un Supabase opérationnel.  
Pour les activer, configurer `.env.local` et lancer `test:security`.

---

## Fonctionnalités opérationnelles

| Fonctionnalité | Statut | Remarque |
|---|---|---|
| Formulaire de dépôt (particulier/pro/véhicule/don) | ✅ Opérationnel | Auth requise |
| Calcul du plafond P2P (computeP2P) | ✅ Opérationnel | Côté serveur uniquement |
| Calcul du plafond Pro (quantité réelle) | ✅ Opérationnel | quantity transmise |
| Calcul du plafond Véhicule (km réels) | ✅ Opérationnel | km transmis |
| Recherche prix neuf EAN + vérification nom | ✅ Opérationnel | Fallback manuel si API indisponible |
| Vérification nom produit (génération/variante) | ✅ Opérationnel | iPhone 14 ≠ 15, 128 ≠ 256 Go |
| Fallback `pending_price_review` | ✅ Opérationnel | Si aucune source fiable |
| Upload de photos (JPEG/PNG/WebP, max 5 Mo) | ✅ Opérationnel | Après soumission de l'annonce |
| Page des dons avec données Supabase réelles | ✅ Opérationnel | Fallback message vide |
| Réservation de don atomique | ✅ Opérationnel | Vérification anti-doublon |
| Dons d'association (association vérifiée requise) | ✅ Opérationnel | Vérifié côté serveur |
| Affichage des annonces publiées sur l'accueil | ✅ Opérationnel | Fallback démo affiché explicitement |
| Verrouillage des champs sensibles (SQL trigger) | ✅ Opérationnel | Champs prix/modération protégés |
| Politiques RLS : insert/update listings | ✅ Opérationnel | Statuts contrôlés |
| Connexion/inscription utilisateur | ✅ Opérationnel | Supabase Auth |

---

## Fonctionnalités non encore opérationnelles

| Fonctionnalité | Raison |
|---|---|
| Affichage des photos sur les cards | `imageUrl` = null (photos en Storage, pas encore lues dans get-listings) |
| Recherche par mots-clés (barre de recherche) | Handler non branché (UI présente) |
| Espace vendeur / tableau de bord | Routes non créées |
| Modération admin (validation prix neuf) | Interface admin non créée |
| Notifications e-mail (changement de statut) | Non configuré (Supabase Edge Functions ou Resend) |
| Paiement / transaction sécurisée | Hors périmètre V6 |
| Vérification SIRET (pros) | Non implémentée |
| Vérification associations (agrément) | Interface admin manquante |
| Tests de sécurité C1–C4 (SQL réels) | Nécessite Supabase configuré |

---

## Architecture

```
src/
  routes/           # Pages TanStack Router (SSR)
    index.tsx       # Accueil (loader Supabase, fallback démo explicite)
    deposer.tsx     # Formulaire de dépôt + upload photos
    dons.tsx        # Page des dons (données réelles + réservation)
  server/
    actions/
      submit-listing.ts     # Dépôt d'annonce (auth + moteur prix)
      get-listings.ts       # Lecture annonces publiées
      get-donations.ts      # Lecture dons publiés
      reserve-donation.ts   # Réservation atomique de don
      upload-photo.ts       # Upload photo vers Storage
  lib/
    pricing/        # Moteurs de calcul P2P / Pro / Véhicule
    product-lookup/ # Recherche prix neuf (EAN, DDG, Wayback)
    supabase.ts     # Client Supabase (anon + service_role)
    supabase.types.ts  # Types générés (mis à jour manuellement)
supabase/
  schema.sql        # Schéma complet : tables, RLS, triggers, Storage
```
