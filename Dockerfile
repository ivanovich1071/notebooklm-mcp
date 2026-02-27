# --- BUILD STAGE ---
# Use Node.js for building the application
FROM node:20-bookworm-slim AS builder

# Install system dependencies required for the build process (including TypeScript compilation and i18n copy)
# We don't install Playwright browsers here, as the final stage will handle that.
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Dependencies potentially needed for Node.js native modules compilation during npm install
    python3 \
    make \
    g++ \
    # Utilities
    ca-certificates \
    wget \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install ALL dependencies (including devDependencies) for the build
RUN npm ci --include=dev --ignore-scripts

# Copy source code needed for build
COPY . .

# Build the project: compile TypeScript and copy i18n assets
RUN npm run build

# Verify build output (optional, can help catch issues early)
RUN test -f dist/index.js
RUN test -f dist/i18n/en.json || test -f dist/i18n/fr.json # Assuming at least one i18n file exists

# --- FINAL STAGE ---
# Use the official Playwright image as the base - contains browsers and system deps
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Install *only* essential system dependencies not covered by the Playwright image
# (e.g., specific fonts, noVNC components if needed separately, but often Playwright image covers Playwright/Chromium deps well)
# For this project, the Playwright image should cover most Chromium deps.
# We might still need noVNC dependencies if they are not included.
# Let's install the core ones needed by the application logic (Playwright interaction).
# The Playwright image (based on Ubuntu Jammy) usually includes common GUI/X11 deps for headless Chromium.
# If noVNC is crucial, install its server parts (novnc, websockify, fluxbox, Xvfb, x11vnc).
# Let's assume we still need them for the VNC functionality described.
RUN apt-get update && apt-get install -y --no-install-recommends \
    # noVNC dependencies (if not already in playwright image)
    novnc \
    websockify \
    fluxbox \
    xvfb \
    x11vnc \
    # Additional utilities sometimes needed
    wget \
    ca-certificates \
    procps \
    fonts-liberation \
    fonts-noto-color-emoji \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security (consistent with original)
RUN groupadd -r notebooklm && \
    useradd -r -g notebooklm -d /home/notebooklm notebooklm && \
    mkdir -p /home/notebooklm /app /data /tmp/.X11-unix && \
    chown -R notebooklm:notebooklm /home/notebooklm /app /data && \
    chmod 1777 /tmp/.X11-unix

WORKDIR /app

# Copy built application and scripts from the builder stage
COPY --from=builder --chown=notebooklm:notebooklm /app/dist ./dist
COPY --from=builder --chown=notebooklm:notebooklm /app/scripts ./scripts
COPY --from=builder --chown=notebooklm:notebooklm /app/package*.json ./

# Install *only* production dependencies for the final image
RUN npm ci --omit=dev --ignore-scripts

# --- BROWSERS ARE ALREADY INSTALLED IN THE BASE IMAGE ---
# The mcr.microsoft.com/playwright image comes with Chromium pre-installed.
# No need to run 'npx patchright install chromium' here.
# The PLAYWRIGHT_BROWSERS_PATH is typically set by the base image or defaults correctly within it.
# Let's explicitly set it just to be sure, matching the Playwright image convention.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

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
    # Playwright/Chrome settings (using the path from the Playwright image)
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    # Display for noVNC (if used)
    DISPLAY=:99 \
    NOVNC_PORT=6080

# Expose HTTP port and noVNC port
EXPOSE 3000 6080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Data volume
VOLUME ["/data"]

# Start with entrypoint (VNC setup + Node.js server)
CMD ["/app/scripts/docker-entrypoint.sh"]