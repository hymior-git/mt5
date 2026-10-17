@echo off
title MT5 Local Demo Trading Simulator
echo ========================================================
echo MetaTrader 5 - Local Demo Trading Simulator
echo ========================================================
echo Dang khoi dong may chu tai http://localhost:8080/
start http://localhost:8080/
powershell -ExecutionPolicy Bypass -File .\serve.ps1
pause
