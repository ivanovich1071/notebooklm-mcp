#!/usr/bin/env pwsh
#Requires -Version 5.1

<#
.SYNOPSIS
    Test the Auto-Discovery endpoint

.DESCRIPTION
    Tests the POST /notebooks/auto-discover endpoint with various scenarios:
    - Valid NotebookLM URL
    - Invalid URL format
    - Missing URL field

.PARAMETER ServerUrl
    Base URL of the NotebookLM MCP HTTP server (default: http://localhost:3000)

.PARAMETER NotebookUrl
    Optional: NotebookLM notebook URL to test with

.EXAMPLE
    .\test-auto-discovery.ps1
    # Tests with prompts for notebook URL

.EXAMPLE
    .\test-auto-discovery.ps1 -NotebookUrl "https://notebooklm.google.com/notebook/abc123"
    # Tests with specific notebook URL
#>

param(
    [string]$ServerUrl = "http://localhost:3000",
    [string]$NotebookUrl = ""
)

# Colors
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning-Custom { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error-Custom { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }

# Banner
Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║                                                        ║" -ForegroundColor Magenta
Write-Host "║      AUTO-DISCOVERY ENDPOINT TESTS                     ║" -ForegroundColor Cyan
Write-Host "║                                                        ║" -ForegroundColor Magenta
Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Magenta

Write-Info "Testing server: $ServerUrl"
Write-Host ""

# Check server is running
Write-Info "Checking if server is accessible..."
try {
    $health = Invoke-RestMethod -Uri "$ServerUrl/health" -Method GET -ErrorAction Stop
    Write-Success "Server is running"
} catch {
    Write-Error-Custom "Server is not accessible at $ServerUrl"
    Write-Info "Start the server with: npm run daemon:start"
    exit 1
}

Write-Host ""

# Test counter
$totalTests = 0
$passedTests = 0
$failedTests = 0

# ============================================================================
# Test 1: Missing URL field
# ============================================================================
$totalTests++
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Info "[Test 1/$totalTests] Missing URL field (should return 400)"
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

try {
    $body = @{} | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$ServerUrl/notebooks/auto-discover" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    Write-Error-Custom "Test failed: Should have returned 400 error"
    $failedTests++
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Success "Correctly returned 400 Bad Request"
        $passedTests++
    } else {
        Write-Error-Custom "Wrong error code: $($_.Exception.Response.StatusCode)"
        $failedTests++
    }
}

Write-Host ""

# ============================================================================
# Test 2: Invalid URL format
# ============================================================================
$totalTests++
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Info "[Test 2/$totalTests] Invalid URL format (should return 400)"
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        url = "https://example.com/not-a-notebooklm-url"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$ServerUrl/notebooks/auto-discover" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    Write-Error-Custom "Test failed: Should have returned 400 error"
    $failedTests++
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Success "Correctly returned 400 Bad Request"
        $passedTests++
    } else {
        Write-Error-Custom "Wrong error code: $($_.Exception.Response.StatusCode)"
        $failedTests++
    }
}

Write-Host ""

# ============================================================================
# Test 3: Valid NotebookLM URL (requires real notebook)
# ============================================================================
$totalTests++
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Info "[Test 3/$totalTests] Valid NotebookLM URL auto-discovery"
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

# Prompt for notebook URL if not provided
if (-not $NotebookUrl) {
    Write-Host ""
    Write-Info "To test auto-discovery, provide a valid NotebookLM URL."
    Write-Host "Format: https://notebooklm.google.com/notebook/[id]" -ForegroundColor White
    Write-Host ""
    $NotebookUrl = Read-Host "Enter NotebookLM URL (or press Enter to skip)"
}

if (-not $NotebookUrl) {
    Write-Warning-Custom "Skipping: No NotebookLM URL provided"
    Write-Info "Rerun with -NotebookUrl parameter to test this"
    $totalTests--
} else {
    Write-Info "Testing with: $NotebookUrl"
    Write-Warning-Custom "This may take 20-30 seconds (querying NotebookLM)..."
    Write-Host ""

    try {
        $body = @{
            url = $NotebookUrl
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$ServerUrl/notebooks/auto-discover" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop

        if ($response.success) {
            Write-Success "Auto-discovery successful!"
            Write-Host ""
            Write-Info "Generated Metadata:"
            Write-Host "  Name: $($response.notebook.name)" -ForegroundColor White
            Write-Host "  Description: $($response.notebook.description)" -ForegroundColor White
            Write-Host "  Topics: $($response.notebook.topics -join ', ')" -ForegroundColor White
            Write-Host "  Auto-generated: $($response.notebook.auto_generated)" -ForegroundColor White
            Write-Host ""

            # Validate format
            $validations = @()

            # Check name format (kebab-case, 3 words max)
            if ($response.notebook.name -match '^[a-z0-9]+(-[a-z0-9]+){0,2}$') {
                $validations += "✅ Name format valid (kebab-case)"
            } else {
                $validations += "❌ Name format invalid: $($response.notebook.name)"
            }

            # Check description length (<= 150 chars)
            if ($response.notebook.description.Length -le 150) {
                $validations += "✅ Description length valid ($($response.notebook.description.Length) chars)"
            } else {
                $validations += "❌ Description too long: $($response.notebook.description.Length) chars"
            }

            # Check topics count (8-10)
            $topicCount = $response.notebook.topics.Count
            if ($topicCount -ge 8 -and $topicCount -le 10) {
                $validations += "✅ Topics count valid ($topicCount)"
            } else {
                $validations += "❌ Topics count invalid: $topicCount (must be 8-10)"
            }

            # Check auto_generated flag
            if ($response.notebook.auto_generated -eq $true) {
                $validations += "✅ Auto-generated flag set"
            } else {
                $validations += "❌ Auto-generated flag not set"
            }

            Write-Info "Validation Results:"
            foreach ($validation in $validations) {
                Write-Host "  $validation"
            }

            if ($validations -match "❌") {
                Write-Error-Custom "Metadata validation failed"
                $failedTests++
            } else {
                Write-Success "All metadata validations passed"
                $passedTests++
            }
        } else {
            Write-Error-Custom "Auto-discovery failed: $($response.error)"
            $failedTests++
        }
    } catch {
        Write-Error-Custom "Request failed: $($_.Exception.Message)"
        if ($_.ErrorDetails.Message) {
            $errorObj = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host "  Error: $($errorObj.error)" -ForegroundColor Red
        }
        $failedTests++
    }
}

Write-Host ""

# ============================================================================
# Summary
# ============================================================================
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Gray
Write-Host "║                                                        ║" -ForegroundColor Gray
Write-Host "║                    TEST SUMMARY                        ║" -ForegroundColor Cyan
Write-Host "║                                                        ║" -ForegroundColor Gray
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Gray
Write-Host ""

Write-Host "Total tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $passedTests" -ForegroundColor Green
Write-Host "Failed: $failedTests" -ForegroundColor $(if ($failedTests -gt 0) { "Red" } else { "Gray" })
Write-Host "Success rate: $([math]::Round(($passedTests / $totalTests) * 100, 1))%" -ForegroundColor White
Write-Host ""

if ($failedTests -gt 0) {
    Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║                                                        ║" -ForegroundColor Red
    Write-Host "║              ❌ SOME TESTS FAILED                       ║" -ForegroundColor Red
    Write-Host "║                                                        ║" -ForegroundColor Red
    Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Red
    exit 1
} else {
    Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║                                                        ║" -ForegroundColor Green
    Write-Host "║              ✅ ALL TESTS PASSED                        ║" -ForegroundColor Green
    Write-Host "║                                                        ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Green
    exit 0
}
