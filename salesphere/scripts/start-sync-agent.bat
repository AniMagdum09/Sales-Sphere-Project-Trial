@echo off
REM SalesSphere Sync Agent (Spring Boot) - http://127.0.0.1:8080
REM Creates + migrates the salessphere_local MySQL database on first boot (Flyway).
REM Source SQL Server credentials live in sync-agent\src\main\resources\application.yml
REM and can be changed at runtime via PUT /api/config/source (masked in responses).
cd /d "%~dp0..\sync-agent\target"
java -jar salesphere-sync-agent-1.0.0.jar
pause
