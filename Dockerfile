# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: Production ──
FROM node:20-alpine

RUN apk add --no-cache tini
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# tini as PID 1 for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default: API server. Override with command for worker/seed.
CMD ["node", "dist/server.js"]
