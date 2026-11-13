FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS dependencies
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

FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS gateway
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build /app/package.json ./package.json
USER node
CMD ["node", "dist/server/gateway.js"]

FROM caddy@sha256:4e2425f6009577e7c651010f16679c28f7d12df3e7b1914f941a7a3370746b3c AS ingress
# Ports 4310/4311 need no low-port capability. Remove the inherited file
# capability so exec succeeds with cap_drop ALL and no-new-privileges.
RUN setcap -r /usr/bin/caddy
