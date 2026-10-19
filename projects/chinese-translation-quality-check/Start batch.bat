@echo off
REM Evening launcher: choose the sections, check the cost, send the batch.
cd /d "%~dp0"
node batch\launch_batch.js
echo.
pause
