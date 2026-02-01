# syntax=docker/dockerfile:1
FROM node:24-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# --- Stage 1: Builder 
FROM base AS builder
ENV NODE_ENV=development
# RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --include=dev # Install all dependencies for build and tests
COPY . .
RUN npm run build

# TODO: revert Dev stage with Volume for HMR

# --- Stage 2: Test Runtime (docker-compose-test) ---
FROM builder AS test-runtime
ENV NODE_ENV=development
CMD ["npm", "run", "test:integration"]

# --- Stage 3: Runner (Production) ---
FROM base AS runner
RUN chown node:node /app
USER node
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
