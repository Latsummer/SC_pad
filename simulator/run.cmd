@echo off
setlocal

for %%I in ("%~dp0.") do set "SC_PAD_SIM_DIR=%%~fI"
set "SC_PAD_BUILD_DIR=%SC_PAD_SIM_DIR%\build"

cmake -S "%SC_PAD_SIM_DIR%" -B "%SC_PAD_BUILD_DIR%" -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b 1

cmake --build "%SC_PAD_BUILD_DIR%" --parallel
if errorlevel 1 exit /b 1

"%SC_PAD_BUILD_DIR%\sc_pad_simulator.exe"
