@echo off
chcp 65001 > nul
echo [INFO] Installing Git Hook into Obsidian Vault...
set VAULT_HOOKS=D:\My-Knowledge-Vault\.git\hooks
if not exist "%VAULT_HOOKS%" (
    echo [ERROR] Git hooks directory not found: %VAULT_HOOKS%
    pause
    exit /b 1
)

(
echo #!/bin/sh
echo echo "[Obsidian Git Hook] Triggering Hexo Sync & Deploy..."
echo "D:/Software/miniconda/envs/ai312/python.exe" "D:/Study_docs/Blog/tools/sync_obsidian_to_hexo.py"
) > "%VAULT_HOOKS%\pre-push"

echo [SUCCESS] pre-push hook installed successfully to %VAULT_HOOKS%\pre-push!
echo Whenever your Obsidian vault pushes to Gitee, it will automatically sync and deploy published notes to GitHub Pages!
pause
