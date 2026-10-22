#!/usr/bin/env bash
# install-cert.sh <zone> — run as root. Installs a Cloudflare Origin
# Certificate for one zone (e.g. zonenordiques.com). Paste the certificate,
# then the private key, when prompted; each ends with an empty line.
set -euo pipefail

zone=$1
[[ "$zone" =~ ^[a-z0-9.-]+\.[a-z]+$ ]] || { echo "bad zone" >&2; exit 2; }
dir=/etc/ssl/la-zone

read_block() {
  local out="" line
  while IFS= read -r line; do
    [[ -z "$line" && -n "$out" ]] && break
    out+="$line"$'\n'
  done
  printf '%s' "$out"
}

echo "Paste the ORIGIN CERTIFICATE for $zone, then an empty line:"
cert=$(read_block)
echo "Paste the PRIVATE KEY for $zone, then an empty line:"
key=$(read_block)

grep -q 'BEGIN CERTIFICATE' <<< "$cert" || { echo "that is not a certificate" >&2; exit 1; }
grep -q 'PRIVATE KEY' <<< "$key" || { echo "that is not a private key" >&2; exit 1; }

# The key must match the certificate.
c=$(openssl x509 -noout -pubkey <<< "$cert" | sha256sum)
k=$(openssl pkey -pubout <<< "$key" | sha256sum)
[[ "$c" == "$k" ]] || { echo "key does not match certificate" >&2; exit 1; }

umask 077
printf '%s\n' "$cert" > "$dir/$zone.pem"
printf '%s\n' "$key"  > "$dir/$zone.key"
chmod 644 "$dir/$zone.pem"
chmod 600 "$dir/$zone.key"

openssl x509 -noout -subject -enddate -in "$dir/$zone.pem"
nginx -t -q && systemctl reload nginx
echo "✓ $zone installed"
