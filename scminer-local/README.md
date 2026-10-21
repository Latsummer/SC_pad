# 星航助手 / 星际公民随身助手

一个无需后端的 Star Citizen 资源、制造蓝图和任务查询工具。发布内容位于
`dist/`，可作为静态网站或 PWA 部署。

## 当前功能

- 矿物中英文、别名搜索，以及多矿共同分布地点查询。
- 船采扫描值反查：按“单块特征值 × 同类岩石数量”列出精确或最近候选。
- 矿石价格、采矿属性，以及双向伴生矿关系。
- 制造蓝图模式：从矿物反查可制造蓝图；支持蓝图名称、多个矿物、制造大类、细分类型、槽位和尺寸筛选。
- 矿物详情和扫描结果可跳到同页的制造蓝图模式，并自动带入矿物条件：
  `index.html?mode=blueprints&material=<mineral-id>`。
- 矿物名称以“中文（英文）”展示；制造槽位只显示中文，英文原名仍作为稳定数据键保留。
- 任务档案：1765 个已采集任务的中英文名称搜索，星系／类型／发布方筛选、蓝图奖励／共享／合法快捷筛选、报酬与声望排序；查看描述、接取条件、战斗资料和单人声望次数估算。手机使用底部导航、筛选弹窗和全屏详情。

## 制造成品与品质

蓝图列表已接入 1618 个带稳定配方 ID 的完整详情。点击“制造详情”查看成品参数、材料品质影响，以及最低／基础／增益中点／最高四组实际采集结果；无品质影响的配方显示固定属性。详情按需加载，手机可切换“成品属性”和“材料品质”。

材料槽位支持独立品质滑块与数字输入；匹配四组来源预设的规则用于实时估算，并显示“估算值”。手机在滑块下直接展示受影响的成品参数。规则不匹配的指标保留预设观察值，不参与预测。供电格数按阶梯规则展示，源页面带异常标记的规则保留提示。不要用矿石的采矿抗性、密度或扫描信号推导制造属性。

## 目录说明

| 路径 | 作用 |
| --- | --- |
| `dist/index.html` | 主页面，三个模式：矿物与分布、扫描值反查、制造蓝图。 |
| `dist/app.js` | 矿物、地点和扫描查询逻辑。 |
| `dist/blueprints.js` | 制造蓝图筛选与材料反查逻辑。 |
| `dist/app-data.js` | 浏览器使用的矿物数据与中英文名称。 |
| `dist/blueprints-data.js` | 浏览器使用的蓝图配方数据。由构建脚本生成。 |
| `data/scminer-data.json` | SCMINER 矿物数据的规范来源。 |
| `data/names.zh-CN.json` | 可维护的矿物与地点双语名称表。 |
| `data/scmdb-blueprints.json` | 从用户导出的 SCMDB 公开页面卡片解析出的蓝图数据。 |
| `data/blueprint-slots.zh-CN.json` | 制造槽位英文到中文的对照表。新增槽位必须在此补译。 |
| `imports/scmdb/` | 用户从 SCMDB 公开页面导出的原始快照。 |
| `capture-tools/` | 蓝图与任务采集书签安装页，本机使用，不随网站部署。 |
| `tools/` | 数据同步、导入和浏览器数据构建脚本。 |

## 更新矿物数据

在仓库根目录执行：

```sh
make sync
```

该流程会先读取并遵守 `scminer.rocks/robots.txt`，以串行、限速方式读取
允许的公开页面及必要的第一方静态资源。它不会请求 `/api/`、登录、账号、
合约或指南路径。同步后会更新矿物数据、浏览器数据和 Service Worker 缓存版本。

如果同步遇到网络超时或连接被远端关闭，脚本会尝试使用系统 `curl` 继续请求（需要本机可用）。终端会显示当前请求地址；所有数据提取与构建成功后才会替换页面数据。

也可以直接使用 curl 请求，跳过 Python 网络连接：

```sh
python3 tools/sync_scminer_data.py --transport curl --timeout 180
```

单次请求默认允许等待 180 秒，可通过 `--timeout` 调整；curl 连接超时为 60 秒，失败最多重试两次，并使用 HTTP/1.1 和压缩传输以减少传输问题。

## 更新制造蓝图

任务信息目前提供独立的试采助手：在仓库根目录执行 `make scmdb-missions-capture`，
打开 `capture-tools/missions.html`，按说明安装书签并手动浏览任务详情。
导出的 JSON 放入 `imports/scmdb/missions/`；最终基线已压缩归档，并由本地构建生成网站任务档案。
离线采集回归检查：`node tools/test_scmdb_missions_capture.cjs`（仓库根目录运行）。

