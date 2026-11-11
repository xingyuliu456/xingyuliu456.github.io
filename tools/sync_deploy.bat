@echo off
chcp 65001 > nul
title Sync Obsidian to Hexo Blog
echo [INFO] Starting Obsidian to Hexo Synchronization...
cd /d "%~dp0\.."
"D:\Software\miniconda\envs\ai312\python.exe" "tools\sync_obsidian_to_hexo.py" %*
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Sync completed successfully!
) else (
    echo [ERROR] Sync failed with error code %ERRORLEVEL%.
)
if "%1"=="" (
    timeout /t 3 > nul
)
