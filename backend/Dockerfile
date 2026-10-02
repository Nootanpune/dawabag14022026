# Dawabag API — build from the repository root so the migrations are included:
#   docker build -f backend/Dockerfile -t dawabag-api .
# Behind a corporate proxy with its own CA, add: --secret id=ca,src=/path/ca.crt
# Base image; on AWS use the same official image from ECR Public to avoid Docker Hub limits:
#   --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci && test -x node_modules/.bin/tsc
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM ${NODE_IMAGE}
ENV NODE_ENV=production
# The process runs in UTC so DATE columns parse the same everywhere; every date a
# person sees, and every business day, is computed in IST (src/utils/ist.ts, DB sessions)
ENV TZ=UTC
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev && test -d node_modules/express && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY database ./database
COPY templates ./templates
# DAWA BAG logo for invoice / e-prescription PDFs (read-only, src/utils/brand.ts)
COPY backend/assets ./assets
ENV TEMPLATES_DIR=/app/templates
ENV MIGRATIONS_DIR=/app/database
# The app writes nothing to disk (logs go to stdout); run as an unprivileged user
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
# Pending migrations run first (serialised by an advisory lock), then the API
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" != \"false\" ]; then node dist/db/migrate.js || exit 1; fi; exec node dist/index.js"]
