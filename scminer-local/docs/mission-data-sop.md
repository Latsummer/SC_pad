# 任务数据与翻译更新 SOP

所有命令从仓库根目录运行。采集、构建、审核、部署是独立步骤；构建不提交、不部署。不要根据文件名推断游戏版本，也不要访问 SCMDB 受限数据端点。

## 1. 采集与归档

1. 确认游戏补丁版本、原版英文界面以及筛选范围。记录是否隐藏活动任务；采集数量仅代表当前导出的列表。
2. 从 `make scmdb-missions-capture` 的安装页更新书签，启动“自动采集详情”。完整导出应包含所有列表任务和地点完成记录。失败任务重试，保留原始 JSON。
3. 验证并压缩归档（以实际版本替换示例）：

```sh
python3 tools/archive_mission_capture.py /path/to/scmdb-public-missions-....json --game-version 4.10.2 --english
```

工具核对任务 ID、完成状态、详情标签及地点采集记录，生成 gzip 和包含哈希、版本、覆盖范围的 manifest；拒绝覆盖已有归档。升级采集助手后先小批量确认 DOM 结构仍有效。

## 2. 更新翻译来源

所有任务类型的名称和任务说明统一优先使用 SCMDB 社区表，独立于蓝图的翻译基线：

```sh
python3 tools/update_mission_locale.py --game-version 4.10.2
# 离线检查已下载文件也可以：
python3 tools/update_mission_locale.py --game-version 4.10.2 --input /path/to/lang-zh_CN-live.json
```

此工具只请求上述公开 GitHub 原始文件，验证版本和条目后保存原始压缩快照与哈希。相同版本不同内容会停止，要求人工审核；不会替换蓝图表或改写任务源版本。工作表为 `data/scmdb-mission-locale.zh-CN.json`。主标题、社区任务说明、采集到的结构化条件分别保存；说明中的 `lv.6 蓝图` 是社区原文备注，不能直接当成该任务当前奖励字段。按英文原文和已知等级／货量变量模板匹配，运输方向还需与公开取送点数量相符；未知模板保留回退，禁止只凭相似 debug_name 绑定语言键。


保留原始 `global.ini` 与来源、补丁版本；文件名可以是临时名称。先更新匹配版本的 `data/scmdb-locale.zh-CN.json`（它提供英文与语言键的桥接），再执行：

```sh
python3 tools/import_game_locale.py /path/to/global.ini --game-version 4.10.2
```

INI 不直接部署。导入器清理 BOM、`,P` 键后缀、任务变量及附加奖励说明；生成文件记录原文件 SHA-256。游戏版本、英文桥接版本不符会停止构建，不能只改版本字段绕过核对。

## 3. 暂存构建与审核

```sh
python3 tools/build_mission_site_data.py --capture scminer-local/imports/scmdb/missions/具体快照.json.gz --previous scminer-local/data/scmdb-missions.json --output-root /tmp/xinghang-mission-review
```

检查暂存目录 `data/` 下：

- `scmdb-missions.json`：覆盖数量、来源版本、翻译来源与规则哈希；任务保留 `name_translation_method`。
- `scmdb-missions.diff.json`：新增、变化、缺失候选。缺失不等于版本移除，要检查采集筛选、活动隐藏与版本后再决定。
- `scmdb-missions.translation-report.json`：逐任务缺译／歧义（名称和描述分别统计）。
- `scmdb-missions.translation-worklist.json`：按字段和英文正文哈希合并的待处理项，包含所有关联任务 ID。`proposed_zh` 只是审核草稿，不会自动上线。

名称策略：任务社区表唯一主标题优先，社区说明独立展示；INI 唯一译文作为回退；统一标点、去社区标题备注；仅从英文明确内容填入等级／货量／风险／已解析地点；整句匹配的人工审核规则兜底。未知格式不套规则；真实歧义保留英文。规则在 `tools/mission_translation.py`，新增时添加代表性正例和拒绝匹配的反例。

描述只采用可确认的语言键匹配，不用模糊相似度套用另一任务。现阶段仍有描述缺译是正常审核状态，不能以名称覆盖率宣称全中文。

