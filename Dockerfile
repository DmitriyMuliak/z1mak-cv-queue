# syntax=docker/dockerfile:1

# --- Stage 1: Builder ---
FROM node:24-slim AS builder
WORKDIR /app

# Install build dependencies (required for compiling native node modules)
# RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Runner ---
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN chown node:node /app
USER node

COPY --from=builder --chown=node:node /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/src/server.js"]