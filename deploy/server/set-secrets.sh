#!/usr/bin/env bash
# set-secrets.sh — run as root (sudo) in an interactive SSH session:
#   ssh -t pascal@<ip> sudo /srv/la-zone/bin/set-secrets.sh
#
# Writes the server-only secrets into /srv/la-zone/env/<brand>.secrets.env.
# That file is loaded at runtime only (activate-release.sh); the CI gate never
# reads it, so these values never leave the server. Typed values are not
# echoed and never appear on a command line. Leave a prompt empty to keep the
# current value.
#
# Generated here (once, if missing):
#   CRON_SECRET     one per brand
#   VIEW_HASH_SALT  shared — must be identical across brands (view dedup)
set -euo pipefail

. /srv/la-zone/bin/brands.sh
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 2; }

ENV_DIR="$ROOT/env"
# The directory must be root-owned so nobody else can swap its entries.
[[ "$(stat -c %U "$ENV_DIR")" == root && ! -L "$ENV_DIR" ]] || { echo "$ENV_DIR must be a root-owned directory" >&2; exit 1; }

secrets_file() {
  local f="$ENV_DIR/$1.secrets.env"
  [[ ! -L "$f" ]] || { echo "$f is a symlink — refusing" >&2; exit 1; }
  [[ ! -e "$f" || -f "$f" ]] || { echo "$f is not a regular file — refusing" >&2; exit 1; }
  printf '%s' "$f"
}

get_var() { [[ -f "$1" ]] && sed -n "s/^$2=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" "$1" | tail -n 1 || true; }

ask() {
  local label=$1 v
  read -r -s -p "$label (empty = keep current): " v < /dev/tty
  echo >&2
  [[ "$v" != *'"'* ]] || { echo "$label contains a double quote — refusing" >&2; exit 1; }
  printf '%s' "$v"
}

svc=$(ask "SUPABASE_SERVICE_ROLE_KEY")
anth=$(ask "ANTHROPIC_API_KEY")
resend=$(ask "RESEND_API_KEY")

salt=""
for b in $BRANDS; do
  s=$(get_var "$(secrets_file "$b")" VIEW_HASH_SALT)
  [[ -n "$s" ]] && salt=$s
done
[[ -n "$salt" ]] || salt=$(openssl rand -hex 32)

for b in $BRANDS; do
  f=$(secrets_file "$b")
  declare -A cur=()
  for k in SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY RESEND_API_KEY CRON_SECRET; do
    cur[$k]=$(get_var "$f" "$k")
  done
  [[ -n "$svc" ]]    && cur[SUPABASE_SERVICE_ROLE_KEY]=$svc
  [[ -n "$anth" ]]   && cur[ANTHROPIC_API_KEY]=$anth
  [[ -n "$resend" ]] && cur[RESEND_API_KEY]=$resend
  [[ -n "${cur[CRON_SECRET]}" ]] || cur[CRON_SECRET]=$(openssl rand -hex 32)

  # Write a new file next to the old one, then rename it into place.
  tmp=$(mktemp "$ENV_DIR/.secrets.XXXXXX")
  {
    echo "# Server-only secrets for $b — written by set-secrets.sh. Never sent to CI."
    for k in SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY RESEND_API_KEY CRON_SECRET; do
      [[ -n "${cur[$k]}" ]] && printf '%s="%s"\n' "$k" "${cur[$k]}"
    done
    printf 'VIEW_HASH_SALT="%s"\n' "$salt"
  } > "$tmp"
  chown root:deploy "$tmp"
  chmod 640 "$tmp"
  mv -f "$tmp" "$f"
  unset cur
done

echo
for b in $BRANDS; do
  f=$(secrets_file "$b")
  printf '%-14s' "$b"
  for k in SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY RESEND_API_KEY CRON_SECRET VIEW_HASH_SALT; do
    if [[ -n "$(get_var "$f" "$k")" ]]; then printf ' %s ✓' "$k"; else printf ' %s ✗' "$k"; fi
  done
  echo
done
