#include "sc_pad_theme.h"

namespace sc_pad {
namespace theme {

lv_color_t color(uint32_t value)
{
    return lv_color_hex(value);
}

const Theme kThemes[kThemeCount] = {
    // RSI
    {
        "ROBERTS SPACE INDUSTRIES", // name 主题全称
        "RSI",                      // short_name 主题短名
        &sc_pad_logo_rsi,           // logo 徽标图片
        0x22272B,                   // logo_surface 徽标底板颜色
        0xFBB815,                   // logo_border 徽标边框颜色
        0x14171C,                   // screen 屏幕背景色
        0x11171A,                   // header 顶部状态栏底色
        0x2B313A,                   // surface 按钮/卡片底色
        0xE6A000,                   // surface_pressed 按钮按下底色
        0x4A565A,                   // border 边框颜色
        0x2E2E2E,                   // nav 底部导航栏底色
        0xF4F3EE,                   // text 主文字颜色
        0xAAB0B0,                   // muted_text 次要文字颜色
        0xFBB815,                   // primary 强调色
        0x60480B,                   // primary_dim 强调色暗色（预留）
        0x302D21,                   // accent_surface 强调色浅底
        0x5A4611,                   // local_state_surface 本地激活态底色
        0xFBB815,                   // local_state_border 本地激活态边框（预留）
        0xFFE7A0,                   // local_state_text 本地激活态文字（预留）
        0x50320B,                   // progress_surface 进度条底色（预留）
        0xFFD252,                   // progress_border 过渡闪烁色
        0xFFD58A,                   // progress_text 进度文字色（预留）
        12,                         // action_radius 按钮圆角
        1,                          // action_border_width 按钮边框宽度
        17,                         // control_radius 控件圆角
    },
    // AEGIS
    {
        "AEGIS DYNAMICS", // name 主题全称
        "AEGIS",          // short_name 主题短名
        &sc_pad_logo_aegis, // logo 徽标图片
        0xEEE7DF,           // logo_surface 徽标底板颜色
        0xC22323,           // logo_border 徽标边框颜色
        0x13151A,           // screen 屏幕背景色
        0x141317,           // header 顶部状态栏底色
        0x2B313C,           // surface 按钮/卡片底色
        0xA3222A,           // surface_pressed 按钮按下底色
        0x51535A,           // border 边框颜色
        0x101114,           // nav 底部导航栏底色
        0xF1F0EA,           // text 主文字颜色
        0xA8A9A6,           // muted_text 次要文字颜色
        0xC22323,           // primary 强调色
        0x4B2023,           // primary_dim 强调色暗色（预留）
        0x292124,           // accent_surface 强调色浅底
        0x482024,           // local_state_surface 本地激活态底色
        0xC22323,           // local_state_border 本地激活态边框（预留）
        0xFFC4C4,           // local_state_text 本地激活态文字（预留）
        0x42351A,           // progress_surface 进度条底色（预留）
        0xD93642,           // progress_border 过渡闪烁色
        0xFFDC91,           // progress_text 进度文字色（预留）
        3,                  // action_radius 按钮圆角
        2,                  // action_border_width 按钮边框宽度
        4,                  // control_radius 控件圆角
    },
    // ANVIL
    {
        "ANVIL AEROSPACE", // name 主题全称
        "ANVIL",           // short_name 主题短名
        &sc_pad_logo_anvil, // logo 徽标图片
        0xD5D0B9,           // logo_surface 徽标底板颜色
        0x525445,           // logo_border 徽标边框颜色
        0x10110E,           // screen 屏幕背景色
        0x1B1C18,           // header 顶部状态栏底色
        0x252720,           // surface 按钮/卡片底色
        0x979E6D,           // surface_pressed 按钮按下底色
        0x565A4B,           // border 边框颜色
        0x161713,           // nav 底部导航栏底色
        0xF1F0E7,           // text 主文字颜色
        0xB0B1A3,           // muted_text 次要文字颜色
        0x8D9274,           // primary 强调色
        0x3F4433,           // primary_dim 强调色暗色（预留）
        0x33352C,           // accent_surface 强调色浅底
        0x494C3A,           // local_state_surface 本地激活态底色
        0x8D9274,           // local_state_border 本地激活态边框（预留）
        0xF1F5D7,           // local_state_text 本地激活态文字（预留）
        0x51411A,           // progress_surface 进度条底色（预留）
        0xD4E64E,           // progress_border 过渡闪烁色
        0xFFE7A0,           // progress_text 进度文字色（预留）
        4,                  // action_radius 按钮圆角
        2,                  // action_border_width 按钮边框宽度
        5,                  // control_radius 控件圆角
    },
    // DRAKE
    {
        "DRAKE INTERPLANETARY", // name 主题全称
        "DRAKE",                // short_name 主题短名
        &sc_pad_logo_drake,     // logo 徽标图片
        0xE0B887,               // logo_surface 徽标底板颜色
        0x000000,               // logo_border 徽标边框颜色
        0x130D08,               // screen 屏幕背景色
        0x22170E,               // header 顶部状态栏底色
        0x2D2116,               // surface 按钮/卡片底色
        0xCC742D,               // surface_pressed 按钮按下底色
        0x6D5136,               // border 边框颜色
        0x1B120B,               // nav 底部导航栏底色
        0xF5E7D2,               // text 主文字颜色
        0xC2AD91,               // muted_text 次要文字颜色
        0xC57934,               // primary 强调色
        0x593411,               // primary_dim 强调色暗色（预留）
        0x3A2919,               // accent_surface 强调色浅底
        0x633A16,               // local_state_surface 本地激活态底色
        0xC57934,               // local_state_border 本地激活态边框（预留）
        0xFFDB9B,               // local_state_text 本地激活态文字（预留）
        0x5A4611,               // progress_surface 进度条底色（预留）
        0x7BC4FF,               // progress_border 过渡闪烁色
        0xFFF0B2,               // progress_text 进度文字色（预留）
        1,                      // action_radius 按钮圆角
        2,                      // action_border_width 按钮边框宽度
        2,                      // control_radius 控件圆角
    },
    // MISC
    {
        "MISC",            // name 主题全称
        "MISC",            // short_name 主题短名
        &sc_pad_logo_misc, // logo 徽标图片
        0xB9D3D4,          // logo_surface 徽标底板颜色
        0x124B6B,          // logo_border 徽标边框颜色
        0xF3F8F8,          // screen 屏幕背景色
        0xE9F1F2,          // header 顶部状态栏底色
        0xFFFFFF,          // surface 按钮/卡片底色
        0x819199,          // surface_pressed 按钮按下底色
        0x9EB4BA,          // border 边框颜色
        0xF3F8F8,          // nav 底部导航栏底色
        0x122A35,          // text 主文字颜色
        0x5A717A,          // muted_text 次要文字颜色
        0x124B6B,          // primary 强调色
        0x9DC7D4,          // primary_dim 强调色暗色（预留）
        0xE2F0F3,          // accent_surface 强调色浅底
        0xA9CFDE,          // local_state_surface 本地激活态底色
        0x124B6B,          // local_state_border 本地激活态边框（预留）
        0x0C3C50,          // local_state_text 本地激活态文字（预留）
        0xD6E5EA,          // progress_surface 进度条底色（预留）
        0xF7A57C,          // progress_border 过渡闪烁色
        0x173E50,          // progress_text 进度文字色（预留）
        18,                // action_radius 按钮圆角
        1,                 // action_border_width 按钮边框宽度
        18,                // control_radius 控件圆角
    },
    // ORIGIN
    {
        "ORIGIN JUMPWORKS", // name 主题全称
        "ORIGIN",           // short_name 主题短名
        &sc_pad_logo_origin, // logo 徽标图片
        0xE8E0D2,            // logo_surface 徽标底板颜色
        0x000000,            // logo_border 徽标边框颜色
        0xF7F4EF,            // screen 屏幕背景色
        0xEFE9E0,            // header 顶部状态栏底色
        0xFFFDF9,            // surface 按钮/卡片底色
        0xEDB064,            // surface_pressed 按钮按下底色
        0xB8AA97,            // border 边框颜色
        0xF7F4EF,            // nav 底部导航栏底色
        0x1B1917,            // text 主文字颜色
        0x746C62,            // muted_text 次要文字颜色
        0xB49A78,            // primary 强调色
        0xD8C9B3,            // primary_dim 强调色暗色（预留）
        0xF3E7D4,            // accent_surface 强调色浅底
        0xE9D4B5,            // local_state_surface 本地激活态底色
        0xB49A78,            // local_state_border 本地激活态边框（预留）
        0x5B4127,            // local_state_text 本地激活态文字（预留）
        0xD6E1E9,            // progress_surface 进度条底色（预留）
        0x7EAFF7,            // progress_border 过渡闪烁色
        0x223B4D,            // progress_text 进度文字色（预留）
        22,                  // action_radius 按钮圆角
        1,                   // action_border_width 按钮边框宽度
        20,                  // control_radius 控件圆角
    },
    // CRUSADER
    {
        "CRUSADER INDUSTRIES", // name 主题全称
        "CRUSADER",            // short_name 主题短名
        &sc_pad_logo_crusader, // logo 徽标图片
        0x101E2A,              // logo_surface 徽标底板颜色
        0x1772D5,              // logo_border 徽标边框颜色
        0x061019,              // screen 屏幕背景色
        0x091923,              // header 顶部状态栏底色
        0x0C2230,              // surface 按钮/卡片底色
        0x68B2D9,              // surface_pressed 按钮按下底色
        0x245267,              // border 边框颜色
        0x081720,              // nav 底部导航栏底色
        0xE4F7FF,              // text 主文字颜色
        0x9CC7D8,              // muted_text 次要文字颜色
        0x1772D5,              // primary 强调色
        0x173F54,              // primary_dim 强调色暗色（预留）
        0x103044,              // accent_surface 强调色浅底
        0x114D69,              // local_state_surface 本地激活态底色
        0x1772D5,              // local_state_border 本地激活态边框（预留）
        0xC6F3FF,              // local_state_text 本地激活态文字（预留）
        0x3D3154,              // progress_surface 进度条底色（预留）
        0xB463F2,              // progress_border 过渡闪烁色
        0xE8DAFF,              // progress_text 进度文字色（预留）
        10,                    // action_radius 按钮圆角
        1,                     // action_border_width 按钮边框宽度
        17,                    // control_radius 控件圆角
    },
};

} // namespace theme
} // namespace sc_pad
