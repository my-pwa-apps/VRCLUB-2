@echo off
echo ========================================
echo    VR Club - Local Development Server
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found!
    echo.
    echo Please install Python from https://www.python.org
    echo Or use Node.js: npx http-server -p 8000
    echo.
    pause
    exit /b 1
)

echo [OK] Python found
echo.
echo Starting server on http://localhost:8000
echo.
echo For Quest 3S, use your computer's IP address
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start Python HTTP server
python -m http.server 8000
