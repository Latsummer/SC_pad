#include "sc_pad_ui.h"

#include "lvgl.h"
#include "sc_pad_logos.h"

LV_FONT_DECLARE(sc_pad_font_source_han_22)
LV_FONT_DECLARE(sc_pad_font_jetbrains_mono_12)
LV_FONT_DECLARE(sc_pad_font_jetbrains_mono_16)
LV_FONT_DECLARE(sc_pad_font_jetbrains_mono_20)

namespace sc_pad {
namespace {

constexpr int kScreenWidth = 1024;
constexpr int kHeaderHeight = 64;
// The navigation occupies the full lower chin. Its controls are centered in
// this area, while the divider sits slightly below the action grid.
constexpr int kNavTop = 524;
constexpr int kNavHeight = 76;
constexpr int kActionCount = 12;
constexpr int kThemeCount = 7;

lv_color_t color(uint32_t value)
{
    return lv_color_hex(value);
}

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
};

// Theme tokens describe surfaces and hierarchy only. Amber remains the
// panel-local state/progress color and red is reserved for faults or
// destructive actions; a theme's primary color is used for touch and selection.
struct Theme {
    const char *name;
    const char *short_name;
    const lv_img_dsc_t *logo;
    uint32_t logo_surface;
    uint32_t logo_border;
    uint32_t screen;
    uint32_t header;
    uint32_t surface;
    uint32_t surface_pressed;
    uint32_t border;
    uint32_t nav;
    uint32_t text;
    uint32_t muted_text;
    uint32_t primary;
    uint32_t primary_dim;
    uint32_t accent_surface;
    uint32_t local_state_surface;
    uint32_t local_state_border;
    uint32_t local_state_text;
    uint32_t progress_surface;
    uint32_t progress_border;
    uint32_t progress_text;
    uint8_t action_radius;
    uint8_t action_border_width;
    uint8_t control_radius;
};

const Theme kThemes[kThemeCount] = {
    {"ROBERTS SPACE INDUSTRIES", "RSI", &sc_pad_logo_rsi, 0x22272B, 0xFBB815, 0x080B0D, 0x11171A, 0x151B1D, 0x2A3438, 0x4A565A, 0x0E1315, 0xF4F3EE, 0xAAB0B0, 0xFBB815, 0x60480B, 0x302D21, 0x5A4611, 0xFBB815, 0xFFE7A0, 0x50320B, 0xF2A93B, 0xFFD58A, 12, 1, 17},
    {"AEGIS DYNAMICS", "AEGIS", &sc_pad_logo_aegis, 0xEEE7DF, 0xC22323, 0x0C0D0F, 0x141317, 0x1A1B1E, 0x303238, 0x51535A, 0x101114, 0xF1F0EA, 0xA8A9A6, 0xC22323, 0x4B2023, 0x292124, 0x482024, 0xC22323, 0xFFC4C4, 0x42351A, 0xF0B84F, 0xFFDC91, 3, 2, 4},
    {"ANVIL AEROSPACE", "ANVIL", &sc_pad_logo_anvil, 0xD5D0B9, 0x525445, 0x10110E, 0x1B1C18, 0x252720, 0x383A31, 0x565A4B, 0x161713, 0xF1F0E7, 0xB0B1A3, 0x8D9274, 0x3F4433, 0x33352C, 0x494C3A, 0x8D9274, 0xF1F5D7, 0x51411A, 0xE1B849, 0xFFE7A0, 4, 2, 5},
    {"DRAKE INTERPLANETARY", "DRAKE", &sc_pad_logo_drake, 0xE0B887, 0x000000, 0x130D08, 0x22170E, 0x2D2116, 0x4A321D, 0x6D5136, 0x1B120B, 0xF5E7D2, 0xC2AD91, 0xC57934, 0x593411, 0x3A2919, 0x633A16, 0xC57934, 0xFFDB9B, 0x5A4611, 0xF4C542, 0xFFF0B2, 1, 2, 2},
    {"MISC", "MISC", &sc_pad_logo_misc, 0xB9D3D4, 0x124B6B, 0xF3F8F8, 0xE9F1F2, 0xFFFFFF, 0xDCE9EC, 0x9EB4BA, 0xF3F8F8, 0x122A35, 0x5A717A, 0x124B6B, 0x9DC7D4, 0xE2F0F3, 0xC9E4EB, 0x124B6B, 0x0C3C50, 0xD6E5EA, 0x397A98, 0x173E50, 18, 1, 18},
    {"ORIGIN JUMPWORKS", "ORIGIN", &sc_pad_logo_origin, 0xE8E0D2, 0x000000, 0xF7F4EF, 0xEFE9E0, 0xFFFDF9, 0xEEE6DB, 0xB8AA97, 0xF7F4EF, 0x1B1917, 0x746C62, 0xB49A78, 0xD8C9B3, 0xF3E7D4, 0xE9D4B5, 0xB49A78, 0x5B4127, 0xD6E1E9, 0x6A8495, 0x223B4D, 22, 1, 20},
    {"CRUSADER INDUSTRIES", "CRUSADER", &sc_pad_logo_crusader, 0x101E2A, 0x1772D5, 0x061019, 0x091923, 0x0C2230, 0x14384C, 0x245267, 0x081720, 0xE4F7FF, 0x9CC7D8, 0x1772D5, 0x173F54, 0x103044, 0x114D69, 0x1772D5, 0xC6F3FF, 0x3D3154, 0xC49AFF, 0xE8DAFF, 10, 1, 17},
};

struct ActionRuntime {
    const ActionSpec *spec = nullptr;
    lv_obj_t *button = nullptr;
    lv_obj_t *label = nullptr;
    lv_timer_t *timer = nullptr;
};

// This model outlives LVGL objects. Rebuilding the view for a new theme must
// never change the panel's local command state or discard an active process.
struct ActionState {
    bool active = false;
    bool processing = false;
    uint16_t process_elapsed_ms = 0;
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
};

struct ShipControlRuntime {
    Command command = Command::ShieldUp;
    lv_obj_t *button = nullptr;
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
    {Command::Gear, "01", "Gear UP", "Gear Down", ButtonBehavior::ProcessAndToggle, &kGearProcess},
    {Command::Doors, "02", "ALL Doors CLOSE", "ALL Doors OPEN", ButtonBehavior::ProcessAndToggle, &kDoorsProcess},
    {Command::MiningMode, "03", "Miner MODE", nullptr, ButtonBehavior::Momentary},
    {Command::Vtol, "04", "VTOL MODE", "VTOL ON", ButtonBehavior::LocalToggle},
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
lv_style_t style_nav;
lv_style_t style_nav_active;

// Attach ON permits HID output; Attach OFF keeps the on-screen model editable
// without sending commands to the host.
bool attach_mode = true;
bool orientation_180 = false;
int current_theme = 0;
PanelPage current_page = PanelPage::Flight;
bool styles_initialized = false;
lv_obj_t *page_title = nullptr;
lv_obj_t *attach_mode_button = nullptr;
lv_obj_t *attach_mode_label = nullptr;
lv_obj_t *theme_button = nullptr;
lv_obj_t *theme_label = nullptr;
lv_obj_t *theme_picker_overlay = nullptr;

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
    lv_style_set_border_color(&style_action_pressed, color(palette.primary));
    lv_style_set_border_width(&style_action_pressed, palette.action_border_width);
    lv_style_set_shadow_width(&style_action_pressed, 0);

