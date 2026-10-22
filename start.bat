@echo off
rem Starts The Bard's Tongue at http://localhost:8765 and opens it in Chrome.
rem Keep this window open while you practice. Close it when you're done.
rem (Chrome only allows the speech check and remembers the mic on an http address.)

cd /d "%~dp0"
start "" chrome "http://localhost:8765"
python -m http.server 8765 --bind 127.0.0.1
