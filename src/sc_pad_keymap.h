#pragma once

#include <stdint.h>

#include "sc_pad_ui.h"

namespace sc_pad {

// The three physical keyboard behaviours supported by the panel. A chord
// presses its keys in listed order, keeps them down together briefly, then
// releases all of them together.
enum class InputMode : uint8_t {
    Tap,
    Hold,
    Chord,
};

// Hardware-independent key names keep the UI/simulator separate from the
// Arduino USB HID constants. Add future keys here, then translate them in
// main.cpp.
enum class Key : uint8_t {
    None,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I,
    J,
    K,
    L,
    M,
    N,
    O,
    P,
    Q,
    R,
    S,
    T,
    U,
    V,
    W,
    X,
    Y,
    Z,
    Slash,
    F2,
    F5,
    F6,
    F7,
    F8,
    Keypad2,
    Keypad4,
    Keypad5,
    Keypad6,
    Keypad7,
    Keypad8,
    Keypad9,
    LeftAlt,
};

constexpr uint8_t kMaxChordKeys = 3;

struct KeyBinding {
    InputMode mode;
    Key keys[kMaxChordKeys];
    uint16_t hold_ms;
    const char *display_name;
};

// All game-facing bindings live in one table in sc_pad_keymap.cpp. An empty
// binding is intentionally silent; it means the action has no reliable game
// default and should be assigned in Star Citizen before use.
const KeyBinding &key_binding_for(Command command);
const char *input_mode_name(InputMode mode);

} // namespace sc_pad
