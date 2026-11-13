# TDS co-op relay (server/relay.mjs). Build context is this folder:
#   docker build -t tds-relay server
#   docker run --rm -p 8787:8787 -e ALLOWED_ORIGINS=https://you.github.io tds-relay
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# dependencies first so code changes do not invalidate the npm layer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY relay.mjs ./

# the official image ships an unprivileged "node" user
USER node

ENV PORT=8787
EXPOSE 8787

# /health answers 200 JSON while the relay is up (node 22 has fetch built in)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "relay.mjs"]
