#!/usr/bin/env bash
# Sauvegarde Supabase Cloud → OVH Object Storage S3
# À planifier via cron sur le VPS : 0 3 * * * /srv/mqr/deploy/scripts/backup.sh
#
# Variables d'environnement requises (depuis /srv/mqr/.env) :
#   SUPABASE_DB_URL          — postgresql://... (depuis Supabase > Project Settings > Database)
#   OVH_S3_ENDPOINT          — ex : https://s3.gra.io.cloud.ovh.net
#   OVH_S3_BUCKET            — nom du bucket (ex : mqr-backups)
#   OVH_S3_ACCESS_KEY        — clé d'accès S3 OVHcloud
#   OVH_S3_SECRET_KEY        — clé secrète S3 OVHcloud
#   BACKUP_RETENTION_DAYS    — nombre de jours de rétention (défaut : 14)

set -euo pipefail

# Charger les variables depuis .env si disponible
ENV_FILE="$(dirname "$0")/../../.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

RETENTION="${BACKUP_RETENTION_DAYS:-14}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/mqr_db_${DATE}.sql.gz"

echo "[$(date)] ▶ Sauvegarde PostgreSQL (Supabase Cloud)"
pg_dump "$SUPABASE_DB_URL" | gzip > "$BACKUP_FILE"
echo "[$(date)] ✓ Dump créé : $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

echo "[$(date)] ▶ Envoi vers OVH Object Storage"
AWS_ACCESS_KEY_ID="$OVH_S3_ACCESS_KEY" \
AWS_SECRET_ACCESS_KEY="$OVH_S3_SECRET_KEY" \
aws s3 cp "$BACKUP_FILE" \
  "s3://${OVH_S3_BUCKET}/database/${DATE}.sql.gz" \
  --endpoint-url "$OVH_S3_ENDPOINT" \
  --region "gra"   # adapter à votre région OVH

echo "[$(date)] ✓ Envoi terminé"

# Supprimer les sauvegardes locales temporaires
rm -f "$BACKUP_FILE"

# Supprimer les anciens backups distants (> RETENTION_DAYS)
echo "[$(date)] ▶ Nettoyage des sauvegardes de plus de ${RETENTION} jours"
CUTOFF=$(date -d "-${RETENTION} days" +%Y%m%d 2>/dev/null || date -v-"${RETENTION}"d +%Y%m%d)

AWS_ACCESS_KEY_ID="$OVH_S3_ACCESS_KEY" \
AWS_SECRET_ACCESS_KEY="$OVH_S3_SECRET_KEY" \
aws s3 ls "s3://${OVH_S3_BUCKET}/database/" \
  --endpoint-url "$OVH_S3_ENDPOINT" \
  --region "gra" \
| awk '{print $4}' \
| while read -r key; do
    file_date="${key:0:8}"
    if [[ "$file_date" < "$CUTOFF" ]]; then
      AWS_ACCESS_KEY_ID="$OVH_S3_ACCESS_KEY" \
      AWS_SECRET_ACCESS_KEY="$OVH_S3_SECRET_KEY" \
      aws s3 rm "s3://${OVH_S3_BUCKET}/database/${key}" \
        --endpoint-url "$OVH_S3_ENDPOINT" \
        --region "gra"
      echo "[$(date)]   Supprimé : $key"
    fi
  done

echo "[$(date)] ✓ Sauvegarde terminée"