书签安装页可以直接用浏览器打开本地 HTML，无需服务；也可在仓库根目录执行
`make scmdb-serve`，访问 `http://127.0.0.1:8766/missions.html`。
端口可用 `make scmdb-serve SCMDB_PORT=8767` 调整。保存书签后，采集发生在
SCMDB 页面，不依赖安装页或本机 HTTP 服务。当前尚未部署此安装页。

SCMDB 的 `robots.txt` 禁止抓取其 `/data/` 路径，因此蓝图数据采用**手动发起、
只记录已在公开页面渲染的卡片**的流程：

1. 执行 `make scmdb-capture`，打开 `capture-tools/blueprints.html`，按页面说明保存书签。
2. 在 SCMDB 的公开 Fabricator 页面手动启动书签，缓慢滚动至列表末尾并导出 JSON。
3. 将导出文件放入 `imports/scmdb/`。
4. 在仓库根目录执行：

   ```sh
   make blueprints-build
   ```

最后一步只读取本地导出：导入最新快照、验证每个槽位均有中文翻译，并生成
`dist/blueprints-data.js`、`dist/blueprint-index.js` 和
`dist/blueprint-locale.js`。它不会向 SCMDB 发起网络请求。

## 静态发布与离线缓存

`dist/` 是完整的发布目录。`manifest.webmanifest` 与 `sw.js` 提供 PWA 元数据
和离线缓存。通过 HTTP(S) 访问时 Service Worker 才会生效；直接打开本地
`index.html` 仍可使用查询功能，但浏览器通常不会启用离线缓存。

每次修改发布资源后，应更新 `dist/sw.js` 中的 `CACHE_NAME`，避免已安装的 PWA
继续读取旧资源。矿物同步会自动处理矿物数据变更；蓝图构建或界面改动后的缓存
版本需要一并更新。

## 接手时的检查清单

1. 执行对应的数据构建命令后，确认脚本没有报告缺少槽位翻译或未解析卡片。
2. 对矿物名称新增翻译时编辑 `data/names.zh-CN.json`，不要改稳定 ID。
3. 任何 SCMDB 新增槽位，先补 `data/blueprint-slots.zh-CN.json`，再重新构建。
4. 保持蓝图页“已选矿物”与“其他筛选条件”分离：重置筛选不能清除已选矿物。
5. 新增制造属性功能前，先取得能证明“物品、槽位、材料、品质、属性变化”的
   独立公开数据源；不要依据配方文本猜测数值。

## 蓝图名称翻译

