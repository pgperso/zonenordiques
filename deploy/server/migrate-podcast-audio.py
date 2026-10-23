#!/usr/bin/env python3
"""Move podcast audio from Supabase Storage to the VPS media dir (one-off).

  sudo python3 migrate-podcast-audio.py            # dry run: list only
  sudo python3 migrate-podcast-audio.py --apply    # copy, verify, repoint DB

For each podcast whose audio_url is in the `podcast-audio` bucket:
download it, write it under /srv/la-zone/media/podcast-audio/<community>/,
check the size and that nginx serves it, then update `podcasts.audio_url`.
Bucket files are NOT deleted here — that is a separate step once every
podcast is confirmed playing from the new URL. Re-runnable: rows already
pointing at the VPS are skipped.
"""
import hashlib, json, os, re, ssl, subprocess, sys, urllib.request

ROOT = "/srv/la-zone"
MEDIA = f"{ROOT}/media/podcast-audio"
MARK = "/storage/v1/object/public/podcast-audio/"
HOSTS = {11: "www.zonenordiques.com", 12: "www.zoneexpos.com", 14: "cflquebec.com"}
APPLY = "--apply" in sys.argv


def env(file, key):
    for line in open(file, encoding="utf-8"):
        m = re.match(rf'^{key}="?(.*?)"?$', line.strip())
        if m:
            return m.group(1)
    raise SystemExit(f"{key} missing in {file}")


URL = env(f"{ROOT}/env/zonenordiques.env", "SUPABASE_URL")
KEY = env(f"{ROOT}/env/zonenordiques.secrets.env", "SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def rest(method, path, body=None):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method, headers=H,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


rows = rest("GET", "podcasts?select=id,community_id,audio_url&audio_url=like.*podcast-audio*&order=id")
todo = [r for r in rows if MARK in (r["audio_url"] or "")]
print(f"{len(todo)} podcast(s) still on Supabase Storage{'' if APPLY else ' (dry run)'}")

done = 0
for r in todo:
    pid, cid, src = r["id"], r["community_id"], r["audio_url"]
    host = HOSTS.get(cid)
    ext = os.path.splitext(src.split("?")[0])[1].lower().lstrip(".") or "mp3"
    if host is None or ext not in ("mp3", "m4a", "ogg", "webm"):
        print(f"  #{pid}: SKIP (community {cid}, ext {ext})")
        continue
    if not APPLY:
        print(f"  #{pid} community {cid} → {host}  {src.split(MARK)[1]}")
        continue

    with urllib.request.urlopen(src, timeout=600) as resp:
        data = resp.read()
    name = f"{pid}-{hashlib.sha256(data).hexdigest()[:10]}.{ext}"
    dest_dir = f"{MEDIA}/{cid}"
    os.makedirs(dest_dir, exist_ok=True)
    dest = f"{dest_dir}/{name}"
    with open(dest + ".part", "wb") as f:
        f.write(data)
    os.replace(dest + ".part", dest)
    os.chmod(dest, 0o644)
    subprocess.run(["chown", "-R", "deploy:deploy", f"{ROOT}/media"], check=True)

    new_url = f"https://{host}/media/podcast-audio/{cid}/{name}"
    # Verify through nginx on this box before repointing the row.
    out = subprocess.run(["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code} %{size_download}",
                          "--resolve", f"{host}:443:127.0.0.1", new_url],
                         capture_output=True, text=True).stdout.split()
    if out[0] != "200" or int(out[1]) != len(data):
        print(f"  #{pid}: VERIFY FAILED ({out}), row left unchanged")
        continue
    rest("PATCH", f"podcasts?id=eq.{pid}", {"audio_url": new_url})
    done += 1
    print(f"  #{pid}: {len(data)/1e6:.1f} MB → {new_url}")

if APPLY:
    print(f"{done}/{len(todo)} moved")
