# VR Club - Local Development Server
# Run this script to start a local web server for testing

Write-Host "🎉 Starting VR Club Local Server..." -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue

if ($pythonCommand) {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Found $pythonVersion" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Starting server on http://localhost:8000" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📱 For Quest 3S, use your computer's IP address:" -ForegroundColor Yellow
    
    # Get local IP address
    $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
    
    if ($ipAddress) {
        Write-Host "   http://$ipAddress:8000" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
    Write-Host ""
    
    # Start Python HTTP server
    python -m http.server 8000
} else {
    Write-Host "❌ Python not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Python from https://www.python.org" -ForegroundColor Yellow
    Write-Host "Or use Node.js: npx http-server -p 8000" -ForegroundColor Yellow
    Write-Host ""
    Pause
}
