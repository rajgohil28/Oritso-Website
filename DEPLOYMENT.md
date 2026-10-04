# Deploying Oritso on your own server

This deploys the whole stack on one Linux server with Docker, **including the Strapi CMS with all its
existing content** (solutions, media library, admin users, permissions).

```
Visitors ──► Caddy (80/443, automatic HTTPS)
               ├── www.example.com ──► web    (Next.js, port 3000)
               └── cms.example.com ──► strapi (Strapi CMS + admin, port 1337)
                                         ├── volume strapi-data    → SQLite database (.tmp/data.db)
                                         └── volume strapi-uploads → media library (public/uploads)
```

How the CMS is wired (so you know what must be preserved):

- **Content lives in two places, both outside git:** the SQLite database `cms/app/.tmp/data.db` and the
  uploaded files in `cms/app/public/uploads/`. Cloning the repo alone gives you an **empty** CMS. Step 5
  copies these two into the server so nothing is lost.
- **Content types are in git** (`cms/app/src/api/solution`, `cms/app/src/components`), so they come with the repo.
- **The site reads the CMS live.** Solution pages are rendered with ISR (`revalidate = 60`), so an edit
  published in Strapi appears on the website within about a minute, with no rebuild.
- The other 25 pages (home, about, blogs, contact, …) are Framer's prerendered HTML in `content/` and
  `public/_fr`, and don't depend on the CMS.

---

## 1. What you need

| Item | Requirement |
| --- | --- |
| Server | Ubuntu 22.04 / 24.04, 2 GB RAM (1 GB works but the Docker build may need swap), 20 GB disk, public IPv4 |
| Domains | Two DNS names, e.g. `www.oritso.in` (site) and `cms.oritso.in` (CMS admin + API) |
| Open ports | 22 (SSH), 80 and 443 (Caddy needs both, 80 is used for certificate issuance) |
| Local machine | Access to this repo including its **gitignored** `cms/app/.tmp/data.db` and `cms/app/public/uploads/` |

## 2. Point DNS at the server

Create two **A records** to the server's public IP:

```
www.oritso.in   A   <SERVER_IP>
cms.oritso.in   A   <SERVER_IP>
```

Check with `dig +short www.oritso.in cms.oritso.in`. Caddy can only get HTTPS certificates once both
names resolve to this server. If the domain currently serves an old site, do this step last (see
"Switching over from the old site" at the end).

## 3. Prepare the server

```bash
ssh <user>@<SERVER_IP>

# Docker + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Firewall
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable

# Optional but recommended on a 1–2 GB server: 2 GB swap for the image builds
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verify: `docker compose version` prints a version.

## 4. Get the code and configure it

```bash
git clone https://github.com/rajgohil28/Oritso-Website.git
cd Oritso-Website
cp .env.example .env
```

Generate six secrets and note that `APP_KEYS` needs **two** comma-separated values with no spaces:

```bash
for i in 1 2 3 4 5 6; do openssl rand -base64 32; done
```

Edit `.env`:

```ini
SITE_DOMAIN=www.oritso.in
CMS_DOMAIN=cms.oritso.in

STRAPI_APP_KEYS=<secret1>,<secret2>
STRAPI_API_TOKEN_SALT=<secret3>
STRAPI_ADMIN_JWT_SECRET=<secret4>
STRAPI_JWT_SECRET=<secret5>
STRAPI_TRANSFER_TOKEN_SALT=<secret6>
STRAPI_ENCRYPTION_KEY=<secret7 — generate one more>
```

> **Keep `.env` safe and backed up** (password manager). If you lose these secrets you can't decrypt
> encrypted CMS fields and all admin sessions are invalidated. Never commit it (`.env` is gitignored).
> Don't reuse the values from `cms/app/.env`; those are development placeholders.

## 5. Bring the CMS content across

Do this **before the first start**, so Strapi boots with your data instead of creating an empty database.

### 5a. On your local machine: make a clean copy of the CMS data

Stop the local Strapi first, so the SQLite file isn't mid-write:

```bash
cd Oritso-Website
# Ctrl+C the running `npm run develop` in cms/app, then:
mkdir -p /tmp/oritso-cms
cp cms/app/.tmp/data.db /tmp/oritso-cms/data.db
tar -C cms/app/public -czf /tmp/oritso-cms/uploads.tar.gz uploads
ls -lh /tmp/oritso-cms
```

Expected: `data.db` (about 1.2 MB) and `uploads.tar.gz` (about 40 MB, 240+ files).

### 5b. Copy to the server

```bash
scp /tmp/oritso-cms/data.db /tmp/oritso-cms/uploads.tar.gz <user>@<SERVER_IP>:~/
```

### 5c. On the server: load them into the Docker volumes

`docker compose create` builds the images and creates the (empty) volumes and containers without
starting anything. Then the files are copied into place:

```bash
cd ~/Oritso-Website
docker compose create strapi          # builds the Strapi image, creates volumes

