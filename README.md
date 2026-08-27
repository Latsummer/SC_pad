# SC Pad

基于微雪 ESP32-S3-Touch-LCD-7B 的《星际公民》触摸控制面板。

## 当前里程碑

第一个可运行版本已经打通以下链路：

```text
GT911 触摸屏 -> LVGL 按钮 -> ESP32-S3 原生 USB HID -> Windows 键盘输入
```

当前界面采用多船厂主题的控制台风格，包含顶部状态栏、飞行/飞船/采矿页面和底部功能区入口。英文使用 JetBrains Mono，中文按钮采用 22px 思源黑体精简字库。面板通过原生 USB HID 发送可配置的键盘输入；本地高亮仅表示面板自己的操作记录，不代表游戏遥测状态。

HID 输出支持三种基础模式：短按（按下后约 45ms 松开）、长按（当前约 1.5 秒）和组合键（修饰键预留 45ms 后按下目标键，再统一松开）。快速点击时，短按与组合键可在当前输入后缓存最多两条；每条等待超过 250ms 自动丢弃，队列满时丢弃最新点击。长按不排队，而是立即执行并清空待发送项。默认映射集中在 `src/sc_pad_keymap.cpp`：起落架 `N`、舱门 `/`、采矿 `M`、导弹 `Left Ctrl + G`、灯光 `L`、量子长按 `B`、扫描 `V`、星图 `F2`、电源 `U`、引擎 `I`、ATC `Left Alt + N`、离席长按 `Y`。SHIP 页的护盾控制使用数字小键盘 `Num 2/4/5/6/7/8/9`，电源分配使用 `F5–F8`。

显示方向默认固定为原生 0° 输出，以使用更快的双缓冲路径。若确实需要在 SYSTEM 页动态切换 180°，将 `platformio.ini` 中的 `SC_PAD_ENABLE_DYNAMIC_ROTATION` 改为 `1` 后重新编译；原有保存的旋转偏好不会被清除。

## 开发环境

- Visual Studio Code
- PlatformIO Core 6.1.19 或更新版本
- pioarduino `platform-espressif32` stable
- Arduino-ESP32 3.3.11
- LVGL 8

## 编译与烧录

烧录时将数据线连接到开发板的 `USB TO UART` 接口，并把 UART 选择开关拨到 `UART1`：

```powershell
pio run
pio run --target upload
```

当前 `platformio.ini` 使用 `COM8`。如果系统分配了其他端口，请修改：

```ini
upload_port = COM8
monitor_port = COM8
```

烧录完成后，将数据线连接到开发板的原生 `USB` 接口。Windows 应将设备识别为标准键盘。请先在游戏里确认或按需要修改 `src/sc_pad_keymap.cpp` 中的映射；`UNBOUND` 项不会发送任何键，避免误触。

## 桌面模拟器

桌面模拟器与开发板共用 `src/sc_pad_ui.cpp` 和同一份 LVGL 8.4 字库，可用于调整颜色、布局、字体、动画、按钮交互和功能分区。模拟器只在终端打印命令，不会向电脑发送真实键盘输入。

Windows：

```text
simulator\run.cmd
```

macOS 首次安装依赖后运行：

```bash
xcode-select --install
brew install cmake sdl2
bash simulator/run.sh
```

Windows 使用原生 Win32 后端，macOS 使用 SDL2。LCD 实际色彩、触摸校准、性能和 USB HID 仍需在开发板上确认。详细说明见 `simulator/README.md`。

## 项目结构

```text
boards/                       微雪开发板的 PlatformIO 板卡定义
lib/                          LCD、GT911、IO 扩展器和 LVGL 相关驱动
src/main.cpp                  ESP32 硬件和 USB HID 入口
src/sc_pad_ui.cpp             开发板与模拟器共用的 LVGL 界面
src/sc_pad_font_source_*.c    精简中文字体
simulator/                    Windows/macOS 桌面模拟器
platformio.ini                PlatformIO 构建配置
```

## 硬件注意事项

ESP32-S3 的 GPIO19/20 在该开发板上由 USB 和 CAN 共用。当前程序通过 IO 扩展器选择 USB，因此运行本示例时不能同时使用板载 CAN。
