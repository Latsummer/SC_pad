#include "sc_pad_ui.h"

#include "lvgl.h"
#include "sc_pad_logos.h"

LV_FONT_DECLARE(sc_pad_font_source_han_22)

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

struct ProcessSpec {
    uint16_t duration_ms;
    uint16_t update_interval_ms;
    ProcessEffect effect;
};

struct ActionSpec {
    const char *number;
    const char *inactive_label;
    const char *active_label;
    ButtonBehavior behavior;
    const ProcessSpec *process = nullptr;
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
    uint32_t shadow;
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
    uint8_t action_shadow_width;
    uint8_t control_radius;
};

const Theme kThemes[kThemeCount] = {
    {"ROBERTS SPACE INDUSTRIES", "RSI", &sc_pad_logo_rsi, 0x22272B, 0xFBB815, 0x080B0D, 0x020304, 0x11171A, 0x151B1D, 0x2A3438, 0x4A565A, 0x0E1315, 0xF4F3EE, 0xAAB0B0, 0xFBB815, 0x60480B, 0x302D21, 0x5A4611, 0xFBB815, 0xFFE7A0, 0x50320B, 0xF2A93B, 0xFFD58A, 12, 1, 10, 17},
    {"AEGIS DYNAMICS", "AEGIS", &sc_pad_logo_aegis, 0xEEE7DF, 0xC22323, 0x0C0D0F, 0x050506, 0x141317, 0x1A1B1E, 0x303238, 0x51535A, 0x101114, 0xF1F0EA, 0xA8A9A6, 0xC22323, 0x4B2023, 0x292124, 0x482024, 0xC22323, 0xFFC4C4, 0x42351A, 0xF0B84F, 0xFFDC91, 3, 2, 3, 4},
    {"ANVIL AEROSPACE", "ANVIL", &sc_pad_logo_anvil, 0xD5D0B9, 0x525445, 0x10110E, 0x050605, 0x1B1C18, 0x252720, 0x383A31, 0x565A4B, 0x161713, 0xF1F0E7, 0xB0B1A3, 0x8D9274, 0x3F4433, 0x33352C, 0x494C3A, 0x8D9274, 0xF1F5D7, 0x51411A, 0xE1B849, 0xFFE7A0, 4, 2, 4, 5},
    {"DRAKE INTERPLANETARY", "DRAKE", &sc_pad_logo_drake, 0xE0B887, 0x000000, 0x130D08, 0x070503, 0x22170E, 0x2D2116, 0x4A321D, 0x6D5136, 0x1B120B, 0xF5E7D2, 0xC2AD91, 0xC57934, 0x593411, 0x3A2919, 0x633A16, 0xC57934, 0xFFDB9B, 0x5A4611, 0xF4C542, 0xFFF0B2, 1, 2, 0, 2},
    {"MISC", "MISC", &sc_pad_logo_misc, 0xB9D3D4, 0x124B6B, 0xF3F8F8, 0x94A8AE, 0xE9F1F2, 0xFFFFFF, 0xDCE9EC, 0x9EB4BA, 0xF3F8F8, 0x122A35, 0x5A717A, 0x124B6B, 0x9DC7D4, 0xE2F0F3, 0xC9E4EB, 0x124B6B, 0x0C3C50, 0xD6E5EA, 0x397A98, 0x173E50, 18, 1, 8, 18},
    {"ORIGIN JUMPWORKS", "ORIGIN", &sc_pad_logo_origin, 0xE8E0D2, 0x000000, 0xF7F4EF, 0xB6ACA0, 0xEFE9E0, 0xFFFDF9, 0xEEE6DB, 0xB8AA97, 0xF7F4EF, 0x1B1917, 0x746C62, 0xB49A78, 0xD8C9B3, 0xF3E7D4, 0xE9D4B5, 0xB49A78, 0x5B4127, 0xD6E1E9, 0x6A8495, 0x223B4D, 22, 1, 14, 20},
    {"CRUSADER INDUSTRIES", "CRUSADER", &sc_pad_logo_crusader, 0x101E2A, 0x1772D5, 0x061019, 0x020609, 0x091923, 0x0C2230, 0x14384C, 0x245267, 0x081720, 0xE4F7FF, 0x9CC7D8, 0x1772D5, 0x173F54, 0x103044, 0x114D69, 0x1772D5, 0xC6F3FF, 0x3D3154, 0xC49AFF, 0xE8DAFF, 10, 1, 12, 17},
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

// A long, low-frequency pulse reads as a mechanical operation rather than a
// tap acknowledgement. Future actions can select their own process profile.
constexpr ProcessSpec kGearProcess = {4000, 400, ProcessEffect::Pulse};

const ActionSpec kActions[kActionCount] = {
    {"01", "收起起落架", "放下起落架", ButtonBehavior::ProcessAndToggle, &kGearProcess},
    {"02", "关闭垂直起降", "开启垂直起降", ButtonBehavior::LocalToggle},
    {"03", "耦合模式", "解耦模式", ButtonBehavior::LocalToggle},
    {"04", "关闭限速器", "开启限速器", ButtonBehavior::LocalToggle},
    {"05", "关闭灯光", "开启灯光", ButtonBehavior::LocalToggle},
    {"06", "关闭量子模式", "开启量子模式", ButtonBehavior::LocalToggle},
    {"07", "关闭扫描", "开启扫描", ButtonBehavior::LocalToggle},
    {"08", "锁定前方目标", nullptr, ButtonBehavior::Momentary},
    {"09", "关闭电源", "开启电源", ButtonBehavior::LocalToggle},
    {"10", "关闭引擎", "开启引擎", ButtonBehavior::LocalToggle},
    {"11", "关闭护盾", "开启护盾", ButtonBehavior::LocalToggle},
    {"12", "离开座位", nullptr, ButtonBehavior::Momentary},
};

const char *kNavLabels[] = {"FLIGHT", "COMBAT", "SHIP", "CAMERA", "SYSTEM"};

CommandCallback command_callback = nullptr;
void *command_user_data = nullptr;
ActionRuntime action_runtime[kActionCount];
ActionState action_state[kActionCount];

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

// Attach mode keeps the on-screen model editable without emitting HID input.
bool attach_mode = false;
int current_theme = 0;
bool styles_initialized = false;
lv_obj_t *attach_mode_button = nullptr;
lv_obj_t *attach_mode_label = nullptr;
lv_obj_t *theme_button = nullptr;
lv_obj_t *theme_label = nullptr;

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
    lv_style_set_shadow_width(&style_action, palette.action_shadow_width);
    lv_style_set_shadow_color(&style_action, color(palette.shadow));
    lv_style_set_shadow_opa(&style_action, LV_OPA_50);
    lv_style_set_pad_all(&style_action, 0);

    // Avoid transform/zoom effects here. They can leave invalid regions on this
    // RGB display configuration. Color and border feedback are deterministic.
    lv_style_init(&style_action_pressed);
    lv_style_set_bg_color(&style_action_pressed, color(palette.surface_pressed));
    lv_style_set_border_color(&style_action_pressed, color(palette.primary));
    lv_style_set_border_width(&style_action_pressed, 3);
    lv_style_set_shadow_color(&style_action_pressed, color(palette.primary));
    lv_style_set_shadow_opa(&style_action_pressed, LV_OPA_40);

    // This is a panel-local state, never a claim about the in-game state.
    lv_style_init(&style_action_active);
    lv_style_set_bg_color(&style_action_active, color(palette.local_state_surface));
    lv_style_set_border_color(&style_action_active, color(palette.local_state_border));
    lv_style_set_border_width(&style_action_active, 3);
    lv_style_set_shadow_color(&style_action_active, color(palette.local_state_border));
    lv_style_set_shadow_opa(&style_action_active, LV_OPA_30);

    // Applied and removed by a timer to create the transition flash.
    lv_style_init(&style_action_transition);
    lv_style_set_bg_color(&style_action_transition, color(palette.progress_surface));
    lv_style_set_border_color(&style_action_transition, color(palette.progress_border));
    lv_style_set_border_width(&style_action_transition, 3);
    lv_style_set_shadow_color(&style_action_transition, color(palette.progress_border));
    lv_style_set_shadow_opa(&style_action_transition, LV_OPA_50);

    lv_style_init(&style_nav);
    lv_style_set_radius(&style_nav, palette.control_radius / 2);
    lv_style_set_bg_opa(&style_nav, LV_OPA_TRANSP);
    lv_style_set_border_width(&style_nav, 0);
    lv_style_set_text_color(&style_nav, color(palette.muted_text));
    lv_style_set_text_font(&style_nav, &lv_font_montserrat_12);
    lv_style_set_shadow_width(&style_nav, 0);

    lv_style_init(&style_nav_active);
    lv_style_set_bg_opa(&style_nav_active, LV_OPA_COVER);
    lv_style_set_bg_color(&style_nav_active, color(palette.accent_surface));
    lv_style_set_border_width(&style_nav_active, 1);
    lv_style_set_border_color(&style_nav_active, color(palette.primary));
    lv_style_set_text_color(&style_nav_active, color(palette.text));

    styles_initialized = true;
}

