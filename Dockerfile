FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 DATA_DIR=/app/data \
    NODE_OPTIONS=--max-old-space-size=320 \
    FAA_NOTAM_BROWSER_EXECUTABLE=/usr/bin/chromium \
    BALLISTIC_WORKERS=1 CLOUD_TILE_CACHE_MAX_ITEMS=64 CLOUD_DATASET_CACHE_MAX_ITEMS=1 LAUNCH_LIBRARY_PAGE_SIZE=100
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ca-certificates curl pciutils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
