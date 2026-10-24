@echo off
chcp 65001 >nul
title HUB-042: Online
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0HUB-042-Admin.ps1" online
echo.
pause
