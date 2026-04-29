#!/usr/bin/env bash
# =========================================================
# init-letsencrypt.sh — bootstrap SSL certificates for the
# reverse-proxy nginx using Certbot's webroot challenge.
#
# Usage:
#   1. Point your DNS A/AAAA records (apex + wildcard) at this VPS
#      BEFORE running. Certbot HTTP-01 needs the domain to resolve.
#   2. Set DOMAIN, ADMIN_DOMAIN, LETSENCRYPT_EMAIL in .env.production.
#   3. Run: bash deploy/init-letsencrypt.sh
#
# Re-run idempotently: skips fetching if cert already exists for the domain.
# =========================================================

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo ".env.production not found at repo root. Copy .env.production.example first." >&2
  exit 1
fi
set -a; . ./.env.production; set +a

DOMAIN="${DOMAIN:?set DOMAIN in .env.production}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.${DOMAIN}}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?set LETSENCRYPT_EMAIL in .env.production}"

mkdir -p deploy/certbot/conf deploy/certbot/www

# 1. Make sure the reverse-proxy is running so it can serve the ACME challenge.
docker compose up -d reverse-proxy

# 2. Replace the __DOMAIN__ placeholder in the nginx config with the real domain
#    so SSL paths resolve once the cert exists. (Idempotent — does nothing if
#    already replaced.)
if grep -q "__DOMAIN__" deploy/nginx/nginx.conf; then
  echo "[init-letsencrypt] patching deploy/nginx/nginx.conf with domain=${DOMAIN}"
  sed -i.bak "s|__DOMAIN__|${DOMAIN}|g" deploy/nginx/nginx.conf
fi

# 3. Request the cert (or skip if already present).
if [ ! -d "deploy/certbot/conf/live/${DOMAIN}" ]; then
  echo "[init-letsencrypt] requesting cert for ${DOMAIN}, *.${DOMAIN}, ${ADMIN_DOMAIN}"
  docker compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
      --email ${LETSENCRYPT_EMAIL} \
      --agree-tos --no-eff-email \
      -d ${DOMAIN} \
      -d *.${DOMAIN} \
      -d ${ADMIN_DOMAIN} \
      --rsa-key-size 4096" certbot
else
  echo "[init-letsencrypt] cert already exists for ${DOMAIN} — skipping issuance."
fi

# 4. Reload reverse-proxy so it picks up the new cert.
docker compose exec reverse-proxy nginx -s reload || true

echo "[init-letsencrypt] done. Bring the rest of the stack up: docker compose up -d"
