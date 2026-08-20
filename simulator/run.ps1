$ErrorActionPreference = "Stop"

$buildDirectory = Join-Path $PSScriptRoot "build"

cmake -S $PSScriptRoot -B $buildDirectory -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build $buildDirectory --parallel

& (Join-Path $buildDirectory "sc_pad_simulator.exe")
