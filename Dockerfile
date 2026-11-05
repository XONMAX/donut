FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p data
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:${PORT}/healthz || exit 1
# Start as root only to fix ownership of the mounted data volume (Render/Railway/Fly
# mount it as root), then drop to the unprivileged "node" user (-p keeps the env vars).
CMD ["sh", "-c", "chown -R node:node /app/data && exec su -p node -s /bin/sh -c 'exec node --disable-warning=ExperimentalWarning dist/server.js'"]
