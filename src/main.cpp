#include <Arduino.h>
#include <USB.h>
#include <USBHIDKeyboard.h>
#include <esp_system.h>

#include "io_extension.h"
#include "lvgl_port.h"
#include "sc_pad_keymap.h"
#include "sc_pad_ui.h"

namespace {

USBHIDKeyboard keyboard;

constexpr uint16_t kChordKeyIntervalMs = 25;
// Keep HID timing subtly organic without jeopardising a recognised key press.
// All variation is intentionally much smaller than the nominal hold time.
constexpr uint16_t kTapJitterMs = 12;
constexpr uint16_t kLongHoldJitterMs = 90;
constexpr uint16_t kChordIntervalJitterMs = 8;

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

uint16_t jittered_duration(uint16_t nominal_ms, uint16_t jitter_ms)
{
    if (jitter_ms == 0) {
        return nominal_ms;
    }

    const uint32_t range = static_cast<uint32_t>(jitter_ms) * 2 + 1;
    const int32_t offset = static_cast<int32_t>(esp_random() % range) - jitter_ms;
    return static_cast<uint16_t>(static_cast<int32_t>(nominal_ms) + offset);
}

uint16_t binding_hold_duration(const sc_pad::KeyBinding &binding)
{
    const uint16_t jitter = binding.mode == sc_pad::InputMode::Hold
                                ? kLongHoldJitterMs
                                : kTapJitterMs;
    return jittered_duration(binding.hold_ms, jitter);
}

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
        hid_dispatch.deadline_ms = millis() +
                                   jittered_duration(kChordKeyIntervalMs, kChordIntervalJitterMs);
    } else {
        hid_dispatch.state = HidDispatchState::Holding;
        hid_dispatch.deadline_ms = millis() + binding_hold_duration(binding);
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
                                       jittered_duration(kChordKeyIntervalMs, kChordIntervalJitterMs);
            return;
        }

        hid_dispatch.state = HidDispatchState::Holding;
        hid_dispatch.deadline_ms = millis() + binding_hold_duration(*hid_dispatch.binding);
        return;
    }

    finish_hid_dispatch();
}

void send_command(sc_pad::Command command, void *user_data)
{
    (void)user_data;
    start_hid_dispatch(sc_pad::key_binding_for(command));
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
    update_hid_dispatch();
}
