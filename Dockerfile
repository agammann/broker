FROM node:26.12.0-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913 AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS browser-dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pnpm exec playwright install --with-deps chromium && mkdir -p /app/data && chown node:node /app/data

FROM dependencies AS build
COPY . .
RUN pnpm build

FROM browser-dependencies AS runtime
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/dist ./dist
COPY --from=build /app/web-dist ./web-dist
COPY --from=build /app/migrations ./migrations
USER node
CMD ["node", "dist/server/main.js"]

FROM node:26.12.0-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913 AS gateway
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER node
CMD ["node", "dist/server/gateway.js"]

FROM caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 AS ingress
# Ports 4310/4311 need no low-port capability. Remove the inherited file
# capability so exec succeeds with cap_drop ALL and no-new-privileges.
RUN setcap -r /usr/bin/caddy
