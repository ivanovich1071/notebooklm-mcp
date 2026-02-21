# =========================
# ===== BUILD STAGE ======
# =========================
FROM node:20-bookworm-slim AS builder

ENV NODE_ENV=development

# Install system deps required for build + Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    fonts-liberation \
    wget \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --include=dev

# Copy project
COPY . .

# Build project (FAIL if build fails)
RUN npm run build

# Verify build output
RUN test -f dist/index.js
RUN test -f dist/i18n/fr.json
RUN test -f dist/i18n/en.json

# =========================
# ===== FINAL STAGE ======
# =========================
FROM node:20-bookworm-slim AS final

ENV NODE_ENV=production

# Runtime system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    fonts-liberation \
    wget \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create user
RUN groupadd -r notebooklm && \
    useradd -r -g notebooklm -d /home/notebooklm notebooklm && \
    mkdir -p /home/notebooklm /app /data /tmp/.X11-unix && \
    chown -R notebooklm:notebooklm /home/notebooklm /app /data && \
    chmod 1777 /tmp/.X11-unix

WORKDIR /app

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package*.json ./

# Install only prod deps
RUN npm ci --omit=dev

# Install Chromium via patchright
RUN npx patchright install chromium || true

# Make entrypoint executable
RUN chmod +x /app/scripts/*.sh

USER notebooklm

# Environment
ENV HTTP_PORT=3000 \
    HTTP_HOST=0.0.0.0 \
    HEADLESS=true \
    NOTEBOOKLM_DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/home/notebooklm/.cache/ms-playwright \
    DISPLAY=:99 \
    NOVNC_PORT=6080

EXPOSE 3000 6080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

VOLUME ["/data"]

CMD ["/app/scripts/docker-entrypoint.sh"]
