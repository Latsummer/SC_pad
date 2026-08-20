# SC Pad

基于微雪 ESP32-S3-Touch-LCD-7B 的《星际公民》触摸控制面板。

## 当前里程碑

第一个可运行版本已经打通以下链路：

```text
GT911 触摸屏 -> LVGL 按钮 -> ESP32-S3 原生 USB HID -> Windows 键盘输入
```

当前界面采用暗色控制台风格，包含顶部状态栏、4×3 飞行功能按钮和底部五个功能区入口。中文按钮采用 22px 思源黑体精简字库，英文标题和辅助信息使用 Montserrat。每个功能按钮暂时都是安全的测试按钮：点击一次，通过原生 USB 向电脑发送并释放一次 `A` 键。

按钮演示三种交互模型：瞬时按钮只显示按压反馈；切换按钮激活后保持橙黄色；起落架按钮会闪烁约 2 秒表示执行过程，随后切换本地状态。当前状态完全保存在面板本地，不代表游戏内的真实状态。

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

烧录完成后，将数据线连接到开发板的原生 `USB` 接口。Windows 应将设备识别为标准键盘；打开记事本并点击任一功能按钮，每次应输入一个小写 `a`。底部导航目前只用于展示样式，不会发送按键或切换页面。

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
