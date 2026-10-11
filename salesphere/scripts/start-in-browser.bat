@echo off
REM ============================================================
REM  SalesSphere in your BROWSER (no Electron needed)
REM  Starts: 1) analytics API on port 8000  2) web dashboard on
REM  port 4173, then opens http://127.0.0.1:4173 in your browser.
REM
REM  Uses the REAL database (salessphere_local) - a fresh start.
REM  First step: open the Import Data page and bring in your
REM  client's Excel/CSV files (SR, PR and Stock Report all work).
REM
REM  (The synthetic demo database is still available for testing:
REM   uncomment the salessphere_demo line below instead.)
REM ============================================================

REM set SALESSPHERE_DB_URL=mysql+pymysql://root:root@127.0.0.1:3306/salessphere_demo

start "SalesSphere Analytics API" cmd /k "cd /d "%~dp0..\analytics-api" && ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

start "SalesSphere Web Dashboard" cmd /k "cd /d "%~dp0..\desktop-app" && npx vite preview --port 4173 --host 127.0.0.1"

timeout /t 5 /nobreak >nul
start http://127.0.0.1:4173

echo.
echo  Dashboard:  http://127.0.0.1:4173   (opened in your browser)
echo  API docs :  http://127.0.0.1:8000/docs
echo  AI chat  :  needs Ollama running (start the Ollama app); without it
echo              the chatbot still answers using built-in rules.
echo.
echo  Close the two black windows to stop.
pause
