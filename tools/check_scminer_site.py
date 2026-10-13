#!/usr/bin/env python3
"""Validate local site data and reproducible browser payloads without network access."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = json.loads((ROOT / 'scminer-local/data/scmdb-blueprints.json').read_text())
    if source['counts']['unparsed_cards'] or source.get('unparsed_cards'):
        raise SystemExit('Blueprint data contains unparsed cards')
    if len(source['blueprints']) != source['counts']['blueprints']:
        raise SystemExit('Blueprint count does not match records')
    if sum(len(b['materials']) for b in source['blueprints']) != source['counts']['materials']:
        raise SystemExit('Material count does not match records')

    with tempfile.TemporaryDirectory(prefix='scminer-check-') as temporary:
        staging = Path(temporary)
        shutil.copytree(ROOT / 'tools', staging / 'tools', ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(ROOT / 'scminer-local/data', staging / 'scminer-local/data')
        dist = staging / 'scminer-local/dist'
        dist.mkdir(parents=True)
        commands = [
            ['tools/build_scminer_site_data.py', '--dataset', 'scminer-local/data/scminer-data.json',
             '--locale', 'scminer-local/data/names.zh-CN.json', '--output', 'scminer-local/dist/app-data.js'],
            ['tools/build_blueprint_site_data.py'],
            ['tools/build_scmdb_capture_bookmarklet.py', '--source', 'tools/scmdb_public_capture.js',
             '--output', 'scminer-local/dist/scmdb-capture.html'],
        ]
        for command in commands:
            subprocess.run([sys.executable, *command], cwd=staging, check=True)
        for name in ['app-data.js', 'blueprints-data.js', 'blueprint-index.js',
                     'blueprint-locale.js', 'scmdb-capture.html']:
            if (dist / name).read_bytes() != (ROOT / 'scminer-local/dist' / name).read_bytes():
                raise SystemExit(f'Stale generated file: {name}. Rebuild and commit the output.')
    print('Site data and generated files are consistent')


if __name__ == '__main__':
    main()
