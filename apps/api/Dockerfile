FROM node:22-alpine AS base

FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/emissions/package.json ./packages/emissions/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/jest-presets/package.json ./packages/jest-presets/package.json

RUN npm ci

COPY . .

RUN npm run build -w @repo/logger
RUN npm run build -w @repo/emissions
RUN npm run build -w api
RUN npm prune --omit=dev && mkdir -p apps/api/node_modules

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4001
ENV HOST=0.0.0.0
ENV NMEA_HOST=0.0.0.0
RUN apk add --no-cache python3 py3-pip
COPY analytics/requirements.txt /tmp/analytics-requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/analytics-requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs
RUN chown nodejs:nodejs /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/logger/package.json ./packages/logger/package.json
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/emissions/package.json ./packages/emissions/package.json
COPY --from=builder /app/packages/emissions/dist ./packages/emissions/dist

COPY --from=builder /app/analytics ./analytics

USER nodejs
EXPOSE 4001
EXPOSE 10110/udp

CMD ["node", "apps/api/dist/index.js"]
