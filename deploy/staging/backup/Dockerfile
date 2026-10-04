# Dawabag staging backup runner: pg_dump / pg_restore (PostgreSQL 16 client, same major
# version as the postgres:16 service) and a small Node helper that streams dumps to and
# from the object store. Built by deploy/staging/compose.yml (context: deploy/staging).
# Behind a corporate proxy with its own CA, add: --secret id=ca,src=/path/ca.crt
# Same Node line as the API image; Alpine release pinned so the client stays at 16.x
ARG NODE_IMAGE=node:20-alpine3.22
FROM ${NODE_IMAGE}
RUN apk add --no-cache bash tzdata postgresql16-client
# The container clock stays UTC; the schedule and backup names use Asia/Kolkata explicitly
ENV TZ=UTC NODE_ENV=production
WORKDIR /app/backup
COPY backup/package.json backup/package-lock.json ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY backup/lib.sh backup/backup.sh backup/s3.mjs backup/crypt.mjs backup/heads.sql ./
COPY restore.sh /app/restore.sh
RUN chmod +x /app/backup/backup.sh /app/restore.sh && pg_dump --version | grep -q ' 16\.'
USER node
CMD ["/app/backup/backup.sh", "schedule"]
