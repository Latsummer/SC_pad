#pragma once

#include "lvgl.h"
#include "sc_pad_logos.h"

namespace sc_pad {
namespace theme {

constexpr int kThemeCount = 7;

// 主题只描述表面与层级关系。琥珀色始终是面板本地状态/进度色，红色保留给
// 故障或破坏性动作；主题的 primary 色用于触控与选中高亮。
struct Theme {
    const char *name;              // 主题全称
    const char *short_name;        // 主题短名
    const lv_img_dsc_t *logo;      // 徽标图片
    uint32_t logo_surface;         // 徽标底板颜色
    uint32_t logo_border;          // 徽标边框颜色
    uint32_t screen;               // 屏幕背景色
    uint32_t header;               // 顶部状态栏底色
    uint32_t surface;              // 按钮/卡片底色
    uint32_t surface_pressed;      // 按钮按下底色
    uint32_t border;               // 边框颜色
    uint32_t nav;                  // 底部导航栏底色
    uint32_t text;                 // 主文字颜色
    uint32_t muted_text;           // 次要文字颜色
    uint32_t primary;              // 强调色（选中/高亮边框）
    uint32_t primary_dim;          // 强调色暗色（预留）
    uint32_t accent_surface;       // 强调色浅底
    uint32_t local_state_surface;  // 本地激活态底色
    uint32_t local_state_border;   // 本地激活态边框（预留）
    uint32_t local_state_text;     // 本地激活态文字（预留）
    uint32_t progress_surface;     // 进度条底色（预留）
    uint32_t progress_border;      // 进度/过渡闪烁色
    uint32_t progress_text;        // 进度文字色（预留）
    uint8_t action_radius;         // 按钮圆角
    uint8_t action_border_width;   // 按钮边框宽度
    uint8_t control_radius;        // 控件圆角
};

// 将 0xRRGGBB 转换为 lvgl 颜色。
lv_color_t color(uint32_t value);

extern const Theme kThemes[kThemeCount];

} // namespace theme
} // namespace sc_pad
