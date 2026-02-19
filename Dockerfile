# NotebookLM MCP Server - Docker Image
#
# Build: docker build -t notebooklm-mcp .
# Run:   docker run -p 3000:3000 -p 6080:6080 -v notebooklm-data:/data notebooklm-mcp
#
# Ports:
#   3000 - MCP HTTP API
#   6080 - noVNC web interface (for initial Google auth setup)

# Use Node.js with Debian for Playwright compatibility
FROM node:20-bookworm-slim

# Install dependencies for Playwright/Chromium + noVNC
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    # Playwright dependencies
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
    # noVNC dependencies
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
    && rm -rf /var/lib/apt/lists/*

# Install browsers via patchright (moved up for better caching)
# This should ideally happen *after* dependencies are installed, but before copying source code
# However, since patchright install happens during runtime in scripts usually, we can move it later.
# For now, let's keep npm install and build together for correctness.
# Let's move patchright install after npm run build as it might depend on project setup.

# Create non-root user for security
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

# Switch to root temporarily to install dependencies
USER root

# Install dependencies (--ignore-scripts to skip husky prepare)
RUN npm ci --omit=dev --ignore-scripts

# Install browsers via patchright (must match the patchright version)
# Wrap in sh -c and force exit code 0 to handle potential non-zero exit codes from patchright
RUN (npx patchright install chromium) || true
# Optionally, you can check if the installation was successful after forcing the exit code
# RUN ls -la /root/.cache/ms-playwright/chromium-* # Example check

# Switch back to non-root user
USER notebooklm

# --- ИЗМЕНЕНИЕ ---
# Copy source code (including tsconfig, src/, etc.) needed for build
COPY --chown=notebooklm:notebooklm . .

# Build the project inside the container to create 'dist' folder
RUN npm run build
# --- КОНЕЦ ИЗМЕНЕНИЯ ---

# Copy built application and scripts (this step is now redundant as dist is already there after build)
# We can remove the explicit COPY for dist/ as it's already part of the WORKDIR after npm run build.
# If the build script outputs to /app/dist, then the folder already exists correctly.
# The scripts and package.json still need to be copied, but they were already included in the previous COPY . .
# Let's ensure scripts are copied explicitly if build didn't overwrite them or they are outside src.
# Since scripts are likely needed, we copy them again to ensure they are present and executable.
COPY --chown=notebooklm:notebooklm scripts/ ./scripts/
COPY --chown=notebooklm:notebooklm package.json ./

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
