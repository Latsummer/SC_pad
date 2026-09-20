.PHONY: sync scmdb-capture scmdb-import blueprints-build

sync:
	python3 tools/sync_scminer_data.py

scmdb-capture:
	python3 tools/build_scmdb_capture_bookmarklet.py --source tools/scmdb_public_capture.js --output scminer-local/dist/scmdb-capture.html

scmdb-import:
	python3 tools/import_scmdb_public_capture.py

blueprints-build: scmdb-import
	python3 tools/build_blueprint_site_data.py
