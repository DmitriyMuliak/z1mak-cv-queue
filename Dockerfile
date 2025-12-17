# syntax=docker/dockerfile:1

FROM node:20-slim AS builder
WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY test ./test
COPY README.md ./README.md

RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
