# la-zone VPS

All three brands (Zone Nordiques, Zone Expos, CFL Québec) run on one Astral Internet unmanaged VPS: Ubuntu 24.04, 2 vCPU, 4 GB RAM, hostname `la-zone`. This replaces Vercel.

```
Visitor ─► Cloudflare (proxy, cache, TLS) ─► nginx :443 ─► PM2 ─► node server.js (Next standalone)
                                            (Cloudflare IPs only)   one app per brand, slot a|b
```

- **Builds run on GitHub Actions**, not on the server ([.github/workflows/deploy-vps.yml](../.github/workflows/deploy-vps.yml)). The 4 GB of RAM is reserved for serving.
- **Zero-downtime deploys.** Each brand has two slots (`a` and `b`). A deploy starts the new release on the idle slot, health-checks `/fr`, switches nginx, then stops the old slot. If the health check fails, the live site is untouched.
- **Two env files per brand**, both owned by root and readable by `deploy` (mode 640):
  - `<brand>.env` holds the public build values (`NEXT_PUBLIC_*`, `SUPABASE_URL`). CI fetches only those lines for the build.
  - `<brand>.secrets.env` holds the server-only secrets. It is loaded at runtime only and never leaves the server.
- **Crons** ([server/crontab](server/crontab)) replace the `crons` block of `apps/web/vercel.json`. Times are in UTC.

## Users

| User | Purpose |
|---|---|
| `pascal` | Admin. Personal SSH key, passwordless sudo. |
| `deploy` | Runs the sites. No password. Its only sudo right is `switch-upstream.sh`, which takes a validated brand and slot and writes the nginx upstream itself, so `deploy` never writes a file that root's nginx loads. The CI key in its `authorized_keys` is forced to `deploy-gate.sh`, which accepts only `env`, `upload` and `activate`. |
| `root` | SSH login disabled by `harden-ssh.sh`. |

## Layout on the server

```
/srv/la-zone/
  bin/                      scripts from deploy/server (root-owned)
  env/<brand>.env           public build values (CI may read)
  env/<brand>.secrets.env   server-only secrets (runtime only)
  <brand>/releases/<id>/    unpacked standalone builds (last 5 kept)
  <brand>/live              a | b
  <brand>/live-release      release id currently served
  logs/cron.log
/etc/nginx/la-zone-upstreams/<brand>.conf   root-owned, rewritten on each deploy
```

| Brand | Slots (ports) | Canonical host |
|---|---|---|
| zonenordiques | 3001 / 3002 | www.zonenordiques.com |
| zoneexpos | 3011 / 3012 | www.zoneexpos.com |
| cflquebec | 3021 / 3022 | cflquebec.com |

## First-time setup

1. **Authorize your key as root.** Do this once, with the root password Astral emailed. From PowerShell:
   ```powershell
   type $HOME\.ssh\id_ed25519.pub | ssh root@<ip> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
   ```
2. **Run the bootstrap.**
   ```bash
   scp -r deploy/server root@<ip>:/root/la-zone-setup
   ssh root@<ip> 'bash /root/la-zone-setup/bootstrap.sh "$(cat ~/.ssh/authorized_keys | head -1)"'
   ```
3. **Check that `ssh pascal@<ip>` works**, then run `sudo /srv/la-zone/bin/harden-ssh.sh`.
4. **Create the CI deploy key.** Generate it on your PC with `ssh-keygen -t ed25519 -N "" -f la-zone-ci`, then add it to `/home/deploy/.ssh/authorized_keys` as:
   ```
   command="/srv/la-zone/bin/deploy-gate.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... la-zone-ci
   ```
   Then set the GitHub secrets `VPS_HOST`, `VPS_SSH_KEY` (the private key) and `VPS_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <ip>`).
5. **Fill the env files.**
   - Public values go in `<brand>.env`, as `NEXT_PUBLIC_*` plus `SUPABASE_URL`, one `KEY="value"` per line. Always use double quotes: values contain spaces (`"LCF Québec"`) and `#` (hex colours). Do not set `PORT`, `HOSTNAME` or `VERCEL_ENV`.
   - Secrets are entered with `ssh -t pascal@<ip> sudo /srv/la-zone/bin/set-secrets.sh`. It prompts for the Supabase service-role, Anthropic and Resend keys, generates `CRON_SECRET` and `VIEW_HASH_SALT`, and writes `<brand>.secrets.env`.
6. **Deploy.** Run *Actions → Deploy to VPS → Run workflow*. Test each brand through a tunnel before touching DNS:
   ```bash
   ssh -L 8080:127.0.0.1:3001 pascal@<ip>   # then open http://localhost:8080/fr
   ```
7. **Install the origin certificates.** For each zone, go to Cloudflare → SSL/TLS → Origin Server → Create certificate (RSA, 15 years). Then run `sudo /srv/la-zone/bin/install-cert.sh <zone>`. The zones are `zonenordiques.com`, `zoneexpos.com`, `cflquebec.com`, `lcfquebec.com`, `cflquebec.ca` and `lcfquebec.ca`.
8. **Cut over DNS one zone at a time** (CFL, then Expos, then ZN). Set the `A` records for the apex and `www` to the VPS IP, **proxied** (orange cloud). Set SSL/TLS mode to **Full (strict)**. To roll back, restore the previous DNS values; Vercel keeps running until it is cancelled.
9. **After cutover**, uncomment the `push:` trigger in the workflow so every push to `main` deploys.

## Day to day

| Task | Command (as `pascal`) |
|---|---|
| Status | `sudo -u deploy pm2 ls` |
| App logs | `sudo -u deploy pm2 logs zonenordiques-a` (or `-b`; see `/srv/la-zone/zonenordiques/live`) |
| Cron log | `tail -f /srv/la-zone/logs/cron.log` |
| Roll back | `sudo -u deploy /srv/la-zone/bin/activate-release.sh <brand> <older-release-id>` (`ls /srv/la-zone/<brand>/releases`) |
| Env change | Public value: edit `<brand>.env` (as root), then redeploy, because `NEXT_PUBLIC_*` values are baked in at build time. Secret: re-run `set-secrets.sh`, then redeploy. |
| Cloudflare IP refresh | `sudo /srv/la-zone/bin/cloudflare-ips.sh` |
