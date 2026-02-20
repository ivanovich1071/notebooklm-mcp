# --- BUILD STAGE ---
# Use Node.js with Debian for build dependencies
FROM node:20-bookworm-slim AS builder

# Install system dependencies for Playwright/Chromium + noVNC (needed for build tools potentially)
# Even if not used in final stage, build tools might need them
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    # Playwright dependencies (just in case build tools need them)
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
    # noVNC dependencies (just in case)
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    # Additional utilities
    fonts-liberation \
    fonts-noto-color-emoji \
    wget \
    ca-certificates \
    procps \
    # Clean up
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create non-root user for security (used in both stages)
RUN groupadd -r notebooklm && useradd -r -g notebooklm -d /home/notebooklm notebooklm \
    && mkdir -p /home/notebooklm /app /data \
    && chown -R notebooklm:notebooklm /home/notebooklm /app /data \
    # Create X11 socket directory with proper permissions for Xvfb
    && mkdir -p /tmp/.X11-unix \
    && chmod 1777 /tmp/.X11-unix

# Set working directory
WORKDIR /app

# Copy package files first (better caching)
COPY --chown=notebooklm:notebooklm package*.json ./

# Switch to root to install dependencies (including devDependencies for build)
USER root

# Install ALL dependencies (prod and dev) for the build
RUN npm ci --include=dev --ignore-scripts

# Copy source code needed for build
COPY --chown=notebooklm:notebooklm . .

# Build the project inside the container to create 'dist' folder
# This step requires typescript and other dev dependencies to be installed
RUN npm run build

# --- FINAL STAGE ---
FROM node:20-bookworm-slim AS final

# Reinstall system dependencies required at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Playwright dependencies (required for running Playwright)
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
    # noVNC dependencies (required for VNC)
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    # Additional utilities
    fonts-liberation \
    fonts-noto-color-emoji \
    wget \
    ca-certificates \
    procps \
    # Clean up
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Recreate user/group (UID/GID might differ, but consistency is good practice)
RUN groupadd -r notebooklm && useradd -r -g notebooklm -d /home/notebooklm notebooklm \
    && mkdir -p /home/notebooklm /app /data \
    && chown -R notebooklm:notebooklm /home/notebooklm /app /data \
    && mkdir -p /tmp/.X11-unix \
    && chmod 1777 /tmp/.X11-unix

WORKDIR /app

# Copy built application and scripts from the builder stage
COPY --from=builder --chown=notebooklm:notebooklm /app/dist ./dist
COPY --from=builder --chown=notebooklm:notebooklm /app/scripts ./scripts
COPY --from=builder --chown=notebooklm:notebooklm /app/package*.json ./

# Install *only* production dependencies for the final image
RUN npm ci --omit=dev --ignore-scripts --only=production

# Install browsers via patchright into the final image
# Wrap in sh -c and force exit code 0 to handle potential non-zero exit codes from patchright itself
RUN sh -c 'npx patchright install chromium; true' || true

# Make scripts executable (needs root)
USER root
RUN chmod +x /app/scripts/*.sh
USER notebooklm

# Environment variables
ENV NODE_ENV=production \
    HTTP_PORT=3000 \
    HTTP_HOST=0.0.0.0 \
    HEADLESS=true \
    NOTEBOOKLM_DATA_DIR=/data \
    # Playwright/Chrome settings for Docker
    PLAYWRIGHT_BROWSERS_PATH=/home/notebooklm/.cache/ms-playwright \
    # Display for noVNC
    DISPLAY=:99 \
    NOVNC_PORT=6080

# Expose HTTP port and noVNC port
EXPOSE 3000 6080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Data volume
VOLUME ["/data"]

# Start with entrypoint (VNC + Node.js)
CMD ["/app/scripts/docker-entrypoint.sh"]
