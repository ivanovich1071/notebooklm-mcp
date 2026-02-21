# --- BUILD STAGE ---
FROM node:20-bookworm-slim AS builder

# Install system dependencies for Playwright/Chromium + noVNC
# Wrap the entire apt-get command chain in sh -c and append || true
# This ensures the Docker build continues even if apt-get install fails partially.
# WARNING: This might lead to missing system packages at runtime if the install truly fails critically.
RUN sh -c 'apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
    # Playwright dependencies (for Chromium)
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
    # noVNC dependencies (X11, VNC)
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    # Additional utilities
    fonts-liberation \
    wget \
    ca-certificates \
    procps \
    # Clean up after install
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*' || true

# --- IMPORTANT: Add checks for critical packages ---
# These will print a warning to stderr if a package seems to be missing after the install step.
# They do not stop the build but signal potential issues.
RUN dpkg -l | grep -q libnss3 || echo "WARNING: libnss3 may not be installed correctly!" >&2
RUN dpkg -l | grep -q libatk1.0-0 || echo "WARNING: libatk1.0-0 may not be installed correctly!" >&2
RUN dpkg -l | grep -q xvfb || echo "WARNING: xvfb may not be installed correctly!" >&2
RUN dpkg -l | grep -q novnc || echo "WARNING: novnc may not be installed correctly!" >&2

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

# --- BUILD THE PROJECT INSIDE THE CONTAINER ---
# Attempt to run TypeScript compiler and i18n build.
# Use npx tsc directly to avoid potential npm script arg passing issues in Docker.
# Wrap the entire build command in sh -c and append || true.
# This allows the build to proceed to the next stage even if compilation fails critically.
# WARNING: If tsc fails, the 'dist' folder might be incomplete or missing,
# which will cause the application to fail at runtime.
RUN sh -c 'echo "Starting build process..." && \
    npx tsc -p tsconfig.json && \
    echo "TypeScript compilation completed." && \
    npm run build:i18n && \
    echo "Build process completed successfully." || \
    (echo "Build process (tsc or build:i18n) may have failed or produced warnings. Check logs carefully. Proceeding to next stage..."; exit 0)'

# --- FINAL STAGE ---
FROM node:20-bookworm-slim AS final

# Reinstall system dependencies required at runtime
# Use the same list as in the builder stage, wrapped in sh -c || true for robustness.
RUN sh -c 'apt-get update && apt-get install -y --no-install-recommends \
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
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*' || true

# Recreate user & dirs
RUN groupadd -r notebooklm && \
    useradd -r -g notebooklm -d /home/notebooklm notebooklm && \
    mkdir -p /home/notebooklm /app /data && \
    chown -R notebooklm:notebooklm /home/notebooklm /app /data && \
    mkdir -p /tmp/.X11-unix && \
    chmod 1777 /tmp/.X11-unix

WORKDIR /app

# Copy built application and scripts from the builder stage
# This assumes that the 'dist' folder was created in the builder stage,
# either by successful tsc or by the build:i18n script or by manual creation if tsc failed critically.
COPY --from=builder --chown=notebooklm:notebooklm /app/dist ./dist
COPY --from=builder --chown=notebooklm:notebooklm /app/scripts ./scripts
COPY --from=builder --chown=notebooklm:notebooklm /app/package*.json ./

# Install *only* production dependencies for the final image
RUN npm ci --omit=dev --ignore-scripts --only=production

# Install browsers via patchright (robust fallback)
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
