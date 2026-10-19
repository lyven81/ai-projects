@echo off
REM Open the review page without collecting (all sections are collected). Keep this window open while you review.
cd /d "%~dp0"
echo The review page opens in your browser. Keep this window open while you review; close it when you stop.
node review_server.js --open
