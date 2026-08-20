#include "sc_pad_ui.h"

#include "lvgl.h"

LV_FONT_DECLARE(sc_pad_font_source_han_22)

namespace sc_pad {
namespace {

constexpr int kScreenWidth = 1024;
constexpr int kHeaderHeight = 64;
constexpr int kNavTop = 528;
constexpr int kNavHeight = 72;
constexpr int kActionCount = 12;

lv_color_t color(uint32_t value)
{
    return lv_color_hex(value);
}

enum class ButtonKind {
    Normal,
    Accent,
    Danger,
};

enum class ButtonBehavior {
    Momentary,
    Toggle,
    Transition,
};

struct ActionSpec {
    const char *number;
    const char *inactive_label;
    const char *active_label;
    ButtonKind kind;
    ButtonBehavior behavior;
};

struct ActionRuntime {
    const ActionSpec *spec = nullptr;
    lv_obj_t *button = nullptr;
    lv_obj_t *label = nullptr;
    lv_obj_t *hint = nullptr;
    lv_timer_t *timer = nullptr;
    bool active = false;
    bool transitioning = false;
    uint8_t transition_tick = 0;
};

const ActionSpec kActions[kActionCount] = {
    {"01", "收起起落架", "放下起落架", ButtonKind::Accent, ButtonBehavior::Transition},
    {"02", "关闭垂直起降", "开启垂直起降", ButtonKind::Normal, ButtonBehavior::Toggle},
    {"03", "耦合模式", "解耦模式", ButtonKind::Normal, ButtonBehavior::Toggle},
    {"04", "关闭限速器", "开启限速器", ButtonKind::Normal, ButtonBehavior::Toggle},
    {"05", "关闭灯光", "开启灯光", ButtonKind::Normal, ButtonBehavior::Toggle},
    {"06", "关闭量子模式", "开启量子模式", ButtonKind::Accent, ButtonBehavior::Toggle},
    {"07", "关闭扫描", "开启扫描", ButtonKind::Normal, ButtonBehavior::Toggle},
    {"08", "锁定前方目标", nullptr, ButtonKind::Normal, ButtonBehavior::Momentary},
    {"09", "关闭电源", "开启电源", ButtonKind::Normal, ButtonBehavior::Toggle},
    {"10", "关闭引擎", "开启引擎", ButtonKind::Accent, ButtonBehavior::Toggle},
    {"11", "关闭护盾", "开启护盾", ButtonKind::Normal, ButtonBehavior::Toggle},
    {"12", "弹射", nullptr, ButtonKind::Danger, ButtonBehavior::Momentary},
};

const char *kNavLabels[] = {"FLIGHT", "COMBAT", "SHIP", "CAMERA", "SYSTEM"};

CommandCallback command_callback = nullptr;
void *command_user_data = nullptr;
ActionRuntime action_runtime[kActionCount];

lv_style_t style_action;
lv_style_t style_action_pressed;
lv_style_t style_action_accent;
lv_style_t style_action_danger;
lv_style_t style_action_active;
lv_style_t style_action_transition;
lv_style_t style_nav;
lv_style_t style_nav_active;

bool reset_mode = false;
lv_obj_t *reset_mode_button = nullptr;
lv_obj_t *reset_mode_label = nullptr;

void init_styles()
{
    lv_style_init(&style_action);
    lv_style_set_radius(&style_action, 12);
    lv_style_set_bg_opa(&style_action, LV_OPA_COVER);
    lv_style_set_bg_color(&style_action, color(0x0E1C26));
    lv_style_set_border_width(&style_action, 1);
    lv_style_set_border_color(&style_action, color(0x294454));
    lv_style_set_shadow_width(&style_action, 10);
    lv_style_set_shadow_color(&style_action, color(0x02070A));
    lv_style_set_shadow_opa(&style_action, LV_OPA_50);
    lv_style_set_pad_all(&style_action, 0);

    // Avoid transform/zoom effects here. They can leave invalid regions on this
    // RGB display configuration. Color and border feedback are deterministic.
    lv_style_init(&style_action_pressed);
    lv_style_set_bg_color(&style_action_pressed, color(0x17384A));
    lv_style_set_border_color(&style_action_pressed, color(0x6DE0FF));
    lv_style_set_border_width(&style_action_pressed, 3);
    lv_style_set_shadow_color(&style_action_pressed, color(0x31B9E8));
    lv_style_set_shadow_opa(&style_action_pressed, LV_OPA_40);

    lv_style_init(&style_action_accent);
    lv_style_set_bg_color(&style_action_accent, color(0x102B38));
    lv_style_set_border_color(&style_action_accent, color(0x2AAED6));
    lv_style_set_border_width(&style_action_accent, 2);

    lv_style_init(&style_action_danger);
    lv_style_set_bg_color(&style_action_danger, color(0x2A151A));
    lv_style_set_border_color(&style_action_danger, color(0xB64B5B));
    lv_style_set_border_width(&style_action_danger, 2);

    // Persistent local state: warm amber clearly differs from touch feedback.
    lv_style_init(&style_action_active);
    lv_style_set_bg_color(&style_action_active, color(0x4A2C0B));
    lv_style_set_border_color(&style_action_active, color(0xF2A93B));
    lv_style_set_border_width(&style_action_active, 3);
    lv_style_set_shadow_color(&style_action_active, color(0xF2A93B));
    lv_style_set_shadow_opa(&style_action_active, LV_OPA_30);

    // Applied and removed by a timer to create the transition flash.
    lv_style_init(&style_action_transition);
    lv_style_set_bg_color(&style_action_transition, color(0x6A430D));
    lv_style_set_border_color(&style_action_transition, color(0xFFD166));
    lv_style_set_border_width(&style_action_transition, 3);
    lv_style_set_shadow_color(&style_action_transition, color(0xFFD166));
    lv_style_set_shadow_opa(&style_action_transition, LV_OPA_50);

    lv_style_init(&style_nav);
    lv_style_set_radius(&style_nav, 8);
    lv_style_set_bg_opa(&style_nav, LV_OPA_TRANSP);
    lv_style_set_border_width(&style_nav, 0);
    lv_style_set_text_color(&style_nav, color(0x68808F));
    lv_style_set_text_font(&style_nav, &lv_font_montserrat_12);
    lv_style_set_shadow_width(&style_nav, 0);

    lv_style_init(&style_nav_active);
    lv_style_set_bg_opa(&style_nav_active, LV_OPA_COVER);
    lv_style_set_bg_color(&style_nav_active, color(0x102B38));
    lv_style_set_border_width(&style_nav_active, 1);
    lv_style_set_border_color(&style_nav_active, color(0x2AAED6));
    lv_style_set_text_color(&style_nav_active, color(0xD9F6FF));
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
    const char *label = runtime.spec->inactive_label;
    if (runtime.active && runtime.spec->active_label != nullptr) {
        label = runtime.spec->active_label;
    }
    lv_label_set_text(runtime.label, label);

    if (runtime.transitioning) {
        lv_label_set_text(runtime.hint, "COMMAND IN PROGRESS");
    } else if (runtime.spec->behavior == ButtonBehavior::Momentary) {
        lv_label_set_text(runtime.hint, "MOMENTARY ACTION");
    } else {
        lv_label_set_text(runtime.hint, runtime.active ? "LOCAL STATE  ACTIVE" : "TAP TO ACTIVATE");
    }
}

void apply_active_state(ActionRuntime &runtime)
{
    if (runtime.active) {
        lv_obj_add_state(runtime.button, LV_STATE_CHECKED);
    } else {
        lv_obj_clear_state(runtime.button, LV_STATE_CHECKED);
    }
    update_action_text(runtime);
}

void transition_timer_cb(lv_timer_t *timer)
{
    auto *runtime = static_cast<ActionRuntime *>(timer->user_data);
    ++runtime->transition_tick;

    if (runtime->transition_tick >= 8) {
        lv_obj_clear_state(runtime->button, LV_STATE_USER_1);
        runtime->transitioning = false;
        runtime->active = !runtime->active;
        runtime->timer = nullptr;
        lv_timer_del(timer);
        apply_active_state(*runtime);
        return;
    }

    if ((runtime->transition_tick % 2) == 0) {
        lv_obj_add_state(runtime->button, LV_STATE_USER_1);
    } else {
        lv_obj_clear_state(runtime->button, LV_STATE_USER_1);
    }
}

void start_transition(ActionRuntime &runtime)
{
    if (runtime.transitioning) {
        return;
    }

    runtime.transitioning = true;
    runtime.transition_tick = 0;
    lv_obj_add_state(runtime.button, LV_STATE_USER_1);
    update_action_text(runtime);
    runtime.timer = lv_timer_create(transition_timer_cb, 250, &runtime);
}

void reset_action_state(ActionRuntime &runtime)
{
    if (runtime.timer != nullptr) {
        lv_timer_del(runtime.timer);
        runtime.timer = nullptr;
    }

    runtime.active = false;
    runtime.transitioning = false;
    runtime.transition_tick = 0;
    lv_obj_clear_state(runtime.button, LV_STATE_CHECKED | LV_STATE_USER_1);
    update_action_text(runtime);
}

void reset_mode_event_cb(lv_event_t *event)
{
    if (lv_event_get_code(event) != LV_EVENT_CLICKED) {
        return;
    }

    reset_mode = !reset_mode;
    if (reset_mode) {
        lv_obj_add_state(reset_mode_button, LV_STATE_CHECKED);
        lv_label_set_text(reset_mode_label, "RESET MODE  ON");
        lv_obj_set_style_text_color(reset_mode_label, color(0xFFD58A), LV_STATE_DEFAULT);
    } else {
        lv_obj_clear_state(reset_mode_button, LV_STATE_CHECKED);
        lv_label_set_text(reset_mode_label, "RESET MODE");
        lv_obj_set_style_text_color(reset_mode_label, color(0xC4D5DC), LV_STATE_DEFAULT);
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

    if (reset_mode) {
        reset_action_state(*runtime);
        return;
    }

    if (runtime->transitioning) {
        return;
    }

    send_command(*runtime);

    switch (runtime->spec->behavior) {
        case ButtonBehavior::Momentary:
            break;
        case ButtonBehavior::Toggle:
            runtime->active = !runtime->active;
            apply_active_state(*runtime);
            break;
        case ButtonBehavior::Transition:
            start_transition(*runtime);
            break;
    }
}

void create_header(lv_obj_t *screen)
{
    lv_obj_t *header = lv_obj_create(screen);
    lv_obj_set_pos(header, 0, 0);
    lv_obj_set_size(header, kScreenWidth, kHeaderHeight);
    lv_obj_clear_flag(header, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(header, 0, 0);
    lv_obj_set_style_bg_color(header, color(0x09141C), 0);
    lv_obj_set_style_bg_opa(header, LV_OPA_COVER, 0);
    lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_width(header, 1, 0);
    lv_obj_set_style_border_color(header, color(0x1C3948), 0);

    lv_obj_t *accent = lv_obj_create(header);
    lv_obj_set_size(accent, 4, 34);
    lv_obj_align(accent, LV_ALIGN_LEFT_MID, 20, 0);
    lv_obj_set_style_radius(accent, 2, 0);
    lv_obj_set_style_bg_color(accent, color(0x35C8F0), 0);
    lv_obj_set_style_bg_opa(accent, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(accent, 0, 0);

    lv_obj_t *title = lv_label_create(header);
    lv_label_set_text(title, "SC PAD  //  FLIGHT CONTROL");
    lv_obj_align(title, LV_ALIGN_LEFT_MID, 38, 0);
    lv_obj_set_style_text_color(title, color(0xE4F7FF), 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);

    reset_mode_button = lv_btn_create(header);
    lv_obj_set_size(reset_mode_button, 154, 34);
    lv_obj_align(reset_mode_button, LV_ALIGN_RIGHT_MID, -222, 0);
    lv_obj_set_style_radius(reset_mode_button, 17, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(reset_mode_button, color(0x14222A), LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(reset_mode_button, LV_OPA_COVER, LV_STATE_DEFAULT);
    lv_obj_set_style_border_color(reset_mode_button, color(0x435C68), LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(reset_mode_button, 1, LV_STATE_DEFAULT);
    lv_obj_set_style_shadow_width(reset_mode_button, 0, LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(reset_mode_button, color(0x5A3510), LV_STATE_CHECKED);
    lv_obj_set_style_border_color(reset_mode_button, color(0xF2A93B), LV_STATE_CHECKED);
    lv_obj_set_style_border_width(reset_mode_button, 2, LV_STATE_CHECKED);
    lv_obj_set_style_bg_color(reset_mode_button, color(0x263A44), LV_STATE_PRESSED);
    lv_obj_add_event_cb(reset_mode_button, reset_mode_event_cb, LV_EVENT_CLICKED, nullptr);

    reset_mode_label = lv_label_create(reset_mode_button);
    lv_label_set_text(reset_mode_label, "RESET MODE");
    lv_obj_center(reset_mode_label);
    lv_obj_set_style_text_color(reset_mode_label, color(0xC4D5DC), LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(reset_mode_label, &lv_font_montserrat_12, LV_STATE_DEFAULT);

    lv_obj_t *status = lv_obj_create(header);
    lv_obj_set_size(status, 190, 34);
    lv_obj_align(status, LV_ALIGN_RIGHT_MID, -20, 0);
    lv_obj_clear_flag(status, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(status, 17, 0);
    lv_obj_set_style_bg_color(status, color(0x0E2530), 0);
    lv_obj_set_style_bg_opa(status, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(status, color(0x245267), 0);
    lv_obj_set_style_border_width(status, 1, 0);

    lv_obj_t *dot = lv_obj_create(status);
    lv_obj_set_pos(dot, 13, 11);
    lv_obj_set_size(dot, 10, 10);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, color(0x48E0A4), 0);
    lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(dot, 0, 0);

    lv_obj_t *status_label = lv_label_create(status);
    lv_label_set_text(status_label, "USB HID  //  TEST MODE");
    lv_obj_align(status_label, LV_ALIGN_RIGHT_MID, -13, 0);
    lv_obj_set_style_text_color(status_label, color(0x9CC7D8), 0);
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

    if (spec.kind == ButtonKind::Accent) {
        lv_obj_add_style(button, &style_action_accent, LV_STATE_DEFAULT);
    } else if (spec.kind == ButtonKind::Danger) {
        lv_obj_add_style(button, &style_action_danger, LV_STATE_DEFAULT);
    }

    lv_obj_add_style(button, &style_action_active, LV_STATE_CHECKED);
    lv_obj_add_style(button, &style_action_transition, LV_STATE_USER_1);
    lv_obj_add_style(button, &style_action_pressed, LV_STATE_PRESSED);
    lv_obj_add_event_cb(button, action_event_cb, LV_EVENT_CLICKED, &runtime);

    lv_obj_t *number = lv_label_create(button);
    lv_label_set_text(number, spec.number);
    lv_obj_set_pos(number, 15, 13);
    lv_obj_set_style_text_color(
        number,
        spec.kind == ButtonKind::Danger ? color(0xE87786) : color(0x4ABFDF),
        0);
    lv_obj_set_style_text_font(number, &lv_font_montserrat_12, 0);

    runtime.label = lv_label_create(button);
    lv_obj_align(runtime.label, LV_ALIGN_CENTER, 0, -5);
    lv_obj_set_style_text_color(runtime.label, color(0xE2F2F7), 0);
    lv_obj_set_style_text_font(runtime.label, &sc_pad_font_source_han_22, 0);

    runtime.hint = lv_label_create(button);
    lv_obj_align(runtime.hint, LV_ALIGN_BOTTOM_MID, 0, -14);
    lv_obj_set_style_text_color(runtime.hint, color(0x8AA0AA), 0);
    lv_obj_set_style_text_font(runtime.hint, &lv_font_montserrat_12, 0);

    update_action_text(runtime);
}

void create_navigation(lv_obj_t *screen)
{
    lv_obj_t *nav_bg = lv_obj_create(screen);
    lv_obj_set_pos(nav_bg, 0, kNavTop);
    lv_obj_set_size(nav_bg, kScreenWidth, kNavHeight);
    lv_obj_clear_flag(nav_bg, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_radius(nav_bg, 0, 0);
    lv_obj_set_style_bg_color(nav_bg, color(0x08131A), 0);
    lv_obj_set_style_bg_opa(nav_bg, LV_OPA_COVER, 0);
    lv_obj_set_style_border_side(nav_bg, LV_BORDER_SIDE_TOP, 0);
    lv_obj_set_style_border_width(nav_bg, 1, 0);
    lv_obj_set_style_border_color(nav_bg, color(0x1C3948), 0);

    for (int i = 0; i < 5; ++i) {
        lv_obj_t *nav_button = lv_btn_create(nav_bg);
        lv_obj_set_pos(nav_button, 12 + i * 200, 11);
        lv_obj_set_size(nav_button, 192, 50);
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
    lv_obj_set_style_bg_color(screen, color(0x050C11), 0);
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
