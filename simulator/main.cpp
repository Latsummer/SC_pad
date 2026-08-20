#include <windows.h>
#include <windowsx.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <vector>

#include "lvgl.h"
#include "sc_pad_ui.h"

namespace {

constexpr int kWidth = 1024;
constexpr int kHeight = 600;
constexpr int kRenderRows = 64;

HWND window_handle = nullptr;
bool running = true;
bool pointer_down = false;
POINT pointer_position = {0, 0};
std::vector<uint32_t> framebuffer(kWidth * kHeight, 0);

void flush_display(lv_disp_drv_t *display, const lv_area_t *area, lv_color_t *pixels)
{
    const int left = std::max<int>(area->x1, 0);
    const int top = std::max<int>(area->y1, 0);
    const int right = std::min<int>(area->x2, kWidth - 1);
    const int bottom = std::min<int>(area->y2, kHeight - 1);
    const int source_width = area->x2 - area->x1 + 1;

    for (int y = top; y <= bottom; ++y) {
        const int source_y = y - area->y1;
        for (int x = left; x <= right; ++x) {
            const int source_x = x - area->x1;
            framebuffer[y * kWidth + x] = lv_color_to32(pixels[source_y * source_width + source_x]);
        }
    }

    InvalidateRect(window_handle, nullptr, FALSE);
    lv_disp_flush_ready(display);
}

void read_pointer(lv_indev_drv_t *, lv_indev_data_t *data)
{
    data->point.x = static_cast<lv_coord_t>(pointer_position.x);
    data->point.y = static_cast<lv_coord_t>(pointer_position.y);
    data->state = pointer_down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

void paint_window(HWND window)
{
    PAINTSTRUCT paint{};
    HDC dc = BeginPaint(window, &paint);

    BITMAPINFO bitmap{};
    bitmap.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bitmap.bmiHeader.biWidth = kWidth;
    bitmap.bmiHeader.biHeight = -kHeight;
    bitmap.bmiHeader.biPlanes = 1;
    bitmap.bmiHeader.biBitCount = 32;
    bitmap.bmiHeader.biCompression = BI_RGB;

    StretchDIBits(dc, 0, 0, kWidth, kHeight, 0, 0, kWidth, kHeight,
                  framebuffer.data(), &bitmap, DIB_RGB_COLORS, SRCCOPY);
    EndPaint(window, &paint);
}

LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM w_param, LPARAM l_param)
{
    switch (message) {
        case WM_LBUTTONDOWN:
            pointer_down = true;
            pointer_position = {GET_X_LPARAM(l_param), GET_Y_LPARAM(l_param)};
            SetCapture(window);
            return 0;
        case WM_MOUSEMOVE:
            pointer_position = {GET_X_LPARAM(l_param), GET_Y_LPARAM(l_param)};
            return 0;
        case WM_LBUTTONUP:
            pointer_down = false;
            pointer_position = {GET_X_LPARAM(l_param), GET_Y_LPARAM(l_param)};
            ReleaseCapture();
            return 0;
        case WM_PAINT:
            paint_window(window);
            return 0;
        case WM_CLOSE:
            DestroyWindow(window);
            return 0;
        case WM_DESTROY:
            running = false;
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProc(window, message, w_param, l_param);
    }
}

bool create_window(HINSTANCE instance)
{
    const wchar_t *class_name = L"ScPadLvglSimulator";
    WNDCLASSW window_class{};
    window_class.lpfnWndProc = window_proc;
    window_class.hInstance = instance;
    window_class.hCursor = LoadCursor(nullptr, IDC_ARROW);
    window_class.lpszClassName = class_name;

    if (RegisterClassW(&window_class) == 0) {
        return false;
    }

    RECT bounds = {0, 0, kWidth, kHeight};
    const DWORD style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
    AdjustWindowRect(&bounds, style, FALSE);

    window_handle = CreateWindowExW(
        0, class_name, L"SC PAD - LVGL 8.4 Desktop Simulator", style,
        CW_USEDEFAULT, CW_USEDEFAULT, bounds.right - bounds.left, bounds.bottom - bounds.top,
        nullptr, nullptr, instance, nullptr);

    if (window_handle == nullptr) {
        return false;
    }

    ShowWindow(window_handle, SW_SHOW);
    return true;
}

void print_command(sc_pad::Command command, void *)
{
    constexpr std::array<const char *, 12> names = {
        "GEAR", "VTOL", "COUPLED", "LIMITER", "LIGHTS", "QUANTUM",
        "SCAN", "TARGET AHEAD", "POWER", "ENGINES", "SHIELDS", "EJECT",
    };
    const auto index = static_cast<std::size_t>(command);
    std::cout << "[SC PAD] command: " << names.at(index) << std::endl;
}

} // namespace

int main()
{
    if (!create_window(GetModuleHandleW(nullptr))) {
        std::cerr << "Could not create the simulator window." << std::endl;
        return 1;
    }

    lv_init();

    static std::vector<lv_color_t> render_buffer(kWidth * kRenderRows);
    static lv_disp_draw_buf_t draw_buffer;
    lv_disp_draw_buf_init(&draw_buffer, render_buffer.data(), nullptr, render_buffer.size());

    static lv_disp_drv_t display_driver;
    lv_disp_drv_init(&display_driver);
    display_driver.hor_res = kWidth;
    display_driver.ver_res = kHeight;
    display_driver.flush_cb = flush_display;
    display_driver.draw_buf = &draw_buffer;
    lv_disp_drv_register(&display_driver);

    static lv_indev_drv_t pointer_driver;
    lv_indev_drv_init(&pointer_driver);
    pointer_driver.type = LV_INDEV_TYPE_POINTER;
    pointer_driver.read_cb = read_pointer;
    lv_indev_drv_register(&pointer_driver);

    sc_pad::create_ui(print_command);

    DWORD previous_tick = GetTickCount();
    while (running) {
        MSG message{};
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }

        const DWORD current_tick = GetTickCount();
        lv_tick_inc(current_tick - previous_tick);
        previous_tick = current_tick;
        lv_timer_handler();
        Sleep(5);
    }

    return 0;
}
