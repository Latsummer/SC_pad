# 桌面模拟器工作指南

先读 `README.md`。模拟器以 1024×600 运行固件共用的 `src/sc_pad_ui.cpp` 和 LVGL 字库。鼠标代替触摸，命令只打印到终端，不发送真实键盘输入。

在仓库根目录运行：

- macOS：`bash simulator/run.sh`，需要 CMake、SDL2 和 Apple Clang；Homebrew 与编译器架构需一致。
- Windows：`simulator\run.cmd`，需要 CMake 与 MinGW GCC/G++，使用原生 Win32 后端。

共用布局和交互改在 `src/`，后端差异改在 `main.cpp` / `main_sdl.cpp` 或 CMake 配置。保留 Windows 与 macOS 两种后端，不用平台独有行为替代共用 UI。

`build/` 是忽略的构建产物，不提交。模拟器只能验证布局、主题、字体、动画和按钮状态；真实 LCD 色彩、性能、内存、触摸和 USB HID 需开发板确认。
