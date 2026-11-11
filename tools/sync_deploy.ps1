# Sync Obsidian to Hexo Blog
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BlogDir = Split-Path -Parent $ScriptDir
$PythonExe = "D:\Software\miniconda\envs\ai312\python.exe"
$SyncScript = Join-Path $ScriptDir "sync_obsidian_to_hexo.py"

Set-Location $BlogDir
& $PythonExe $SyncScript @args
