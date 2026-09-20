FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src/ ./src/
COPY core/ ./core/
COPY templates/ ./templates/
COPY registry/ ./registry/
COPY security/ ./security/
COPY advanced/ ./advanced/
COPY extensions/ ./extensions/
COPY coordination/ ./coordination/
COPY database/ ./database/
COPY distribution/ ./distribution/
COPY error-fix-loop/ ./error-fix-loop/
COPY preview/ ./preview/
COPY loops/ ./loops/
COPY agents/ ./agents/
COPY artifacts/ ./artifacts/
COPY quality/ ./quality/
COPY live-preview/ ./live-preview/
COPY server/ ./server/
COPY session/ ./session/
COPY context/ ./context/
COPY index.ts ./

RUN npx tsc --project tsconfig.build.json

FROM node:20-alpine AS runtime

RUN apk add --no-cache wget

RUN addgroup -g 1001 -S nova && \
    adduser -S nova -u 1001 -G nova

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN chown -R nova:nova /app

USER nova

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
