#include "sc_pad_ui.h"

#include <initializer_list>

#include "lvgl.h"
#include "sc_pad_theme.h"

LV_FONT_DECLARE(sc_pad_font_source_han_22)
LV_FONT_DECLARE(sc_pad_font_jetbrains_mono_12)
LV_FONT_DECLARE(sc_pad_font_jetbrains_mono_16)
LV_FONT_DECLARE(sc_pad_font_jetbrains_mono_20)

namespace sc_pad {
namespace {

using namespace theme;

constexpr int kScreenWidth = 1024;
constexpr int kHeaderHeight = 64;
// The navigation occupies the full lower chin. Its controls are centered in
// this area, while the divider sits slightly below the action grid.
constexpr int kNavTop = 508;
constexpr int kNavHeight = 92;
constexpr int kActionCount = 12;

enum class ButtonBehavior {
    // A panel-local state changes immediately after the command is sent.
    LocalToggle,
    // Sends one command and returns to its idle presentation.
    Momentary,
    // Runs a visible process, then changes the panel-local state.
    ProcessAndToggle,
    // Runs a visible process but has no final local state (for example, ATC).
    Request,
};

enum class ProcessEffect {
    Pulse,
    Steady,
};

enum class PanelPage : uint8_t {
    Flight,
    Ship,
    Mining,
    Camera,
    System,
};

struct ProcessSpec {
    uint16_t duration_ms;
    uint16_t update_interval_ms;
    ProcessEffect effect;
};

struct ActionSpec {
    Command command;
    const char *number;
    const char *inactive_label;
    const char *active_label;
    ButtonBehavior behavior;
    const ProcessSpec *process = nullptr;
    bool visible = true;
    bool initially_active = false;
};

// The visual layers are entirely inside a button's original bounds. They are
// shared by every full-size control page so the physical treatment stays
// consistent without moving labels or altering hit targets.
struct PhysicalButtonLayers {
    lv_obj_t *face = nullptr;
    lv_obj_t *leading_bevel = nullptr;
    lv_obj_t *trailing_bevel = nullptr;
    lv_obj_t *state_ring = nullptr;
};

struct ActionRuntime {
    const ActionSpec *spec = nullptr;
    lv_obj_t *button = nullptr;
    lv_obj_t *label = nullptr;
    PhysicalButtonLayers layers;
    lv_timer_t *timer = nullptr;
};

// This model outlives LVGL objects. Rebuilding the view for a new theme must
// never change the panel's local command state or discard an active process.
struct ActionState {
    bool active = false;
    bool processing = false;
    uint16_t process_elapsed_ms = 0;
    bool initialized = false;
};

struct NavigationRuntime {
    PanelPage page = PanelPage::Flight;
    bool available = false;
    lv_obj_t *button = nullptr;
};

struct ThemeSelectionRuntime {
    uint8_t index = 0;
};

enum class MiningControl : uint8_t {
    LaserDecrease,
    LaserIncrease,
    Module1,
    Module2,
    Module3,
    CollectMode,
    ExitMining,
};

struct MiningState {
    bool modules[3] = {};
    bool collect_mode = false;
};

struct MiningControlRuntime {
    MiningControl control = MiningControl::LaserDecrease;
    Command command = Command::LaserPowerDecrease;
    lv_obj_t *button = nullptr;
    lv_obj_t *label = nullptr;
    PhysicalButtonLayers layers;
};

struct ShipControlRuntime {
    Command command = Command::ShieldUp;
    lv_obj_t *button = nullptr;
    PhysicalButtonLayers layers;
};

struct PageTransition {
    bool active = false;
    PanelPage target = PanelPage::Flight;
    uint16_t elapsed_ms = 0;
    lv_obj_t *source_button = nullptr;
    lv_timer_t *timer = nullptr;
};

// A long, low-frequency pulse reads as a mechanical operation rather than a
// tap acknowledgement. Future actions can select their own process profile.
constexpr ProcessSpec kGearProcess = {4000, 400, ProcessEffect::Pulse};
constexpr ProcessSpec kDoorsProcess = {2600, 350, ProcessEffect::Pulse};
constexpr ProcessSpec kAtcRequestProcess = {2200, 300, ProcessEffect::Pulse};
// Leaving the seat is acknowledged as a short request, then returns to idle.
constexpr ProcessSpec kExitSeatProcess = {2000, 400, ProcessEffect::Pulse};
constexpr ProcessSpec kReqACTProcess = {6000, 500, ProcessEffect::Pulse};

const ActionSpec kActions[kActionCount] = {
    // The landing gear starts engaged: a ship leaving the hangar always has
    // its gear down, so the button reads "Gear Down" and appears pressed.
    {Command::Gear, "01", "Gear UP", "Gear Down", ButtonBehavior::ProcessAndToggle, &kGearProcess, true, true},
    {Command::Doors, "02", "ALL Doors CLOSE", "ALL Doors OPEN", ButtonBehavior::ProcessAndToggle, &kDoorsProcess},
    {Command::MiningMode, "03", "Miner MODE", nullptr, ButtonBehavior::Momentary},
    {Command::MissileMode, "04", "Missile MODE", "Missile ON", ButtonBehavior::LocalToggle},
    {Command::Lights, "05", "Light OFF", "Light ON", ButtonBehavior::LocalToggle},
    {Command::Quantum, "06", "Quantum OFF", "Quantum ON", ButtonBehavior::LocalToggle},
    {Command::Scan, "07", "Scan MODE", "Scan ON", ButtonBehavior::LocalToggle},
    {Command::Map, "08", "MAP", nullptr, ButtonBehavior::Momentary},
    {Command::Power, "09", "Power OFF", "Power ON", ButtonBehavior::LocalToggle},
    {Command::Engines, "10", "Engine OFF", "Engine ON", ButtonBehavior::LocalToggle},
    {Command::RequestAtc, "11", "Request ATC", nullptr, ButtonBehavior::Request, &kReqACTProcess},
    {Command::ExitSeat, "12", "离席", nullptr, ButtonBehavior::Request, &kExitSeatProcess},
};

const char *kNavLabels[] = {"FLIGHT", "SHIP", "MINING", "CAMERA", "SYSTEM"};

CommandCallback command_callback = nullptr;
void *command_user_data = nullptr;
ActionRuntime action_runtime[kActionCount];
ActionState action_state[kActionCount];
NavigationRuntime navigation_runtime[5];
ThemeSelectionRuntime theme_selection_runtime[kThemeCount];
MiningState mining_state;
MiningControlRuntime mining_controls[7];
ShipControlRuntime ship_controls[11];
PageTransition page_transition;

ActionState &state_for(ActionRuntime &runtime)
{
    return action_state[&runtime - action_runtime];
}

lv_style_t style_action;
lv_style_t style_action_pressed;
lv_style_t style_action_active;
lv_style_t style_action_transition;
lv_style_t style_flight_action;
lv_style_t style_flight_action_pressed;
lv_style_t style_flight_action_active;
lv_style_t style_flight_action_transition;
lv_style_t style_flight_face;
lv_style_t style_flight_face_pressed;
lv_style_t style_flight_face_active;
lv_style_t style_flight_face_active_pressed;
lv_style_t style_flight_face_transition;
lv_style_t style_flight_bevel_leading;
lv_style_t style_flight_bevel_leading_pressed;
lv_style_t style_flight_bevel_leading_active;
lv_style_t style_flight_bevel_leading_active_pressed;
lv_style_t style_flight_bevel_leading_transition;
lv_style_t style_flight_bevel_trailing;
lv_style_t style_flight_bevel_trailing_pressed;
lv_style_t style_flight_bevel_trailing_active;
lv_style_t style_flight_bevel_trailing_active_pressed;
lv_style_t style_flight_bevel_trailing_transition;
lv_style_t style_flight_state_ring;
lv_style_t style_flight_state_ring_pressed;
lv_style_t style_flight_state_ring_active;
lv_style_t style_flight_state_ring_active_pressed;
lv_style_t style_flight_state_ring_transition;
lv_style_t style_nav;
lv_style_t style_nav_active;

// Attach ON permits HID output; Attach OFF keeps the on-screen model editable
// without sending commands to the host.
bool attach_mode = true;
#if SC_PAD_ENABLE_DYNAMIC_ROTATION
bool orientation_180 = false;
#endif
int current_theme = 0;
PanelPage current_page = PanelPage::Flight;
bool styles_initialized = false;
lv_obj_t *page_title = nullptr;
lv_obj_t *attach_mode_button = nullptr;
lv_obj_t *attach_mode_label = nullptr;

const Theme &theme()
{
    return kThemes[current_theme];
}

void init_styles()
{
    const Theme &palette = theme();

    if (styles_initialized) {
        lv_style_reset(&style_action);
        lv_style_reset(&style_action_pressed);
        lv_style_reset(&style_action_active);
        lv_style_reset(&style_action_transition);
        lv_style_reset(&style_flight_action);
        lv_style_reset(&style_flight_action_pressed);
        lv_style_reset(&style_flight_action_active);
        lv_style_reset(&style_flight_action_transition);
        lv_style_reset(&style_flight_face);
        lv_style_reset(&style_flight_face_pressed);
        lv_style_reset(&style_flight_face_active);
        lv_style_reset(&style_flight_face_active_pressed);
        lv_style_reset(&style_flight_face_transition);
        lv_style_reset(&style_flight_bevel_leading);
        lv_style_reset(&style_flight_bevel_leading_pressed);
        lv_style_reset(&style_flight_bevel_leading_active);
        lv_style_reset(&style_flight_bevel_leading_active_pressed);
        lv_style_reset(&style_flight_bevel_leading_transition);
        lv_style_reset(&style_flight_bevel_trailing);
        lv_style_reset(&style_flight_bevel_trailing_pressed);
        lv_style_reset(&style_flight_bevel_trailing_active);
        lv_style_reset(&style_flight_bevel_trailing_active_pressed);
        lv_style_reset(&style_flight_bevel_trailing_transition);
        lv_style_reset(&style_flight_state_ring);
        lv_style_reset(&style_flight_state_ring_pressed);
        lv_style_reset(&style_flight_state_ring_active);
        lv_style_reset(&style_flight_state_ring_active_pressed);
        lv_style_reset(&style_flight_state_ring_transition);
        lv_style_reset(&style_nav);
        lv_style_reset(&style_nav_active);
    }

    lv_style_init(&style_action);
    lv_style_set_radius(&style_action, palette.action_radius);
    lv_style_set_bg_opa(&style_action, LV_OPA_COVER);
    lv_style_set_bg_color(&style_action, color(palette.surface));
    lv_style_set_border_width(&style_action, palette.action_border_width);
    lv_style_set_border_color(&style_action, color(palette.border));
    // The panel uses solid surfaces and borders only: shadows look like a
    // transient full-screen blur on lower-refresh touch displays.
    lv_style_set_shadow_width(&style_action, 0);
    lv_style_set_pad_all(&style_action, 0);

    // Avoid transform/zoom effects here. They can leave invalid regions on this
    // RGB display configuration. Color and border feedback are deterministic.
    lv_style_init(&style_action_pressed);
    lv_style_set_bg_color(&style_action_pressed, color(palette.surface_pressed));
    lv_style_set_border_color(&style_action_pressed, color(palette.border));
    lv_style_set_border_width(&style_action_pressed, palette.action_border_width);
    lv_style_set_shadow_width(&style_action_pressed, 0);

    // This is a panel-local state, never a claim about the in-game state.
    lv_style_init(&style_action_active);
    lv_style_set_bg_color(&style_action_active, color(palette.local_state_surface));
    lv_style_set_border_color(&style_action_active, color(palette.border));
    lv_style_set_border_width(&style_action_active, palette.action_border_width);
    lv_style_set_shadow_width(&style_action_active, 0);

    // Applied and removed by a timer to create the transition flash.
    lv_style_init(&style_action_transition);
    lv_style_set_bg_color(&style_action_transition, color(palette.progress_border));
    lv_style_set_bg_opa(&style_action_transition, LV_OPA_COVER);
    lv_style_set_border_color(&style_action_transition, color(palette.border));
    lv_style_set_border_opa(&style_action_transition, LV_OPA_COVER);
    lv_style_set_border_width(&style_action_transition, palette.action_border_width);
    lv_style_set_shadow_width(&style_action_transition, 0);

    // Flight established the panel's restrained physical language. Every
    // full-size control now shares this fixed 4 px recess around a themed
    // inner face, with no shadow, blur, transform, or layout change. A
    // transparent state ring completes all four edges without changing the
    // button's hit area.
    constexpr int kFlightStateRingWidth = 3;
    const lv_color_t flight_fill_default = color(palette.surface);
    const lv_color_t flight_fill_pressed = lv_color_darken(flight_fill_default, LV_OPA_20);
    const lv_color_t flight_fill_active = color(palette.local_state_surface);
    const lv_color_t flight_fill_active_pressed = lv_color_darken(flight_fill_active, LV_OPA_20);
    const lv_color_t flight_fill_transition = color(palette.progress_border);
    const auto reflected_edge = [](lv_color_t fill) {
        return lv_color_lighten(fill, LV_OPA_30);
    };
    const auto shaded_edge = [](lv_color_t fill) {
        return lv_color_darken(fill, LV_OPA_60);
    };
    const auto surrounding_reflection = [](lv_color_t fill) {
        return lv_color_darken(fill, LV_OPA_70);
    };
    lv_style_init(&style_flight_action);
    lv_style_set_radius(&style_flight_action, palette.action_radius);
    lv_style_set_bg_opa(&style_flight_action, LV_OPA_COVER);
    lv_style_set_bg_color(&style_flight_action, shaded_edge(flight_fill_default));
    lv_style_set_border_width(&style_flight_action, palette.action_border_width);
    lv_style_set_border_color(&style_flight_action, surrounding_reflection(flight_fill_default));
    lv_style_set_shadow_width(&style_flight_action, 0);
    lv_style_set_pad_all(&style_flight_action, 0);

    lv_style_init(&style_flight_action_pressed);
    lv_style_set_bg_color(&style_flight_action_pressed, shaded_edge(flight_fill_pressed));
    lv_style_set_border_width(&style_flight_action_pressed, palette.action_border_width);
    lv_style_set_border_color(&style_flight_action_pressed, surrounding_reflection(flight_fill_pressed));
    lv_style_set_shadow_width(&style_flight_action_pressed, 0);

    lv_style_init(&style_flight_action_active);
    lv_style_set_bg_color(&style_flight_action_active, shaded_edge(flight_fill_active));
    lv_style_set_border_width(&style_flight_action_active, palette.action_border_width);
    lv_style_set_border_color(&style_flight_action_active, surrounding_reflection(flight_fill_active));
    lv_style_set_shadow_width(&style_flight_action_active, 0);

    lv_style_init(&style_flight_action_transition);
    lv_style_set_bg_color(&style_flight_action_transition, shaded_edge(flight_fill_transition));
    lv_style_set_border_width(&style_flight_action_transition, palette.action_border_width);
    lv_style_set_border_color(&style_flight_action_transition, surrounding_reflection(flight_fill_transition));
    lv_style_set_shadow_width(&style_flight_action_transition, 0);

    lv_style_init(&style_flight_face);
    lv_style_set_radius(&style_flight_face, LV_MAX(0, palette.action_radius - 4));
    lv_style_set_bg_opa(&style_flight_face, LV_OPA_COVER);
    lv_style_set_bg_color(&style_flight_face, flight_fill_default);
    // The one-pixel inner seam is theme-derived but deliberately subdued. It
    // reads as a fine assembly line rather than a second accent-colored frame.
    lv_style_set_border_width(&style_flight_face, 1);
    lv_style_set_border_color(&style_flight_face, reflected_edge(flight_fill_default));
    lv_style_set_border_opa(&style_flight_face, LV_OPA_COVER);
    lv_style_set_shadow_width(&style_flight_face, 0);

    lv_style_init(&style_flight_face_pressed);
    lv_style_set_bg_color(&style_flight_face_pressed, flight_fill_pressed);
    lv_style_set_border_color(&style_flight_face_pressed, reflected_edge(flight_fill_pressed));
    lv_style_set_border_opa(&style_flight_face_pressed, LV_OPA_COVER);

    lv_style_init(&style_flight_face_active);
    lv_style_set_bg_color(&style_flight_face_active, flight_fill_active);
    lv_style_set_border_color(&style_flight_face_active, reflected_edge(flight_fill_active));
    lv_style_set_border_opa(&style_flight_face_active, LV_OPA_COVER);

    lv_style_init(&style_flight_face_active_pressed);
    lv_style_set_bg_color(&style_flight_face_active_pressed, flight_fill_active_pressed);
    lv_style_set_border_color(&style_flight_face_active_pressed, reflected_edge(flight_fill_active_pressed));
    lv_style_set_border_opa(&style_flight_face_active_pressed, LV_OPA_COVER);

    lv_style_init(&style_flight_face_transition);
    lv_style_set_bg_color(&style_flight_face_transition, flight_fill_transition);
    lv_style_set_border_color(&style_flight_face_transition, reflected_edge(flight_fill_transition));
    lv_style_set_border_opa(&style_flight_face_transition, LV_OPA_COVER);

    lv_style_init(&style_flight_bevel_leading);
    lv_style_set_bg_opa(&style_flight_bevel_leading, LV_OPA_TRANSP);
    lv_style_set_border_side(&style_flight_bevel_leading, LV_BORDER_SIDE_TOP | LV_BORDER_SIDE_LEFT);
    lv_style_set_border_width(&style_flight_bevel_leading, 3);
    lv_style_set_border_color(&style_flight_bevel_leading, reflected_edge(flight_fill_default));
    lv_style_set_shadow_width(&style_flight_bevel_leading, 0);

    lv_style_init(&style_flight_bevel_leading_pressed);
    lv_style_set_border_color(&style_flight_bevel_leading_pressed, reflected_edge(flight_fill_pressed));

    lv_style_init(&style_flight_bevel_leading_active);
    lv_style_set_border_color(&style_flight_bevel_leading_active, reflected_edge(flight_fill_active));

    lv_style_init(&style_flight_bevel_leading_active_pressed);
    lv_style_set_border_color(&style_flight_bevel_leading_active_pressed, reflected_edge(flight_fill_active_pressed));

    lv_style_init(&style_flight_bevel_leading_transition);
    lv_style_set_border_color(&style_flight_bevel_leading_transition, reflected_edge(flight_fill_transition));

    lv_style_init(&style_flight_bevel_trailing);
    lv_style_set_bg_opa(&style_flight_bevel_trailing, LV_OPA_TRANSP);
    lv_style_set_border_side(&style_flight_bevel_trailing, LV_BORDER_SIDE_BOTTOM | LV_BORDER_SIDE_RIGHT);
    lv_style_set_border_width(&style_flight_bevel_trailing, 3);
    lv_style_set_border_color(&style_flight_bevel_trailing, shaded_edge(flight_fill_default));
    lv_style_set_shadow_width(&style_flight_bevel_trailing, 0);

    lv_style_init(&style_flight_bevel_trailing_pressed);
    lv_style_set_border_color(&style_flight_bevel_trailing_pressed, shaded_edge(flight_fill_pressed));

    lv_style_init(&style_flight_bevel_trailing_active);
    lv_style_set_border_color(&style_flight_bevel_trailing_active, shaded_edge(flight_fill_active));

    lv_style_init(&style_flight_bevel_trailing_active_pressed);
    lv_style_set_border_color(&style_flight_bevel_trailing_active_pressed, shaded_edge(flight_fill_active_pressed));

    lv_style_init(&style_flight_bevel_trailing_transition);
    lv_style_set_border_color(&style_flight_bevel_trailing_transition, shaded_edge(flight_fill_transition));

    lv_style_init(&style_flight_state_ring);
    lv_style_set_radius(&style_flight_state_ring, palette.action_radius);
    lv_style_set_bg_opa(&style_flight_state_ring, LV_OPA_TRANSP);
    lv_style_set_border_side(&style_flight_state_ring, LV_BORDER_SIDE_FULL);
    lv_style_set_border_width(&style_flight_state_ring, kFlightStateRingWidth);
    lv_style_set_border_color(&style_flight_state_ring, surrounding_reflection(flight_fill_default));
    lv_style_set_shadow_width(&style_flight_state_ring, 0);

    lv_style_init(&style_flight_state_ring_pressed);
    lv_style_set_border_color(&style_flight_state_ring_pressed, surrounding_reflection(flight_fill_pressed));

    lv_style_init(&style_flight_state_ring_active);
    lv_style_set_border_color(&style_flight_state_ring_active, surrounding_reflection(flight_fill_active));

    lv_style_init(&style_flight_state_ring_active_pressed);
    lv_style_set_border_color(&style_flight_state_ring_active_pressed, surrounding_reflection(flight_fill_active_pressed));

    lv_style_init(&style_flight_state_ring_transition);
    lv_style_set_border_color(&style_flight_state_ring_transition, surrounding_reflection(flight_fill_transition));

    lv_style_init(&style_nav);
    lv_style_set_radius(&style_nav, palette.control_radius / 2);
    lv_style_set_bg_opa(&style_nav, LV_OPA_TRANSP);
    lv_style_set_border_width(&style_nav, 0);
    lv_style_set_text_color(&style_nav, color(palette.muted_text));
    lv_style_set_text_font(&style_nav, &sc_pad_font_jetbrains_mono_16);
    lv_style_set_shadow_width(&style_nav, 0);

    lv_style_init(&style_nav_active);
    lv_style_set_bg_opa(&style_nav_active, LV_OPA_COVER);
    lv_style_set_bg_color(&style_nav_active, color(palette.accent_surface));
    lv_style_set_border_width(&style_nav_active, 1);
    lv_style_set_border_color(&style_nav_active, color(palette.primary));
    lv_style_set_text_color(&style_nav_active, color(palette.text));

    styles_initialized = true;
}

void send_command(Command command)
{
    if (command_callback == nullptr) {
        return;
    }

    command_callback(command, command_user_data);
}

void send_command(ActionRuntime &runtime)
{
    send_command(runtime.spec->command);
}

bool contains_non_ascii(const char *text)
{
    for (const unsigned char *character = reinterpret_cast<const unsigned char *>(text);
         *character != '\0';
         ++character) {
        if (*character > 0x7F) {
            return true;
        }
    }
    return false;
}

void update_action_text(ActionRuntime &runtime)
{
    const ActionState &state = state_for(runtime);
    const char *label = runtime.spec->inactive_label;
    if (state.active && runtime.spec->active_label != nullptr) {
        label = runtime.spec->active_label;
    }
    lv_label_set_text(runtime.label, label);
    lv_obj_set_style_text_font(
        runtime.label,
        contains_non_ascii(label) ? &sc_pad_font_source_han_22 : &sc_pad_font_jetbrains_mono_20,
        LV_STATE_DEFAULT);
}

void set_visual_state(lv_obj_t *object, lv_state_t state, bool enabled)
{
    if (object == nullptr) {
        return;
    }

    if (enabled) {
        lv_obj_add_state(object, state);
    } else {
        lv_obj_clear_state(object, state);
    }
}

// Each flash holds a bright ignition briefly, then eases back to its themed
// highlight. Object-owned animations are removed by LVGL when a page is rebuilt.
constexpr uint16_t kFlashPeakHoldMs = 120;
constexpr uint16_t kFlashDecayMs = 180;
constexpr uint8_t kFlashPeakWhiteMix = LV_OPA_70;

lv_color_t flash_fill(int32_t white_mix)
{
    return lv_color_lighten(color(theme().progress_border), white_mix);
}

void flash_shell_cb(void *object, int32_t white_mix)
{
    auto *button = static_cast<lv_obj_t *>(object);
    const lv_color_t fill = flash_fill(white_mix);
    lv_obj_set_style_bg_color(button, lv_color_darken(fill, LV_OPA_60), LV_STATE_USER_1);
    lv_obj_set_style_border_color(button, lv_color_darken(fill, LV_OPA_70), LV_STATE_USER_1);
}

void flash_face_cb(void *object, int32_t white_mix)
{
    auto *face = static_cast<lv_obj_t *>(object);
    const lv_color_t fill = flash_fill(white_mix);
    lv_obj_set_style_bg_color(face, fill, LV_STATE_USER_1);
    lv_obj_set_style_border_color(face, lv_color_lighten(fill, LV_OPA_30), LV_STATE_USER_1);
}

void flash_leading_cb(void *object, int32_t white_mix)
{
    lv_obj_set_style_border_color(static_cast<lv_obj_t *>(object),
                                 lv_color_lighten(flash_fill(white_mix), LV_OPA_30), LV_STATE_USER_1);
}

void flash_trailing_cb(void *object, int32_t white_mix)
{
    lv_obj_set_style_border_color(static_cast<lv_obj_t *>(object),
                                 lv_color_darken(flash_fill(white_mix), LV_OPA_60), LV_STATE_USER_1);
}

void flash_ring_cb(void *object, int32_t white_mix)
{
    lv_obj_set_style_border_color(static_cast<lv_obj_t *>(object),
                                 lv_color_darken(flash_fill(white_mix), LV_OPA_70), LV_STATE_USER_1);
}

void animate_flash(lv_obj_t *object, lv_anim_exec_xcb_t callback, bool enabled)
{
    lv_anim_del(object, callback);
    if (!enabled) {
        return;
    }

    lv_anim_t animation;
    lv_anim_init(&animation);
    lv_anim_set_var(&animation, object);
    lv_anim_set_exec_cb(&animation, callback);
    lv_anim_set_values(&animation, kFlashPeakWhiteMix, 0);
    lv_anim_set_delay(&animation, kFlashPeakHoldMs);
    lv_anim_set_time(&animation, kFlashDecayMs);
    lv_anim_set_path_cb(&animation, lv_anim_path_ease_out);
    lv_anim_set_early_apply(&animation, true);
    lv_anim_start(&animation);
}

void sync_physical_button_layers(PhysicalButtonLayers &layers, lv_obj_t *button)
{
    if (button == nullptr || layers.face == nullptr || layers.state_ring == nullptr) {
        return;
    }

    const bool checked = lv_obj_has_state(button, LV_STATE_CHECKED);
    const bool transitioning = lv_obj_has_state(button, LV_STATE_USER_1);
    const bool flash_changed = transitioning != lv_obj_has_state(layers.face, LV_STATE_USER_1);
    for (lv_obj_t *layer : {layers.face, layers.leading_bevel, layers.trailing_bevel, layers.state_ring}) {
        set_visual_state(layer, LV_STATE_CHECKED, checked);
        set_visual_state(layer, LV_STATE_USER_1, transitioning);
    }
    // Labels have their own colors, so mirror the flash state onto them.
    // Their default theme colors remain intact for the unlit phase.
    for (uint32_t i = 0; i < lv_obj_get_child_cnt(button); ++i) {
        lv_obj_t *child = lv_obj_get_child(button, i);
        if (lv_obj_check_type(child, &lv_label_class)) {
            set_visual_state(child, LV_STATE_USER_1, transitioning);
        }
    }
    if (flash_changed) {
        animate_flash(button, flash_shell_cb, transitioning);
        animate_flash(layers.face, flash_face_cb, transitioning);
        animate_flash(layers.leading_bevel, flash_leading_cb, transitioning);
        animate_flash(layers.trailing_bevel, flash_trailing_cb, transitioning);
        animate_flash(layers.state_ring, flash_ring_cb, transitioning);
    }
}

void create_physical_button_layers(
    lv_obj_t *button,
    PhysicalButtonLayers &layers,
    int width,
    int height)
{
    constexpr int kBevelInset = 4;
    const int inner_width = width - kBevelInset * 2;
    const int inner_height = height - kBevelInset * 2;

    layers.face = lv_obj_create(button);
    lv_obj_set_pos(layers.face, kBevelInset, kBevelInset);
    lv_obj_set_size(layers.face, inner_width, inner_height);
    lv_obj_clear_flag(layers.face, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_all(layers.face, 0, 0);
    lv_obj_add_style(layers.face, &style_flight_face, LV_STATE_DEFAULT);
    lv_obj_add_style(layers.face, &style_flight_face_active, LV_STATE_CHECKED);
    lv_obj_add_style(layers.face, &style_flight_face_active_pressed, LV_STATE_CHECKED | LV_STATE_PRESSED);
    lv_obj_add_style(layers.face, &style_flight_face_transition, LV_STATE_USER_1);
    lv_obj_add_style(layers.face, &style_flight_face_pressed, LV_STATE_PRESSED);

    layers.leading_bevel = lv_obj_create(button);
    lv_obj_set_pos(layers.leading_bevel, kBevelInset, kBevelInset);
    lv_obj_set_size(layers.leading_bevel, inner_width, inner_height);
    lv_obj_clear_flag(layers.leading_bevel, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(layers.leading_bevel, LV_MAX(0, theme().action_radius - kBevelInset), 0);
    lv_obj_set_style_pad_all(layers.leading_bevel, 0, 0);
    lv_obj_add_style(layers.leading_bevel, &style_flight_bevel_leading, LV_STATE_DEFAULT);
    lv_obj_add_style(layers.leading_bevel, &style_flight_bevel_leading_pressed, LV_STATE_PRESSED);
    lv_obj_add_style(layers.leading_bevel, &style_flight_bevel_leading_active, LV_STATE_CHECKED);
    lv_obj_add_style(layers.leading_bevel, &style_flight_bevel_leading_active_pressed, LV_STATE_CHECKED | LV_STATE_PRESSED);
    lv_obj_add_style(layers.leading_bevel, &style_flight_bevel_leading_transition, LV_STATE_USER_1);

    layers.trailing_bevel = lv_obj_create(button);
    lv_obj_set_pos(layers.trailing_bevel, kBevelInset, kBevelInset);
    lv_obj_set_size(layers.trailing_bevel, inner_width, inner_height);
    lv_obj_clear_flag(layers.trailing_bevel, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(layers.trailing_bevel, LV_MAX(0, theme().action_radius - kBevelInset), 0);
    lv_obj_set_style_pad_all(layers.trailing_bevel, 0, 0);
    lv_obj_add_style(layers.trailing_bevel, &style_flight_bevel_trailing, LV_STATE_DEFAULT);
    lv_obj_add_style(layers.trailing_bevel, &style_flight_bevel_trailing_pressed, LV_STATE_PRESSED);
    lv_obj_add_style(layers.trailing_bevel, &style_flight_bevel_trailing_active, LV_STATE_CHECKED);
    lv_obj_add_style(layers.trailing_bevel, &style_flight_bevel_trailing_active_pressed, LV_STATE_CHECKED | LV_STATE_PRESSED);
    lv_obj_add_style(layers.trailing_bevel, &style_flight_bevel_trailing_transition, LV_STATE_USER_1);

    layers.state_ring = lv_obj_create(button);
    lv_obj_set_pos(layers.state_ring, 0, 0);
    lv_obj_set_size(layers.state_ring, width, height);
    lv_obj_clear_flag(layers.state_ring, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_all(layers.state_ring, 0, 0);
    lv_obj_add_style(layers.state_ring, &style_flight_state_ring, LV_STATE_DEFAULT);
    lv_obj_add_style(layers.state_ring, &style_flight_state_ring_active, LV_STATE_CHECKED);
    lv_obj_add_style(layers.state_ring, &style_flight_state_ring_active_pressed, LV_STATE_CHECKED | LV_STATE_PRESSED);
    lv_obj_add_style(layers.state_ring, &style_flight_state_ring_transition, LV_STATE_USER_1);
    lv_obj_add_style(layers.state_ring, &style_flight_state_ring_pressed, LV_STATE_PRESSED);
}

void physical_button_feedback_event_cb(lv_event_t *event)
{
    auto *layers = static_cast<PhysicalButtonLayers *>(lv_event_get_user_data(event));
    if (layers == nullptr) {
        return;
    }

    const lv_event_code_t code = lv_event_get_code(event);
    if (code == LV_EVENT_PRESSED) {
        for (lv_obj_t *layer : {layers->face, layers->leading_bevel, layers->trailing_bevel, layers->state_ring}) {
            set_visual_state(layer, LV_STATE_PRESSED, true);
        }
    } else if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
        for (lv_obj_t *layer : {layers->face, layers->leading_bevel, layers->trailing_bevel, layers->state_ring}) {
            set_visual_state(layer, LV_STATE_PRESSED, false);
        }
    } else {
        return;
    }

    lv_obj_invalidate(lv_event_get_target(event));
}

void sync_flight_button_layers(ActionRuntime &runtime)
{
    sync_physical_button_layers(runtime.layers, runtime.button);
}

void sync_flight_button_layers(lv_obj_t *button)
{
    for (ActionRuntime &runtime : action_runtime) {
        if (runtime.button == button) {
            sync_flight_button_layers(runtime);
            return;
        }
    }
    for (MiningControlRuntime &runtime : mining_controls) {
        if (runtime.button == button) {
            sync_physical_button_layers(runtime.layers, runtime.button);
            return;
        }
    }
}

void apply_active_state(ActionRuntime &runtime)
{
    if (state_for(runtime).active) {
        lv_obj_add_state(runtime.button, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(runtime.button, LV_STATE_CHECKED);
    }
    sync_flight_button_layers(runtime);
    update_action_text(runtime);
}

void apply_process_presentation(ActionRuntime &runtime)
{
    const ActionState &state = state_for(runtime);
    const ProcessSpec &process = *runtime.spec->process;
    const bool visible = process.effect == ProcessEffect::Steady ||
                         (state.process_elapsed_ms / process.update_interval_ms) % 2 == 0;

    if (visible) {
        lv_obj_add_state(runtime.button, LV_STATE_USER_1);
    } else {
        lv_obj_clear_state(runtime.button, LV_STATE_USER_1);
    }
    sync_flight_button_layers(runtime);
    // Request a full-button redraw after both fill and border properties have
    // changed, so they reach the display in the same refresh.
    lv_obj_invalidate(runtime.button);
    update_action_text(runtime);
}

void process_timer_cb(lv_timer_t *timer)
{
    auto *runtime = static_cast<ActionRuntime *>(timer->user_data);
    ActionState &state = state_for(*runtime);
    const ProcessSpec &process = *runtime->spec->process;
    state.process_elapsed_ms += process.update_interval_ms;

    if (state.process_elapsed_ms >= process.duration_ms) {
        lv_obj_clear_state(runtime->button, LV_STATE_USER_1);
        sync_flight_button_layers(*runtime);
        state.processing = false;
        if (runtime->spec->behavior == ButtonBehavior::ProcessAndToggle) {
            state.active = !state.active;
        }
        runtime->timer = nullptr;
        lv_timer_del(timer);
        if (runtime->spec->behavior == ButtonBehavior::ProcessAndToggle) {
            apply_active_state(*runtime);
        } else {
            update_action_text(*runtime);
        }
        return;
    }

    apply_process_presentation(*runtime);
}

void resume_process(ActionRuntime &runtime)
{
    if (runtime.spec->process == nullptr) {
        return;
    }

    apply_process_presentation(runtime);
    runtime.timer = lv_timer_create(
        process_timer_cb,
        runtime.spec->process->update_interval_ms,
        &runtime);
}

void start_process(ActionRuntime &runtime)
{
    ActionState &state = state_for(runtime);
    if (state.processing || runtime.spec->process == nullptr) {
        return;
    }

    state.processing = true;
    state.process_elapsed_ms = 0;
    resume_process(runtime);
}

void create_ui_impl();
void select_page(PanelPage page);

constexpr uint16_t kPageTransitionDurationMs = 2000;
constexpr uint16_t kPageTransitionPulseMs = 300;

void cancel_page_transition()
{
    if (page_transition.source_button != nullptr) {
        lv_obj_clear_state(page_transition.source_button, LV_STATE_USER_1);
        sync_flight_button_layers(page_transition.source_button);
    }
    if (page_transition.timer != nullptr) {
        lv_timer_del(page_transition.timer);
    }
    page_transition = {};
}

void page_transition_timer_cb(lv_timer_t *timer)
{
    page_transition.elapsed_ms += kPageTransitionPulseMs;
    if (page_transition.elapsed_ms >= kPageTransitionDurationMs) {
        lv_obj_clear_state(page_transition.source_button, LV_STATE_USER_1);
        sync_flight_button_layers(page_transition.source_button);
        lv_obj_invalidate(page_transition.source_button);
        const PanelPage target = page_transition.target;
        page_transition.timer = nullptr;
        page_transition.active = false;
        lv_timer_del(timer);
        select_page(target);
        return;
    }

    const bool highlighted =
        (page_transition.elapsed_ms / kPageTransitionPulseMs) % 2 == 0;
    if (highlighted) {
        lv_obj_add_state(page_transition.source_button, LV_STATE_USER_1);
    } else {
        lv_obj_clear_state(page_transition.source_button, LV_STATE_USER_1);
    }
    sync_flight_button_layers(page_transition.source_button);
    lv_obj_invalidate(page_transition.source_button);
}

void start_page_transition(PanelPage target, lv_obj_t *source_button)
{
    if (page_transition.active || source_button == nullptr) {
        return;
    }

    page_transition.active = true;
    page_transition.target = target;
    page_transition.elapsed_ms = 0;
    page_transition.source_button = source_button;
    lv_obj_add_state(source_button, LV_STATE_USER_1);
    sync_flight_button_layers(source_button);
    lv_obj_invalidate(source_button);
    page_transition.timer = lv_timer_create(
        page_transition_timer_cb,
        kPageTransitionPulseMs,
        nullptr);
}

void rebuild_ui(void *)
{
    cancel_page_transition();
    for (ActionRuntime &runtime : action_runtime) {
        if (runtime.timer != nullptr) {
            lv_timer_del(runtime.timer);
        }
        runtime = {};
    }
    for (MiningControlRuntime &runtime : mining_controls) {
        runtime = {};
    }
    for (ShipControlRuntime &runtime : ship_controls) {
        runtime = {};
    }
    for (NavigationRuntime &runtime : navigation_runtime) {
        runtime = {};
    }
    lv_obj_clean(lv_scr_act());
    create_ui_impl();
}

void theme_choice_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    const auto *selection = static_cast<const ThemeSelectionRuntime *>(lv_event_get_user_data(event));
    current_theme = selection->index;
    lv_async_call(rebuild_ui, nullptr);
}

void attach_mode_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    attach_mode = !attach_mode;
    if (attach_mode) {
        lv_obj_add_state(attach_mode_button, LV_STATE_CHECKED);
        lv_label_set_text(attach_mode_label, "ATTACH ON");
        lv_obj_set_style_text_color(attach_mode_label, color(theme().primary), LV_STATE_DEFAULT);
    } else {
        lv_obj_clear_state(attach_mode_button, LV_STATE_CHECKED);
        lv_label_set_text(attach_mode_label, "ATTACH OFF");
        lv_obj_set_style_text_color(attach_mode_label, color(theme().text), LV_STATE_DEFAULT);
    }

}

void action_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    auto *runtime = static_cast<ActionRuntime *>(lv_event_get_user_data(event));
    if (runtime == nullptr) {
        return;
    }

    if (page_transition.active || state_for(*runtime).processing) {
        return;
    }

    const int action_index = static_cast<int>(runtime - action_runtime);
    if (action_index == 2) {
        if (attach_mode) {
            send_command(*runtime);
        }
        start_page_transition(PanelPage::Mining, runtime->button);
        return;
    }

    if (attach_mode) {
        send_command(*runtime);
    }

    switch (runtime->spec->behavior) {
        case ButtonBehavior::Momentary:
            break;
        case ButtonBehavior::LocalToggle:
            state_for(*runtime).active = !state_for(*runtime).active;
            apply_active_state(*runtime);
            break;
        case ButtonBehavior::ProcessAndToggle:
        case ButtonBehavior::Request:
            start_process(*runtime);
            break;
    }
}

const char *page_title_text(PanelPage page)
{
    switch (page) {
        case PanelPage::Flight:
            return "FLIGHT";
        case PanelPage::Ship:
            return "SHIP";
        case PanelPage::Mining:
            return "MINING";
        case PanelPage::Camera:
            return "CAMERA";
        case PanelPage::System:
            return "SYSTEM";
    }
    return "FLIGHT";
}

void select_page(PanelPage page)
{
    if (current_page == page) {
        return;
    }

    current_page = page;
    // Construct only the selected page. Keeping all pages alive exceeds the
    // fixed LVGL heap on the target even though hidden objects are invisible.
    lv_async_call(rebuild_ui, nullptr);
}

void navigation_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    auto *runtime = static_cast<NavigationRuntime *>(lv_event_get_user_data(event));
    if (!page_transition.active && runtime != nullptr && runtime->available) {
        select_page(runtime->page);
    }
}

lv_obj_t *create_content_page(lv_obj_t *screen)
{
    lv_obj_t *page = lv_obj_create(screen);
    lv_obj_set_pos(page, 0, kHeaderHeight);
    lv_obj_set_size(page, kScreenWidth, kNavTop - kHeaderHeight);
    lv_obj_clear_flag(page, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(page, 0, 0);
    lv_obj_set_style_bg_opa(page, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(page, 0, 0);
    lv_obj_set_style_pad_all(page, 0, 0);
    return page;
}

void create_header(lv_obj_t *screen)
{
    const Theme &palette = theme();
    lv_obj_t *header = lv_obj_create(screen);
    lv_obj_set_pos(header, 0, 0);
    lv_obj_set_size(header, kScreenWidth, kHeaderHeight);
    lv_obj_clear_flag(header, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(header, 0, 0);
    lv_obj_set_style_bg_color(header, color(palette.header), 0);
    lv_obj_set_style_bg_opa(header, LV_OPA_COVER, 0);
    lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_width(header, 1, 0);
    lv_obj_set_style_border_color(header, color(palette.border), 0);

    // Several official marks are intentionally black. A compact, brand-tinted
    // plate keeps their native artwork legible without recoloring it.
    lv_obj_t *logo_plate = lv_obj_create(header);
    lv_obj_set_size(logo_plate, 144, 54);
    lv_obj_align(logo_plate, LV_ALIGN_LEFT_MID, 6, 0);
    lv_obj_set_style_radius(logo_plate, palette.control_radius, 0);
    lv_obj_set_style_bg_color(logo_plate, color(palette.logo_surface), 0);
    lv_obj_set_style_bg_opa(logo_plate, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(logo_plate, color(palette.logo_border), 0);
    lv_obj_set_style_border_width(logo_plate, 1, 0);

    lv_obj_t *accent = lv_obj_create(header);
    lv_obj_set_size(accent, 4, 38);
    lv_obj_align(accent, LV_ALIGN_LEFT_MID, 158, 0);
    lv_obj_set_style_radius(accent, 2, 0);
    lv_obj_set_style_bg_color(accent, color(palette.primary), 0);
    lv_obj_set_style_bg_opa(accent, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(accent, 0, 0);

    page_title = lv_label_create(header);
    lv_label_set_text(page_title, page_title_text(current_page));
    lv_obj_align(page_title, LV_ALIGN_LEFT_MID, 178, 0);
    lv_obj_set_style_text_color(page_title, color(palette.text), 0);
    lv_obj_set_style_text_font(page_title, &sc_pad_font_jetbrains_mono_16, 0);

    lv_obj_t *logo = lv_img_create(header);
    lv_img_set_src(logo, palette.logo);
    lv_obj_align(logo, LV_ALIGN_LEFT_MID, 12, 0);

    attach_mode_button = lv_btn_create(header);
    lv_obj_set_size(attach_mode_button, 154, 34);
    lv_obj_align(attach_mode_button, LV_ALIGN_RIGHT_MID, -166, 0);
    lv_obj_set_style_radius(attach_mode_button, palette.control_radius, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(attach_mode_button, color(palette.surface), LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(attach_mode_button, LV_OPA_COVER, LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(attach_mode_button, color(palette.border), LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(attach_mode_button, 1, LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(attach_mode_button, 0, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(attach_mode_button, color(palette.accent_surface), LV_STATE_CHECKED);
    lv_obj_set_style_border_color(attach_mode_button, color(palette.primary), LV_STATE_CHECKED);
    lv_obj_set_style_border_width(attach_mode_button, 1, LV_STATE_CHECKED);
    lv_obj_set_style_bg_color(attach_mode_button, color(palette.surface_pressed), LV_STATE_PRESSED);
    lv_obj_add_event_cb(attach_mode_button, attach_mode_event_cb, LV_EVENT_CLICKED, nullptr);

    attach_mode_label = lv_label_create(attach_mode_button);
    lv_label_set_text(attach_mode_label, attach_mode ? "ATTACH ON" : "ATTACH OFF");
    lv_obj_center(attach_mode_label);
    lv_obj_set_style_text_color(attach_mode_label, color(attach_mode ? palette.primary : palette.text), LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(attach_mode_label, &sc_pad_font_jetbrains_mono_12, LV_STATE_DEFAULT);
    if (attach_mode) {
        lv_obj_add_state(attach_mode_button, LV_STATE_CHECKED);
    }

    lv_obj_t *status = lv_obj_create(header);
    lv_obj_set_size(status, 134, 34);
    lv_obj_align(status, LV_ALIGN_RIGHT_MID, -20, 0);
    lv_obj_clear_flag(status, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(status, palette.control_radius, 0);
    lv_obj_set_style_bg_color(status, color(palette.accent_surface), 0);
    lv_obj_set_style_bg_opa(status, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(status, color(palette.border), 0);
    lv_obj_set_style_border_width(status, 1, 0);
    lv_obj_set_style_pad_all(status, 0, 0);

    lv_obj_t *dot = lv_obj_create(status);
    lv_obj_set_pos(dot, 64, 24);
    lv_obj_set_size(dot, 6, 6);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, color(palette.primary), 0);
    lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(dot, 0, 0);

    lv_obj_t *status_label = lv_label_create(status);
    lv_label_set_text(status_label, "USB HID");
    lv_obj_set_pos(status_label, 0, 4);
    lv_obj_set_width(status_label, 134);
    lv_obj_set_style_text_align(status_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_color(status_label, color(palette.text), 0);
    lv_obj_set_style_text_font(status_label, &sc_pad_font_jetbrains_mono_12, 0);
}

void create_action_button(lv_obj_t *screen, int index)
{
    constexpr int button_width = 233;
    constexpr int button_height = 132;
    constexpr int horizontal_gap = 14;
    constexpr int vertical_gap = 12;
    constexpr int start_x = 24;
    constexpr int start_y = 18;

    const ActionSpec &spec = kActions[index];
    ActionRuntime &runtime = action_runtime[index];
    runtime.spec = &spec;

    // Apply a spec's default state once; later rebuilds (theme/page changes)
    // must preserve whatever the operator has toggled since boot.
    ActionState &state = state_for(runtime);
    if (!state.initialized) {
        state.active = spec.initially_active;
        state.initialized = true;
    }

    const int column = index % 4;
    const int row = index / 4;

    lv_obj_t *button = lv_btn_create(screen);
    runtime.button = button;
    lv_obj_set_pos(
        button,
        start_x + column * (button_width + horizontal_gap),
        start_y + row * (button_height + vertical_gap));
    lv_obj_set_size(button, button_width, button_height);
    lv_obj_add_style(button, &style_flight_action, LV_STATE_DEFAULT);
    lv_obj_add_style(button, &style_flight_action_active, LV_STATE_CHECKED);
    lv_obj_add_style(button, &style_flight_action_transition, LV_STATE_USER_1);
    lv_obj_add_style(button, &style_flight_action_pressed, LV_STATE_PRESSED);
    create_physical_button_layers(button, runtime.layers, button_width, button_height);
    lv_obj_add_event_cb(button, physical_button_feedback_event_cb, LV_EVENT_ALL, &runtime.layers);
    lv_obj_add_event_cb(button, action_event_cb, LV_EVENT_CLICKED, &runtime);

    lv_obj_t *number = lv_label_create(button);
    lv_label_set_text(number, spec.number);
    lv_obj_set_pos(number, 15, 13);
    lv_obj_set_style_text_color(number, color(theme().primary), 0);
    lv_obj_set_style_text_color(number, lv_color_black(), LV_STATE_USER_1);
    lv_obj_set_style_text_font(number, &sc_pad_font_jetbrains_mono_12, 0);

    runtime.label = lv_label_create(button);
    lv_obj_center(runtime.label);
    lv_obj_set_style_text_color(runtime.label, color(theme().text), 0);
    lv_obj_set_style_text_color(runtime.label, lv_color_black(), LV_STATE_USER_1);

    if (state_for(runtime).processing) {
        resume_process(runtime);
    } else {
        apply_active_state(runtime);
    }
}

lv_obj_t *create_control_section(lv_obj_t *page, int x, const char *title)
{
    lv_obj_t *section = lv_obj_create(page);
    lv_obj_set_pos(section, x, 18);
    lv_obj_set_size(section, 479, 424);
    lv_obj_clear_flag(section, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(section, theme().action_radius, 0);
    lv_obj_set_style_bg_color(section, color(theme().accent_surface), 0);
    lv_obj_set_style_bg_opa(section, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(section, 1, 0);
    lv_obj_set_style_border_color(section, color(theme().border), 0);
    lv_obj_set_style_shadow_width(section, 0, 0);
    lv_obj_set_style_pad_all(section, 0, 0);

    lv_obj_t *heading = lv_label_create(section);
    lv_label_set_text(heading, title);
    lv_obj_set_pos(heading, 16, 17);
    lv_obj_set_style_text_color(heading, color(theme().primary), 0);
    lv_obj_set_style_text_font(heading, &sc_pad_font_jetbrains_mono_12, 0);
    return section;
}

void create_ship_control_button(
    lv_obj_t *section,
    int index,
    Command command,
    const char *label,
    int x,
    int y,
    int width,
    int height)
{
    ShipControlRuntime &runtime = ship_controls[index];
    runtime.command = command;
    lv_obj_t *button = lv_btn_create(section);
    runtime.button = button;
    lv_obj_set_pos(button, x, y);
    lv_obj_set_size(button, width, height);
    lv_obj_add_style(button, &style_flight_action, LV_STATE_DEFAULT);
    lv_obj_add_style(button, &style_flight_action_pressed, LV_STATE_PRESSED);
    create_physical_button_layers(button, runtime.layers, width, height);
    lv_obj_add_event_cb(button, physical_button_feedback_event_cb, LV_EVENT_ALL, &runtime.layers);
    lv_obj_add_event_cb(
        button,
        [](lv_event_t *event) {
            if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
                return;
            }
            const auto *control = static_cast<const ShipControlRuntime *>(lv_event_get_user_data(event));
            if (control != nullptr && attach_mode) {
                send_command(control->command);
            }
        },
        LV_EVENT_CLICKED,
        &runtime);

    lv_obj_t *button_label = lv_label_create(button);
    lv_label_set_text(button_label, label);
    lv_obj_center(button_label);
    lv_obj_set_style_text_color(button_label, color(theme().text), 0);
    lv_obj_set_style_text_font(button_label, &sc_pad_font_jetbrains_mono_16, 0);
}

void create_ship_page(lv_obj_t *page)
{
    constexpr int kSectionWidth = 479;
    constexpr int kSectionGap = 18;

    lv_obj_t *shields = create_control_section(page, 24, "SHIELD DISTRIBUTION");
    // Keep every direction the same physical size while preserving its place
    // around the hull: front/back vertical, left/right lateral, reset core.
    constexpr int kShieldButtonWidth = 137;
    constexpr int kShieldButtonHeight = 100;
    constexpr int kShieldColumnX[] = {24, 171, 318};
    constexpr int kShieldRowY[] = {55, 165, 275};
    create_ship_control_button(shields, 0, Command::ShieldUp, "UP +", kShieldColumnX[0], kShieldRowY[0], kShieldButtonWidth, kShieldButtonHeight);
    create_ship_control_button(shields, 1, Command::ShieldFront, "FRONT +", kShieldColumnX[1], kShieldRowY[0], kShieldButtonWidth, kShieldButtonHeight);
    create_ship_control_button(shields, 2, Command::ShieldLeft, "LEFT +", kShieldColumnX[0], kShieldRowY[1], kShieldButtonWidth, kShieldButtonHeight);
    create_ship_control_button(shields, 3, Command::ResetShields, "RESET", kShieldColumnX[1], kShieldRowY[1], kShieldButtonWidth, kShieldButtonHeight);
    create_ship_control_button(shields, 4, Command::ShieldRight, "RIGHT +", kShieldColumnX[2], kShieldRowY[1], kShieldButtonWidth, kShieldButtonHeight);
    create_ship_control_button(shields, 5, Command::ShieldRear, "REAR +", kShieldColumnX[1], kShieldRowY[2], kShieldButtonWidth, kShieldButtonHeight);
    create_ship_control_button(shields, 6, Command::ShieldDown, "DOWN +", kShieldColumnX[2], kShieldRowY[2], kShieldButtonWidth, kShieldButtonHeight);

    lv_obj_t *power = create_control_section(page, 24 + kSectionWidth + kSectionGap, "POWER DISTRIBUTION");
    constexpr int kPowerButtonWidth = 137;
    constexpr int kPowerButtonHeight = 120;
    create_ship_control_button(power, 7, Command::PowerWeapons, "WEAPONS +", 15, 65, kPowerButtonWidth, kPowerButtonHeight);
    create_ship_control_button(power, 8, Command::PowerEngines, "ENGINES +", 171, 65, kPowerButtonWidth, kPowerButtonHeight);
    create_ship_control_button(power, 9, Command::PowerShields, "SHIELDS +", 327, 65, kPowerButtonWidth, kPowerButtonHeight);
    create_ship_control_button(power, 10, Command::ResetPower, "RESET POWER", 171, 230, kPowerButtonWidth, kPowerButtonHeight);
}

void create_system_page(lv_obj_t *page)
{
    lv_obj_t *themes = create_control_section(page, 24, "MANUFACTURER THEME");
    lv_obj_t *current = lv_label_create(themes);
    lv_label_set_text_fmt(current, "CURRENT: %s", theme().short_name);
    lv_obj_set_pos(current, 15, 44);
    lv_obj_set_style_text_color(current, color(theme().muted_text), 0);
    lv_obj_set_style_text_font(current, &sc_pad_font_jetbrains_mono_12, 0);

    for (int i = 0; i < kThemeCount; ++i) {
        const Theme &candidate = kThemes[i];
        ThemeSelectionRuntime &selection = theme_selection_runtime[i];
        selection.index = static_cast<uint8_t>(i);

        lv_obj_t *choice = lv_btn_create(themes);
        lv_obj_set_pos(choice, 15, 69 + i * 47);
        lv_obj_set_size(choice, 449, 38);
        lv_obj_set_style_radius(choice, candidate.control_radius, 0);
        lv_obj_set_style_bg_color(choice, color(candidate.accent_surface), 0);
        lv_obj_set_style_bg_opa(choice, LV_OPA_COVER, 0);
        lv_obj_set_style_border_color(choice, color(candidate.primary), 0);
        lv_obj_set_style_border_width(choice, i == current_theme ? 2 : 1, 0);
        lv_obj_set_style_shadow_width(choice, 0, 0);
        lv_obj_set_style_pad_all(choice, 0, 0);
        lv_obj_set_style_bg_color(choice, color(candidate.surface_pressed), LV_STATE_PRESSED);
        lv_obj_add_event_cb(choice, theme_choice_event_cb, LV_EVENT_CLICKED, &selection);

        lv_obj_t *name = lv_label_create(choice);
        lv_label_set_text(name, candidate.short_name);
        lv_obj_align(name, LV_ALIGN_LEFT_MID, 14, 0);
        lv_obj_set_style_text_color(name, color(candidate.text), 0);
        lv_obj_set_style_text_font(name, &sc_pad_font_jetbrains_mono_16, 0);

        lv_obj_t *state = lv_label_create(choice);
        lv_label_set_text(state, i == current_theme ? "ACTIVE" : "SELECT");
        lv_obj_align(state, LV_ALIGN_RIGHT_MID, -14, 0);
        lv_obj_set_style_text_color(state, color(i == current_theme ? candidate.primary : candidate.muted_text), 0);
        lv_obj_set_style_text_font(state, &sc_pad_font_jetbrains_mono_12, 0);
    }

    lv_obj_t *section = create_control_section(page, 521, "PANEL SETTINGS");
#if SC_PAD_ENABLE_DYNAMIC_ROTATION
    lv_obj_t *description = lv_label_create(section);
    lv_label_set_text(description, "ROTATES DISPLAY AND TOUCH 180 DEG\nSAVED AFTER RESTART");
    lv_obj_set_pos(description, 16, 51);
    lv_obj_set_style_text_color(description, color(theme().muted_text), 0);
    lv_obj_set_style_text_font(description, &sc_pad_font_jetbrains_mono_12, 0);

    lv_obj_t *orientation_button = lv_btn_create(section);
    lv_obj_set_size(orientation_button, 449, 190);
    lv_obj_align(orientation_button, LV_ALIGN_CENTER, 0, 45);
    lv_obj_add_style(orientation_button, &style_action, LV_STATE_DEFAULT);
    lv_obj_add_style(orientation_button, &style_action_pressed, LV_STATE_PRESSED);
    lv_obj_add_event_cb(
        orientation_button,
        [](lv_event_t *event) {
            if (lv_event_get_code(event) == LV_EVENT_CLICKED) {
                // Orientation is local hardware configuration: it must work
                // even while ATTACH is off and never produces a HID key.
                send_command(Command::ToggleOrientation);
            }
        },
        LV_EVENT_CLICKED,
        nullptr);

    lv_obj_t *button_title = lv_label_create(orientation_button);
    lv_label_set_text(button_title, orientation_180 ? "RETURN TO 0 DEG" : "ROTATE 180 DEG");
    lv_obj_align(button_title, LV_ALIGN_CENTER, 0, -18);
    lv_obj_set_style_text_color(button_title, color(theme().text), 0);
    lv_obj_set_style_text_font(button_title, &sc_pad_font_jetbrains_mono_20, 0);

    lv_obj_t *button_detail = lv_label_create(orientation_button);
    lv_label_set_text(
        button_detail,
        orientation_180 ? "CURRENT: 180 DEG | USB EDGE: RIGHT" : "CURRENT: 0 DEG | USB EDGE: LEFT");
    lv_obj_align(button_detail, LV_ALIGN_CENTER, 0, 26);
    lv_obj_set_style_text_color(button_detail, color(theme().muted_text), 0);
    lv_obj_set_style_text_font(button_detail, &sc_pad_font_jetbrains_mono_12, 0);
#else
    lv_obj_t *status = lv_label_create(section);
    lv_label_set_text(status, "DISPLAY ORIENTATION FIXED");
    lv_obj_align(status, LV_ALIGN_CENTER, 0, -12);
    lv_obj_set_style_text_color(status, color(theme().text), 0);
    lv_obj_set_style_text_font(status, &sc_pad_font_jetbrains_mono_20, 0);

    lv_obj_t *detail = lv_label_create(section);
    lv_label_set_text(detail, "SYSTEM CONTROLS RESERVED");
    lv_obj_align(detail, LV_ALIGN_CENTER, 0, 26);
    lv_obj_set_style_text_color(detail, color(theme().muted_text), 0);
    lv_obj_set_style_text_font(detail, &sc_pad_font_jetbrains_mono_12, 0);
#endif
}

void update_mining_presentation()
{
    for (int i = 0; i < 3; ++i) {
        lv_obj_t *button = mining_controls[2 + i].button;
        if (mining_state.modules[i]) {
            lv_obj_add_state(button, LV_STATE_CHECKED);
        } else {
            lv_obj_clear_state(button, LV_STATE_CHECKED);
        }
        sync_physical_button_layers(mining_controls[2 + i].layers, button);
    }

    MiningControlRuntime &collect = mining_controls[5];
    lv_label_set_text(collect.label, mining_state.collect_mode ? "COLLECT ON" : "COLLECT MODE");
    if (mining_state.collect_mode) {
        lv_obj_add_state(collect.button, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(collect.button, LV_STATE_CHECKED);
    }
    sync_physical_button_layers(collect.layers, collect.button);
}

void mining_control_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    auto *runtime = static_cast<MiningControlRuntime *>(lv_event_get_user_data(event));
    if (runtime == nullptr) {
        return;
    }

    if (page_transition.active) {
        return;
    }

    if (attach_mode) {
        send_command(runtime->command);
    }

    switch (runtime->control) {
        case MiningControl::LaserDecrease:
        case MiningControl::LaserIncrease:
            // Deliberately no local power estimate: the game does not report
            // its current laser setting back to this panel.
            break;
        case MiningControl::Module1:
        case MiningControl::Module2:
        case MiningControl::Module3: {
            const int module = static_cast<int>(runtime->control) - static_cast<int>(MiningControl::Module1);
            mining_state.modules[module] = !mining_state.modules[module];
            break;
        }
        case MiningControl::CollectMode:
            mining_state.collect_mode = !mining_state.collect_mode;
            break;
        case MiningControl::ExitMining:
            start_page_transition(PanelPage::Flight, runtime->button);
            return;
    }

    update_mining_presentation();
}

void create_mining_button(
    lv_obj_t *section,
    int index,
    MiningControl control,
    Command command,
    const char *label,
    int x,
    int y,
    int width,
    int height,
    bool primary = false)
{
    MiningControlRuntime &runtime = mining_controls[index];
    runtime.control = control;
    runtime.command = command;
    runtime.button = lv_btn_create(section);
    lv_obj_set_pos(runtime.button, x, y);
    lv_obj_set_size(runtime.button, width, height);
    lv_obj_add_style(runtime.button, &style_flight_action, LV_STATE_DEFAULT);
    lv_obj_add_style(runtime.button, &style_flight_action_active, LV_STATE_CHECKED);
    lv_obj_add_style(runtime.button, &style_flight_action_transition, LV_STATE_USER_1);
    lv_obj_add_style(runtime.button, &style_flight_action_pressed, LV_STATE_PRESSED);
    create_physical_button_layers(runtime.button, runtime.layers, width, height);
    lv_obj_add_event_cb(runtime.button, physical_button_feedback_event_cb, LV_EVENT_ALL, &runtime.layers);
    lv_obj_add_event_cb(runtime.button, mining_control_event_cb, LV_EVENT_CLICKED, &runtime);

    runtime.label = lv_label_create(runtime.button);
    lv_label_set_text(runtime.label, label);
    lv_obj_center(runtime.label);
    lv_obj_set_style_text_color(runtime.label, color(theme().text), 0);
    lv_obj_set_style_text_color(runtime.label, lv_color_black(), LV_STATE_USER_1);
    lv_obj_set_style_text_font(
        runtime.label,
        primary ? &sc_pad_font_jetbrains_mono_20 : &sc_pad_font_jetbrains_mono_16,
        0);
}

void create_mining_page(lv_obj_t *page)
{
    constexpr int kSectionWidth = 479;
    constexpr int kSectionGap = 18;
    constexpr int kControlWidth = 137;
    constexpr int kAuxiliaryHeight = 56;
    constexpr int kPrimaryHeight = 222;

    lv_obj_t *laser = create_control_section(page, 24, "LASER POWER");
    create_mining_button(laser, 5, MiningControl::CollectMode, Command::CollectMode, "COLLECT MODE", 15, 65, 449, kAuxiliaryHeight);
    create_mining_button(laser, 0, MiningControl::LaserDecrease, Command::LaserPowerDecrease, "POWER -", 15, 142, 213, kPrimaryHeight, true);
    create_mining_button(laser, 1, MiningControl::LaserIncrease, Command::LaserPowerIncrease, "POWER +", 251, 142, 213, kPrimaryHeight, true);

    lv_obj_t *modules = create_control_section(page, 24 + kSectionWidth + kSectionGap, "MINING MODULES");
    create_mining_button(modules, 6, MiningControl::ExitMining, Command::ExitMining, "EXIT MINING", 15, 65, 449, kAuxiliaryHeight);
    create_mining_button(modules, 2, MiningControl::Module1, Command::MiningModule1, "MODULE 1", 15, 142, kControlWidth, kPrimaryHeight);
    create_mining_button(modules, 3, MiningControl::Module2, Command::MiningModule2, "MODULE 2", 171, 142, kControlWidth, kPrimaryHeight);
    create_mining_button(modules, 4, MiningControl::Module3, Command::MiningModule3, "MODULE 3", 327, 142, kControlWidth, kPrimaryHeight);

    update_mining_presentation();
}

void create_navigation(lv_obj_t *screen)
{
    const Theme &palette = theme();
    lv_obj_t *nav_bg = lv_obj_create(screen);
    lv_obj_set_pos(nav_bg, 0, kNavTop);
    lv_obj_set_size(nav_bg, kScreenWidth, kNavHeight);
    lv_obj_clear_flag(nav_bg, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(nav_bg, 0, 0);
    lv_obj_set_style_bg_color(nav_bg, color(palette.nav), 0);
    lv_obj_set_style_bg_opa(nav_bg, LV_OPA_COVER, 0);
    lv_obj_set_style_border_side(nav_bg, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_width(nav_bg, 1, 0);
    lv_obj_set_style_border_color(nav_bg, color(palette.border), 0);
    // LVGL objects have default content padding. Remove it so navigation
    // buttons can be aligned against the full bar rather than drifting down.
    lv_obj_set_style_pad_all(nav_bg, 0, 0);

    for (int i = 0; i < 5; ++i) {
        lv_obj_t *nav_button = lv_btn_create(nav_bg);
        NavigationRuntime &runtime = navigation_runtime[i];
        runtime.button = nav_button;
        runtime.available = true;
        runtime.page = i == 1 ? PanelPage::Ship
                               : (i == 2 ? PanelPage::Mining
                                         : (i == 3 ? PanelPage::Camera
                                                   : (i == 4 ? PanelPage::System : PanelPage::Flight)));
        lv_obj_set_size(nav_button, 192, 60);
        lv_obj_align(nav_button, LV_ALIGN_LEFT_MID, 12 + i * 200, 0);
        lv_obj_add_style(nav_button, &style_nav, LV_STATE_DEFAULT);
        if (runtime.available && runtime.page == current_page) {
            lv_obj_add_style(nav_button, &style_nav_active, LV_STATE_DEFAULT);
        }
        lv_obj_add_event_cb(nav_button, navigation_event_cb, LV_EVENT_CLICKED, &runtime);

        lv_obj_t *label = lv_label_create(nav_button);
        lv_label_set_text(label, kNavLabels[i]);
        lv_obj_center(label);
    }
}

void create_ui_impl()
{
    lv_obj_t *screen = lv_scr_act();
    lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(screen, color(theme().screen), 0);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);

    init_styles();
    create_header(screen);

    lv_obj_t *page = create_content_page(screen);
    switch (current_page) {
        case PanelPage::Flight:
            for (int i = 0; i < kActionCount; ++i) {
                if (kActions[i].visible) {
                    create_action_button(page, i);
                }
            }
            break;
        case PanelPage::Ship:
            create_ship_page(page);
            break;
        case PanelPage::Mining:
            create_mining_page(page);
            break;
        case PanelPage::Camera:
            break;
        case PanelPage::System:
            create_system_page(page);
            break;
    }

    create_navigation(screen);
}

} // namespace

void create_ui(CommandCallback callback, void *user_data)
{
    command_callback = callback;
    command_user_data = user_data;
    create_ui_impl();
}

void set_orientation_180(bool enabled)
{
#if SC_PAD_ENABLE_DYNAMIC_ROTATION
    orientation_180 = enabled;
#else
    (void)enabled;
#endif
}

void set_theme_index(int index)
{
    if (index < 0 || index >= theme::kThemeCount) {
        return;
    }
    current_theme = index;
}

int theme_index()
{
    return current_theme;
}

} // namespace sc_pad
