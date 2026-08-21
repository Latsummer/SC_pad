cmake_minimum_required(VERSION 3.20)

project(sc_pad_simulator LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(PROJECT_ROOT "${CMAKE_CURRENT_LIST_DIR}/..")
file(GLOB_RECURSE LVGL_SOURCES CONFIGURE_DEPENDS
    "${PROJECT_ROOT}/lib/lvgl/src/*.c"
)

# Waveshare's bundled LVGL omits the examples directory, while LVGL's upstream
# CMake file creates an examples target unconditionally. Build only the core
# sources that both the firmware and simulator actually use.
add_library(lvgl STATIC ${LVGL_SOURCES})
add_library(lvgl::lvgl ALIAS lvgl)
target_include_directories(lvgl SYSTEM PUBLIC
    "${PROJECT_ROOT}/lib/lvgl"
    "${PROJECT_ROOT}/lib"
)
target_compile_definitions(lvgl PUBLIC
    LV_CONF_INCLUDE_SIMPLE
    LV_LVGL_H_INCLUDE_SIMPLE
)

if(WIN32)
    set(SIMULATOR_PLATFORM_SOURCE main.cpp)
else()
    set(SIMULATOR_PLATFORM_SOURCE main_sdl.cpp)

    find_package(SDL2 CONFIG REQUIRED)
    if(TARGET SDL2::SDL2)
        set(SIMULATOR_PLATFORM_LIBRARIES SDL2::SDL2)
    elseif(TARGET SDL2::SDL2-static)
        set(SIMULATOR_PLATFORM_LIBRARIES SDL2::SDL2-static)
    else()
        message(FATAL_ERROR "SDL2 was found, but it did not provide a supported CMake target.")
    endif()
endif()

add_executable(sc_pad_simulator
    ${SIMULATOR_PLATFORM_SOURCE}
    "${PROJECT_ROOT}/src/sc_pad_font_source_han_22.c"
    "${PROJECT_ROOT}/src/sc_pad_font_jetbrains_mono_12.c"
    "${PROJECT_ROOT}/src/sc_pad_font_jetbrains_mono_16.c"
    "${PROJECT_ROOT}/src/sc_pad_font_jetbrains_mono_20.c"
    "${PROJECT_ROOT}/src/sc_pad_logos.c"
    "${PROJECT_ROOT}/src/sc_pad_keymap.cpp"
    "${PROJECT_ROOT}/src/sc_pad_ui.cpp"
)

target_include_directories(sc_pad_simulator PRIVATE
    "${PROJECT_ROOT}/src"
    "${PROJECT_ROOT}/lib"
)

target_link_libraries(sc_pad_simulator PRIVATE
    lvgl::lvgl
)

if(WIN32)
    target_compile_definitions(sc_pad_simulator PRIVATE
        WIN32_LEAN_AND_MEAN
        NOMINMAX
    )
    target_link_libraries(sc_pad_simulator PRIVATE user32 gdi32)
else()
    target_link_libraries(sc_pad_simulator PRIVATE ${SIMULATOR_PLATFORM_LIBRARIES})
endif()
