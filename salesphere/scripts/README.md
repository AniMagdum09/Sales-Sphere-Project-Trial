# SalesSphere start scripts (Windows)
# 1) start-analytics-api.bat  - FastAPI analytics API on port 8000 (uses the demo DB if SALESSPHERE_DB_URL is set)
# 2) start-sync-agent.bat     - Spring Boot sync agent on port 8080 (creates/migrates salessphere_local automatically)
# 3) start-desktop-app.bat    - Electron desktop dashboard
#
# Optional: seed-demo-database.bat creates the salessphere_demo database with synthetic data.

Write-Host "See scripts\ for the individual start scripts." -ForegroundColor Yellow