void send_command(ActionRuntime &runtime)
{
    if (command_callback == nullptr) {
        return;
    }

    const auto index = static_cast<uint8_t>(&runtime - action_runtime);
    command_callback(static_cast<Command>(index), command_user_data);
}

void update_action_text(ActionRuntime &runtime)
{
    const ActionState &state = state_for(runtime);
    const char *label = runtime.spec->inactive_label;
    if (state.active && runtime.spec->active_label != nullptr) {
        label = runtime.spec->active_label;
    }
    lv_label_set_text(runtime.label, label);
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

void rebuild_ui(void *)
{
    for (ActionRuntime &runtime : action_runtime) {
        if (runtime.timer != nullptr) {
            lv_timer_del(runtime.timer);
        }
        runtime = {};
    }

    lv_obj_clean(lv_scr_act());
    create_ui_impl();
}

void theme_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    current_theme = (current_theme + 1) % kThemeCount;
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

    if (state_for(*runtime).processing) {
        return;
    }

    if (!attach_mode) {
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

    lv_obj_t *title = lv_label_create(header);
    lv_label_set_text(title, "FLIGHT");
    lv_obj_align(title, LV_ALIGN_LEFT_MID, 178, 0);
    lv_obj_set_style_text_color(title, color(palette.text), 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);

    lv_obj_t *logo = lv_img_create(header);
    lv_img_set_src(logo, palette.logo);
    lv_obj_align(logo, LV_ALIGN_LEFT_MID, 12, 0);

    attach_mode_button = lv_btn_create(header);
    lv_obj_set_size(attach_mode_button, 154, 34);
    lv_obj_align(attach_mode_button, LV_ALIGN_RIGHT_MID, -222, 0);
    lv_obj_set_style_radius(attach_mode_button, palette.control_radius, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(attach_mode_button, color(palette.surface), LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(attach_mode_button, LV_OPA_COVER, LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(attach_mode_button, color(palette.border), LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(attach_mode_button, 1, LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(attach_mode_button, 0, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(attach_mode_button, color(palette.accent_surface), LV_STATE_CHECKED);
    lv_obj_set_style_border_color(attach_mode_button, color(palette.primary), LV_STATE_CHECKED);
    lv_obj_set_style_border_width(attach_mode_button, 2, LV_STATE_CHECKED);
    lv_obj_set_style_bg_color(attach_mode_button, color(palette.surface_pressed), LV_STATE_PRESSED);
    lv_obj_add_event_cb(attach_mode_button, attach_mode_event_cb, LV_EVENT_CLICKED, nullptr);

    attach_mode_label = lv_label_create(attach_mode_button);
    lv_label_set_text(attach_mode_label, attach_mode ? "ATTACH ON" : "ATTACH OFF");
    lv_obj_center(attach_mode_label);
    lv_obj_set_style_text_color(attach_mode_label, color(attach_mode ? palette.primary : palette.text), LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(attach_mode_label, &lv_font_montserrat_12, LV_STATE_DEFAULT);
    if (attach_mode) {
        lv_obj_add_state(attach_mode_button, LV_STATE_CHECKED);
    }

    theme_button = lv_btn_create(header);
    lv_obj_set_size(theme_button, 170, 34);
    lv_obj_align(theme_button, LV_ALIGN_RIGHT_MID, -394, 0);
    lv_obj_set_style_radius(theme_button, palette.control_radius, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(theme_button, color(palette.accent_surface), LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(theme_button, LV_OPA_COVER, LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(theme_button, color(palette.primary), LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(theme_button, 1, LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(theme_button, 0, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(theme_button, color(palette.surface_pressed), LV_STATE_PRESSED);
    lv_obj_add_event_cb(theme_button, theme_event_cb, LV_EVENT_CLICKED, nullptr);

    theme_label = lv_label_create(theme_button);
    lv_label_set_text_fmt(theme_label, "THEME  //  %s", palette.short_name);
    lv_obj_center(theme_label);
    lv_obj_set_style_text_color(theme_label, color(palette.text), LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(theme_label, &lv_font_montserrat_12, LV_STATE_DEFAULT);

    lv_obj_t *status = lv_obj_create(header);
    lv_obj_set_size(status, 190, 34);
    lv_obj_align(status, LV_ALIGN_RIGHT_MID, -20, 0);
    lv_obj_clear_flag(status, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(status, palette.control_radius, 0);
    lv_obj_set_style_bg_color(status, color(palette.accent_surface), 0);
    lv_obj_set_style_bg_opa(status, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(status, color(palette.border), 0);
    lv_obj_set_style_border_width(status, 1, 0);

    lv_obj_t *dot = lv_obj_create(status);
    lv_obj_set_pos(dot, 13, 11);
    lv_obj_set_size(dot, 10, 10);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, color(palette.primary), 0);
    lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(dot, 0, 0);

    lv_obj_t *status_label = lv_label_create(status);
    lv_label_set_text(status_label, "USB HID  //  TEST MODE");
    lv_obj_align(status_label, LV_ALIGN_RIGHT_MID, -13, 0);
    lv_obj_set_style_text_color(status_label, color(palette.muted_text), 0);
    lv_obj_set_style_text_font(status_label, &lv_font_montserrat_12, 0);
}

void create_action_button(lv_obj_t *screen, int index)
{
    constexpr int button_width = 233;
    constexpr int button_height = 132;
    constexpr int horizontal_gap = 14;
    constexpr int vertical_gap = 12;
    constexpr int start_x = 24;
    constexpr int start_y = 82;

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
    lv_obj_set_style_text_font(number, &lv_font_montserrat_12, 0);

    runtime.label = lv_label_create(button);
    lv_obj_center(runtime.label);
    lv_obj_set_style_text_color(runtime.label, color(theme().text), 0);
    lv_obj_set_style_text_font(runtime.label, &sc_pad_font_source_han_22, 0);

    if (state_for(runtime).processing) {
        resume_process(runtime);
    } else {
        apply_active_state(runtime);
    }
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
        lv_obj_set_size(nav_button, 192, 44);
        lv_obj_align(nav_button, LV_ALIGN_LEFT_MID, 12 + i * 200, 0);
        lv_obj_add_style(nav_button, &style_nav, LV_STATE_DEFAULT);
        if (i == 0) {
            lv_obj_add_style(nav_button, &style_nav_active, LV_STATE_DEFAULT);
        }

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

    for (int i = 0; i < kActionCount; ++i) {
        create_action_button(screen, i);
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

} // namespace sc_pad
