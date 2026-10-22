#!/usr/bin/env bash
# bootstrap.sh "<ssh public key>" — one-time setup of the la-zone VPS.
# Run as root on a fresh Ubuntu 24.04, from this directory (deploy/server).
# Idempotent: safe to re-run.
#
# Users:
#   pascal — the admin (your key, sudo). Use this one to log in.
#   deploy — runs the sites with PM2; no password; sudo only for
#            switch-upstream.sh (validated brand + slot, root writes the file).
#            GitHub Actions reaches it through deploy-gate.sh only.
set -euo pipefail

PUBKEY=${1:-}
[[ "$PUBKEY" == ssh-* ]] || { echo "usage: bootstrap.sh \"ssh-ed25519 AAAA... comment\"" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=/srv/la-zone
NODE_MAJOR=22

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }

step "Hostname, timezone"
hostnamectl set-hostname la-zone
grep -q 'la-zone' /etc/hosts || echo "127.0.1.1 la-zone" >> /etc/hosts
timedatectl set-timezone Etc/UTC   # crons are written in UTC, like Vercel's

step "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q curl ca-certificates gnupg nginx ufw unattended-upgrades openssl cron logrotate

step "Automatic security updates (reboot at 08:00 UTC ≈ 3-4 h in Québec if needed)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52la-zone-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "08:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

step "Swap (2 GB safety net)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -q -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-la-zone.conf

step "Node.js $NODE_MAJOR + PM2"
if ! node -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y -q nodejs
fi
npm install -g pm2@latest --silent
node -v

step "Users"
id pascal >/dev/null 2>&1 || adduser --disabled-password --gecos '' pascal
usermod -aG sudo pascal
echo 'pascal ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-pascal
chmod 440 /etc/sudoers.d/90-pascal
install -d -m 700 -o pascal -g pascal /home/pascal/.ssh
touch /home/pascal/.ssh/authorized_keys
grep -qF "$PUBKEY" /home/pascal/.ssh/authorized_keys || echo "$PUBKEY" >> /home/pascal/.ssh/authorized_keys
chown pascal:pascal /home/pascal/.ssh/authorized_keys
chmod 600 /home/pascal/.ssh/authorized_keys

id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos '' deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
cat > /etc/sudoers.d/91-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /srv/la-zone/bin/switch-upstream.sh
EOF
chmod 440 /etc/sudoers.d/91-deploy
visudo -cq

step "Directories and scripts"
install -d -m 755 -o root -g root "$ROOT" "$ROOT/bin"          # deploy can run, not rewrite
install -d -m 755 -o deploy -g deploy "$ROOT/logs"
install -d -m 755 -o root -g root /etc/nginx/la-zone-upstreams   # root-only: nginx loads it
# root owns the env dir and files; deploy (PM2, CI gate) can only read them.
install -d -m 750 -o root -g deploy "$ROOT/env"
. "$HERE/brands.sh"
for b in $BRANDS; do
  install -d -m 755 -o deploy -g deploy "$ROOT/$b" "$ROOT/$b/releases"
  # <brand>.env: build-time, public values (the CI gate may read these).
  # <brand>.secrets.env: server-only secrets (runtime only, never leave here).
  for f in "$ROOT/env/$b.env" "$ROOT/env/$b.secrets.env"; do
    touch "$f"
    chown root:deploy "$f"
    chmod 640 "$f"
  done
  up="/etc/nginx/la-zone-upstreams/$b.conf"
  [[ -f "$up" ]] || printf 'upstream %s { server 127.0.0.1:%s; keepalive 16; }\n' "$b" "$(brand_port "$b" a)" > "$up"
done
for f in brands.sh activate-release.sh deploy-gate.sh run-cron.sh switch-upstream.sh set-secrets.sh cloudflare-ips.sh install-cert.sh harden-ssh.sh; do
  install -m 755 -o root -g root "$HERE/$f" "$ROOT/bin/$f"
done

step "PM2 at boot (as deploy)"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u deploy --hp /home/deploy >/dev/null
systemctl enable pm2-deploy >/dev/null 2>&1 || true

step "Crons"
crontab -u deploy "$HERE/crontab"

step "Logs rotation"
cat > /etc/logrotate.d/la-zone <<'EOF'
/srv/la-zone/logs/*.log /home/deploy/.pm2/logs/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
  su deploy deploy
}
EOF

step "nginx"
install -d -m 755 /etc/ssl/la-zone
for zone in zonenordiques.com zoneexpos.com cflquebec.com lcfquebec.com cflquebec.ca lcfquebec.ca; do
  # Placeholder so nginx starts; replaced by install-cert.sh before DNS cutover.
  if [[ ! -f /etc/ssl/la-zone/$zone.pem ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=$zone" \
      -keyout /etc/ssl/la-zone/$zone.key -out /etc/ssl/la-zone/$zone.pem 2>/dev/null
    chmod 600 /etc/ssl/la-zone/$zone.key
  fi
done
install -m 644 "$HERE/nginx/la-zone.conf" /etc/nginx/sites-available/la-zone.conf
ln -sf /etc/nginx/sites-available/la-zone.conf /etc/nginx/sites-enabled/la-zone.conf
rm -f /etc/nginx/sites-enabled/default
sed -i 's/^\s*#\?\s*server_tokens .*/\tserver_tokens off;/' /etc/nginx/nginx.conf
# Ubuntu's default still allows TLS 1.0/1.1; only Cloudflare connects, over 1.2+.
sed -i 's/^\s*ssl_protocols .*/\tssl_protocols TLSv1.2 TLSv1.3;/' /etc/nginx/nginx.conf
sed -i 's/^\s*ssl_prefer_server_ciphers .*/\tssl_prefer_server_ciphers off;/' /etc/nginx/nginx.conf

step "Firewall"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null   # key-only SSH; a rate limit would throttle CI deploys
ufw --force enable >/dev/null
bash "$HERE/cloudflare-ips.sh"   # realip conf + 80/443 from Cloudflare only
nginx -t -q
systemctl enable --now nginx >/dev/null
systemctl reload nginx

echo
echo "✓ Bootstrap done."
echo "  Next: from your PC, check that  ssh pascal@<ip>  works, then run harden-ssh.sh."