## 4. 人工补译

规范入口为 `data/mission-translations.zh-CN.json`，按任务 ID 维护，禁止直接编辑 dist 或生成目录。例如（此处仅为字段示意）：

```json
{
  "game_version": "4.10.2",
  "missions": {
    "任务ID": {
      "name_en": "完整原英文标题",
      "name_zh": "审核后的中文标题",
      "reason": "核对的语言键、来源或人工审核说明",
      "description_en_sha256": "worklist中的描述source_sha256",
      "description_zh": "可选：完整中文描述"
    }
  }
}
```

未补译描述时省略最后两个字段。名称原文、描述哈希、版本或占位符变化会报错，需重新审核；保留 `[LOCATION]` 等实际存在的变量，不添加英文中不存在的变量。新版本不得机械沿用旧覆盖表的版本号。

## 5. 激活与验证

审核通过后，将 `tools/build_mission_site_data.py` 的 `DEFAULT_CAPTURE` 指向本次归档，使 `make missions-build` 和一致性检查使用同一基线。保存旧目录用于差异检查，然后运行正式构建：

```sh
python3 tools/build_mission_site_data.py --previous scminer-local/data/scmdb-missions.json
python3 tools/test_archive_mission_capture.py
python3 tools/test_mission_translation.py
python3 tools/test_game_locale.py
python3 tools/test_mission_site_data.py
node tools/test_scmdb_missions_capture.cjs
python3 tools/check_scminer_site.py
git diff --check
```

更新 `dist/sw.js` 的 `CACHE_NAME`，确保 PWA 获取新索引和详情。不要改任务稳定标识（包括 debug_name 尾部空格）。检查 iPhone 14 Pro Max 附近尺寸：搜索中文／英文、等级或货量变体、地点点击、任务前置跳转、奖励配方和声望表。确认奖励、声望数值未因翻译改变。审阅 Git 差异，提交与部署需按用户当次授权执行。

切换数据基线时，`test_mission_site_data.py` 中任务数和代表性任务断言也属于审核范围：根据归档清单和实际版本核对后更新，不为通过测试而直接改成任意当前值。已移除任务仍保留旧归档用于追溯。

货运名称中的等级优先使用同一任务采集的声望表译名（例如 Experienced → lv.4 运输老炮），缺失时才使用规则通用译名；运输点数量与 SCU 从公开 HAULING ORDERS 提取，在卡片独立显示，不把社区附加备注当作游戏原始标题。比较 SCMDB 时应按同一任务 ID／英文名／等级核对，中文排序与英文排序不保证相同顺序。

当前任务社区表版本与 INI 英文桥接表独立记录；无需为了更新任务名称重建全部蓝图数据。名称来源语言键保存在 `name_translation_keys`，社区任务说明在 `name_notes_zh`。

## 蓝图与任务双向关联

`make missions-build` 同时生成 `dist/missions/blueprint-sources.json`，仅从任务的 BLUEPRINT REWARDS 结构化奖励池建立英文精确名称→任务 ID 反向索引，不把任务提供的蓝图或普通物品奖励作为产出证据。蓝图卡片按需读取，任务列表通过 `reward_blueprint` 参数精确筛选；新增、移除任务后随同快照重建，不手工维护链接。概率保存奖励池触发率与候选项数，不假设候选项等概率，不推算单张蓝图掉落率。验证工具会核对每条反向关联与原任务奖励池一致。

## 从 JSON 恢复补采

助手“导入 JSON”读取本地 `scmdb-public-missions-capture-v1` 文件，按频道与任务 ID 合并快照，保留标识尾部空格，不以显示名称去重。导入不删除未出现在当前筛选中的记录。只有版本匹配、完成标记存在且必要标签快照齐全时才恢复完成状态；地点完成标记缺失的任务仍会补采。旧文件缺少游戏版本时默认只恢复内容，确认同版本后可勾选面板提示再导入以续采。明确版本不同或语言／频道上下文不同则拒绝导入，应重新建立新版本采集会话。导入后自动保存浏览器进度，保存失败需手动导出。
