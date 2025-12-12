# WSL Usage Guide

This guide explains how to use the NotebookLM MCP HTTP Server from WSL (Windows Subsystem for Linux).

## Architecture Overview

Due to browser requirements (Playwright needs Chrome), the server must run on **Windows** to access Chrome. However, you can interact with it from WSL using the provided helper script.

```
┌─────────────────────────────────────────────────────────────┐
│                         WINDOWS                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │  MCP HTTP Server    │    │       Chrome Browser        │ │
│  │  (node.exe)         │◄──►│   (Playwright-controlled)   │ │
│  │  localhost:3000     │    │                             │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│            ▲                                                 │
└────────────┼─────────────────────────────────────────────────┘
             │ PowerShell Invoke-RestMethod
             │ (bypasses WSL network isolation)
┌────────────┼─────────────────────────────────────────────────┐
│            │                  WSL                            │
│  ┌─────────┴───────────────────────────────────────────────┐│
│  │  mcp-wsl-helper.sh                                      ││
│  │  - Calls Windows PowerShell for HTTP requests           ││
│  │  - Manages server lifecycle (start/stop)                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Your Agent / Script                                    ││
│  │  - Uses helper script or direct PowerShell calls        ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start the Server

```bash
# Using the helper script
/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh start

# Or manually via PowerShell
powershell.exe -Command "Start-Process -NoNewWindow -FilePath 'node' -ArgumentList 'D:/Claude/notebooklm-mcp-http/dist/http-wrapper.js' -WorkingDirectory 'D:/Claude/notebooklm-mcp-http'"
```

### 2. Check Server Status

```bash
/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh status
```

### 3. Authenticate (First Time)

```bash
/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh auth
```

This opens Chrome on Windows for Google authentication.

### 4. Ask a Question

```bash
/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh ask "What is CNV?" corpus-cnv
```

## Helper Script Reference

Location: `/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh`

| Command                        | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `start`                        | Start the server (Windows background process) |
| `stop`                         | Stop the server                               |
| `status`                       | Check server status and health                |
| `health`                       | Get health status (JSON)                      |
| `auth`                         | Launch authentication (opens Chrome)          |
| `ask "question" [notebook_id]` | Ask a question                                |
| `notebooks`                    | List available notebooks                      |

## Direct API Calls from WSL

If you need to make direct API calls without the helper script, use PowerShell:

### Health Check

```bash
powershell.exe -Command "Invoke-RestMethod -Uri 'http://localhost:3000/health' | ConvertTo-Json"
```

### Ask Question

```bash
powershell.exe -Command "Invoke-RestMethod -Uri 'http://localhost:3000/ask' -Method Post -ContentType 'application/json' -Body '{\"question\": \"Your question here\", \"notebook_id\": \"corpus-cnv\"}' | ConvertTo-Json -Depth 10"
```

### List Notebooks

```bash
powershell.exe -Command "Invoke-RestMethod -Uri 'http://localhost:3000/notebooks' | ConvertTo-Json -Depth 10"
```

## Why Not Use curl Directly?

WSL2 uses a virtualized network that doesn't share `localhost` with Windows by default. While there are ways to configure this (WSL mirrored networking, firewall rules), the most reliable approach is to use PowerShell's `Invoke-RestMethod` which runs on Windows and accesses `localhost:3000` directly.

## Troubleshooting

### Server won't start

```bash
# Check if port 3000 is already in use
cmd.exe /c "netstat -ano | findstr :3000"

# Kill the process if needed
cmd.exe /c "taskkill /PID <PID> /F"
```

### Authentication expired

```bash
# Check health first
/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh health

# If authenticated: false, re-authenticate
/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh auth
```

### Chrome profile locked

Close all Chrome windows and try again:

```bash
cmd.exe /c "taskkill /IM chrome.exe /F"
/mnt/d/Claude/notebooklm-mcp-http/scripts/mcp-wsl-helper.sh start
```

## Data Sharing Between WSL and Windows

The server stores authentication and data in:

- **Windows**: `C:\Users\<user>\AppData\Local\notebooklm-mcp\Data\`
- **WSL symlink**: `~/.local/share/notebooklm-mcp` → Windows path

This symlink ensures both environments share the same authentication state.

To create the symlink (already done):

```bash
rm -rf ~/.local/share/notebooklm-mcp
ln -sf /mnt/c/Users/<user>/AppData/Local/notebooklm-mcp/Data ~/.local/share/notebooklm-mcp
```
