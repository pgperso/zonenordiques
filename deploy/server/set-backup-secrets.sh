#!/usr/bin/env bash
# set-backup-secrets.sh — run as root (sudo) in an interactive SSH session:
#   ssh -t pascal@<ip> sudo /srv/la-zone/bin/set-backup-secrets.sh
#
# Stores what backup.sh needs in /srv/la-zone/env/backup.env (root-only):
#   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  (Cloudflare R2 token)
#   DATABASE_URL  (Supabase "Session pooler" connection string, with password)
# Typed values are not echoed. Leave a prompt empty to keep the current value.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 2; }

f=/srv/la-zone/env/backup.env
[[ ! -L "$f" && ( ! -e "$f" || -f "$f" ) ]] || { echo "$f is not a regular file" >&2; exit 1; }
get_var() { [[ -f "$f" ]] && sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" "$f" | tail -n 1 || true; }

ask() {
  local label=$1 secret=$2 v
  if [[ $secret == 1 ]]; then read -r -s -p "$label (empty = keep): " v < /dev/tty; echo >&2
  else read -r -p "$label (empty = keep): " v < /dev/tty; fi
  [[ "$v" != *'"'* ]] || { echo "$label contains a double quote" >&2; exit 1; }
  printf '%s' "$v"
}

declare -A cur
for k in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY DATABASE_URL; do cur[$k]=$(get_var "$k"); done

v=$(ask "R2 endpoint (https://<id>.r2.cloudflarestorage.com)" 0); [[ -n "$v" ]] && cur[R2_ENDPOINT]=$v
v=$(ask "R2 Access Key ID" 0);                                   [[ -n "$v" ]] && cur[R2_ACCESS_KEY_ID]=$v
v=$(ask "R2 Secret Access Key" 1);                               [[ -n "$v" ]] && cur[R2_SECRET_ACCESS_KEY]=$v
v=$(ask "Supabase DATABASE_URL (Session pooler)" 1);             [[ -n "$v" ]] && cur[DATABASE_URL]=$v

tmp=$(mktemp /srv/la-zone/env/.backup.XXXXXX)
{
  echo "# Backup credentials — written by set-backup-secrets.sh. Root only."
  for k in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY DATABASE_URL; do
    [[ -n "${cur[$k]}" ]] && printf '%s="%s"\n' "$k" "${cur[$k]}"
  done
} > "$tmp"
chown root:root "$tmp"; chmod 600 "$tmp"
mv -f "$tmp" "$f"

for k in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY DATABASE_URL; do
  if [[ -n "${cur[$k]}" ]]; then printf '%s ✓\n' "$k"; else printf '%s ✗\n' "$k"; fi
done
