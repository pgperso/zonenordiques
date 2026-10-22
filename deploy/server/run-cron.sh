#!/usr/bin/env bash
# run-cron.sh <brand> <path>
#
# Replaces Vercel Cron: calls a cron route on the brand's live slot with the
# CRON_SECRET bearer the routes already require (src/lib/requestGuards.ts).
set -euo pipefail

. /srv/la-zone/bin/brands.sh

brand=$1
path=$2
is_brand "$brand" || { echo "unknown brand: $brand" >&2; exit 2; }

slot=$(live_slot "$brand")
[[ "$slot" == "a" || "$slot" == "b" ]] || exit 0   # brand not deployed yet

secret=$(sed -n 's/^CRON_SECRET=//p' "$ROOT/env/$brand.secrets.env" | tail -n 1 | sed 's/^"\(.*\)"$/\1/')
[[ -n "$secret" ]] || { echo "CRON_SECRET missing for $brand" >&2; exit 1; }

port=$(brand_port "$brand" "$slot")
host=$(brand_host "$brand")

code=$(curl -s -o /tmp/cron-$brand.out -w '%{http_code}' --max-time 300 \
  -H "Host: $host" \
  -H 'X-Forwarded-Proto: https' \
  -H "Authorization: Bearer $secret" \
  "http://127.0.0.1:$port$path")

echo "$(date -u +%FT%TZ) $brand $path → HTTP $code"
[[ "$code" =~ ^2 ]] || { head -c 2000 /tmp/cron-$brand.out >&2; exit 1; }
