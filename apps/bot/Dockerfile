FROM node:lts-alpine@sha256:951203ef9d4e576c355194222fd19c2c7736f91228deb112675414ae3a7c9046 AS base

RUN apk add --no-cache bash curl unzip libc6-compat && \
  curl https://bun.sh/install | bash
ENV PATH="${PATH}:/root/.bun/bin"
WORKDIR /app

# ---
FROM base AS prepare

RUN bun add -g turbo@^2
COPY . .
RUN turbo prune bot --docker

# ---
FROM base AS builder

COPY --from=prepare /app/out/json/ .
RUN bun install

COPY --from=prepare /app/out/full/ .
RUN bun run build

ENV NODE_ENV=production
RUN rm -rf node_modules && \
  rm -rf /root/.bun/install/cache/ && \
  bun install --frozen-lockfile --production
RUN curl -sf https://gobinaries.com/tj/node-prune | sh && \
  node-prune

# ---
FROM node:lts-alpine@sha256:951203ef9d4e576c355194222fd19c2c7736f91228deb112675414ae3a7c9046 AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /app/apps/bot/package.json ./
COPY --from=builder --chown=node:node /app/apps/bot/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
