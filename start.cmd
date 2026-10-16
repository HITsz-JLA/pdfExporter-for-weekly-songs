@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not "%NODE_EXE%"=="node" if not exist "%NODE_EXE%" (
  echo Please install Node.js 20 or later, then restart this window.
  pause
  exit /b 1
)
if not exist node_modules\express\package.json (
  echo Installing dependencies...
  where npm >nul 2>nul
  if errorlevel 1 (
    echo npm not found. Run install with npm or pnpm first. See README.md.
    pause
    exit /b 1
  )
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:3210 in your browser. Keep this window open.
"%NODE_EXE%" src\server.js
pause
