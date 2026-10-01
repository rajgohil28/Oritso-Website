# Strapi CMS, self-hosted alongside the Next.js site (see ../../Dockerfile + ../../docker-compose.yml).

FROM node:22-slim AS deps
WORKDIR /opt/app
# better-sqlite3 needs to compile a native binding if no prebuilt one matches this image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /opt/app
ENV NODE_ENV=production
COPY --from=deps /opt/app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /opt/app
ENV NODE_ENV=production
COPY --from=builder /opt/app ./
# tsconfig.json only exists for editor type-checking on the (plain JS, noEmit:true) config files.
# `strapi start` doesn't know that: any tsconfig.json makes it look for a compiled dist/ that
# this project never produces, and it fails to boot. Not needed at runtime, so drop it here.
RUN rm -f tsconfig.json
# public/uploads is excluded by .dockerignore (dev uploads shouldn't ship in the image) and is
# normally supplied by the strapi-uploads volume (docker-compose.yml), but the local upload
# provider still needs the directory to exist even before that volume's first write.
RUN mkdir -p public/uploads
EXPOSE 1337
CMD ["npm", "run", "start"]
