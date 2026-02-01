# syntax=docker/dockerfile:1
FROM node:24-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# --- Stage 1: Dependencies ---
FROM base as deps
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci --include=dev

# --- Stage 2: Development ---
FROM deps as development
COPY . .

# --- Stage 3: Builder ---
FROM deps AS builder
COPY . .
RUN npm run build

# --- Stage 4: Test Runtime (docker-compose-test) ---
FROM builder AS test-runtime
ENV NODE_ENV=development
CMD ["npm", "run", "test:integration"]

# --- Stage 5: Runner (Production) ---
FROM base AS runner
RUN chown node:node /app
USER node
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
