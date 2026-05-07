# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/providers/package.json packages/providers/
COPY packages/tools/package.json packages/tools/
COPY packages/cli/package.json packages/cli/
COPY packages/tui/package.json packages/tui/
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/server/package.json packages/server/
COPY packages/wiki/package.json packages/wiki/
COPY packages/arix/package.json packages/arix/
COPY packages/vscode-ext/package.json packages/vscode-ext/

# Install dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY . .

# Build all packages
RUN pnpm build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Install pnpm for workspace linking
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy built artifacts and manifests
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/providers/dist packages/providers/dist
COPY --from=builder /app/packages/tools/dist packages/tools/dist
COPY --from=builder /app/packages/cli/dist packages/cli/dist
COPY --from=builder /app/packages/dashboard/dist packages/dashboard/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/proto packages/server/proto
COPY --from=builder /app/packages/wiki/dist packages/wiki/dist
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/providers/package.json packages/providers/
COPY --from=builder /app/packages/tools/package.json packages/tools/
COPY --from=builder /app/packages/cli/package.json packages/cli/
COPY --from=builder /app/packages/dashboard/package.json packages/dashboard/
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/wiki/package.json packages/wiki/
COPY --from=builder /app/package.json .
COPY --from=builder /app/pnpm-workspace.yaml .
COPY --from=builder /app/pnpm-lock.yaml .

# Install production deps only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Create non-root user
RUN addgroup -S arix && adduser -S arix -G arix
RUN mkdir -p /home/arix/.arix && chown -R arix:arix /home/arix
USER arix

ENV HOME=/home/arix

# Expose dashboard and gRPC ports
EXPOSE 3000 50051

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
CMD ["--help"]
