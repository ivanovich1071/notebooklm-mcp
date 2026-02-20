# --- BUILD STAGE ---
FROM node:20-bookworm-slim AS builder

# Install system dependencies needed for building & runtime (Playwright, noVNC, etc.)
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    # Playwright Chromium deps
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
    # noVNC/Xvfb deps
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    # Fonts & utils
    fonts-liberation \
    wget \
    ca-certificates \
    procps \
    # Clean up
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create non-root user
RUN groupadd -r notebooklm && \
    useradd -r -g notebooklm -d /home/notebooklm notebooklm && \
    mkdir -p /home/notebooklm /app /data && \
    chown -R notebooklm:notebooklm /home/notebooklm /app /data && \
    mkdir -p /tmp/.X11-unix && \
    chmod 1777 /tmp/.X11-unix

WORKDIR /app

# Copy package files first (for caching)
COPY --chown=notebooklm:notebooklm package*.json ./

# Install ALL dependencies (including dev) as root
USER root
RUN npm ci --include=dev --ignore-scripts

# Copy source code
COPY --chown=notebooklm:notebooklm . .

# Build: compile TS first, then run i18n step
# ⚠️ Important: use `npx tsc -p tsconfig.json` to avoid npm script arg issues in Docker
RUN npx tsc -p tsconfig.json && \
    npm run build:i18n

# --- FINAL STAGE ---
FROM node:20-bookworm-slim AS final

# Reinstall only *runtime* system deps (same list, but minimal)
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
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Recreate user & dirs
RUN groupadd -r notebooklm && \
    useradd -r -g notebooklm -d /home/notebooklm notebooklm && \
    mkdir -p /home/notebooklm /app /data && \
    chown -R notebooklm:notebooklm /home/notebooklm /app /data && \
    mkdir -p /tmp/.X11-unix && \
    chmod 1777 /tmp/.X11-unix

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=notebooklm:notebooklm /app/dist ./dist
COPY --from=builder --chown=notebooklm:notebooklm /app/scripts ./scripts
COPY --from=builder --chown=notebooklm:notebooklm /app/package*.json ./

# Install production-only npm deps
RUN npm ci --omit=dev --ignore-scripts --only=production

# Install browsers via patchright (robust fallback)
RUN sh -c 'npx patchright install chromium; true' || true

# Make scripts executable
USER root
RUN chmod +x /app/scripts/*.sh
USER notebooklm

# Environment variables
ENV NODE_ENV=production \
    HTTP_PORT=3000 \
    HTTP_HOST=0.0.0.0 \
    HEADLESS=true \
    NOTEBOOKLM_DATA_DIR=/data \
    PLAYWRIGHT_BROWSERS_PATH=/home/notebooklm/.cache/ms-playwright \
    DISPLAY=:99 \
    NOVNC_PORT=6080

# Expose ports
EXPOSE 3000 6080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Data volume
VOLUME ["/data"]

# Entrypoint
CMD ["/app/scripts/docker-entrypoint.sh"]
