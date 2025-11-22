# Installation Guide - NotebookLM MCP HTTP Server

> Complete installation from scratch on Windows 10/11

---

## 📋 Table of Contents

1. [Prerequisites](#-prerequisites)
2. [Node.js Installation](#-nodejs-installation)
3. [Project Cloning](#-project-cloning)
4. [Dependencies Installation](#-dependencies-installation)
5. [Compilation](#-compilation)
6. [Authentication Configuration](#-authentication-configuration)
7. [Notebooks Configuration](#-notebooks-configuration)
8. [Verification](#-verification)
9. [Startup](#-startup)

---

## 📌 Prerequisites

Before starting, you need:

### Hardware
- **RAM:** 2 GB minimum (4 GB recommended)
- **Disk:** 500 MB free space
- **Network:** Stable Internet connection

### Software
- **Windows 10/11** (64-bit)
- **PowerShell 5.1+** (included in Windows)
- **Browser:** Chrome installed (Playwright will use it)

### Accounts
- **Google Account** with access to https://notebooklm.google.com
- At least **1 NotebookLM notebook** already created

---

## 📥 Node.js Installation

### Check if Node.js is already installed

```powershell
node --version
npm --version
```

If you see version numbers (e.g., `v20.9.0` and `10.1.0`), Node.js is installed. ✅
If not, continue below. ⬇️

### Download Node.js

1. Go to https://nodejs.org/
2. Download the **LTS** (Long Term Support) version for Windows
3. Run the `.msi` installer
4. Follow the installation wizard:
   - ✅ Accept the license
   - ✅ Standard installation (default path: `C:\Program Files\nodejs\`)
   - ✅ Check "Automatically install the necessary tools" if offered

5. Restart PowerShell and verify:

```powershell
node --version   # Should display: v20.x.x or higher
npm --version    # Should display: 10.x.x or higher
```

---

## 📂 Project Cloning

### Method 1: With Git

```powershell
# Install Git if not already done: https://git-scm.com/download/win

# Clone the repository
cd D:\
git clone https://github.com/PleasePrompto/notebooklm-mcp.git notebooklm-http
cd notebooklm-http
```

### Method 2: ZIP Download

1. Download the ZIP from GitHub
2. Extract to `D:\notebooklm-http\`
3. Open PowerShell in this folder

---

## 📦 Dependencies Installation

```powershell
# Make sure you're in the right directory
cd D:\notebooklm-http

# Install all npm dependencies
npm install
```

**What gets installed:**
- `express` - HTTP server
- `patchright` - Stealth Playwright to automate Chrome
- `@anthropic-ai/sdk` - MCP SDK
- And ~50 other necessary packages

**Duration:** 2-5 minutes depending on your Internet connection

**Expected result:**
```
added 150 packages in 3m
```

---

## 🔨 Compilation

The project is written in TypeScript and must be compiled to JavaScript:

```powershell
npm run build
```

**Expected result:**
```
> notebooklm-mcp@1.1.2 build
> tsc

> notebooklm-mcp@1.1.2 postbuild
> chmod +x dist/index.js

✓ Compilation successful
```

**Verification:**
```powershell
ls dist\http-wrapper.js
```

If the file exists, compilation is OK! ✅

---

## 🔐 Authentication Configuration

**IMPORTANT:** This step is done **ONLY ONCE**.
Authentication will be saved and valid for ~399 days.

### PowerShell Script (Recommended)

**Note:** The path depends on your current directory.

**If you're at the project root:**
```powershell
.\deployment\scripts\setup-auth.ps1
```

**If you're in the deployment folder:**
```powershell
.\scripts\setup-auth.ps1
```

**Or use npm (works everywhere):**
```powershell
npm run setup-auth
```

**What will happen:**

1. The script checks if authentication already exists
   - If yes: asks for confirmation to reset
   - If no: continues directly

2. Chrome opens (visible window)

3. **Actions to do in Chrome:**
   - Sign in to your Google account
   - Go to https://notebooklm.google.com
   - Wait for the page to load completely
   - You should see your notebooks
   - **Close Chrome** (click the red X)

4. The script verifies that files are correctly created

**Expected result:**
```
✅ Authentication configured successfully!
💡 Google session valid for ~399 days

Files created:
  ✅ state.json created (X KB)
  ✅ Cookies created (XXX KB)
```

### 📁 Authentication Files Location

**IMPORTANT:** Authentication files are NOT stored in the project directory, but in the Windows user directory:

**Full path:**
```
C:\Users\<YOUR_NAME>\AppData\Local\notebooklm-mcp\Data\
```

**File structure:**
```
C:\Users\<YOUR_NAME>\AppData\Local\notebooklm-mcp\Data\
├── chrome_profile\           ← Complete Chrome profile (Google cookies)
│   └── Default\
│       └── Cookies           ← Cookies file (must be >10KB)
│
├── browser_state\
│   └── state.json            ← Authentication state (16 critical cookies)
│
└── library.json              ← Library of configured notebooks
```

**To verify on your PC:**
```powershell
# Display the path
echo $env:LOCALAPPDATA\notebooklm-mcp\Data

# List files
dir $env:LOCALAPPDATA\notebooklm-mcp\Data
dir $env:LOCALAPPDATA\notebooklm-mcp\Data\chrome_profile\Default\Cookies
dir $env:LOCALAPPDATA\notebooklm-mcp\Data\browser_state\state.json
```

**Expected files:**
- `Cookies` - SQLite database (>10 KB) - **Contains your Google cookies**
- `state.json` - JSON file with 16 critical cookies - **Valid for 399 days**
- `library.json` - Library of your NotebookLM notebooks (created automatically)

---

## 📚 Notebooks Configuration

Once authentication is configured, you must add at least one notebook to your library.

### Option 1: Via HTTP API (Recommended)

**Prerequisite:** Start the HTTP server first

```powershell
# In a first terminal
npm run start:http
```

**In a second PowerShell terminal:**

```powershell
# Prepare notebook data
$body = @{
    url = "https://notebooklm.google.com/notebook/74912e55-34a4-4027-bdcc-8e89badd0efd"
    name = "CNV"
    description = "Communication NonViolente"
    topics = @("communication", "empathie", "besoins")
} | ConvertTo-Json

# Add the notebook (automatic validation)
Invoke-RestMethod -Uri "http://localhost:3000/notebooks" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

**⏱️ Note:** Adding takes 15-30 seconds because the server validates that the notebook actually exists.

**Automatic validations:**
- ✅ NotebookLM URL format
- ✅ Notebook actually accessible (live check)
- ✅ No duplicate name
- ✅ Valid Google session

**How to get a notebook URL:**
1. Go to https://notebooklm.google.com
2. Open your notebook
3. Copy the URL from the address bar

Expected format: `https://notebooklm.google.com/notebook/[id]`

### Option 2: Manual Modification (Advanced)

Edit `library.json` directly:

```powershell
# Open the file
code "$env:LOCALAPPDATA\notebooklm-mcp\Data\library.json"
```

**⚠️ Warning:** This method bypasses automatic validations.

**Example structure:**

```json
{
  "notebooks": [
    {
      "id": "cnv",
      "url": "https://notebooklm.google.com/notebook/74912e55-34a4-4027-bdcc-8e89badd0efd",
      "name": "CNV",
      "description": "Communication NonViolente",
      "topics": ["communication", "empathie", "besoins"],
      "content_types": ["documentation", "examples"],
      "use_cases": ["Learning about CNV"],
      "added_at": "2025-11-22T08:49:16.735Z",
      "last_used": "2025-11-22T08:49:16.735Z",
      "use_count": 0,
      "tags": []
    }
  ],
  "active_notebook_id": "cnv",
  "last_modified": "2025-11-22T08:49:16.735Z",
  "version": "1.0.0"
}
```

**Restart the server after manual modification.**

### Verify Configuration

```powershell
# List configured notebooks
Invoke-RestMethod -Uri "http://localhost:3000/notebooks"
```

**Expected result:**

```json
{
  "success": true,
  "data": {
    "notebooks": [
      {
        "id": "cnv",
        "name": "CNV",
        "url": "https://notebooklm.google.com/notebook/xxx",
        "active": true
      }
    ],
    "count": 1
  }
}
```

**📖 For more details on notebook management, see [06-NOTEBOOK-LIBRARY.md](./06-NOTEBOOK-LIBRARY.md)**

---

### ⚠️ AUTHENTICATION FILES SECURITY
- These files contain your **authenticated Google cookies**
- **NEVER** share these files
- **NEVER** commit them to Git (already protected by .gitignore)
- To reset auth: delete the `Data\` folder and run `npm run setup-auth` again

If all files are present and not empty, authentication is configured! ✅

---

## ✅ Verification

Before starting the server, let's verify that everything is OK:

### Complete Checklist

```powershell
# 1. Node.js installed
node --version
# ✅ Should display v20.x.x or higher

# 2. Dependencies installed
ls node_modules\express
# ✅ The folder must exist

# 3. Code compiled
ls dist\http-wrapper.js
# ✅ The file must exist

# 4. Authentication configured
ls Data\chrome_profile\Default\Cookies
ls Data\browser_state\state.json
# ✅ Both files must exist and not be empty

# 5. Port 3000 free
netstat -ano | findstr :3000
# ✅ No result = port free
# ❌ A result = port occupied (see TROUBLESHOOTING.md)
```

If all checks are ✅, you're ready! 🎉

---

## ▶️ Startup

### First Startup

```powershell
npm run start:http
```

**Expected result:**
```
✅ [14:30:15] 🌐 HTTP Wrapper listening on 0.0.0.0:3000
ℹ️  [14:30:15]    Health check: http://localhost:3000/health
ℹ️  [14:30:15]    Ask question: POST http://localhost:3000/ask
ℹ️  [14:30:15]    List notebooks: GET http://localhost:3000/notebooks

ℹ️  [14:30:15] 📖 API Documentation:
ℹ️  [14:30:15]    POST /ask - Ask a question to NotebookLM
ℹ️  [14:30:15]    GET /health - Check server health
ℹ️  [14:30:15]    GET /notebooks - List all notebooks
```

**The server is started!** 🚀

### Health Test

Open a **new PowerShell terminal** and test:

```powershell
curl http://localhost:3000/health
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "sessions": 0,
    "library_notebooks": 1,
    "context_age_hours": 0.0
  }
}
```

If `"authenticated": true`, everything works! ✅

### Complete Test with Question

```powershell
curl -X POST http://localhost:3000/ask `
  -H "Content-Type: application/json" `
  -d '{"question":"Liste 1 besoin en CNV","notebook_id":"cnv"}'
```

**Wait 30-60 seconds** (NotebookLM generation time).

**Expected response:**
```json
{
  "success": true,
  "data": {
    "status": "success",
    "question": "Liste 1 besoin en CNV",
    "answer": "Votre requête concernant la liste des besoins...",
    "session_id": "abc123",
    "notebook_url": "https://notebooklm.google.com/notebook/...",
    "session_info": {
      "age_seconds": 35,
      "message_count": 1
    }
  }
}
```

If you receive a JSON response with `"success": true` and an `"answer"`, **congratulations!** 🎉
Your NotebookLM HTTP server is operational!

### Automated Tests (Recommended)

For complete validation, use the test scripts:

```powershell
# Quick test (30 seconds)
.\deployment\scripts\test-server.ps1

# Complete tests (5-10 minutes)
.\deployment\scripts\test-api.ps1
```

**Expected result:**
```
✅ ALL TESTS PASSED!

Total tests: 10
Successful tests: 10
Failed tests: 0
Success rate: 100%
```

**👉 Complete test documentation:** [Test Scripts](../scripts/README.md)

---

## 🚪 Stop the Server

In the terminal where the server is running, press:

```
Ctrl + C
```

The server stops gracefully with:
```
SIGINT received, shutting down gracefully...
```

---

## ➡️ Next Steps

✅ Installation complete!

**Now you can:**

1. **[Advanced Configuration](./02-CONFIGURATION.md)** - Environment variables, firewall, security
2. **[API Documentation](./03-API.md)** - All available endpoints
3. **[n8n Integration](./04-N8N-INTEGRATION.md)** - Connect with n8n step-by-step
4. **[Troubleshooting](./05-TROUBLESHOOTING.md)** - Solutions to common problems

---

## 🆘 Problems?

If something doesn't work:

1. Consult **[05-TROUBLESHOOTING.md](./05-TROUBLESHOOTING.md)**
2. Check server logs
3. Test with `npm run setup-auth` again
4. Open a GitHub issue with the logs

---

**Congratulations! Your NotebookLM HTTP server is installed and operational! 🎉**
