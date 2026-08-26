#include "sc_pad_keymap.h"

namespace sc_pad {
namespace {

constexpr uint16_t kTapHoldMs = 45;
constexpr uint16_t kLongHoldMs = 1500;

constexpr KeyBinding kBindings[static_cast<uint8_t>(Command::Count)] = {
    // Edit this table to match a custom Star Citizen keybind profile.
    {InputMode::Tap, {Key::N, Key::None, Key::None}, kTapHoldMs, "N"},
    {InputMode::Tap, {Key::Slash, Key::None, Key::None}, kTapHoldMs, "/"},
    {InputMode::Tap, {Key::M, Key::None, Key::None}, kTapHoldMs, "M"},
    {InputMode::Chord, {Key::LeftCtrl, Key::G, Key::None}, kTapHoldMs, "LEFT CTRL + G"},
    {InputMode::Tap, {Key::L, Key::None, Key::None}, kTapHoldMs, "L"},
    {InputMode::Hold, {Key::B, Key::None, Key::None}, kLongHoldMs, "B"},
    {InputMode::Tap, {Key::V, Key::None, Key::None}, kTapHoldMs, "V"},
    {InputMode::Tap, {Key::F2, Key::None, Key::None}, kTapHoldMs, "F2"},
    {InputMode::Tap, {Key::U, Key::None, Key::None}, kTapHoldMs, "U"},
    {InputMode::Tap, {Key::I, Key::None, Key::None}, kTapHoldMs, "I"},
    {InputMode::Chord, {Key::LeftAlt, Key::N, Key::None}, kTapHoldMs, "LEFT ALT + N"},
    {InputMode::Hold, {Key::Y, Key::None, Key::None}, kLongHoldMs, "Y"},
    // Shield controls deliberately use the numeric keypad, never the top row.
    {InputMode::Tap, {Key::Keypad7, Key::None, Key::None}, kTapHoldMs, "NUM 7"},
    {InputMode::Tap, {Key::Keypad8, Key::None, Key::None}, kTapHoldMs, "NUM 8"},
    {InputMode::Tap, {Key::Keypad4, Key::None, Key::None}, kTapHoldMs, "NUM 4"},
    {InputMode::Tap, {Key::Keypad5, Key::None, Key::None}, kTapHoldMs, "NUM 5"},
    {InputMode::Tap, {Key::Keypad6, Key::None, Key::None}, kTapHoldMs, "NUM 6"},
    {InputMode::Tap, {Key::Keypad2, Key::None, Key::None}, kTapHoldMs, "NUM 2"},
    {InputMode::Tap, {Key::Keypad9, Key::None, Key::None}, kTapHoldMs, "NUM 9"},
    {InputMode::Tap, {Key::F5, Key::None, Key::None}, kTapHoldMs, "F5"},
    {InputMode::Tap, {Key::F6, Key::None, Key::None}, kTapHoldMs, "F6"},
    {InputMode::Tap, {Key::F7, Key::None, Key::None}, kTapHoldMs, "F7"},
    {InputMode::Tap, {Key::F8, Key::None, Key::None}, kTapHoldMs, "F8"},
    // Mining controls use the main keyboard row, not the numeric keypad.
    {InputMode::Chord, {Key::LeftAlt, Key::Minus, Key::None}, kTapHoldMs, "LALT + -"},
    {InputMode::Chord, {Key::LeftAlt, Key::Equals, Key::None}, kTapHoldMs, "LALT + ="},
    {InputMode::Chord, {Key::LeftAlt, Key::TopRow1, Key::None}, kTapHoldMs, "LALT + 1"},
    {InputMode::Chord, {Key::LeftAlt, Key::TopRow2, Key::None}, kTapHoldMs, "LALT + 2"},
    {InputMode::Chord, {Key::LeftAlt, Key::TopRow3, Key::None}, kTapHoldMs, "LALT + 3"},
    {InputMode::Chord, {Key::LeftAlt, Key::TopRow0, Key::None}, kTapHoldMs, "LALT + 0"},
    {InputMode::Tap, {Key::M, Key::None, Key::None}, kTapHoldMs, "M"},
    // This command is handled by the firmware itself and never reaches HID.
    {InputMode::Tap, {Key::None, Key::None, Key::None}, 0, "LOCAL"},
};

constexpr KeyBinding kUnbound = {
    InputMode::Tap,
    {Key::None, Key::None, Key::None},
    0,
    "UNBOUND",
};

static_assert(
    sizeof(kBindings) / sizeof(kBindings[0]) == static_cast<uint8_t>(Command::Count),
    "Every panel command must have one key binding entry.");

} // namespace

const KeyBinding &key_binding_for(Command command)
{
    const uint8_t index = static_cast<uint8_t>(command);
    if (index >= static_cast<uint8_t>(Command::Count)) {
        return kUnbound;
    }
    return kBindings[index];
}

const char *input_mode_name(InputMode mode)
{
    switch (mode) {
        case InputMode::Tap:
            return "TAP";
        case InputMode::Hold:
            return "HOLD";
        case InputMode::Chord:
            return "CHORD";
    }
    return "TAP";
}

} // namespace sc_pad
