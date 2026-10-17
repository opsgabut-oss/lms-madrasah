@echo off
title LMS Oemah Sinau Server
cd /d "%~dp0"
echo ====================================================
echo  Menjalankan LMS Oemah Sinau Platform...
echo  Akses di Browser: http://localhost:3000
echo ====================================================
node server.js
pause
