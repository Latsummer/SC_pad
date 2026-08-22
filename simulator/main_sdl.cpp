#define SDL_MAIN_HANDLED
#include <SDL.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <vector>

#include "lvgl.h"
#include "sc_pad_keymap.h"
#include "sc_pad_ui.h"

namespace {

constexpr int kWidth = 1024;
constexpr int kHeight = 600;
constexpr int kRenderRows = 64;

bool running = true;
bool frame_dirty = true;
bool pointer_down = false;
lv_point_t pointer_position = {0, 0};
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

    frame_dirty = true;
    lv_disp_flush_ready(display);
}

void read_pointer(lv_indev_drv_t *, lv_indev_data_t *data)
{
    data->point = pointer_position;
    data->state = pointer_down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

void handle_events()
{
    SDL_Event event{};
    while (SDL_PollEvent(&event)) {
        switch (event.type) {
            case SDL_QUIT:
                running = false;
                break;
            case SDL_MOUSEBUTTONDOWN:
                if (event.button.button == SDL_BUTTON_LEFT) {
                    pointer_down = true;
                    pointer_position = {
                        static_cast<lv_coord_t>(event.button.x),
                        static_cast<lv_coord_t>(event.button.y),
                    };
                }
                break;
            case SDL_MOUSEBUTTONUP:
                if (event.button.button == SDL_BUTTON_LEFT) {
                    pointer_down = false;
                    pointer_position = {
                        static_cast<lv_coord_t>(event.button.x),
                        static_cast<lv_coord_t>(event.button.y),
                    };
                }
                break;
            case SDL_MOUSEMOTION:
                pointer_position = {
                    static_cast<lv_coord_t>(event.motion.x),
                    static_cast<lv_coord_t>(event.motion.y),
                };
                break;
            default:
                break;
        }
    }
}

void print_command(sc_pad::Command command, void *)
{
    constexpr std::array<const char *, static_cast<std::size_t>(sc_pad::Command::Count)> names = {
        "GEAR", "DOORS", "MINING MODE", "VTOL", "LIGHTS", "QUANTUM",
        "SCAN", "MAP", "POWER", "ENGINES", "REQUEST ATC", "LEAVE SEAT",
        "SHIELD UP", "SHIELD FRONT", "SHIELD LEFT", "RESET SHIELDS",
        "SHIELD RIGHT", "SHIELD REAR", "SHIELD DOWN", "POWER WEAPONS",
        "POWER ENGINES", "POWER SHIELDS", "RESET POWER",
        "LASER POWER -", "LASER POWER +", "MINING MODULE 1", "MINING MODULE 2",
        "MINING MODULE 3", "COLLECT MODE", "EXIT MINING", "TOGGLE ORIENTATION",
    };
    const auto index = static_cast<std::size_t>(command);
    const sc_pad::KeyBinding &binding = sc_pad::key_binding_for(command);
    std::cout << "[SC PAD] command: " << names.at(index)
              << " [" << sc_pad::input_mode_name(binding.mode)
              << " " << binding.display_name << "]" << std::endl;
}

} // namespace

int main()
{
    SDL_SetMainReady();
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) != 0) {
        std::cerr << "Could not initialize SDL2: " << SDL_GetError() << std::endl;
        return 1;
    }

    SDL_Window *window = SDL_CreateWindow(
        "SC PAD - LVGL 8.4 Desktop Simulator",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        kWidth,
        kHeight,
        SDL_WINDOW_SHOWN);
    if (window == nullptr) {
        std::cerr << "Could not create the SDL2 window: " << SDL_GetError() << std::endl;
        SDL_Quit();
        return 1;
    }

    SDL_Renderer *renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED);
    if (renderer == nullptr) {
        renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE);
    }
    SDL_Texture *texture = renderer == nullptr
                               ? nullptr
                               : SDL_CreateTexture(renderer, SDL_PIXELFORMAT_ARGB8888,
                                                   SDL_TEXTUREACCESS_STREAMING, kWidth, kHeight);
    if (renderer == nullptr || texture == nullptr) {
        std::cerr << "Could not create the SDL2 renderer: " << SDL_GetError() << std::endl;
        if (texture != nullptr) SDL_DestroyTexture(texture);
        if (renderer != nullptr) SDL_DestroyRenderer(renderer);
        SDL_DestroyWindow(window);
        SDL_Quit();
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

    uint32_t previous_tick = SDL_GetTicks();
    while (running) {
        handle_events();

        const uint32_t current_tick = SDL_GetTicks();
        lv_tick_inc(current_tick - previous_tick);
        previous_tick = current_tick;
        lv_timer_handler();

        if (frame_dirty) {
            SDL_UpdateTexture(texture, nullptr, framebuffer.data(), kWidth * sizeof(uint32_t));
            SDL_RenderClear(renderer);
            SDL_RenderCopy(renderer, texture, nullptr, nullptr);
            SDL_RenderPresent(renderer);
            frame_dirty = false;
        }

        SDL_Delay(5);
    }

    SDL_DestroyTexture(texture);
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
