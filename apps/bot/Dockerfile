FROM node:lts-alpine@sha256:c921b97d4b74f51744057454b306b418cf693865e73b8100559189605f6955b8 AS base

ENV PNPM_HOME=/usr/local/bin
WORKDIR /app

RUN corepack enable && \
  corepack prepare pnpm@latest --activate

# ---
FROM base AS prepare

RUN pnpm add -g turbo@^2

COPY . .
RUN turbo prune bot --docker

# ---
FROM base AS prod-deps

RUN apk add --no-cache curl

COPY --from=prepare /app/out/json/ .
RUN pnpm --filter=./apps/bot deploy --legacy --prod /dependencies && \
  pnpm prune --prod

WORKDIR /dependencies
RUN curl -sf https://gobinaries.com/tj/node-prune | sh && \
  node-prune

# ---
FROM base AS builder

COPY --from=prepare /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=prepare /app/out/full/ .
RUN pnpm run build

# ---
FROM base AS runner

ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY --from=builder --chown=node:node /app/apps/bot/package.json ./
COPY --from=builder --chown=node:node /app/apps/bot/dist ./dist
COPY --from=prod-deps --chown=node:node /dependencies/node_modules ./node_modules

RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["pnpm", "run", "start:prod"]
