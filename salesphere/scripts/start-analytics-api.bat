@echo off
REM SalesSphere Analytics API (FastAPI) - http://127.0.0.1:8000  (docs at /docs)
REM Default database: salessphere_local (real synced data).
REM To demo with synthetic data instead, uncomment the SET line below.
cd /d "%~dp0..\analytics-api"
REM set SALESSPHERE_DB_URL=mysql+pymysql://root:root@127.0.0.1:3306/salessphere_demo
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
