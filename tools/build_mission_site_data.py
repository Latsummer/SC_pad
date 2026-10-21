#!/usr/bin/env python3
"""Build mission catalog and immutable detail shards from local public DOM captures."""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re
from mission_translation import canonical, resolve_title, community_title_index, resolve_community_title

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CAPTURE = ROOT / 'scminer-local/imports/scmdb/missions/scmdb-public-missions-2026-10-20T12-11-46-279Z.json.gz'


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


def minimum_rank(basis, marker="MIN"):
    """Read marked minimum rank from captured tables; never infer from title/XP."""
    levels = set()
    for table in basis.get('rank_tables', []):
        for rank in table['ranks']:
            if not re.search(marker + r'(?=MIN|MAX|$|\s)', rank['rank']):
                continue
            match = re.search(r'lv\.(\d+)', rank.get('rank_zh') or '', re.I)
            if match:
                levels.add(int(match[1]))
            elif rank['rank'].replace('MIN', '').replace('MAX', '').strip() == 'Neutral':
                levels.add(0)
    return next(iter(levels)) if len(levels) == 1 else None


def blueprint_pools(text, blueprint_names, translations):
    pools = []
    expect_name = False
    for line in text.splitlines():
        line = line.strip()
        chance = re.fullmatch(r'(\d+(?:\.\d+)?)% chance [—–-] 1 of (\d+)', line)
        if chance:
            pools.append({'chance_percent': float(chance[1]), 'candidate_count': int(chance[2]), 'items': []})
            expect_name = False
        elif line == '🔧':
            expect_name = True
        elif expect_name and line and pools:
            known = blueprint_names.get(normalize(line))
            candidates = translations.get(normalize(line), set())
            pools[-1]['items'].append(known or {'name_en': line, 'name_zh': next(iter(candidates)) if len(candidates) == 1 else None})
            expect_name = False
    return pools


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
    game_path = ROOT / 'scminer-local/data/game-locale.zh-CN.json'
    game_raw = game_path.read_bytes() if game_path.exists() else None
    game_locale = json.loads(game_raw) if game_raw else None
    if game_locale:
        if game_locale['game_version'] != manifest.get('game_data_version') or game_locale['bridge_version'] != locale['version']:
            raise ValueError('Game localization version does not match capture/English bridge')
    mission_locale_raw = (ROOT / 'scminer-local/data/scmdb-mission-locale.zh-CN.json').read_bytes()
    mission_locale = json.loads(mission_locale_raw)
    if mission_locale['version'].split('-')[0] != manifest.get('game_data_version'):
        raise ValueError('Mission locale patch version mismatch')
    community_index = community_title_index(mission_locale['keys'])
    translations = defaultdict(set)
    descriptions = []
    for key, entry in locale['keys'].items():
        en, zh = normalize(entry.get('en')), entry.get('tr', '')
        if not en or not re.search('[\u4e00-\u9fff]', zh) or en == normalize(zh) or re.search(r'等待译名|<REDACTED>|未翻译', zh):
            continue
        translations[en].add(zh)
        if 'desc' in key.lower() and len(en) > 60:
            descriptions.append((en, game_locale['keys'].get(key, zh) if game_locale else zh, key))
    if game_locale:
        game_candidates = defaultdict(set)
        for key, zh in game_locale['keys'].items():
            en = normalize(locale['keys'].get(key, {}).get('en'))
            if en and set(re.findall(r'\[[A-Z_0-9]+\]', zh)) <= set(re.findall(r'\[[A-Z_0-9]+\]', en)):
                game_candidates[en].add(zh)
        for en, candidates in game_candidates.items():
            if len(candidates) == 1:
                translations[en] = candidates
    title_index = defaultdict(set)
    for en, candidates in translations.items():
        title_index[canonical(en)].update(candidates)
    descriptions.sort(key=lambda entry: -len(entry[0]))
    blueprint_catalog = json.loads((ROOT / 'scminer-local/data/scmdb-blueprints.json').read_text())
    blueprint_names = {}
    for blueprint in blueprint_catalog['blueprints']:
        if blueprint.get('name_en'):
            blueprint_names[normalize(blueprint['name_en'])] = {'name_en': blueprint['name_en'], 'name_zh': blueprint.get('name_zh')}
    override_path = ROOT / 'scminer-local/data/mission-translations.zh-CN.json'
    overrides = json.loads(override_path.read_text()) if override_path.exists() else {'game_version': manifest.get('game_data_version'), 'missions': {}}
    if overrides['game_version'] != manifest.get('game_data_version'):
        raise ValueError('Manual mission translation version mismatch')
    worklist = {}
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
        title_translations = sorted(title_index.get(canonical(name), []))
        title_zh, title_method = resolve_title(name, title_translations)
        placeholder_mismatch = False
        if title_zh and not set(re.findall(r'\[[A-Z_0-9]+\]', title_zh)) <= set(re.findall(r'\[[A-Z_0-9]+\]', name)):
            placeholder_mismatch = True
            title_zh = None  # Do not replace a resolved location/rank with an unresolved translated template.
        if not title_zh:
            issues.append({'id': item['mission_id'], 'name': name, 'field': 'title', 'status': 'placeholder_mismatch' if placeholder_mismatch else 'ambiguous' if title_translations else 'missing', 'candidates': title_translations})
        if len(desc_translations) != 1:
            issues.append({'id': item['mission_id'], 'name': name, 'field': 'description', 'status': 'ambiguous' if desc_translations else 'missing', 'translation_keys': [entry[2] for entry in matches]})
        override = overrides['missions'].get(item['mission_id'], {})
        if override:
            if override.get('name_en') != name or not override.get('reason'):
                raise ValueError(f'Stale/undocumented manual translation: {identity}')
            if override.get('name_zh'):
                title_zh, title_method = resolve_title(name, [override['name_zh']])
                if not title_zh:
                    raise ValueError(f'Invalid manual title placeholders: {identity}')
                title_method = 'manual-reviewed'
            if override.get('description_zh'):
                if override.get('description_en_sha256') != hashlib.sha256(normalized.encode()).hexdigest():
                    raise ValueError(f'Stale manual description: {identity}')
                from mission_translation import fill_variables
                if fill_variables(description, override['description_zh']) is None:
                    raise ValueError(f'Invalid manual description placeholders: {identity}')
                desc_translations = [override['description_zh']]
            issues = [issue for issue in issues if issue['id'] != item['mission_id'] or (issue['field'] == 'title' and not title_zh) or (issue['field'] == 'description' and len(desc_translations) != 1)]
        for field, value, unresolved in [('title', name, not title_zh), ('description', description, len(desc_translations) != 1)]:
            if unresolved:
                source_hash = hashlib.sha256(normalize(value).encode()).hexdigest()
                entry = worklist.setdefault(field + ':' + source_hash, {'field': field, 'source_sha256': source_hash, 'source_en': value, 'mission_ids': [], 'proposed_zh': '', 'review_note': ''})
                entry['mission_ids'].append(item['mission_id'])
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
        rank_labels = {}
        for table in basis.get('rank_tables', []):
            for rank in table['ranks']:
                if rank.get('rank_zh'):
                    rank_labels[re.sub(r'MIN|MAX', '', rank['rank'])] = rank['rank_zh']
        if title_method != 'manual-reviewed':
            title_zh, title_method = resolve_title(name, title_translations, rank_labels)
        sections = []
        for key in ('overview', 'requirements', 'combat'):
            seen = set()
            for section in snapshots.get(key, {}).get('sections', []):
                signature = (section['heading'], section['raw_text'])
                if signature not in seen:
                    sections.append({'group': key, 'heading': section['heading'], 'text': section['raw_text'], 'links': section.get('links', [])})
                    seen.add(signature)
        for section in sections:
            if section['heading'] == 'BLUEPRINT REWARDS':
                section['blueprint_pools'] = blueprint_pools(section['text'], blueprint_names, translations)
        reward_lines = [line for section in sections if section['heading'].startswith(('BLUEPRINT REWARDS', 'YOU RECEIVE', 'ITEM REWARDS')) for line in section['text'].splitlines()]
        related_blueprints = list({normalize(line): blueprint_names[normalize(line)] for line in reward_lines if normalize(line) in blueprint_names}.values())
        hauling = None
        for section in sections:
            if section['heading'].startswith('HAULING ORDERS'):
                total = re.search(r'HAULING ORDERS\s+([\d,]+(?:[-–][\d,]+)?)\s*SCU', section['text'])
                route = re.search(r'📦\s*(\d+)\s*→\s*📍\s*(\d+)', section['text'])
                hauling = {'total_scu': total[1] if total else None, 'pickups': int(route[1]) if route else None, 'dropoffs': int(route[2]) if route else None}
                break
        community = resolve_community_title(name, community_index, rank_labels, hauling)
        title_notes, title_keys = [], []
        if community and title_method != 'manual-reviewed':
            title_zh, title_method = community['title'], 'community-locale'
            title_notes, title_keys = community['notes'], community['keys']
            issues = [issue for issue in issues if not (issue['id'] == item['mission_id'] and issue['field'] == 'title')]
        has_blueprints = any('BLUEPRINT REWARDS' in section['heading'] for section in sections)
        detail = {'location_details': {key: snapshots[key]['location_details'] for key in ('overview', 'requirements') if snapshots.get(key, {}).get('location_details')}, 'description_en': description, 'description_zh': desc_translations[0] if len(desc_translations) == 1 else None,
                  'description_translation_keys': [entry[2] for entry in matches], 'requirements_text': req,
                  'combat_text': snapshots.get('combat', {}).get('raw_text'), 'sections': sections, 'calculator': basis, 'related_blueprints': related_blueprints}
        record = {'id': item['mission_id'], 'channel': item['channel'], 'debug_name': debug, 'name_en': name, 'name_zh': title_zh, 'name_translation_method': title_method, 'name_translation_keys': title_keys, 'name_notes_zh': title_notes, 'hauling': hauling,
                  'contractor': contractor, 'contractor_zh': next(iter(translations[normalize(contractor)])) if len(translations.get(normalize(contractor), [])) == 1 else None, 'system': system, 'type': mission_type,
                  'reward': int(reward_match.group(1).replace(',', '')) if reward_match else None,
                  'minimum_rank': minimum_rank(basis), 'maximum_rank': minimum_rank(basis, 'MAX'), 'rank_range_complete': minimum_rank(basis) is not None and ('\nMAX:\n' not in req or minimum_rank(basis, 'MAX') is not None), 'reputation': rep, 'illegal': flag('ILLEGAL'), 'shareable': flag('SHAREABLE'), 'once_only': flag('ONCE ONLY'),
                  'reward_blueprints': sorted({item['name_en'] for section in sections for pool in section.get('blueprint_pools', []) for item in pool['items']}),
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
    catalog['translation']['mission_locale'] = {'version': mission_locale['version'], 'sha256': hashlib.sha256(mission_locale_raw).hexdigest(), 'priority': 'mission titles and explanatory notes; INI/rules are fallback'}
    catalog['translation']['rules_sha256'] = hashlib.sha256((ROOT / 'tools/mission_translation.py').read_bytes()).hexdigest()
    catalog['translation']['manual_sha256'] = hashlib.sha256(json.dumps(overrides, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    resolved_ids = {m['id'] for m in missions if m['name_zh']}
    worklist = {key: value for key,value in worklist.items() if value['field'] != 'title' or not set(value['mission_ids']) <= resolved_ids}
    write_json(output_root / 'data/scmdb-missions.translation-worklist.json', {'game_version': manifest.get('game_data_version'), 'entries': list(worklist.values())})
    if game_locale:
        catalog['translation']['game_locale'] = {key: value for key, value in game_locale.items() if key != 'keys'}
        catalog['translation']['game_locale']['sha256'] = hashlib.sha256(game_raw).hexdigest()
        catalog['translation']['game_locale']['bridged_keys'] = len(game_locale['keys'])
    write_json(output_root / 'data/scmdb-missions.json', catalog)
    write_json(output_root / 'data/scmdb-missions.translation-report.json', {'locale': catalog['translation'], 'issues': issues, 'title_fallbacks': [{'id': m['id'], 'name_en': m['name_en'], 'method': m['name_translation_method']} for m in missions if m['name_translation_method'] != 'community-locale'], 'community_title_count': sum(m['name_translation_method'] == 'community-locale' for m in missions), 'community_notes_count': sum(bool(m['name_notes_zh']) for m in missions)})
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
    reverse = defaultdict(list)
    for mission in missions:
        pools_by_name = defaultdict(list)
        for section in mission['detail']['sections']:
            for pool in section.get('blueprint_pools', []):
                for item in pool['items']:
                    evidence = {'chance_percent':pool['chance_percent'], 'candidate_count':pool['candidate_count']}
                    if evidence not in pools_by_name[item['name_en']]:
                        pools_by_name[item['name_en']].append(evidence)
        for name, pools in pools_by_name.items():
            reverse[name].append({'id':mission['id'], 'name':mission['name_zh'] or mission['name_en'], 'system':mission['system'], 'minimum_rank':mission['minimum_rank'], 'pools':pools})
    write_json(output_root / 'dist/missions/blueprint-sources.json', {'source':catalog['source'], 'blueprints':dict(sorted(reverse.items()))})
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
