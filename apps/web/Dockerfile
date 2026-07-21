FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p apps/web/public

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_HOST=http://localhost:4001
ENV NEXT_PUBLIC_API_HOST=$NEXT_PUBLIC_API_HOST

RUN npm run build -w web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 4000

CMD ["node", "apps/web/server.js"]
