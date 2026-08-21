#pragma once

#include <stdint.h>

namespace sc_pad {

enum class Command : uint8_t {
    Gear = 0,
    Doors,
    MiningMode,
    Vtol,
    Lights,
    Quantum,
    Scan,
    Map,
    Power,
    Engines,
    RequestAtc,
    ExitSeat,
    ShieldUp,
    ShieldFront,
    ShieldLeft,
    ResetShields,
    ShieldRight,
    ShieldRear,
    ShieldDown,
    PowerWeapons,
    PowerEngines,
    PowerShields,
    ResetPower,
    Count,
};

using CommandCallback = void (*)(Command command, void *user_data);

// Builds the complete 1024 x 600 interface on LVGL's active screen.
void create_ui(CommandCallback callback, void *user_data = nullptr);

} // namespace sc_pad
