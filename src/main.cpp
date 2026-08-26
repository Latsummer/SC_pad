#include <Arduino.h>
#include <Preferences.h>
#include <USB.h>
#include <USBHIDKeyboard.h>
#include <esp_system.h>

#include "io_extension.h"
#include "lvgl_port.h"
#include "sc_pad_keymap.h"
#include "sc_pad_ui.h"

namespace {

USBHIDKeyboard keyboard;

constexpr char kSettingsNamespace[] = "sc-pad";
constexpr char kOrientationKey[] = "rot180";
bool orientation_180 = false;
bool orientation_restart_pending = false;

// Press modifiers first, then wait long enough for the host/game input stack
// to observe them before adding the chord's target key.
constexpr uint16_t kChordKeyIntervalMs = 100;

enum class HidDispatchState : uint8_t {
    Idle,
    PressingChord,
    Holding,
};

struct HidDispatch {
    const sc_pad::KeyBinding *binding = nullptr;
    uint8_t next_key = 0;
    uint32_t deadline_ms = 0;
    HidDispatchState state = HidDispatchState::Idle;
};

HidDispatch hid_dispatch;

uint8_t hid_key(sc_pad::Key key)
{
    if (key >= sc_pad::Key::A && key <= sc_pad::Key::Z) {
        return static_cast<uint8_t>('a' +
                                    (static_cast<uint8_t>(key) -
                                     static_cast<uint8_t>(sc_pad::Key::A)));
    }

    switch (key) {
        case sc_pad::Key::Slash:
            return '/';
        case sc_pad::Key::F2:
            return KEY_F2;
        case sc_pad::Key::F5:
            return KEY_F5;
        case sc_pad::Key::F6:
            return KEY_F6;
        case sc_pad::Key::F7:
            return KEY_F7;
        case sc_pad::Key::F8:
            return KEY_F8;
        case sc_pad::Key::TopRow0:
            return '0';
        case sc_pad::Key::TopRow1:
            return '1';
        case sc_pad::Key::TopRow2:
            return '2';
        case sc_pad::Key::TopRow3:
            return '3';
        case sc_pad::Key::Minus:
            return '-';
        case sc_pad::Key::Equals:
            return '=';
        case sc_pad::Key::Keypad2:
            return KEY_KP_2;
        case sc_pad::Key::Keypad4:
            return KEY_KP_4;
        case sc_pad::Key::Keypad5:
            return KEY_KP_5;
        case sc_pad::Key::Keypad6:
            return KEY_KP_6;
        case sc_pad::Key::Keypad7:
            return KEY_KP_7;
        case sc_pad::Key::Keypad8:
            return KEY_KP_8;
        case sc_pad::Key::Keypad9:
            return KEY_KP_9;
        case sc_pad::Key::LeftAlt:
            return KEY_LEFT_ALT;
        case sc_pad::Key::LeftCtrl:
            return KEY_LEFT_CTRL;
        default:
            return 0;
    }
}

void finish_hid_dispatch()
{
    keyboard.releaseAll();
    hid_dispatch = {};
}

void start_hid_dispatch(const sc_pad::KeyBinding &binding)
{
    // Buttons remain usable while a key is held. Starting a new command
    // safely releases the old one first, preventing stuck modifiers.
    if (hid_dispatch.state != HidDispatchState::Idle) {
        finish_hid_dispatch();
    }

    const uint8_t first_key = hid_key(binding.keys[0]);
    if (first_key == 0) {
        return;
    }

    keyboard.press(first_key);
    hid_dispatch.binding = &binding;
    hid_dispatch.next_key = 1;

    const bool has_more_keys = binding.keys[1] != sc_pad::Key::None;
    if (binding.mode == sc_pad::InputMode::Chord && has_more_keys) {
        hid_dispatch.state = HidDispatchState::PressingChord;
        hid_dispatch.deadline_ms = millis() + kChordKeyIntervalMs;
    } else {
        hid_dispatch.state = HidDispatchState::Holding;
        hid_dispatch.deadline_ms = millis() + binding.hold_ms;
    }
}

void update_hid_dispatch()
{
    if (hid_dispatch.state == HidDispatchState::Idle ||
        static_cast<int32_t>(millis() - hid_dispatch.deadline_ms) < 0) {
        return;
    }

    if (hid_dispatch.state == HidDispatchState::PressingChord) {
        const uint8_t key = hid_key(hid_dispatch.binding->keys[hid_dispatch.next_key]);
        if (key != 0) {
            keyboard.press(key);
        }
        ++hid_dispatch.next_key;

        if (hid_dispatch.next_key < sc_pad::kMaxChordKeys &&
            hid_dispatch.binding->keys[hid_dispatch.next_key] != sc_pad::Key::None) {
            hid_dispatch.deadline_ms = millis() +
                                       kChordKeyIntervalMs;
            return;
        }

        hid_dispatch.state = HidDispatchState::Holding;
        hid_dispatch.deadline_ms = millis() + hid_dispatch.binding->hold_ms;
        return;
    }

    finish_hid_dispatch();
}

void apply_touch_orientation(esp_lcd_touch_handle_t touch, bool rotate_180)
{
    // The RGB output is rotated while copying its frame buffer. Mirror both
    // GT911 axes so touch coordinates follow the visible orientation.
    ESP_ERROR_CHECK(esp_lcd_touch_set_mirror_x(touch, rotate_180));
    ESP_ERROR_CHECK(esp_lcd_touch_set_mirror_y(touch, rotate_180));
}

void persist_and_restart_orientation()
{
    Preferences settings;
    if (!settings.begin(kSettingsNamespace, false)) {
        return;
    }

    const size_t written = settings.putBool(kOrientationKey, !orientation_180);
    settings.end();
    if (written != sizeof(bool)) {
        return;
    }

    // The port owns display frame buffers, so a clean reboot is the safest
    // way to apply an orientation change while a frame may be in flight.
    delay(80);
    ESP.restart();
}

void send_command(sc_pad::Command command, void *user_data)
{
    (void)user_data;
    if (command == sc_pad::Command::ToggleOrientation) {
        orientation_restart_pending = true;
        return;
    }
    start_hid_dispatch(sc_pad::key_binding_for(command));
}

} // namespace

void setup()
{
    static esp_lcd_panel_handle_t panel_handle = nullptr;
    static esp_lcd_touch_handle_t touch_handle = nullptr;

    touch_handle = touch_gt911_init();

    Preferences settings;
    if (settings.begin(kSettingsNamespace, true)) {
        orientation_180 = settings.getBool(kOrientationKey, false);
        settings.end();
    }

    // GPIO19/20 are shared by USB and CAN. Select the native USB path.
    IO_EXTENSION_Output(IO_EXTENSION_IO_5, 0);

    keyboard.begin();
    USB.begin();

    panel_handle = waveshare_esp32_s3_rgb_lcd_init();
    lvgl_port_set_rotation_180(orientation_180);
    wavesahre_rgb_lcd_bl_on();
    ESP_ERROR_CHECK(lvgl_port_init(panel_handle, touch_handle));
    apply_touch_orientation(touch_handle, orientation_180);

    if (lvgl_port_lock(-1)) {
        sc_pad::set_orientation_180(orientation_180);
        sc_pad::create_ui(send_command);
        lvgl_port_unlock();
    }
}

void loop()
{
    update_hid_dispatch();
    if (orientation_restart_pending) {
        orientation_restart_pending = false;
        persist_and_restart_orientation();
    }
}
