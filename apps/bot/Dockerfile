FROM node:lts-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS node-base

WORKDIR /app

# ---
FROM node-base AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME/bin:$PATH

# Node.js no longer ships Corepack: install the pnpm pinned in packageManager with npm.
COPY package.json ./
RUN npm install -g --allow-scripts=pnpm "$(node -p "require('./package.json').packageManager")" && \
  npm cache clean --force

# ---
FROM base AS prepare

RUN pnpm add -g turbo@^2

COPY . .
RUN turbo prune bot --docker

# ---
FROM base AS prod-deps

RUN apk add --no-cache curl build-base python3

COPY --from=prepare /app/out/json/ .
RUN pnpm --filter=./apps/bot deploy --legacy --prod /dependencies && \
  pnpm prune --prod

WORKDIR /dependencies
RUN curl -sf https://gobinaries.com/tj/node-prune | sh && \
  node-prune

# ---
FROM base AS builder

RUN apk add --no-cache build-base python3

COPY --from=prepare /app/out/json/ .
RUN pnpm ci

COPY --from=prepare /app/out/full/ .
RUN pnpm run build

# ---
FROM node-base AS runner

ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY --from=builder --chown=node:node /app/apps/bot/package.json ./
COPY --from=builder --chown=node:node /app/apps/bot/dist ./dist
COPY --from=prod-deps --chown=node:node /dependencies/node_modules ./node_modules

RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
