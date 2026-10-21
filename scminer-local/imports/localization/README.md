# 翻译原始归档

- 按用户确认的游戏补丁版本分目录，原始文件 gzip 无损保存，不部署到网站。
- `global.ini.gz`：游戏内社区汉化全文；`global.manifest.json` 记录原文和压缩内容哈希。规范桥接子集在 `data/game-locale.zh-CN.json`。
- `scmdb-lang-*.json.gz`：公开 SCMDB 社区语言表的固定快照，旁边 manifest 记录来源 URL、版本、取回时间和哈希。
- 最新任务语言表在 `data/scmdb-mission-locale.zh-CN.json`；蓝图与 INI 英文桥接基线仍独立使用 `data/scmdb-locale.zh-CN.json`，不因为任务更新而替换蓝图翻译。
- 原文件名可为临时名称，项目统一按 `global.ini` 记录。来源版本由操作者确认，禁止仅重命名文件来声称匹配新补丁。

更新工具和校验流程见 [任务数据 SOP](../../docs/mission-data-sop.md)。
