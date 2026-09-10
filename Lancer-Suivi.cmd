@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 ou plus recent est requis. Installez-le puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist "node_modules\express\package.json" (
  echo Installation des dependances...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
if not exist "dist\index.html" (
  echo Construction de l'application...
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)
echo.
echo Ouvrez http://localhost:3001 dans votre navigateur.
echo Gardez cette fenetre ouverte. Ctrl+C pour arreter le serveur.
echo.
call npm.cmd start
