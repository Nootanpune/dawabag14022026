# Dawabag API — build from the repository root so the migrations are included:
#   docker build -f backend/Dockerfile -t dawabag-api .
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY database ./database
ENV MIGRATIONS_DIR=/app/database
# The app writes nothing to disk (logs go to stdout); run as an unprivileged user
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
# Pending migrations run first (serialised by an advisory lock), then the API
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" != \"false\" ]; then node dist/db/migrate.js || exit 1; fi; exec node dist/index.js"]
