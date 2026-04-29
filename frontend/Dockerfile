# =========================================================
# Frontend image — React build served by Nginx (multi-stage)
# =========================================================

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Use yarn (project policy)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY . .

# REACT_APP_BACKEND_URL must be passed at BUILD time because CRA inlines it.
# Override per environment via docker-compose `args`.
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}

RUN yarn build


# ---------- Stage 2: nginx ----------
FROM nginx:alpine AS runtime

# Custom nginx config to handle SPA fallback + cache headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O- http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
