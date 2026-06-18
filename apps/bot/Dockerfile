FROM node:lts-alpine@sha256:5fa278c599dbba0c8f873d8717d50ecbb57c5ae6a53b7ab240c25135e0b65995 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME/bin:$PATH
WORKDIR /app

COPY package.json ./
RUN corepack enable && \
  corepack prepare --activate

# ---
FROM base AS prepare

RUN pnpm add -g turbo@^2

COPY . .
RUN turbo prune bot --docker

# ---
FROM base AS prod-deps

RUN apk add --no-cache curl build-base python3 pango-dev

COPY --from=prepare /app/out/json/ .
RUN pnpm --filter=./apps/bot deploy --legacy --prod /dependencies && \
  pnpm prune --prod

WORKDIR /dependencies
RUN curl -sf https://gobinaries.com/tj/node-prune | sh && \
  node-prune

# ---
FROM base AS builder

RUN apk add --no-cache build-base python3 pango-dev

COPY --from=prepare /app/out/json/ .
RUN pnpm ci

COPY --from=prepare /app/out/full/ .
RUN pnpm run build

# ---
FROM base AS runner

ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg pango

COPY --from=builder --chown=node:node /app/apps/bot/package.json ./
COPY --from=builder --chown=node:node /app/apps/bot/dist ./dist
COPY --from=prod-deps --chown=node:node /dependencies/node_modules ./node_modules

RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
