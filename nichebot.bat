@echo off
:: NicheBot Launcher for Windows
:: Double-click or run from Command Prompt

echo.
echo ======================================
echo   NicheBot - AI Content Assistant
echo ======================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

:: Check node_modules
if not exist "%~dp0node_modules" (
    echo Installing dependencies...
    cd /d "%~dp0"
    npm install
    echo.
)

:: Run
cd /d "%~dp0"
node src/cli.js
pause
