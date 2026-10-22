#!/usr/bin/env bash
# activate-release.sh <brand> <release-id>
#
# Runs as the deploy user. Starts an already-unpacked release on the idle slot,
# health-checks it, switches nginx to it, then stops the previous slot. Any
# failure before the switch leaves the live site untouched.
set -euo pipefail

. /srv/la-zone/bin/brands.sh

brand=$1
release=$2
is_brand "$brand" || { echo "unknown brand: $brand" >&2; exit 2; }
[[ "$release" =~ ^[0-9a-f]{7,40}(-[0-9]+)?$ ]] || { echo "bad release id" >&2; exit 2; }

dir="$ROOT/$brand/releases/$release"
[[ -f "$dir/apps/web/server.js" ]] || { echo "release not found: $dir" >&2; exit 2; }

current=$(live_slot "$brand")
if [[ "$current" == "a" ]]; then next=b; else next=a; fi
port=$(brand_port "$brand" "$next")
host=$(brand_host "$brand")
app="$brand-$next"

echo "→ $brand: starting $release on slot $next (port $port)"
pm2 delete "$app" >/dev/null 2>&1 || true
# Variables already in the environment win over --env-file, so PORT and
# HOSTNAME set here cannot be overridden by the brand's env file.
PORT=$port HOSTNAME=127.0.0.1 NODE_ENV=production pm2 start "$dir/apps/web/server.js" \
  --name "$app" \
  --cwd "$dir/apps/web" \
  --node-args="--env-file=$ROOT/env/$brand.env --env-file=$ROOT/env/$brand.secrets.env" \
  --max-memory-restart 900M \
  --time >/dev/null

# Health check: the locale home must answer 200 within ~60 s.
ok=0
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $host" -H 'X-Forwarded-Proto: https' "http://127.0.0.1:$port/fr" || true)
  if [[ "$code" == "200" ]]; then ok=1; break; fi
  sleep 2
done
if [[ $ok -ne 1 ]]; then
  echo "✗ health check failed on slot $next (last HTTP $code); live site unchanged" >&2
  pm2 logs "$app" --lines 40 --nostream >&2 || true
  pm2 delete "$app" >/dev/null 2>&1 || true
  exit 1
fi

# Switch nginx to the new slot.
sudo "$ROOT/bin/switch-upstream.sh" "$brand" "$next"
echo "$next" > "$ROOT/$brand/live"
echo "$release" > "$ROOT/$brand/live-release"

# Let in-flight requests on the old slot finish, then stop it.
if [[ "$current" == "a" || "$current" == "b" ]]; then
  sleep 10
  pm2 delete "$brand-$current" >/dev/null 2>&1 || true
fi
pm2 save --force >/dev/null

# Keep the five most recent releases (the live one is always among them).
ls -1t "$ROOT/$brand/releases" | tail -n +6 | while read -r old; do
  [[ "$old" == "$release" ]] || rm -rf "${ROOT:?}/$brand/releases/$old"
done

echo "✓ $brand now serving $release on slot $next"
