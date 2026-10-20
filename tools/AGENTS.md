# 工具维护指南

这些工具通常从仓库根目录执行，使用 Python 3 标准库；SCMDB 采集助手是浏览器 JavaScript。先确认调用入口，避免把整个目录当作同一个项目。

## 数据流水线

- `sync_scminer_data.py`：唯一的 SCMINER 网络同步入口，检查 robots、串行限速、保存快照，临时目录提取构建成功后才替换数据；支持 `--dry-run`、`--transport curl`、`--timeout`。
- `extract_scminer_data.py`：只读取本地矿物脚本和地点 HTML，生成规范 JSON 和 CSV。
- `update_scminer_locale.py`：更新名称模板，保留已完成翻译；不要改变稳定 ID。
- `build_scminer_site_data.py`：矿物规范数据与名称表生成浏览器数据。
- `scmdb_public_capture.js`、`build_scmdb_capture_bookmarklet.py`：只采集用户正在浏览的公开渲染卡片，生成书签助手。改变 JS 后执行 `make scmdb-capture`。
- `scmdb_missions_capture.js`：任务试采助手，只读取公开 DOM 的列表和 Overview/Combat/Requirements，支持用户启动的限速批次点击当前列表卡片和公开标签。执行 `make scmdb-missions-capture` 生成说明页，`node tools/test_scmdb_missions_capture.cjs` 验证；不读取内部状态或受限数据目录，Calculator 只采静态奖励、等级 XP 差额与规则，不采集 Community，不点击收藏、完成或提交操作。
- `import_scmdb_public_capture.py`：公开卡片图标映射以实际装备核对，`🔰` 为护盾、`🚀` 为量子驱动、`💠` 为采矿模组，不按 emoji 字面含义猜分类。仅导入本地 JSON；默认按 mtime 选快照。通过 `scmdb_locale.py` 的本地翻译表填入中英文标题，歧义不自动选译名。
- `build_blueprint_site_data.py`：检查槽位翻译，生成蓝图数据、索引和 locale。
- `scmdb_locale.py`：版本校验、双向精确名称匹配和有类型/尺寸条件的人工译名覆盖。
- `build_mission_site_data.py`：只读本地公开任务快照，生成规范任务、翻译报告、保守差异报告及列表／32 个详情分片。源游戏版本未知时保持 null，缺失数值不设为零，任务原始标识保留空格；`test_mission_site_data.py` 验证完整性、归档和生成一致性。
- `test_scmdb_locale.py`：英文、中文、歧义、回退和版本不匹配回归验证，加入 PR 检查。
- `generate_neumorphic.py`：固件图形相关工具，和网站数据更新无关。

修改网络逻辑时保留访问边界、限速、错误可见性与构建前暂存机制。来源网络慢时优先调整明确的超时和传输参数，不绕过访问限制，不用旧缓存冒充新同步成功。

验证解析器应检查代表性卡片、材料数量、稳定矿物关联、未解析条目和缺失翻译；网络请求改动可用 mock 检查超时、失败回退和后续传输复用。实际同步需用完成日志和生成数据确认。生成发布资源后按 `scminer-local/AGENTS.md` 更新缓存版本。
