# Dawabag website — docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.in -t dawabag-web frontend-web
# Base image; on AWS use the same official image from ECR Public to avoid Docker Hub limits:
#   --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci && test -x node_modules/.bin/next
COPY . .
RUN npm run build

FROM ${NODE_IMAGE}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
