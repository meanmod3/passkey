FROM node:20-alpine
WORKDIR /app

# Prisma 5 needs openssl + libc6-compat on alpine.
RUN apk add --no-cache openssl libc6-compat

# Install deps at workspace root so Prisma client resolves correctly.
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY seed/package.json ./seed/
RUN npm install --workspaces --include-workspace-root

COPY backend ./backend
COPY shared ./shared
COPY seed ./seed

WORKDIR /app/backend
RUN npx prisma generate

EXPOSE 4000
# Phase 2: use `db push` to sync schema without requiring committed migrations.
# Switch to `migrate deploy` once initial migration is generated and committed.
# Regenerate the client AFTER push so dev hot-reload of schema.prisma is reflected.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx prisma generate && npm run db:seed && npm run dev"]
