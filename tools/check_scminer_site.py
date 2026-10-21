#!/usr/bin/env python3
"""Validate local site data and reproducible browser payloads without network access."""
from pathlib import Path
import json
import gzip
import hashlib
from urllib.parse import urlsplit
import shutil
import subprocess
import sys
import tempfile
from scmdb_locale import BlueprintTranslator, report_markdown
from import_scmdb_public_capture import parse_card, mineral_lookup

ROOT = Path(__file__).resolve().parents[1]


def check_archives_and_assets():
    site = ROOT / 'scminer-local'
    for path in (site / 'imports').rglob('*.manifest.json'):
        metadata = json.loads(path.read_text())
        if not metadata.get('archive_sha256'):
            continue
        archive = path.with_name(metadata.get('archive') or path.name.replace('.manifest.json', '.json.gz'))
        packed = archive.read_bytes()
        if hashlib.sha256(packed).hexdigest() != metadata['archive_sha256'] or hashlib.sha256(gzip.decompress(packed)).hexdigest() != metadata['raw_sha256']:
            raise SystemExit(f'Archive checksum mismatch: {path}')
    game_locale = json.loads((site / 'data/game-locale.zh-CN.json').read_text())
    ini = site / 'imports/localization' / game_locale['game_version'] / 'global.ini.gz'
    if hashlib.sha256(gzip.decompress(ini.read_bytes())).hexdigest() != game_locale['source_sha256']:
        raise SystemExit('Game locale does not match its original archived global.ini')
    mission_locale = json.loads((site / 'data/scmdb-mission-locale.zh-CN.json').read_text())
    archive = site / 'imports/localization' / mission_locale['version'].split('-')[0] / f"scmdb-lang-{mission_locale['version']}.json.gz"
    if gzip.decompress(archive.read_bytes()) != (site / 'data/scmdb-mission-locale.zh-CN.json').read_bytes():
        raise SystemExit('Mission locale differs from archived source')
    # Prevent an omitted icon or renamed asset from breaking service-worker installation.
    import re
    shell = re.search(r'const APP_SHELL = (\[[\s\S]*?\]);', (site / 'dist/sw.js').read_text())
    if not shell:
        raise SystemExit('Missing service-worker app shell')
    for entry in json.loads(shell[1]):
        if not (site / 'dist' / urlsplit(entry).path).exists():
            raise SystemExit(f'Missing service-worker asset: {entry}')
    shell_entries = set(json.loads(shell[1]))
    for page in ['index.html','blueprints.html']:
        for ref in re.findall(r'(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"', (site / 'dist' / page).read_text()):
            if './' + ref not in shell_entries:
                raise SystemExit(f'Uncached shell resource: {page}: {ref}; run make site-cache')
    manifest = json.loads((site / 'dist/manifest.webmanifest').read_text())
    for icon in manifest['icons']:
        if not (site / 'dist' / urlsplit(icon['src']).path).is_file():
            raise SystemExit(f'Missing PWA icon: {icon["src"]}')


def main():
    check_archives_and_assets()
    source = json.loads((ROOT / 'scminer-local/data/scmdb-blueprints.json').read_text())
    if source['counts']['unparsed_cards'] or source.get('unparsed_cards'):
        raise SystemExit('Blueprint data contains unparsed cards')
    if len(source['blueprints']) != source['counts']['blueprints']:
        raise SystemExit('Blueprint count does not match records')
    if sum(len(b['materials']) for b in source['blueprints']) != source['counts']['materials']:
        raise SystemExit('Material count does not match records')
    version = json.loads((ROOT / 'scminer-local/data/scminer-data.json').read_text())['game_data_version']
    translator = BlueprintTranslator(expected_version=version)
    materials = mineral_lookup(ROOT / 'scminer-local/data/names.zh-CN.json')
    results = []
    for item in source['blueprints']:
        parsed = parse_card(item['raw_text'], 1)
        if any(parsed[key] != item.get(key) for key in ('type_group', 'type_subtype', 'size')):
            raise SystemExit(f'Stale blueprint category: {item["name"]}. Reimport capture.')
        for material in item['materials']:
            if material.get('mineral') != materials.get(material['name'].casefold()):
                raise SystemExit(f'Stale material mapping: {material["name"]}. Reimport capture.')
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
        shutil.copytree(ROOT / 'scminer-local/imports/scmdb/blueprint-details', staging / 'scminer-local/imports/scmdb/blueprint-details')
        commands = [
            ['tools/build_blueprint_quality_data.py'],
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
        quality_relative = Path('scminer-local/data/scmdb-blueprint-quality.json')
        if (staging / quality_relative).read_bytes() != (ROOT / quality_relative).read_bytes():
            raise SystemExit('Stale normalized blueprint quality data; run make blueprint-quality-build')
        quality_report = Path('scminer-local/data/scmdb-blueprint-quality.translation-report.md')
        if (staging / quality_report).read_bytes() != (ROOT / quality_report).read_bytes():
            raise SystemExit('Stale blueprint quality translation report')
        expected_quality = {path.name: path.read_bytes() for path in (dist / 'blueprint-quality').glob('*.json')}
        actual_quality = {path.name: path.read_bytes() for path in (ROOT / 'scminer-local/dist/blueprint-quality').glob('*.json')}
        if expected_quality != actual_quality:
            raise SystemExit('Stale blueprint quality shards; run make blueprint-quality-build')
        for name in ['app-data.js', 'blueprints-data.js', 'blueprint-index.js',
                     'blueprint-locale.js']:
            if (dist / name).read_bytes() != (ROOT / 'scminer-local/dist' / name).read_bytes():
                raise SystemExit(f'Stale generated file: {name}. Rebuild and commit the output.')
        for name in ['blueprints.html', 'missions.html']:
            relative = Path('scminer-local/capture-tools') / name
            if (staging / relative).read_bytes() != (ROOT / relative).read_bytes():
                raise SystemExit(f'Stale generated file: {relative}. Rebuild and commit the output.')
        shutil.copytree(ROOT / 'scminer-local/imports/scmdb/missions', staging / 'scminer-local/imports/scmdb/missions')
        subprocess.run([sys.executable, 'tools/build_mission_site_data.py', '--output-root', str(staging / 'scminer-local')], cwd=staging, check=True)
        expected_files = {path.name for path in (staging / 'scminer-local/dist/missions').glob('*.json')}
        actual_files = {path.name for path in (ROOT / 'scminer-local/dist/missions').glob('*.json')}
        if expected_files != actual_files:
            raise SystemExit('Stale or missing generated mission files; run make missions-build')
        for path in (staging / 'scminer-local/dist/missions').glob('*.json'):
            actual = ROOT / 'scminer-local/dist/missions' / path.name
            if not actual.exists() or path.read_bytes() != actual.read_bytes():
                raise SystemExit(f'Stale mission shard: {path.name}. Run make missions-build.')
        for name in ['scmdb-missions.json', 'scmdb-missions.translation-report.json', 'scmdb-missions.translation-worklist.json']:
            if (staging / 'scminer-local/data' / name).read_bytes() != (ROOT / 'scminer-local/data' / name).read_bytes():
                raise SystemExit(f'Stale mission catalog: {name}. Run make missions-build.')
    print('Site data and generated files are consistent')


if __name__ == '__main__':
    main()
