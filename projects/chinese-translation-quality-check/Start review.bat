@echo off
REM Morning launcher: collect the batches, check every finding, grade, then open the review page.
cd /d "%~dp0"
echo Collecting finished sections...
node batch\collect.mjs
echo.
echo The review page opens in your browser. Keep this window open while you review; close it when you stop.
node review_server.js --open
