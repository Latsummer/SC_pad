#!/usr/bin/env python3
"""Build mission catalog and immutable detail shards from local public DOM captures."""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CAPTURE = ROOT / 'scminer-local/imports/scmdb/missions/scmdb-public-missions-2026-10-20T11-03-16-308Z.json.gz'


def normalize(value):
    value = re.sub(r'<[^>]*>', '', value or '')
    value = re.sub(r'\\+n', ' ', value)
    return re.sub(r'\s+', ' ', value).strip()


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def public_id(value):
    number = 5381
    for char in value:
        number = ((number << 5) + number + ord(char)) & 0xffffffff
    result = ''
    while number:
        number, digit = divmod(number, 36)
        result = '0123456789abcdefghijklmnopqrstuvwxyz'[digit] + result
    return result or '0'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def build(capture, output_root, previous=None):
    previous_catalog = json.loads(previous.read_text()) if previous else None
    manifest_path = capture.with_name(capture.name.removesuffix('.gz').removesuffix('.json') + '.manifest.json')
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    raw = capture.read_bytes()
    source = json.loads(gzip.decompress(raw) if capture.suffix == '.gz' else raw)
    if source.get('format') != 'scmdb-public-missions-capture-v1':
        raise ValueError('Unsupported mission capture format')
    locale_raw = (ROOT / 'scminer-local/data/scmdb-locale.zh-CN.json').read_bytes()
    locale = json.loads(locale_raw)
    translations = defaultdict(set)
    descriptions = []
    for key, entry in locale['keys'].items():
        en, zh = normalize(entry.get('en')), entry.get('tr', '')
        if not en or not re.search('[\u4e00-\u9fff]', zh) or en == normalize(zh) or re.search(r'等待译名|<REDACTED>|未翻译', zh):
            continue
        translations[en].add(zh)
        if 'desc' in key.lower() and len(en) > 60:
            descriptions.append((en, zh, key))
    descriptions.sort(key=lambda entry: -len(entry[0]))
    blueprint_catalog = json.loads((ROOT / 'scminer-local/data/scmdb-blueprints.json').read_text())
    blueprint_names = {}
    for blueprint in blueprint_catalog['blueprints']:
        if blueprint.get('name_en'):
            blueprint_names[normalize(blueprint['name_en'])] = {'name_en': blueprint['name_en'], 'name_zh': blueprint.get('name_zh')}
    issues = []
    missions = []
    identities = set()
    completed = set(source.get('completed_mission_keys', []))
    for item in source['missions']:
        identity = f"{item['channel']}:{item['mission_id']}"
        if identity in identities:
            raise ValueError(f'Duplicate mission ID: {identity}')
        identities.add(identity)
        debug = item.get('debug_name', '')
        if debug and public_id(debug) != item['mission_id']:
            raise ValueError(f'Debug name/public ID mismatch: {identity}')
        snapshots = {entry.get('tab_key', entry.get('tab', '').lower()): entry for entry in item['detail_snapshots']}
        if identity not in completed or not {'overview', 'requirements', 'calculator'} <= snapshots.keys():
            raise ValueError(f'Incomplete mission: {identity}; preserve old catalog and retry capture')
        overview = snapshots['overview']
        header = overview['header_text'].splitlines()
        name = header[1] if len(header) > 2 else re.sub(r'\(\+\d+ alt titles\)$', '', item['title'])
        contractor = header[2].split(' · reputation:')[0].rstrip(' ⚠') if len(header) > 2 else ''
        tail = header[header.index('✕') + 1:] if '✕' in header else []
        system = tail[0].split(' — ')[0] if tail and tail[0].split(' — ')[0] in ('Stanton', 'Pyro', 'Nyx', 'Multi') else 'Unknown'
        mission_type = tail[1] if system != 'Unknown' and len(tail) > 1 else 'Other'
        if mission_type in ('LEGAL', 'ILLEGAL', 'SOLO', 'CHAIN', 'Career', 'Story', 'Event'):
            mission_type = 'Other'
        text = overview['raw_text']
        description = text.split('\nREWARD\n', 1)[0]
        normalized = normalize(description)
        matches = [(en, zh, key) for en, zh, key in descriptions if en in normalized]
        longest = len(matches[0][0]) if matches else 0
        matches = [entry for entry in matches if len(entry[0]) == longest]
        desc_translations = sorted(set(entry[1] for entry in matches))
        title_translations = sorted(translations.get(normalize(name), []))
        title_zh = title_translations[0] if len(title_translations) == 1 else None
        placeholder_mismatch = False
        if title_zh and not set(re.findall(r'\[[A-Z_0-9]+\]', title_zh)) <= set(re.findall(r'\[[A-Z_0-9]+\]', name)):
            placeholder_mismatch = True
            title_zh = None  # Do not replace a resolved location/rank with an unresolved translated template.
        if not title_zh:
            issues.append({'id': item['mission_id'], 'name': name, 'field': 'title', 'status': 'placeholder_mismatch' if placeholder_mismatch else 'ambiguous' if title_translations else 'missing', 'candidates': title_translations})
        req = snapshots['requirements']['raw_text']
        def flag(label):
            match = re.search(r'(?:^|\n)' + re.escape(label) + r'\n(Yes|No)(?:\n|$)', req)
            return match.group(1) == 'Yes' if match else None
        reward_match = re.search(r'(?:^|\n)REWARD\n([\d,]+) aUEC', text)
        basis = snapshots['calculator'].get('calculator_basis') or {}
        fields = [(label, value) for group in basis.get('reward_fields', []) for label, value in zip(group['labels'], group['values'])]
        rep_text = next((value for label, value in fields if 'REP/MISSION' in label.upper()), None)
        rep = float(re.sub(r'[^\d.]', '', rep_text)) if rep_text and re.search(r'\d', rep_text) else None
        for table in basis.get('rank_tables', []):
            for rank in table['ranks']:
                rank_name = re.sub(r'(?:MIN|MAX)', '', rank['rank'])
                candidates = translations.get(normalize(rank_name), set())
                rank['rank_zh'] = next(iter(candidates)) if len(candidates) == 1 else None
        sections = []
        for key in ('overview', 'requirements', 'combat'):
            seen = set()
            for section in snapshots.get(key, {}).get('sections', []):
                signature = (section['heading'], section['raw_text'])
                if signature not in seen:
                    sections.append({'group': key, 'heading': section['heading'], 'text': section['raw_text'], 'links': section.get('links', [])})
                    seen.add(signature)
        reward_lines = [line for section in sections if section['heading'].startswith(('BLUEPRINT REWARDS', 'YOU RECEIVE', 'ITEM REWARDS')) for line in section['text'].splitlines()]
        related_blueprints = list({normalize(line): blueprint_names[normalize(line)] for line in reward_lines if normalize(line) in blueprint_names}.values())
        has_blueprints = any('BLUEPRINT REWARDS' in section['heading'] for section in sections)
        detail = {'description_en': description, 'description_zh': desc_translations[0] if len(desc_translations) == 1 else None,
                  'description_translation_keys': [entry[2] for entry in matches], 'requirements_text': req,
                  'combat_text': snapshots.get('combat', {}).get('raw_text'), 'sections': sections, 'calculator': basis, 'related_blueprints': related_blueprints}
        record = {'id': item['mission_id'], 'channel': item['channel'], 'debug_name': debug, 'name_en': name, 'name_zh': title_zh,
                  'contractor': contractor, 'contractor_zh': next(iter(translations[normalize(contractor)])) if len(translations.get(normalize(contractor), [])) == 1 else None, 'system': system, 'type': mission_type,
                  'reward': int(reward_match.group(1).replace(',', '')) if reward_match else None,
                  'reputation': rep, 'illegal': flag('ILLEGAL'), 'shareable': flag('SHAREABLE'), 'once_only': flag('ONCE ONLY'),
                  'rewards_search': ' '.join(reward_lines + [b['name_zh'] or '' for b in related_blueprints]),
                  'blueprints': has_blueprints, 'source_url': item['source_url'], 'detail': detail}
        record['content_hash'] = digest(record)
        missions.append(record)
    # Use explicit provenance metadata; never infer a source build from the locale.
    catalog = {'schema_version': 1, 'source': {'capture': capture.name, 'sha256': hashlib.sha256(raw).hexdigest(),
                'captured_at': source['captured_at'], 'game_data_version': manifest.get('game_data_version'), 'version_basis': manifest.get('game_data_version_status', 'unrecorded'), 'coverage': 'captured-list'},
               'translation': {'version': locale['version'], 'sha256': hashlib.sha256(locale_raw).hexdigest(), 'version_match': 'patch-only' if manifest.get('game_data_version') == locale['version'].split('-')[0] else 'unconfirmed'},
               'counts': {'missions': len(missions), 'title_translated': sum(bool(m['name_zh']) for m in missions),
                          'description_translated': sum(bool(m['detail']['description_zh']) for m in missions)}, 'missions': missions}
    write_json(output_root / 'data/scmdb-missions.json', catalog)
    write_json(output_root / 'data/scmdb-missions.translation-report.json', {'locale': catalog['translation'], 'issues': issues})
    report = {'baseline': not bool(previous), 'added': [], 'changed': [], 'missing_candidates': [], 'removals_confirmed': False}
    if previous:
        old = {m['id']: m for m in previous_catalog['missions']}
        new = {m['id']: m for m in missions}
        report.update(added=sorted(new.keys() - old.keys()), changed=sorted(key for key in new.keys() & old.keys() if new[key]['content_hash'] != old[key]['content_hash']), missing_candidates=sorted(old.keys() - new.keys()))
    write_json(output_root / 'data/scmdb-missions.diff.json', report)
    shards = defaultdict(dict)
    for mission in missions:
        shards[int(hashlib.sha256(mission['id'].encode()).hexdigest()[:2], 16) % 32][mission['id']] = mission['detail']
    shard_files = {}
    for bucket, detail in sorted(shards.items()):
        filename = f'details-{bucket:02d}-{digest(detail)}.json'
        write_json(output_root / 'dist/missions' / filename, detail)
        for key in detail:
            shard_files[key] = 'missions/' + filename
    index = {key: value for key, value in catalog.items() if key != 'missions'}
    index['missions'] = [{key: value for key, value in mission.items() if key not in ('detail', 'debug_name')} | {'file': shard_files[mission['id']]} for mission in missions]
    write_json(output_root / 'dist/missions/index.json', index)
    # This directory is exclusively generated; remove obsolete immutable shards.
    current = set(shard_files.values())
    for path in (output_root / 'dist/missions').glob('details-*.json'):
        if 'missions/' + path.name not in current:
            path.unlink()
    print(f"Built {len(missions)} missions in {len(shards)} detail shards; translations: {catalog['counts']}")
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, default=DEFAULT_CAPTURE)
    parser.add_argument('--output-root', type=Path, default=ROOT / 'scminer-local')
    parser.add_argument('--previous', type=Path, help='Previous normalized catalog for a non-destructive diff')
    args = parser.parse_args()
    build(args.capture, args.output_root, args.previous)


if __name__ == '__main__':
    main()
