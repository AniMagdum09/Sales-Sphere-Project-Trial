@echo off
REM SalesSphere Desktop Dashboard (Electron)
REM Requires the analytics API running on port 8000 (scripts\start-analytics-api.bat).
cd /d "%~dp0..\desktop-app"
npx electron .
