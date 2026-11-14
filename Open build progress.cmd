@echo off
rem The build progress page, fresh every time it loads. No AI is involved, so it
rem costs nothing. Leave this window open while you watch; close it to stop.
cd /d "%~dp0"
start "" http://127.0.0.1:3230
node scripts\progress-server.mjs
pause
