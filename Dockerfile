# Next.js site, self-hosted alongside Strapi (see cms/app/Dockerfile + docker-compose.yml).
# STRAPI_URL must be reachable both from this build (generateStaticParams pre-renders solution
# pages) and, since it also becomes the <img> src for hero/feature images, from visitors' browsers —
# so it should be Strapi's public URL, not an internal Docker hostname.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG STRAPI_URL
ENV STRAPI_URL=$STRAPI_URL
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG STRAPI_URL
ENV STRAPI_URL=$STRAPI_URL
COPY --from=builder /app/public ./public
COPY --from=builder /app/content ./content
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
