# Moins que rien — Guide de déploiement et de transfert

Ce document permet à un développeur indépendant de reprendre, déployer et migrer
l'application sans dépendre d'aucun outil propriétaire.

---

## Stack technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| Application | TanStack Start + TypeScript | SSR, routing, API serveur |
| Gestionnaire de paquets | Bun | Installation, build, tests |
| Reverse proxy | Nginx + Let's Encrypt | TLS, compression, proxy |
| Processus | PM2 | Redémarrage automatique, logs |
| Base de données | PostgreSQL via Supabase Cloud | Annonces, comptes, barèmes |
| Stockage fichiers | Supabase Storage → OVH Object Storage S3 | Photos des annonces |
| CI/CD | GitHub Actions | Déploiement automatique au push |
| Emails | Brevo (ou Mailgun) via Supabase Auth SMTP | Confirmation d'inscription |

---

## Architecture de déploiement

```
GitHub (branche main)
    │  .github/workflows/deploy.yml
    ▼
OVH VPS (Ubuntu 24.04 LTS)
  ├── /srv/mqr/           ← clone du dépôt
  │     ├── .env          ← secrets (non versionné)
  │     └── deploy/       ← configs Nginx, PM2, scripts
  ├── Nginx               ← /etc/nginx/sites-available/mqr.conf
  └── PM2                 ← ecosystem.config.cjs

        │  connexion réseau chiffrée
        ▼
Supabase Cloud (région eu-west-1)
  ├── PostgreSQL (annonces, comptes, barèmes)
  ├── Auth (inscription, connexion, JWT)
  └── Storage (photos — phase 1)
        │  si migration nécessaire
        ▼
OVH Object Storage S3 (région GRA)
  └── mqr-photos/         ← photos des annonces
```

---

## Installation sur un VPS OVH vierge

### 1. Prérequis sur le VPS (une seule fois)

```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Node.js (via nvm, recommandé)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22

# Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# PM2
npm install -g pm2

# Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# PostgreSQL client (pour pg_dump / restauration)
sudo apt install -y postgresql-client

# AWS CLI (pour sauvegardes vers OVH Object Storage S3)
sudo apt install -y awscli

# Dossier application
sudo mkdir -p /srv/mqr
sudo chown $USER:$USER /srv/mqr
```

### 2. Cloner le dépôt

```bash
cd /srv/mqr
git clone https://github.com/VOTRE_COMPTE/moins-que-rien.git .
cp .env.example .env
# Remplir .env avec les vraies valeurs (voir section Variables)
```

### 3. Installer et construire

```bash
bun install --frozen-lockfile
bun run build
```

### 4. Configurer Nginx

```bash
sudo cp deploy/nginx/mqr.conf /etc/nginx/sites-available/mqr.conf
# Remplacer VOTRE_DOMAINE dans le fichier
sudo sed -i 's/VOTRE_DOMAINE/votre-domaine.fr/g' /etc/nginx/sites-available/mqr.conf
sudo ln -s /etc/nginx/sites-available/mqr.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Obtenir le certificat TLS (Let's Encrypt, gratuit)

```bash
sudo certbot --nginx -d votre-domaine.fr -d www.votre-domaine.fr
# certbot modifie automatiquement le fichier Nginx
sudo systemctl reload nginx
```

### 6. Démarrer l'application avec PM2

```bash
mkdir -p /var/log/mqr
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
pm2 startup  # suivre l'instruction affichée pour démarrer PM2 au boot
```

### 7. Configurer les sauvegardes automatiques

```bash
chmod +x deploy/scripts/backup.sh
# Ajouter au cron : sauvegarde quotidienne à 3h du matin
(crontab -l 2>/dev/null; echo "0 3 * * * /srv/mqr/deploy/scripts/backup.sh >> /var/log/mqr/backup.log 2>&1") | crontab -
```

### 8. Configurer GitHub Actions

Dans votre dépôt GitHub : **Settings → Secrets → Actions**, ajouter :

| Secret | Valeur |
|--------|--------|
| `VPS_HOST` | IP ou domaine du VPS |
| `VPS_USER` | `ubuntu` ou `debian` |
| `VPS_SSH_KEY` | Clé privée SSH (sans passphrase) |
| `VPS_APP_DIR` | `/srv/mqr` |

Générer une paire de clés SSH dédiée au déploiement :
```bash
ssh-keygen -t ed25519 -C "deploy-mqr" -f ~/.ssh/mqr_deploy -N ""
# Copier la clé publique sur le VPS :
ssh-copy-id -i ~/.ssh/mqr_deploy.pub user@VPS_IP
# Copier le contenu de ~/.ssh/mqr_deploy dans le secret VPS_SSH_KEY
```

---

## Variables d'environnement

Voir `.env.example` à la racine du projet pour la liste complète et documentée.
Ne jamais versionner le fichier `.env`.

---

## Lancer les tests

```bash
bun test          # tous les tests (32 au 07/11/2026)
bunx tsc --noEmit # vérification TypeScript (0 erreur)
```

---

## Migration de Supabase Cloud vers auto-hébergé (étape future)

La migration est possible à tout moment car Supabase est du PostgreSQL standard.

### 1. Exporter les données depuis Supabase Cloud

```bash
# Depuis votre machine locale ou le VPS
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl \
  -f mqr_export_$(date +%Y%m%d).sql
```

### 2. Exporter les fichiers (photos)

Utilisez le dashboard Supabase > Storage > télécharger, ou l'API :
```bash
# Avec supabase-cli
supabase db pull
supabase storage ls --project-ref VOTRE_REF
```

### 3. Installer PostgreSQL sur le VPS

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createdb mqr
sudo -u postgres psql mqr < mqr_export_20XXXXXX.sql
```

### 4. Mettre à jour `.env`

Remplacer `SUPABASE_DB_URL` par `postgresql://mqr_user:MOT_DE_PASSE@localhost/mqr`.

### 5. ⚠️ Authentification utilisateurs

**La migration des mots de passe Supabase n'est pas triviale.**
Les mots de passe sont hachés avec bcrypt côté Supabase. Deux options :
- **Option A** : forcer une réinitialisation de mot de passe pour tous les utilisateurs
  (email automatique au premier login post-migration).
- **Option B** : exporter la table `auth.users` et la réimporter dans GoTrue
  auto-hébergé (possible mais à tester sur un environnement de staging d'abord).

Cette étape demande un test complet avant toute migration en production.

---

## Vérifications post-déploiement

```bash
# Application répond
curl -I https://votre-domaine.fr

# PM2 en fonctionnement
pm2 status mqr

# Logs en temps réel
pm2 logs mqr

# Nginx sans erreur
sudo nginx -t

# Certificat TLS valide et renouvelé automatiquement
sudo certbot renew --dry-run
```

---

## Coûts d'exploitation (estimation novembre 2026)

| Poste | Service | Coût/mois HT |
|-------|---------|--------------|
| Serveur | OVH VPS-1 (phase test) | ~3,81 € |
| Serveur | OVH VPS-2 (lancement) | ~7,21 € |
| Base de données | Supabase Free (développement) | 0 € |
| Base de données | Supabase Pro (production) | ~25 $ |
| Photos | Supabase Storage inclus Pro | 0–5 $ |
| Emails | Brevo gratuit (< 300/jour) | 0 € |
| TLS | Let's Encrypt | Gratuit |
| **Total test** | | **~3,81 €/mois** |
| **Total lancement** | | **~35–40 €/mois** |

Tarifs OVH vérifiés sur la page officielle française (novembre 2026).
Vérifiez toujours les prix actuels sur ovhcloud.com avant commande.
