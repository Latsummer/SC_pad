#include <Arduino.h>
#include <USB.h>
#include <USBHIDKeyboard.h>

#include "io_extension.h"
#include "lvgl_port.h"
#include "sc_pad_ui.h"

namespace {

USBHIDKeyboard keyboard;

void send_command(sc_pad::Command command, void *user_data)
{
    (void)command;
    (void)user_data;

    // Every action deliberately remains mapped to the safe test key for now.
    keyboard.press('a');
    delay(30);
    keyboard.releaseAll();
}

} // namespace

void setup()
{
    static esp_lcd_panel_handle_t panel_handle = nullptr;
    static esp_lcd_touch_handle_t touch_handle = nullptr;

    touch_handle = touch_gt911_init();

    // GPIO19/20 are shared by USB and CAN. Select the native USB path.
    IO_EXTENSION_Output(IO_EXTENSION_IO_5, 0);

    keyboard.begin();
    USB.begin();

    panel_handle = waveshare_esp32_s3_rgb_lcd_init();
    wavesahre_rgb_lcd_bl_on();
    ESP_ERROR_CHECK(lvgl_port_init(panel_handle, touch_handle));

    if (lvgl_port_lock(-1)) {
        sc_pad::create_ui(send_command);
        lvgl_port_unlock();
    }
}

void loop()
{
}
