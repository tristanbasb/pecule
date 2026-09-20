@echo off
cd /d "%~dp0"
title Pecule
if not exist node_modules (
  echo Installation des dependances, une seule fois...
  call npm install
)
echo.
echo Pecule demarre sur http://localhost:5180
echo Fermer cette fenetre pour arreter l'application.
echo.
call npm start
pause
