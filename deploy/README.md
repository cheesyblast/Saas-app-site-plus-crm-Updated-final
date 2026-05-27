# Deployment Guide

Production stack for the ERP/Storefront app, designed for **self-hosted Supabase Postgres on a VPS** (no `supabase.co` assumption).



## Important: Nginx body size limit

The app uploads product images and page-builder backgrounds as JSON-encoded
base64. The repo's `deploy/nginx/nginx.conf` sets `client_max_body_size 25M;`
which is enough. If you front the app with **your own Nginx**, make sure your
server block (or `http {}`) has at least:

```nginx
client_max_body_size 5M;
```

The default of 1 MB will silently 413-reject typical phone photos even after
client-side compression. The product-image upload UI auto-retries with an
aggressive 700 KB re-compression when it sees a 413, but values below 1 MB
will still fail for high-resolution shots.


## Architecture

```
                           ┌─────────────────────────────────┐
                           │  Cloudflare / DNS               │
                           │  *.your-domain → VPS-A (proxy)  │
                           └────────────────┬────────────────┘
                                            │
                  ┌──── 80/443 ─────────────▼──────────┐
                  │   reverse-proxy  (nginx + certbot) │
                  │   - Wildcard SSL via Let's Encrypt │
                  │   - Subdomain → X-Tenant-Slug hdr  │
                  └────────┬───────────────┬───────────┘
                           │               │
                  /api/*   │               │   /
                  ▼                        ▼
           ┌──────────────┐         ┌────────────┐
           │  backend     │         │  frontend  │
           │  FastAPI     │         │  Nginx +   │
           │  gunicorn x4 │         │  CRA build │
           └──────┬───────┘         └────────────┘
                  │
                  ▼
        ┌────────────────────────┐
        │ Self-hosted Supabase   │
        │ Postgres on VPS-B (or  │
        │ same VPS, separate     │
        │ docker-compose)        │
        └────────────────────────┘
```

## First-Time Setup

### 1. Server prerequisites
On your VPS, install:
- Docker Engine ≥ 24.x
- Docker Compose plugin (`docker compose` v2)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # log out / in
```

### 2. DNS records
Point at your reverse-proxy VPS:
- `A`  `example.com`         → VPS public IP
- `A`  `*.example.com`       → VPS public IP   (wildcard, REQUIRED for tenant subdomains)
- `A`  `admin.example.com`   → VPS public IP

Cloudflare orange-cloud is fine; just turn off "Always Use HTTPS" for the ACME challenge during first issuance, or use DNS-01 (advanced).

### 3. Environment files
```bash
git clone <your-repo>
cd <repo>

# Repo-root env (used by docker-compose itself + frontend build args)
cp .env.production.example .env.production
$EDITOR .env.production

# Backend env (DB URL, JWT secret, CORS origins)
cp backend/.env.production.example backend/.env.production
$EDITOR backend/.env.production
```

### 4. Self-hosted Supabase Postgres
You're running Supabase on your own VPS via Docker (per your setup). Plug its
Postgres URL into `backend/.env.production`:

```
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_DB_PASS@<supabase-vps-host>:5432/postgres
```

Make sure port 5432 (or your Supabase Postgres port) is reachable from the
reverse-proxy VPS (firewall, security groups, Tailscale, etc.).

### 5. Bootstrap SSL
```bash
bash deploy/init-letsencrypt.sh
```

This script:
- Brings up the reverse-proxy nginx
- Patches `deploy/nginx/nginx.conf` with your domain
- Requests a wildcard cert covering `example.com`, `*.example.com`, `admin.example.com`
- Reloads nginx

### 6. Bring up the stack
```bash
docker compose --env-file .env.production up -d --build
docker compose ps
docker compose logs -f backend
```

The first request will trigger backend startup + idempotent column migrations + RLS policies.

## Day-to-Day

| Task | Command |
|---|---|
| Update + redeploy | `git pull && docker compose --env-file .env.production up -d --build` |
| Tail backend logs | `docker compose logs -f backend` |
| Restart backend only | `docker compose restart backend` |
| Wipe + reseed DB    | `docker compose exec backend python wipe_db.py` |
| Run pytest in container | `docker compose exec backend pytest tests/ -q` |
| Renew SSL manually  | `docker compose exec certbot certbot renew --webroot -w /var/www/certbot` |

## Subdomain → Tenant Routing (Phase B preview)

The reverse-proxy already extracts the leftmost label of the Host header into
`$tenant_slug` and forwards it to the backend as `X-Tenant-Slug`:

| URL                          | X-Tenant-Slug |
|------------------------------|---------------|
| `vetra.example.com`          | `vetra`       |
| `acme.example.com/api/...`   | `acme`        |
| `admin.example.com`          | `admin`       |
| `example.com`                | `` (empty)    |

When Phase B (multi-tenancy) ships, the FastAPI backend will read this header
and inject `tenant_id` into every query. The Dockerfile + nginx config require
**no changes** at that point — only the backend code does.

## Troubleshooting

- **Cert issuance fails**: confirm port 80 is reachable from the public internet and your DNS is propagated (`dig your-domain.com`).
- **Backend keeps restarting**: `docker compose logs backend` — usually a bad `DATABASE_URL` or unreachable Postgres.
- **Frontend shows old URL**: CRA bakes `REACT_APP_BACKEND_URL` at build time. After changing it, run `docker compose up -d --build frontend`.
- **CORS errors in browser**: ensure `CORS_ORIGINS` in `backend/.env.production` includes the exact origin (scheme + host + port). No trailing slash.
