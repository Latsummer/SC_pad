# SC PAD desktop simulator

This target runs the same LVGL 8.4 interface used by the ESP32 firmware in a
native 1024 x 600 Windows window. It has no SDL or Docker dependency.

## Run

Open a terminal in the repository root and run:

```text
simulator\run.cmd
```

You can also double-click `run.cmd` in Explorer. A PowerShell version is
available as `run.ps1`.

Requirements:

- CMake
- A MinGW GCC/G++ toolchain available on `PATH`

The first run builds LVGL and the simulator. Later runs only rebuild changed
files. Use the mouse as the touchscreen. Each accepted action is printed in the
PowerShell window; no keyboard input is sent to Windows by the simulator.