    // This is a panel-local state, never a claim about the in-game state.
    lv_style_init(&style_action_active);
    lv_style_set_bg_color(&style_action_active, color(palette.local_state_surface));
    lv_style_set_border_color(&style_action_active, color(palette.local_state_border));
    lv_style_set_border_width(&style_action_active, palette.action_border_width);
    lv_style_set_shadow_width(&style_action_active, 0);

    // Applied and removed by a timer to create the transition flash.
    lv_style_init(&style_action_transition);
    // Bias strongly toward the signal color so the pulse remains obvious on
    // lower-saturation touch panels, not only on a desktop display.
    lv_style_set_bg_color(
        &style_action_transition,
        lv_color_mix(color(palette.progress_border), color(palette.progress_surface), LV_OPA_80));
    lv_style_set_bg_opa(&style_action_transition, LV_OPA_COVER);
    lv_style_set_border_color(&style_action_transition, color(palette.progress_border));
    lv_style_set_border_opa(&style_action_transition, LV_OPA_COVER);
    lv_style_set_border_width(&style_action_transition, palette.action_border_width);
    lv_style_set_shadow_width(&style_action_transition, 0);

    lv_style_init(&style_nav);
    lv_style_set_radius(&style_nav, palette.control_radius / 2);
    lv_style_set_bg_opa(&style_nav, LV_OPA_TRANSP);
    lv_style_set_border_width(&style_nav, 0);
    lv_style_set_text_color(&style_nav, color(palette.muted_text));
    lv_style_set_text_font(&style_nav, &sc_pad_font_jetbrains_mono_12);
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

void apply_active_state(ActionRuntime &runtime)
{
    if (state_for(runtime).active) {
        lv_obj_add_state(runtime.button, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(runtime.button, LV_STATE_CHECKED);
    }
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
    theme_picker_overlay = nullptr;
    lv_obj_clean(lv_scr_act());
    create_ui_impl();
}

void dismiss_theme_picker()
{
    if (theme_picker_overlay == nullptr) {
        return;
    }

    lv_obj_del_async(theme_picker_overlay);
    theme_picker_overlay = nullptr;
}

void theme_choice_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    const auto *selection = static_cast<const ThemeSelectionRuntime *>(lv_event_get_user_data(event));
    current_theme = selection->index;
    // The screen rebuild removes the picker after this click event returns.
    theme_picker_overlay = nullptr;
    lv_async_call(rebuild_ui, nullptr);
}

void create_theme_picker()
{
    if (theme_picker_overlay != nullptr) {
        return;
    }

    const Theme &palette = theme();
    lv_obj_t *screen = lv_scr_act();
    theme_picker_overlay = lv_obj_create(screen);
    lv_obj_set_size(theme_picker_overlay, kScreenWidth, 600);
    lv_obj_set_pos(theme_picker_overlay, 0, 0);
    lv_obj_clear_flag(theme_picker_overlay, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(theme_picker_overlay, 0, 0);
    lv_obj_set_style_bg_color(theme_picker_overlay, color(palette.screen), 0);
    lv_obj_set_style_bg_opa(theme_picker_overlay, LV_OPA_90, 0);
    lv_obj_set_style_border_width(theme_picker_overlay, 0, 0);
    lv_obj_set_style_pad_all(theme_picker_overlay, 0, 0);

    lv_obj_t *panel = lv_obj_create(theme_picker_overlay);
    lv_obj_set_size(panel, 936, 420);
    lv_obj_align(panel, LV_ALIGN_CENTER, 0, 0);
    lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(panel, palette.action_radius, 0);
    lv_obj_set_style_bg_color(panel, color(palette.header), 0);
    lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(panel, color(palette.primary), 0);
    lv_obj_set_style_border_width(panel, 1, 0);
    lv_obj_set_style_shadow_width(panel, 0, 0);
    lv_obj_set_style_pad_all(panel, 0, 0);

    lv_obj_t *title = lv_label_create(panel);
    lv_label_set_text(title, "SELECT MANUFACTURER THEME");
    lv_obj_set_pos(title, 24, 18);
    lv_obj_set_style_text_color(title, color(palette.text), 0);
    lv_obj_set_style_text_font(title, &sc_pad_font_jetbrains_mono_16, 0);

    lv_obj_t *subtitle = lv_label_create(panel);
    lv_label_set_text_fmt(subtitle, "CURRENT: %s", palette.name);
    lv_obj_set_pos(subtitle, 24, 44);
    lv_obj_set_style_text_color(subtitle, color(palette.muted_text), 0);
    lv_obj_set_style_text_font(subtitle, &sc_pad_font_jetbrains_mono_12, 0);

    lv_obj_t *close_button = lv_btn_create(panel);
    lv_obj_set_size(close_button, 108, 30);
    lv_obj_align(close_button, LV_ALIGN_TOP_RIGHT, -18, 15);
    lv_obj_set_style_radius(close_button, palette.control_radius, 0);
    lv_obj_set_style_bg_color(close_button, color(palette.surface), 0);
    lv_obj_set_style_bg_opa(close_button, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(close_button, color(palette.border), 0);
    lv_obj_set_style_border_width(close_button, 1, 0);
    lv_obj_set_style_pad_all(close_button, 0, 0);
    lv_obj_add_event_cb(
        close_button,
        [](lv_event_t *event) {
            if (lv_event_get_code(event) == LV_EVENT_CLICKED) {
                dismiss_theme_picker();
            }
        },
        LV_EVENT_CLICKED,
        nullptr);
    lv_obj_t *close_label = lv_label_create(close_button);
    lv_label_set_text(close_label, "X  CLOSE");
    lv_obj_center(close_label);
    lv_obj_set_style_text_color(close_label, color(palette.text), 0);
    lv_obj_set_style_text_font(close_label, &sc_pad_font_jetbrains_mono_12, 0);

    constexpr int kCardWidth = 208;
    constexpr int kCardHeight = 136;
    constexpr int kCardLeft = 28;
    constexpr int kCardTop = 82;
    constexpr int kCardGapX = 16;
    constexpr int kCardGapY = 22;
    for (int i = 0; i < kThemeCount; ++i) {
        const int column = i % 4;
        const int row = i / 4;
        const Theme &candidate = kThemes[i];
        ThemeSelectionRuntime &selection = theme_selection_runtime[i];
        selection.index = static_cast<uint8_t>(i);

        lv_obj_t *card = lv_btn_create(panel);
        lv_obj_set_size(card, kCardWidth, kCardHeight);
        const int card_left = row == 1 ? 140 : kCardLeft;
        lv_obj_set_pos(card, card_left + column * (kCardWidth + kCardGapX),
                       kCardTop + row * (kCardHeight + kCardGapY));
        lv_obj_set_style_radius(card, candidate.action_radius, 0);
        lv_obj_set_style_bg_color(card, color(candidate.logo_surface), 0);
        lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
        lv_obj_set_style_border_color(card, color(i == current_theme ? palette.primary : candidate.logo_border), 0);
        lv_obj_set_style_border_width(card, i == current_theme ? 2 : 1, 0);
        lv_obj_set_style_shadow_width(card, 0, 0);
        lv_obj_set_style_pad_all(card, 0, 0);
        lv_obj_set_style_bg_color(card, color(candidate.surface_pressed), LV_STATE_PRESSED);
        lv_obj_add_event_cb(card, theme_choice_event_cb, LV_EVENT_CLICKED, &selection);

        lv_obj_t *logo = lv_img_create(card);
        lv_img_set_src(logo, candidate.logo);
        lv_obj_align(logo, LV_ALIGN_CENTER, 0, -16);

        lv_obj_t *card_label = lv_label_create(card);
        lv_label_set_text(card_label, i == current_theme ? "ACTIVE" : "SELECT");
        lv_obj_align(card_label, LV_ALIGN_BOTTOM_MID, 0, -12);
        lv_obj_set_style_text_color(card_label, color(i == current_theme ? palette.primary : candidate.muted_text), 0);
        lv_obj_set_style_text_font(card_label, &sc_pad_font_jetbrains_mono_12, 0);
    }
}

void theme_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    create_theme_picker();
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

    theme_button = lv_btn_create(header);
    lv_obj_set_size(theme_button, 170, 34);
    lv_obj_align(theme_button, LV_ALIGN_RIGHT_MID, -332, 0);
    lv_obj_set_style_radius(theme_button, palette.control_radius, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(theme_button, color(palette.accent_surface), LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(theme_button, LV_OPA_COVER, LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(theme_button, color(palette.primary), LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(theme_button, 1, LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(theme_button, 0, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(theme_button, color(palette.surface_pressed), LV_STATE_PRESSED);
    lv_obj_add_event_cb(theme_button, theme_event_cb, LV_EVENT_CLICKED, nullptr);

    theme_label = lv_label_create(theme_button);
    lv_label_set_text(theme_label, "THEME");
    lv_obj_center(theme_label);
    lv_obj_set_style_text_color(theme_label, color(palette.text), LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(theme_label, &sc_pad_font_jetbrains_mono_12, LV_STATE_DEFAULT);

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

    const int column = index % 4;
    const int row = index / 4;

    lv_obj_t *button = lv_btn_create(screen);
    runtime.button = button;
    lv_obj_set_pos(
        button,
        start_x + column * (button_width + horizontal_gap),
        start_y + row * (button_height + vertical_gap));
    lv_obj_set_size(button, button_width, button_height);
    lv_obj_add_style(button, &style_action, LV_STATE_DEFAULT);

    lv_obj_add_style(button, &style_action_active, LV_STATE_CHECKED);
    lv_obj_add_style(button, &style_action_transition, LV_STATE_USER_1);
    lv_obj_add_style(button, &style_action_pressed, LV_STATE_PRESSED);
    lv_obj_add_event_cb(button, action_event_cb, LV_EVENT_CLICKED, &runtime);

    lv_obj_t *number = lv_label_create(button);
    lv_label_set_text(number, spec.number);
    lv_obj_set_pos(number, 15, 13);
    lv_obj_set_style_text_color(number, color(theme().primary), 0);
    lv_obj_set_style_text_font(number, &sc_pad_font_jetbrains_mono_12, 0);

    runtime.label = lv_label_create(button);
    lv_obj_center(runtime.label);
    lv_obj_set_style_text_color(runtime.label, color(theme().text), 0);

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
    lv_obj_add_style(button, &style_action, LV_STATE_DEFAULT);
    lv_obj_add_style(button, &style_action_pressed, LV_STATE_PRESSED);
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
    create_ship_control_button(shields, 3, Command::ResetShields, "RESET SHIELDS", kShieldColumnX[1], kShieldRowY[1], kShieldButtonWidth, kShieldButtonHeight);
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
    lv_obj_t *section = create_control_section(page, 24, "DISPLAY ORIENTATION");
    lv_obj_set_size(section, 976, 424);

    lv_obj_t *description = lv_label_create(section);
    lv_label_set_text(description, "ROTATES DISPLAY + TOUCH 180 DEG  //  SAVED AFTER RESTART");
    lv_obj_set_pos(description, 16, 51);
    lv_obj_set_style_text_color(description, color(theme().muted_text), 0);
    lv_obj_set_style_text_font(description, &sc_pad_font_jetbrains_mono_12, 0);

    lv_obj_t *orientation_button = lv_btn_create(section);
    lv_obj_set_size(orientation_button, 608, 190);
    lv_obj_align(orientation_button, LV_ALIGN_CENTER, 0, 35);
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
        orientation_180 ? "CURRENT: 180 DEG  //  USB EDGE: RIGHT" : "CURRENT: 0 DEG  //  USB EDGE: LEFT");
    lv_obj_align(button_detail, LV_ALIGN_CENTER, 0, 26);
    lv_obj_set_style_text_color(button_detail, color(theme().muted_text), 0);
    lv_obj_set_style_text_font(button_detail, &sc_pad_font_jetbrains_mono_12, 0);
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
    }

    MiningControlRuntime &collect = mining_controls[5];
    lv_label_set_text(collect.label, mining_state.collect_mode ? "COLLECT ON" : "COLLECT MODE");
    if (mining_state.collect_mode) {
        lv_obj_add_state(collect.button, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(collect.button, LV_STATE_CHECKED);
    }
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
    int height)
{
    MiningControlRuntime &runtime = mining_controls[index];
    runtime.control = control;
    runtime.command = command;
    runtime.button = lv_btn_create(section);
    lv_obj_set_pos(runtime.button, x, y);
    lv_obj_set_size(runtime.button, width, height);
    lv_obj_add_style(runtime.button, &style_action, LV_STATE_DEFAULT);
    lv_obj_add_style(runtime.button, &style_action_active, LV_STATE_CHECKED);
    lv_obj_add_style(runtime.button, &style_action_transition, LV_STATE_USER_1);
    lv_obj_add_style(runtime.button, &style_action_pressed, LV_STATE_PRESSED);
    lv_obj_add_event_cb(runtime.button, mining_control_event_cb, LV_EVENT_CLICKED, &runtime);

    runtime.label = lv_label_create(runtime.button);
    lv_label_set_text(runtime.label, label);
    lv_obj_center(runtime.label);
    lv_obj_set_style_text_color(runtime.label, color(theme().text), 0);
    lv_obj_set_style_text_font(runtime.label, &sc_pad_font_jetbrains_mono_16, 0);
}

void create_mining_page(lv_obj_t *page)
{
    constexpr int kSectionWidth = 479;
    constexpr int kSectionGap = 18;
    constexpr int kControlWidth = 137;
    constexpr int kControlHeight = 120;

    lv_obj_t *laser = create_control_section(page, 24, "LASER POWER");
    create_mining_button(laser, 0, MiningControl::LaserDecrease, Command::LaserPowerDecrease, "POWER -", 15, 65, 213, kControlHeight);
    create_mining_button(laser, 1, MiningControl::LaserIncrease, Command::LaserPowerIncrease, "POWER +", 251, 65, 213, kControlHeight);
    create_mining_button(laser, 5, MiningControl::CollectMode, Command::CollectMode, "COLLECT MODE", 15, 220, 449, 145);

    lv_obj_t *modules = create_control_section(page, 24 + kSectionWidth + kSectionGap, "MINING MODULES");
    create_mining_button(modules, 2, MiningControl::Module1, Command::MiningModule1, "MODULE 1", 15, 65, kControlWidth, kControlHeight);
    create_mining_button(modules, 3, MiningControl::Module2, Command::MiningModule2, "MODULE 2", 171, 65, kControlWidth, kControlHeight);
    create_mining_button(modules, 4, MiningControl::Module3, Command::MiningModule3, "MODULE 3", 327, 65, kControlWidth, kControlHeight);
    create_mining_button(modules, 6, MiningControl::ExitMining, Command::ExitMining, "EXIT MINING", 15, 220, 449, 145);

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
        runtime.available = i < 3 || i == 4;
        runtime.page = i == 1 ? PanelPage::Ship
                               : (i == 2 ? PanelPage::Mining
                                         : (i == 4 ? PanelPage::System : PanelPage::Flight));
        lv_obj_set_size(nav_button, 192, 44);
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
    orientation_180 = enabled;
}

} // namespace sc_pad
