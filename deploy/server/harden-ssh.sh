#!/usr/bin/env bash
# harden-ssh.sh — run as root, ONLY after you have confirmed that
#   ssh pascal@<ip>
# works with your key (and that `sudo -v` works there).
# Turns off password logins and direct root login.
set -euo pipefail

[[ -s /home/pascal/.ssh/authorized_keys ]] || { echo "pascal has no SSH key — refusing" >&2; exit 1; }

# 00- sorts before cloud-init's 50-cloud-init.conf; sshd keeps the first value.
cat > /etc/ssh/sshd_config.d/00-la-zone.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF

sshd -t
systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|permitrootlogin) '
echo "✓ password and root logins disabled"
