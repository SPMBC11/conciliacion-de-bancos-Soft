# API y worker comparten imagen; el comando decide el proceso (ver docker-compose.yml).
FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
COPY packages/parsers/package.json packages/parsers/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN npm run build -w @finagent/domain -w @finagent/contracts -w @finagent/parsers -w @finagent/api

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /repo
# v1: se conservan node_modules completos (incluye el CLI de Prisma para `migrate deploy`).
# Imagen mínima de producción: Fase 10.
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