# database
docker compose cp ~/data.db strapi:/opt/app/.tmp/data.db

# media library (the tarball contains an "uploads/" folder)
mkdir -p /tmp/up && tar -xzf ~/uploads.tar.gz -C /tmp/up
docker compose cp /tmp/up/uploads/. strapi:/opt/app/public/uploads/
rm -rf /tmp/up
```

What this preserves: all 20 solutions and their features, the media library (hero images, SVG icons), the
**Public role permissions** (the `find`/`findOne` on Solution that the website needs), and every admin
account with its password.

What it does not: **API tokens created before the move stop working**, because their hashes depend on
`STRAPI_API_TOKEN_SALT`. Create new ones in the admin if you use any (the website itself doesn't need one,
since the Solution API is public).

## 6. Start everything

Start Strapi and Caddy first, then build and start the website. The site image bakes in the CMS's public
URL, and pre-rendering the solution pages is easier when the CMS is already reachable:

```bash
docker compose up -d strapi caddy
docker compose logs -f strapi      # wait for "Strapi started successfully" (Ctrl+C to leave logs)
curl -I https://cms.oritso.in/admin # expect HTTP/2 200 (first call may take a few seconds while the certificate is issued)

docker compose up -d --build web
```

If the web build can't reach Strapi it logs a warning and continues (pages are then rendered on first
request instead), so the order is a best practice, not a hard requirement.

## 7. Verify

| Check | Command / URL | Expected |
| --- | --- | --- |
| Containers up | `docker compose ps` | `strapi`, `web`, `caddy` all `running` |
| Site | `https://www.oritso.in` | Home page loads, valid HTTPS |
| CMS data | `https://www.oritso.in/solutions` | The 20 solutions listed |
| A solution page | `https://www.oritso.in/solutions/<slug>` | Hero image, features and icons all show |
| Admin login | `https://cms.oritso.in/admin` | Log in with your **existing** admin credentials |
| Content intact | Admin → Content Manager → Solution | 20 entries; Media Library has the images |
| API | `curl https://cms.oritso.in/api/solutions?pagination[pageSize]=1` | JSON with data, not 403 |

**Test the edit → live loop:** edit a solution's tagline in the admin, click **Publish**, wait about a
minute, refresh the solution page. The change should appear with no rebuild.

If the API returns 403, enable it in the admin: Settings → Users & Permissions → Roles → **Public** →
Solution → tick `find` and `findOne` → Save.

## 8. Day-to-day operations

### Edit content
Use `https://cms.oritso.in/admin`. Publishing is what makes an entry visible on the site.

### Deploy code changes
```bash
cd ~/Oritso-Website
git pull
docker compose up -d --build            # rebuilds only what changed; volumes (CMS data) are untouched
```
`docker compose down` is safe too. **Never** use `docker compose down -v`: `-v` deletes the volumes,
which means deleting your CMS database and uploads.

### Re-sync the Framer pages
On your own machine run `npm run sync`, commit the changed `content/` and `public/_*`, push, then
`git pull && docker compose up -d --build web` on the server.

### Logs and restarts
```bash
docker compose logs -f web      # or strapi, caddy
docker compose restart strapi
```
All three services have `restart: unless-stopped`, so they come back after a reboot.

## 9. Backups (do not skip: the CMS data exists only on this server)

