#!/usr/bin/env bash
# backup.sh — nightly off-site backup to Cloudflare R2 (root crontab).
#
#   db/daily/<date>.dump    pg_dump -Fc of the Supabase database, last 14 kept
#   db/weekly/<date>.dump   Sunday's dump, last 8 kept
#   media/                  mirror of /srv/la-zone/media (podcast audio)
#   media-deleted/<date>/   files removed locally, kept 30 days before purge
#
# Restore a dump:  pg_restore --clean --if-exists --no-owner -d "<connection string>" file.dump
# Credentials: /srv/la-zone/env/backup.env (set-backup-secrets.sh).
# TLS to Supabase is verified against its root CA (Supabase Root 2021 CA,
# sha256 80:70:25:AD:…:CA:FA), installed by bootstrap.sh.
set -euo pipefail

ENV=/srv/la-zone/env/backup.env
[[ -r "$ENV" ]] || { echo "missing $ENV" >&2; exit 1; }
get() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" "$ENV" | tail -n 1; }

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT=$(get R2_ENDPOINT)
export RCLONE_CONFIG_R2_ACCESS_KEY_ID=$(get R2_ACCESS_KEY_ID)
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$(get R2_SECRET_ACCESS_KEY)
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
BUCKET=r2:la-zone-backups

# Hand the connection to libpq through PG* variables rather than a URL on
# pg_dump's command line, which any local user could read from `ps`.
eval "$(DATABASE_URL=$(get DATABASE_URL) python3 - <<'PY'
import os, shlex, urllib.parse
u = urllib.parse.urlsplit(os.environ["DATABASE_URL"])
for k, v in (("PGHOST", u.hostname), ("PGPORT", u.port or 5432),
             ("PGUSER", urllib.parse.unquote(u.username or "")),
             ("PGPASSWORD", urllib.parse.unquote(u.password or "")),
             ("PGDATABASE", u.path.lstrip("/") or "postgres")):
    print(f"export {k}={shlex.quote(str(v))}")
print("export PGSSLMODE=verify-full")
print("export PGSSLROOTCERT=/etc/ssl/la-zone/supabase-ca-2021.crt")
PY
)"

today=$(date -u +%F)
work=$(mktemp -d /var/tmp/la-zone-backup.XXXXXX)
trap 'rm -rf "$work"' EXIT

log() { echo "$(date -u +%FT%TZ) $*"; }

# ── Database ───────────────────────────────────────────────────────────────
dump="$work/$today.dump"
log "pg_dump start"
pg_dump --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --file="$dump"
pg_restore --list "$dump" >/dev/null   # refuse to upload an unreadable dump
log "pg_dump ok ($(du -h "$dump" | cut -f1))"

rclone copyto "$dump" "$BUCKET/db/daily/$today.dump"
if [[ $(date -u +%u) == 7 ]]; then
  rclone copyto "$dump" "$BUCKET/db/weekly/$today.dump"
fi
# Retention by count, newest first (names are ISO dates, so they sort).
prune() {
  rclone lsf "$BUCKET/$1/" | sort -r | tail -n +$(( $2 + 1 )) | while read -r old; do
    rclone deletefile "$BUCKET/$1/$old"
  done
}
prune db/daily 14
prune db/weekly 8

# ── Media ──────────────────────────────────────────────────────────────────
log "media sync start"
rclone sync /srv/la-zone/media "$BUCKET/media" \
  --exclude '*.part' \
  --backup-dir "$BUCKET/media-deleted/$today"
rclone delete "$BUCKET/media-deleted" --min-age 30d --rmdirs || true
log "media sync ok"

log "backup done"
