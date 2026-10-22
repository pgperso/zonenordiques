#!/usr/bin/env bash
# set-secrets.sh — run as root (sudo) in an interactive SSH session:
#   ssh -t pascal@<ip> sudo /srv/la-zone/bin/set-secrets.sh
#
# Writes the server-only secrets into every brand's env file. Typed values are
# never echoed, never passed on a command line and never leave the server.
# Leave a prompt empty to keep the current value.
#
# Generated here (once, if missing):
#   CRON_SECRET     one per brand
#   VIEW_HASH_SALT  shared — must be identical across brands (view dedup)
set -euo pipefail

. /srv/la-zone/bin/brands.sh
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 2; }

# set_var <file> <KEY> <value> — replace or append KEY="value".
set_var() {
  local file=$1 key=$2 value=$3 tmp
  [[ "$value" != *'"'* && "$value" != *$'\n'* ]] || { echo "$key: value contains a quote or newline" >&2; exit 1; }
  tmp=$(mktemp)
  grep -v "^$key=" "$file" > "$tmp" || true
  printf '%s="%s"\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

get_var() { sed -n "s/^$2=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" "$1" | tail -n 1; }

ask() {
  local label=$1 v
  read -r -s -p "$label (empty = keep current): " v < /dev/tty
  echo >&2
  printf '%s' "$v"
}

svc=$(ask "SUPABASE_SERVICE_ROLE_KEY")
anth=$(ask "ANTHROPIC_API_KEY")
resend=$(ask "RESEND_API_KEY")

salt=""
for b in $BRANDS; do
  f="$ROOT/env/$b.env"
  s=$(get_var "$f" VIEW_HASH_SALT)
  [[ -n "$s" ]] && salt=$s
done
[[ -n "$salt" ]] || salt=$(openssl rand -hex 32)

for b in $BRANDS; do
  f="$ROOT/env/$b.env"
  [[ -n "$svc" ]]    && set_var "$f" SUPABASE_SERVICE_ROLE_KEY "$svc"
  [[ -n "$anth" ]]   && set_var "$f" ANTHROPIC_API_KEY "$anth"
  [[ -n "$resend" ]] && set_var "$f" RESEND_API_KEY "$resend"
  set_var "$f" VIEW_HASH_SALT "$salt"
  [[ -n "$(get_var "$f" CRON_SECRET)" ]] || set_var "$f" CRON_SECRET "$(openssl rand -hex 32)"
  chown deploy:deploy "$f"
  chmod 600 "$f"
done

echo
for b in $BRANDS; do
  f="$ROOT/env/$b.env"
  printf '%-14s' "$b"
  for k in SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY RESEND_API_KEY CRON_SECRET VIEW_HASH_SALT; do
    [[ -n "$(get_var "$f" "$k")" ]] && printf ' %s ✓' "$k" || printf ' %s ✗' "$k"
  done
  echo
done
