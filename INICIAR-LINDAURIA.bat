@echo off
chcp 65001 >nul
title LindaurIA - servidor
echo.
echo  ==============================================
echo   LindaurIA - ligando o app...
echo  ==============================================
echo.
echo  No celular (mesmo Wi-Fi), abra:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo     https://%%b:5173
)
echo.
echo  Se aparecer "conexao nao e particular": Avancado - Continuar.
echo  DEIXE ESTA JANELA ABERTA enquanto usar o app.
echo.
cd /d "%~dp0apps\patient"
call npm run dev:https
pause
