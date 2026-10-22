#!/usr/bin/env bash
# switch-upstream.sh <brand> <slot> — root-owned, called by deploy via sudo.
#
# The only way the deploy user can change nginx: it names a known brand and
# slot, and this script writes the upstream file itself (in a root-owned
# directory), validates the config and reloads. deploy never writes anything
# nginx loads, so it cannot inject directives into a root process.
set -euo pipefail

. /srv/la-zone/bin/brands.sh

brand=${1:-}
slot=${2:-}
is_brand "$brand" || { echo "unknown brand" >&2; exit 2; }
[[ "$slot" == "a" || "$slot" == "b" ]] || { echo "bad slot" >&2; exit 2; }

port=$(brand_port "$brand" "$slot")
dir=/etc/nginx/la-zone-upstreams
file="$dir/$brand.conf"
prev=$(cat "$file" 2>/dev/null || true)

printf 'upstream %s { server 127.0.0.1:%s; keepalive 16; }\n' "$brand" "$port" > "$file.new"
mv "$file.new" "$file"

if ! /usr/sbin/nginx -t -q; then
  printf '%s\n' "$prev" > "$file"
  echo "nginx config invalid; upstream restored" >&2
  exit 1
fi
/usr/sbin/nginx -s reload
