#pragma once

#include <stdint.h>

namespace sc_pad {

enum class Command : uint8_t {
    Gear = 0,
    Doors,
    MiningMode,
    MissileMode,
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
    LaserPowerDecrease,
    LaserPowerIncrease,
    MiningModule1,
    MiningModule2,
    MiningModule3,
    CollectMode,
    ExitMining,
    ToggleOrientation,
    Count,
};

using CommandCallback = void (*)(Command command, void *user_data);

// Builds the complete 1024 x 600 interface on LVGL's active screen.
void create_ui(CommandCallback callback, void *user_data = nullptr);

// The firmware sets this before building the UI so the SYSTEM page can show
// the orientation that was restored from non-volatile storage.
void set_orientation_180(bool enabled);

} // namespace sc_pad
