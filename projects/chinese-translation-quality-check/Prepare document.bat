@echo off
REM Prepare the document: glossary stage on the translator's Word file, then the paired document the specialists read.
cd /d "%~dp0"
node glossary_stage.js && node build_document.js && node benchmark\test_tools.mjs
echo.
pause
