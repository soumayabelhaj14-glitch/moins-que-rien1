# Environnement de développement local — Supabase

Ce guide permet de tester l'application complète sans VPS et sans compte Supabase payant.

## Option A — Supabase Cloud (niveau gratuit, recommandée)

Le niveau gratuit Supabase Cloud inclut :
- 500 Mo PostgreSQL
- 1 Go de stockage fichiers
- 50 000 utilisateurs authentifiés/mois
- Mise en veille après 1 semaine d'inactivité (réactivation manuelle gratuite)

### Mise en place

1. Créer un compte sur [supabase.com](https://supabase.com) (gratuit).
2. Créer un projet : région `eu-west-1` (Paris).
3. Dans l'éditeur SQL de Supabase : coller et exécuter `supabase/schema.sql`.
4. Récupérer les clés dans **Settings → API** :
   - `URL` → `VITE_SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement)
5. Copier `.env.example` en `.env` et remplir les valeurs.
6. Lancer : `bun run dev`

---

## Option B — Supabase local (Docker, sans compte cloud)

Nécessite Docker Desktop installé.

```bash
# Installer Supabase CLI
npm install -g supabase

# Initialiser (depuis la racine du projet)
supabase init

# Démarrer le serveur local (PostgreSQL + Auth + Storage + Studio)
supabase start

# Affiche les clés locales automatiquement :
# API URL: http://localhost:54321
# anon key: eyJ... (clé locale de test)
# service_role key: eyJ... (clé locale admin)

# Appliquer le schéma
supabase db reset   # applique supabase/schema.sql automatiquement
# ou manuellement :
psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/schema.sql
```

Mettre à jour `.env` avec les valeurs locales :
```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<clé anon affichée par supabase start>
SUPABASE_SERVICE_ROLE_KEY=<clé service_role affichée>
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

### Arrêter et nettoyer
```bash
supabase stop          # arrête les conteneurs
supabase stop --no-backup  # arrête et supprime les données
```

### Générer les types TypeScript depuis la base locale
```bash
supabase gen types typescript --local > src/lib/supabase.types.ts
```
Cette commande remplace le fichier de types manuel par des types 100% synchronisés
avec le schéma réel. À relancer après chaque migration.

---

## Variables d'environnement complètes

```bash
# .env — développement local
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres

# SMTP (développement : désactiver en utilisant Supabase local qui simule les emails)
# En local, les emails de confirmation apparaissent dans Inbucket : http://localhost:54324

# Stockage S3 (OVH Object Storage — phase production uniquement)
# OVH_S3_ENDPOINT=...
# OVH_S3_BUCKET=...
# OVH_S3_ACCESS_KEY=...
# OVH_S3_SECRET_KEY=...
```

---

## Flux de travail recommandé

```
Développement → branche `dev`     → tests CI uniquement
Validation    → branche `staging` → déploiement staging automatique (si VPS disponible)
Production    → branche `main`    → déploiement MANUEL uniquement
```

Sans VPS pour l'instant :
- Travailler sur `dev` ou `main`
- Tester localement avec `bun run dev` + Supabase local ou Cloud gratuit
- Le CI (`.github/workflows/ci.yml`) vérifie TypeScript + tests à chaque push