Save the database and uploads, plus your `.env`. Script, e.g. `~/backup-cms.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd ~/Oritso-Website
STAMP=$(date +%F)
mkdir -p ~/backups
docker compose stop strapi                                  # quiet database for a consistent copy
docker compose cp strapi:/opt/app/.tmp/data.db ~/backups/data-$STAMP.db
docker compose cp strapi:/opt/app/public/uploads ~/backups/uploads-$STAMP
docker compose start strapi
tar -C ~/backups -czf ~/backups/cms-$STAMP.tar.gz data-$STAMP.db uploads-$STAMP
rm -rf ~/backups/data-$STAMP.db ~/backups/uploads-$STAMP
find ~/backups -name 'cms-*.tar.gz' -mtime +30 -delete       # keep 30 days
```

```bash
chmod +x ~/backup-cms.sh
( crontab -l 2>/dev/null; echo '30 3 * * * ~/backup-cms.sh' ) | crontab -
```

The site goes down for a few seconds only in the CMS (the public site keeps serving its cached
pages). **Copy the backups off the server** (`rsync`/`scp` to another machine or object storage).
A backup on the same disk won't help if the server dies.

### Restore
```bash
docker compose stop strapi
docker compose cp ~/restore/data.db strapi:/opt/app/.tmp/data.db
docker compose cp ~/restore/uploads/. strapi:/opt/app/public/uploads/
docker compose start strapi
```

## 10. Switching over from the old site

To avoid downtime when `www.oritso.in` currently serves another site (the README mentions WordPress):

1. Deploy using a temporary hostname you control, e.g. set `SITE_DOMAIN=new.oritso.in` and
   `CMS_DOMAIN=cms.oritso.in`, and complete steps 1–7.
2. When satisfied, edit `.env` to `SITE_DOMAIN=www.oritso.in`, change the DNS A record for `www` to the
   server IP, then `docker compose up -d --build` (the site image is rebuilt with the new setup).
3. Keep the old hosting for a few days as a fallback, and lower the DNS TTL beforehand (e.g. 300 s).

## 11. Known issues and notes

- **Contact forms still post to Framer's API** (`api.framer.com/forms/...`). They keep working only while
  the Framer project exists. Move them to your own endpoint before cancelling Framer.
- **The Google Maps embed** loads from Google, as it does today.
- **SQLite is fine for this site** (one editor, mostly reads). If several editors work at once or you
  want managed backups, switch Strapi to Postgres via `DATABASE_CLIENT=postgres` and `DATABASE_*`
  variables, then use Strapi's `strapi transfer` to move the data.
- **Large media:** some Framer assets are 30+ MB (GIFs, a 37 MB video). Put Cloudflare (free plan) in
  front of both domains to cache them and cut bandwidth, with the proxy status "Proxied" and SSL mode
  "Full (strict)".
- **Updates:** run `docker compose pull caddy` periodically, and rebuild images
  (`docker compose build --pull`) to pick up Node security patches.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Caddy logs show certificate errors | DNS doesn't point at this server yet, or ports 80/443 are blocked. Check `dig` and `ufw status`. |
| Admin login loops or "Cannot send secure cookie over unencrypted connection" | Strapi isn't seeing HTTPS. `cms/app/config/server.js` sets `proxy.koa` to true; make sure you deployed that version and rebuilt (`docker compose up -d --build strapi`). |
| Admin opens but it's an empty "create first admin" screen | The database wasn't copied (step 5), so Strapi created a new one. Stop strapi, redo 5c, start strapi. |
| Solution pages show 404 or no images | `STRAPI_URL` baked into the web image is wrong, or the Public role lacks `find`/`findOne`. Check `CMS_DOMAIN` in `.env`, then `docker compose up -d --build web`. |
| Images missing in the Media Library | Uploads weren't copied (5c), or the volume was recreated. Restore `uploads/`. |
| `strapi` exits right after start | Missing/invalid secrets: `docker compose logs strapi`. `STRAPI_APP_KEYS` must be two comma-separated values. |
| Build killed / out of memory | Add the swap file from step 3 or use a 2 GB server. |
