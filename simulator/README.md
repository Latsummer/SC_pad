# SC PAD 桌面模拟器

模拟器以 1024×600 运行与 ESP32 固件相同的 LVGL 8.4 界面。鼠标等价于触摸，按钮命令只打印到终端，不会向电脑发送真实键盘输入。

## Windows

依赖：

- CMake
- PATH 中可用的 MinGW GCC/G++

在仓库根目录运行：

```text
simulator\run.cmd
```

也可以在资源管理器中双击 `run.cmd`。Windows 后端使用原生 Win32 API，不需要 SDL 或 Docker。

## macOS

首次使用时安装构建工具和 SDL2：

```bash
xcode-select --install
brew install cmake sdl2
```

在仓库根目录运行：

```bash
bash simulator/run.sh
```

CMake 会自动寻找 Homebrew 提供的 SDL2，并使用 Apple Clang 构建模拟器。Apple Silicon 和 Intel Mac 使用相同的命令，但 Homebrew、终端和编译器必须采用一致的 CPU 架构。

## 适用范围

桌面模拟器适合开发颜色、布局、字体、页面切换、按钮状态和动画。LCD 实际色彩、触摸校准、性能、内存占用和 USB HID 仍需在开发板上确认。

首次运行会编译 LVGL，之后只重新编译发生变化的文件。构建结果位于被 Git 忽略的 `simulator/build/`。
