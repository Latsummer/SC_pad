# 以下命令在仓库根目录执行；网站部署命令见 scminer-local/Makefile。
.PHONY: sync scmdb-capture scmdb-missions-capture scmdb-serve scmdb-import blueprints-build missions-build

# 本机安装页服务端口，可用 make scmdb-serve SCMDB_PORT=8767 修改。
SCMDB_PORT ?= 8766

# 启动本机静态服务，仅提供蓝图／任务采集书签安装页。
# 默认访问 http://127.0.0.1:8766/；Ctrl+C 停止。书签安装后不依赖此服务。
scmdb-serve:
	python3 -m http.server $(SCMDB_PORT) --bind 127.0.0.1 --directory scminer-local/capture-tools

# 从 SCMINER 公开页面同步矿物与分布数据，生成网站矿物数据并更新离线缓存版本。
# 会联网；遵守 robots.txt，串行限速，仅在提取与构建成功后替换数据。
sync:
	python3 tools/sync_scminer_data.py

# 生成蓝图采集书签安装页 capture-tools/blueprints.html（位于 scminer-local/）。
# 不联网；生成后仍需在 SCMDB Fabricator 页面启动书签、手动滚动并导出 JSON。
scmdb-capture:
	python3 tools/build_scmdb_capture_bookmarklet.py --source tools/scmdb_public_capture.js --output scminer-local/capture-tools/blueprints.html

# 生成任务采集书签安装页 capture-tools/missions.html（位于 scminer-local/）。
# 不联网；生成后在 SCMDB 任务页面启动书签，可批量采集详情、保存进度和导出 JSON。
scmdb-missions-capture:
	python3 tools/build_scmdb_capture_bookmarklet.py --kind missions --source tools/scmdb_missions_capture.js --output scminer-local/capture-tools/missions.html

# 导入 imports/scmdb/ 中最近修改的蓝图快照，生成规范配方数据和翻译报告。
# 仅处理本地文件，不联网、不导入任务；指定快照需直接运行 Python 导入脚本。
scmdb-import:
	python3 tools/import_scmdb_public_capture.py

# 先执行 scmdb-import，再生成网站蓝图数据、矿物反查索引和槽位中文表。
# 不部署；发布前还需更新 dist/sw.js 的 CACHE_NAME（位于 scminer-local/）。
blueprints-build: scmdb-import
	python3 tools/build_blueprint_site_data.py

# 从已归档的本地英文任务快照生成规范数据、翻译报告、列表索引及按需详情分片。
# 不联网、不部署；指定新快照或比较旧目录时直接运行脚本的 --capture / --previous 参数。
missions-build:
	python3 tools/build_mission_site_data.py
