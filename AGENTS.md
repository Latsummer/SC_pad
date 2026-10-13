# 仓库工作指南

## 范围与入口

本仓库包含几个独立项目，先确认任务涉及哪一部分：

- `src/`、`boards/`、`platformio.ini`：ESP32-S3 星际公民触摸控制面板。先读根目录 `README.md`。
- `simulator/`：共用固件 UI 的桌面模拟器。遵循该目录的 `AGENTS.md`。
- `scminer-local/`：矿物导航台，独立的纯静态网站/PWA。先读该目录的 `README.md` 和 `AGENTS.md`。
- `tools/`：静态站点数据处理与图形生成工具。遵循该目录的 `AGENTS.md`。
- `erkul-calculator-zh.user.js`：独立的 Erkul 浏览器翻译脚本，不是矿物站点资源。

根目录 Makefile 用于矿物数据同步与蓝图构建；`scminer-local/Makefile` 用于网站部署。执行命令前确认工作目录。

## 修改与验证

- 保留已有用户改动，提交前检查 `git status` 和差异，不加入缓存、构建产物或凭据。
- 固件改动使用 `pio run` 验证；UI 改动可先用桌面模拟器检查。真实 USB HID、触摸、LCD 和内存表现需要开发板验证。
- `src/sc_pad_ui.cpp` 为固件与模拟器共用界面；键位映射在 `src/sc_pad_keymap.cpp`。界面高亮代表本地操作记录，不代表游戏遥测。
- `lib/` 包含第三方库与驱动，避免为了业务改动批量修改或格式化这些文件。
- Erkul 脚本保持 userscript 元信息和启停功能；其既有约定是翻译界面，保留飞船、装备、厂商专名。调整翻译后检查动态界面、输入与链接是否正常，必要时更新 `@version`。
- 检查与改动相关的功能和 `git diff --check`，不为文档或简单样式改动添加重复实现的测试。
- 部署、提交、推送及创建 PR/MR 按用户当前授权执行。GitHub 远程使用 GitHub PR 流程；不要套用其他仓库的 CNB Issue、changeset 或版本发布约定。
