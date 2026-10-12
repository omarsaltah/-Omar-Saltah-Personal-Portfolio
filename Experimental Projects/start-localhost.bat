@echo off
cd /d "%~dp0"
start http://localhost:8000/Light-and-Shadow.html
python -m http.server 8000
