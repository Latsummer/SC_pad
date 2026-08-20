# SC Pad

A Star Citizen touch control panel based on the Waveshare ESP32-S3-Touch-LCD-7B.

## Current milestone

The first working version implements this complete path:

```text
GT911 touch -> LVGL button -> ESP32-S3 native USB HID -> Windows keyboard input
```

The screen shows a `Send A` button. Each click sends and releases the `A` key once over native USB.

## Build and upload

Connect the `USB TO UART` port, set the UART selector to `UART1`, and run:

```powershell
pio run
pio run --target upload
```

The checked-in configuration currently uses `COM8`; adjust `upload_port` and `monitor_port` in `platformio.ini` if Windows assigns a different port.

After uploading, connect the board's native `USB` port. Windows should enumerate it as a standard keyboard. Clicking `Send A` in a text editor should produce exactly one lowercase `a`.

GPIO19/20 are shared between USB and CAN on this board. This firmware selects USB, so the onboard CAN interface cannot be used at the same time.
