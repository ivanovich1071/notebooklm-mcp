#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "Starting NotebookLM MCP Server entrypoint..."

# --- VNC Setup (if needed) ---
# This part handles starting Xvfb, Fluxbox, and x11vnc/noVNC for visual auth.
# Adjust based on whether VNC is actually required for your use case or just for initial setup.

if [ "$HEADLESS" != "true" ]; then
    echo "Starting VNC services..."
    # Start Xvfb virtual display
    Xvfb :99 -screen 0 1024x768x24 &
    sleep 1 # Give Xvfb a moment to start

    # Start fluxbox window manager
    fluxbox &
    sleep 1

    # Start x11vnc to share the X session
    x11vnc -listen localhost -display :99 -forever -shared -passwd notebooklm &
    sleep 1

    # Start noVNC web interface
    websockify --web /usr/share/novnc/ 6080 localhost:5900 &
    sleep 1

    echo "VNC services started. Access via http://<your-domain-or-ip>:6080/vnc.html"
else
    echo "Running in headless mode, skipping VNC setup."
fi

# --- Wait for potential startup processes if needed ---
# If VNC is started, ensure it's ready before Node.js tries to interact with display :99
# A simple sleep might suffice, or you could check for specific processes/files.
# For now, assuming VNC setup is fast enough or handled asynchronously by the app if needed.
sleep 2

# --- Start Node.js Application ---
# Use 'exec' to replace the shell process (PID 1) with the Node.js process.
# This is crucial for proper signal handling (SIGTERM, SIGINT) from the container orchestrator (e.g., Docker, Kubernetes, Render).
# Without 'exec', signals sent to stop the container might only kill the shell script, leaving Node.js running orphaned.
echo "Starting Node.js application..."
exec node dist/http-wrapper.js "$@"
# Any arguments passed to the container will be forwarded to the Node.js script via "$@"
# The 'exec' command replaces the current shell process (the script itself) with 'node'.
# Now, 'node dist/http-wrapper.js' becomes PID 1 and receives signals directly.
