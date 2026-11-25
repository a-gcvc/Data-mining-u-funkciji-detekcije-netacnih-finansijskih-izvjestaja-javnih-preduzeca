@echo off
rem Pokreće backend (i frontend preko static mount-a) na http://127.0.0.1:8000
cd /d "%~dp0backend"
uvicorn main:app --reload
