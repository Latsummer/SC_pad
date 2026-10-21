# SCMDB 蓝图筛选实测

2026-10-21，公开 Fabricator 界面，版本 `4.10.2-live.12913470`，页面总数 1618。仅通过公开按钮和渲染 DOM 检查；不是完整组合覆盖保证，已据此接入采集助手的可选自动分类模式。

## 实测路径

| 路径 | 页面显示数量 |
| --- | ---: |
| Armour | 926 |
| Armour → Light | 254 |
| Armour → Light → Arms | 63 |
| Weapons | 175 |
| Weapons → Rifle | 32 |
| Quantumdrive | 57 |
| Quantumdrive → Military → A | 3 |

量子驱动打开 VK-00 详情再点击详情内 Back to list，类别、Military、A 均保留。

## 组件分类

| 类别 | 数量 | 可见细分组（不含厂商、材料和通用尺寸） |
| --- | ---: | --- |
| Cooler | 75 | Component Class、Grade、Subtype Size0–Size4 |
| Mininglaser | 17 | Subtype Size0–Size2 |
| Mining Module | 5 | Subtype Active / Passive |
| Ore Pod | 5 | Subtype — |
| Powerplant | 75 | Component Class、Grade、Subtype Size0–Size4 |
| Quantumdrive | 57 | Component Class、Grade、Subtype Size1–Size4 |
| Radar | 60 | Component Class、Grade、Subtype Size0–Size4 |
| Refuelling | 8 | Subtype Nozzle |
| Salvage | 5 | Subtype Large / Medium / Small |
| Shield | 62 | Subtype Size0–Size4 |
| Shipweapon | 96 | Subtype Ballistic / Distortion / Laser / Neutron / Tachyon |
| Tractorbeam | 12 | Subtype Size1–Size3 |

这些是当前页面实际显示的选项，不以专业常识补出不存在的过滤器。护甲另有 Armor Class（Light / Medium / Heavy）、Armor Slot（Helmet / Torso / Arms / Legs / Backpack / Undersuit）；武器有 Ammo Type、Subtype（Lmg、—、Pistol、Rifle、Shotgun、Smg、Sniper）。不是所有组合均非空。

## 自动分类采集设计依据

- 不需用户枚举所有组合。预先定义按类别的分组顺序，从当前 `.fab-filter-group` 读取可见选项，逐步应用并检查选中状态。
- 护甲按类型 → 轻中重 → 部位分组；Backpack、Undersuit 需另外验证无重量组的覆盖，不能只遍历三种重量就宣称护甲完整。
- 武器按 Subtype，数量仍多时再按 Ammo Type 分组；组件按实际存在的类别、等级或子类型分组，小列表可直接处理。
- 顶级 Type 在本次测试中为单选，点击另一类别会切换；普通筛选提示为 include / exclude / off 三态，不能用盲目重复点击代替清除。组内精确定位，避免同名 Medium、Laser、Undersuit 等误选。
- 观察到全量清除后渲染较重，尽量切换类别、清除必要子组，不在每个小组之间重新展示全量列表。
- 每个叶分组保存路径、页面数量、卡片和完成配方 ID；空组跳过，按配方 ID 去重。保留没有归入已知子分组的剩余条目，避免遗漏。
- 返回详情后必须复核筛选和列表身份，状态变化则暂停。保留现有“当前筛选列表采集”模式。

## 自动分类模式

采集范围选择“自动分类分组（每组优先不超过 100 个）”。仅当当前显示列表超过 100 个才继续选择子筛选；已经较小的组不强行细分。没有可用细分条件时允许超过 100 个，导出 `grouped_runs[].warnings` 说明原因。分组以实际显示卡片数判断，不把“只采本组前 100 个”冒充列表已变小。

模式启动时清除旧搜索和筛选并记录全量已渲染卡片。之后差量清除必要子筛选，保留共同父筛选。`本批蓝图数` 控制本次全部分组合计处理量；停止／达到数量后，下次重新遍历分组并利用完成映射跳过已有详情。分组路径、显示数量、目标、批次限制和未分类文本保留在统一导出中。无法识别的页面布局或被外部改变的列表会停止提示。未归入轻中重的背包／内甲，通过其他可用分组补查。

回归验证：`node tools/test_scmdb_blueprint_groups.cjs`，覆盖 100 个目标、小组不细分、动态筛选、无重量分类条目、不可细分超大组、续采、总批次上限和停止。
