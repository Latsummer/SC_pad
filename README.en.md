# SC Pad

A Star Citizen touch control panel based on the Waveshare ESP32-S3-Touch-LCD-7B.

## Current milestone

The first working version implements this complete path:

```text
GT911 touch -> LVGL button -> ESP32-S3 native USB HID -> Windows keyboard input
```

The current dark console UI includes a header, a 4×3 flight-action grid, and five bottom navigation items. Every action button is currently a safe test control that sends and releases the `A` key once over native USB.

The UI demonstrates three interaction models: momentary buttons only show press feedback, toggle buttons remain amber while active, and the landing-gear button flashes for about two seconds before changing its local state. These states are local to the panel and do not represent confirmed in-game state.

## Build and upload

Connect the `USB TO UART` port, set the UART selector to `UART1`, and run:

```powershell
pio run
pio run --target upload
```

The checked-in configuration currently uses `COM8`; adjust `upload_port` and `monitor_port` in `platformio.ini` if Windows assigns a different port.

After uploading, connect the board's native `USB` port. Windows should enumerate it as a standard keyboard. Clicking any action button in a text editor should produce exactly one lowercase `a`. The bottom navigation is visual-only in this milestone.

GPIO19/20 are shared between USB and CAN on this board. This firmware selects USB, so the onboard CAN interface cannot be used at the same time.