导入使用本地社区翻译表 `data/scmdb-locale.zh-CN.json`，来源为
[SCMDB_zh_cn](https://github.com/Walkersifolia/SCMDB_zh_cn)，当前快照提交为
`bff507d0bedf34d5786b2f0664fa1eb0af6328af`、版本 `4.10.2-live.12881860`。
文件保留上游键与内容；游戏数据版权归 Cloud Imperium Games，翻译来源保留社区署名。
导入过程不请求网络，来源 URL、文件 SHA-256、版本记录在 `translation_report.locale`。

推荐导出英文页面：导入器保存原始 `name` 和 `name_en`，用唯一匹配的中文填充
`name_zh`，页面优先展示中文且支持中英文搜索。中文导出也兼容；只有唯一反向
匹配时才补英文，不猜测同名物品。未翻译或存在多个候选时保留英文，详情见
[中文翻译检查报告](data/scmdb-blueprints.translation-report.md)；程序用明细同时保存在
`data/scmdb-blueprints.json` 的 `translation_report.issues`。

`data/blueprint-name-overrides.zh-CN.json` 用于人工确认译名，按英文名配置
`zh`，可加 `type_group` 和 `size` 条件；不要仅凭同名地点或矿物翻译装备名称。
当前仅确认 Mercury 的 S3 冷却器译名；Zephyr 仍有歧义，保留英文。

更新社区翻译时，手动下载新的 LIVE JSON 覆盖本地表，更新 `scmdb_locale.py`
的 `SOURCE_URL` 至实际上游提交，核对其版本以及补充表版本，再重新导入快照并构建。
翻译版本需与本地矿物游戏版本相同；捕获文件没有游戏版本字段，仍需在导出页面
人工核对版本，不能把此校验当作快照版本证明。

```sh
python3 tools/import_scmdb_public_capture.py scminer-local/imports/scmdb/具体文件.json
python3 tools/build_blueprint_site_data.py
python3 tools/check_scminer_site.py
python3 tools/test_scmdb_locale.py
```

最后更新 `dist/sw.js` 的缓存版本。PR 检查会验证版本、译名和报告是否与本地表一致。

## 任务档案构建与数据边界

在仓库根目录执行 `make missions-build`，默认读取已归档的最终英文快照。
`tools/build_mission_site_data.py --capture 路径.json.gz` 可指定另一份本地 JSON 或 GZIP 快照，
`--previous 旧的scmdb-missions.json` 可生成新增、变化和缺失候选报告；缺失不等于确认移除。
不完整任务快照会拒绝构建，不覆盖已有目录。更新前保留旧版本规范目录及原始快照。

- `data/scmdb-missions.json`：规范任务目录，保留原始标识（含尾部空格），缺失数值为 null。
- `data/scmdb-missions.translation-report.json`：名称缺译／歧义报告。只选唯一匹配；若译名会丢失已经展开的地点／等级，保留英文。描述按去标签、统一换行后的最长精确匹配翻译，保留匹配键。
- `dist/missions/index.json`：轻量列表和搜索数据；`details-桶号-内容摘要.json`：32 个按需详情分片。任务页首次不加载全部详情，已有矿物页也不加载任务目录。
- `dist/missions.html`、`missions.js`、`missions.css`：任务页，复用现有主题及底部四入口导航。URL 的 `id` 支持直接打开任务，奖励蓝图可按同名查询本地配方。

当前任务版本按用户确认的补丁版本标为 4.10.2，来源清单记录确认依据，不声称完整 build 号。新快照未确认版本时保留未知；不拿翻译版本自动代填。
模板变量、采集不到的折叠内容及蓝图跨版本差异不猜补。声望规划只按基础 XP 估算单人次数，不模拟未知的共享或特殊阵营分配规则。
任务列表加入离线壳缓存；详情首次打开时下载并缓存，未访问过的分片离线时不保证可用，页面提供重试。

验证：`python3 tools/test_mission_site_data.py`、`python3 tools/check_scminer_site.py`，发布资源变化后更新 Service Worker 缓存名。

PR checks 会把中文报告显示在 Actions 运行的 Summary（摘要）中，并上传
`blueprint-translation-report-运行编号-重试编号` 附件，保存 30 天。
如果校验失败，摘要会注明提交中的报告可能需要重新生成，不会把旧报告标记为通过。

## 游戏内汉化 global.ini

任务中文可叠加用户提供的 `global.ini`，文件名不参与解析，临时文件名也可以。原文件压缩归档在 `imports/localization/4.10.2/global.ini.gz`，来源为用户提供的社区游戏内汉化，并非官方译文。规范翻译在 `data/game-locale.zh-CN.json`；不会将完整 INI 部署到网站。

```sh
python3 tools/import_game_locale.py /path/to/global.ini --game-version 4.10.2
make missions-build
```

导入支持 UTF-8 BOM、CRLF、`,P` 键后缀，按第一个等号分割，保留来源 SHA-256。通过 SCMDB 的英文语言键桥接，唯一的 INI 译文优先，歧义回退现有表；动态任务变量转换为占位符，不猜测实际地点。描述中的“任务蓝图奖励”附录会剥离，奖励仍以采集数据为准。游戏版本和英文桥接表版本不匹配时构建会停止。完整 INI 可供后续地点、装备和阵营翻译使用，目前仅接入可桥接的任务翻译。

站点图标源与生成脚本：`tools/generate_site_icons.py`（Pillow），运行后生成 SVG、192/512 PNG 与 iPhone 180px 主屏幕图标。

任务数据与翻译的定期更新流程见 [任务更新 SOP](docs/mission-data-sop.md)，包含原始快照归档、版本核对、翻译待办、人工审核和发布前验证。

目录职责与归档保留策略见 [数据目录说明](docs/data-layout.md)。

蓝图制造品质属性正进行独立采样，入口仍是蓝图采集书签。采集步骤与后续计算接入方案见 [蓝图品质方案](docs/blueprint-quality-plan.md)。网站已接入预设结果与材料品质规则；已加入材料独立滑块和经预设校验的本地估算。

从固定全量详情基线重新构建：`make blueprint-quality-build`。完整采集与定期更新见 [蓝图品质方案](docs/blueprint-quality-plan.md)；新详情目录优先于旧卡片目录生成网站列表，旧原始卡片与规范文件继续保留用于追溯。
