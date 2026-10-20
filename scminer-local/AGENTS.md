# 矿物导航台工作指南

## 运行和目录

先读 `README.md`。`dist/` 是完整静态发布目录，没有后端，也没有 npm 构建步骤。在仓库根目录启动：

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory scminer-local/dist
```

- `dist/index.html`、`app.js`、`styles.css`：页面、矿物/扫描逻辑和响应式布局。
- `dist/blueprints.js`：制造蓝图筛选及材料反查。
- `dist/missions.html`、`missions.js`、`missions.css`：任务查询，手机底部四入口导航、筛选弹窗和全屏详情。
- `data/scmdb-missions.json` 和 `dist/missions/*.json` 是生成文件，执行根目录 `make missions-build`。原始压缩快照在 `imports/scmdb/missions/`；保留任务标识尾部空格。不得用翻译版本替代未知的任务源版本。
- `data/scminer-data.json`：矿物规范数据；`names.zh-CN.json`：中英文名称和别名。
- `data/scmdb-blueprints.json`：从本地用户导出的公开卡片生成的配方数据。
- `data/blueprint-slots.zh-CN.json`：槽位中文表。
- `imports/scmdb/`：保留原始快照及来源，不直接修改卡片文字。
- `dist/app-data.js`、`blueprints-data.js`、`blueprint-index.js`、`blueprint-locale.js` 是生成文件，优先修改对应数据或工具再生成。

`capture-tools/blueprints.html` 和 `capture-tools/missions.html` 也是生成文件，仅用于安装书签，不部署到正式网站。

## 更新矿物

以下命令在仓库根目录运行：

```sh
make sync
# 来源连接不稳定时，使用已验证的 HTTP/1.1、压缩传输和较长超时：
python3 tools/sync_scminer_data.py --transport curl --timeout 180
```

同步遵守当次 `robots.txt`，串行限速，只访问允许的公开页面与第一方静态脚本，不访问 `/api/`、账号、认证、合约或指南。只有提取和构建成功才替换页面数据。不要把超时当作数据已更新；以完成日志、来源版本与时间核对结果。

仅重新生成页面数据：

```sh
python3 tools/build_scminer_site_data.py --dataset scminer-local/data/scminer-data.json --locale scminer-local/data/names.zh-CN.json --output scminer-local/dist/app-data.js
```

右上角版本来源是 `game_data_version`，格式在 `dist/app.js` 的 `versionLabel` 赋值处。不要为显示版本而伪造来源版本。

## 更新蓝图与中文

SCMDB 的 `/data/` 禁止抓取。使用用户主动导出的公开渲染卡片，不直接获取其受限数据端点。执行 `make scmdb-capture` 生成助手，浏览器访问 `/blueprints.html` 保存书签；用户在 Fabricator 页面启动助手，缓慢滚动并导出 JSON。

将导出保存为 `imports/scmdb/scmdb-public-fabricator-*.json`，然后在仓库根目录执行 `make blueprints-build`。默认导入器按文件修改时间选择最近快照，**不是按文件名或采集时间**。需要确定输入时：

```sh
python3 tools/import_scmdb_public_capture.py scminer-local/imports/scmdb/具体文件.json
python3 tools/build_blueprint_site_data.py
```

- 导入前核对格式、来源、采集时间、卡片数量、未解析条目和槽位翻译；也可用 `--output /tmp/检查文件.json` 先验证。
- 导入器使用本地 `data/scmdb-locale.zh-CN.json` 翻译表与 `blueprint-name-overrides.zh-CN.json` 补充表，分别保存 `name_en`、`name_zh`，`name` 保留捕获标题。缺失和歧义保留英文并记录在规范数据的 `translation_report`；中文导出保留其中文标题，仅在唯一匹配时补英文。
- 翻译表和补充表版本必须匹配矿物数据版本；这不能证明无版本字段的捕获快照使用了同一游戏版本，导出时仍需人工确认。更新翻译表后重新导入并构建，执行 `python3 tools/check_scminer_site.py` 和 `python3 tools/test_scmdb_locale.py`。
- 社区翻译参考 `https://github.com/Walkersifolia/SCMDB_zh_cn`。在 SCMDB Fabricator URL 附加 `lang=https://raw.githubusercontent.com/Walkersifolia/SCMDB_zh_cn/main/lang-zh_CN-live.json` 可加载中文；确认翻译文件和页面游戏版本相同，再采集。
- 不以捕获数量证明完整性；比较不同语言快照时，名称可能合并或变化，应核对配方和材料，保留原始快照。
- 新槽位先补中文表再构建。`--expected-count` 的默认值是历史参考值，不是最新总数保证。
- 配方数据不包含品质或材料引起的最终属性变化，不能用采矿抗性、密度或扫描信号推导制造属性。

## UI、缓存和部署

- 保持“已选矿物”和其他筛选分离，重置筛选不能清除已选矿物。
- iOS 主屏幕 PWA 使用 `viewport-fit=cover` 和透明状态栏，内容容器必须保留 `env(safe-area-inset-top)`；横屏考虑左右安全区，底部导航保留底部安全区。顶部浮层优先锚定触发按钮，不使用忽略安全区的固定 top。
- 手机也应能看到版本信息；页头在小屏分行，长版本可换行。验证窄屏没有横向溢出，以及主题、三种模式、筛选与详情操作。
- 发布资源改变后更新 `dist/sw.js` 的 `CACHE_NAME`，使已安装 PWA 获取新资源。矿物同步自动更新缓存名；蓝图或 UI 改动需另行更新。不要重复使用对应旧内容的缓存名。
- 已获部署授权时，在 `scminer-local/` 执行 `make deploy`（正式）或 `make preview`（预览）。当前 Makefile 目标是 EdgeOne 项目 `scminer`、`overseas`；以实际配置和 CLI 输出为准。
- `.sync-cache/`、`dist/.edgeone/` 属于缓存/构建产物，不提交。检查部署成功日志，并尝试验证线上资源；HTTP 401 不能视为已验证公网可用。
