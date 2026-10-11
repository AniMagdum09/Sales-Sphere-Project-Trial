@echo off
REM One-time: create the salessphere_demo database with 15 months of synthetic
REM Indo-Sports-style billing data (3 branches, ~10k invoices) for demos.
cd /d "%~dp0..\analytics-api"
".venv\Scripts\python.exe" seed_demo.py
pause
