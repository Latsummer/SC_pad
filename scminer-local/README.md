# 矿物导航台 / SC Mining Atlas

一个无需后端的 Star Citizen 矿物与制造配方查询工具。发布内容位于
`dist/`，可作为静态网站或 PWA 部署。

## 当前功能

- 矿物中英文、别名搜索，以及多矿共同分布地点查询。
- 船采扫描值反查：按“单块特征值 × 同类岩石数量”列出精确或最近候选。
- 矿石价格、采矿属性，以及双向伴生矿关系。
- 制造蓝图模式：从矿物反查可制造蓝图；支持蓝图名称、多个矿物、制造大类、细分类型、槽位和尺寸筛选。
- 矿物详情和扫描结果可跳到同页的制造蓝图模式，并自动带入矿物条件：
  `index.html?mode=blueprints&material=<mineral-id>`。
- 矿物名称以“中文（英文）”展示；制造槽位只显示中文，英文原名仍作为稳定数据键保留。

## 不包含的能力

当前 SCMDB 导入只包含配方、材料槽位、用量和制造时间。它**不包含**
“材料放在某槽位后怎样改变武器/组件最终属性”、品质滑块或属性计算公式。
不要用矿石的采矿抗性、密度或扫描信号推导制造属性。

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
| `tools/` | 数据同步、导入和浏览器数据构建脚本。 |

## 更新矿物数据

在仓库根目录执行：

```sh
make sync
```

该流程会先读取并遵守 `scminer.rocks/robots.txt`，以串行、限速方式读取
允许的公开页面及必要的第一方静态资源。它不会请求 `/api/`、登录、账号、
合约或指南路径。同步后会更新矿物数据、浏览器数据和 Service Worker 缓存版本。

## 更新制造蓝图

SCMDB 的 `robots.txt` 禁止抓取其 `/data/` 路径，因此蓝图数据采用**手动发起、
只记录已在公开页面渲染的卡片**的流程：

1. 执行 `make scmdb-capture`，打开 `dist/scmdb-capture.html`，按页面说明保存书签。
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
