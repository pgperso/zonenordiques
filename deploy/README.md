# la-zone VPS

All three brands (Zone Nordiques, Zone Expos, CFL Québec) run on one Astral Internet unmanaged VPS: Ubuntu 24.04, 2 vCPU, 4 GB RAM, hostname `la-zone`. This replaces Vercel.

```
Visitor ─► Cloudflare (proxy, cache, TLS) ─► nginx :443 ─► PM2 ─► node server.js (Next standalone)
                                            (Cloudflare IPs only)   one app per brand, slot a|b
```

- **Builds run on GitHub Actions**, not on the server ([.github/workflows/deploy-vps.yml](../.github/workflows/deploy-vps.yml)). The 4 GB of RAM is reserved for serving.
- **Zero-downtime deploys.** Each brand has two slots (`a` and `b`). A deploy starts the new release on the idle slot, health-checks `/fr`, switches nginx, then stops the old slot. If the health check fails, the live site is untouched.
- **Secrets live only on the server**, in `/srv/la-zone/env/<brand>.env` (mode 600, owner `deploy`). CI fetches the file for the build and deletes it afterwards.
- **Crons** ([server/crontab](server/crontab)) replace the `crons` block of `apps/web/vercel.json`. Times are in UTC.

## Users

| User | Purpose |
|---|---|
| `pascal` | Admin. Personal SSH key, passwordless sudo. |
| `deploy` | Runs the sites. No password and no sudo, except `nginx -t -q` and `nginx -s reload`. The CI key in its `authorized_keys` is forced to `deploy-gate.sh`, which accepts only `env`, `upload` and `activate`. |
| `root` | SSH login disabled by `harden-ssh.sh`. |

## Layout on the server

```
/srv/la-zone/
  bin/                      scripts from deploy/server (root-owned)
  env/<brand>.env           runtime + build env, one per brand
  <brand>/releases/<id>/    unpacked standalone builds (last 5 kept)
  <brand>/live              a | b
  <brand>/live-release      release id currently served
  nginx/upstream-<brand>.conf  rewritten on each deploy
  logs/cron.log
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
5. **Fill `/srv/la-zone/env/<brand>.env`.** Copy every variable from the matching Vercel project, one `KEY="value"` per line. Always use double quotes: values contain spaces (`"LCF Québec"`) and `#` (hex colours). Do not set `PORT`, `HOSTNAME` or `VERCEL_ENV`.
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
| Env change | Edit `/srv/la-zone/env/<brand>.env`, then redeploy. `NEXT_PUBLIC_*` values are baked in at build time. |
| Cloudflare IP refresh | `sudo /srv/la-zone/bin/cloudflare-ips.sh` |
