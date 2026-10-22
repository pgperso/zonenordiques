#!/usr/bin/env bash
# Forced command for the GitHub Actions deploy key (see authorized_keys).
# The CI key never gets a shell: it can only run these three verbs.
#
#   env <brand>                 print the brand's env file (needed to build)
#   upload <brand> <release>    read a .tar.gz of the standalone build on stdin
#   activate <brand> <release>  switch the brand to that release
set -euo pipefail

. /srv/la-zone/bin/brands.sh

read -r -a args <<< "${SSH_ORIGINAL_COMMAND:-}"
verb=${args[0]:-}
brand=${args[1]:-}
release=${args[2]:-}

is_brand "$brand" || { echo "refused: unknown brand" >&2; exit 2; }

case "$verb" in
  env)
    [[ ${#args[@]} -eq 2 ]] || { echo "refused" >&2; exit 2; }
    cat "$ROOT/env/$brand.env"
    ;;
  upload)
    [[ ${#args[@]} -eq 3 && "$release" =~ ^[0-9a-f]{7,40}(-[0-9]+)?$ ]] || { echo "refused" >&2; exit 2; }
    dest="$ROOT/$brand/releases/$release"
    tmp="$dest.partial"
    rm -rf "$tmp"
    mkdir -p "$tmp"
    tar -xz --no-same-owner -C "$tmp"
    rm -rf "$dest"
    mv "$tmp" "$dest"
    echo "uploaded $brand $release"
    ;;
  activate)
    [[ ${#args[@]} -eq 3 ]] || { echo "refused" >&2; exit 2; }
    exec "$ROOT/bin/activate-release.sh" "$brand" "$release"
    ;;
  *)
    echo "refused: unknown verb" >&2
    exit 2
    ;;
esac
