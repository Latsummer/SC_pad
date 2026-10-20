#!/usr/bin/env python3
"""Validate local site data and reproducible browser payloads without network access."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
from scmdb_locale import BlueprintTranslator, report_markdown
from import_scmdb_public_capture import parse_card

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = json.loads((ROOT / 'scminer-local/data/scmdb-blueprints.json').read_text())
    if source['counts']['unparsed_cards'] or source.get('unparsed_cards'):
        raise SystemExit('Blueprint data contains unparsed cards')
    if len(source['blueprints']) != source['counts']['blueprints']:
        raise SystemExit('Blueprint count does not match records')
    if sum(len(b['materials']) for b in source['blueprints']) != source['counts']['materials']:
        raise SystemExit('Material count does not match records')
    version = json.loads((ROOT / 'scminer-local/data/scminer-data.json').read_text())['game_data_version']
    translator = BlueprintTranslator(expected_version=version)
    results = []
    for item in source['blueprints']:
        parsed = parse_card(item['raw_text'], 1)
        if any(parsed[key] != item.get(key) for key in ('type_group', 'type_subtype', 'size')):
            raise SystemExit(f'Stale blueprint category: {item["name"]}. Reimport capture.')
        translated = dict(item)
        results.append(translator.translate(translated))
        if any(translated[key] != item.get(key) for key in ('name_en', 'name_zh')):
            raise SystemExit(f'Stale blueprint translation: {item["name"]}. Reimport capture.')
    if source.get('translation_report') != translator.report(results):
        raise SystemExit('Stale translation report. Reimport capture.')
    report_path = ROOT / 'scminer-local/data/scmdb-blueprints.translation-report.md'
    if report_path.read_text() != report_markdown(source['translation_report']):
        raise SystemExit('中文翻译检查报告未更新，请重新导入快照。')

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
             '--output', 'scminer-local/capture-tools/blueprints.html'],
            ['tools/build_scmdb_capture_bookmarklet.py', '--kind', 'missions', '--source', 'tools/scmdb_missions_capture.js',
             '--output', 'scminer-local/capture-tools/missions.html'],
        ]
        for command in commands:
            subprocess.run([sys.executable, *command], cwd=staging, check=True)
        for name in ['app-data.js', 'blueprints-data.js', 'blueprint-index.js',
                     'blueprint-locale.js']:
            if (dist / name).read_bytes() != (ROOT / 'scminer-local/dist' / name).read_bytes():
                raise SystemExit(f'Stale generated file: {name}. Rebuild and commit the output.')
        for name in ['blueprints.html', 'missions.html']:
            relative = Path('scminer-local/capture-tools') / name
            if (staging / relative).read_bytes() != (ROOT / relative).read_bytes():
                raise SystemExit(f'Stale generated file: {relative}. Rebuild and commit the output.')
    print('Site data and generated files are consistent')


if __name__ == '__main__':
    main()
