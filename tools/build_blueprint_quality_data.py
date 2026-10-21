#!/usr/bin/env python3
"""Build an ID-based blueprint catalog and lazy observed-quality shards from local capture."""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re
from import_scmdb_public_capture import parse_card, mineral_lookup
from inspect_blueprint_details import inspect, quality_range
from scmdb_locale import BlueprintTranslator, report_markdown

ROOT = Path(__file__).resolve().parents[1]
BASELINE = 'imports/scmdb/blueprint-details/scmdb-blueprint-details-2026-10-21T10-26-31-626Z.json.gz'
PRESETS = ('min', 'base', 'half', 'max')
SHARDS = 64


def rule(raw):
    parsed = quality_range(raw)
    if parsed:
        return {'kind': 'multiplier_endpoints', **parsed}
    tiers = []
    for part in raw.replace('−', '-').split('|'):
        match = re.fullmatch(r'\s*(\d+)[–-](\d+):\s*([+-]?\d+)\s+pips?\s*', part)
        if not match:
            return {'kind': 'unverified', 'raw': raw}
        low, high, delta = map(int, match.groups())
        if low > high or (tiers and low != tiers[-1]['max'] + 1):
            return {'kind': 'unverified', 'raw': raw}
        tiers.append({'min': low, 'max': high, 'delta': delta})
    if not tiers or tiers[0]['min'] != 0 or tiers[-1]['max'] != 1000:
        return {'kind': 'unverified', 'raw': raw}
    return {'kind': 'steps', 'unit': 'pip', 'tiers': tiers}


def control(slot):
    controls = slot['quality_controls']
    return next((item for item in controls if item['type'] == 'number'), controls[0] if controls else None)


def material_signature(materials):
    return [(item['slot'], item['name'], item['amount_scu'], item['amount_count']) for item in materials]


def slot_materials(slots):
    result = []
    for slot in slots:
        match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*SCU', slot['quantity'])
        count = re.fullmatch(r'[×x]\s*(\d+(?:\.\d+)?)', slot['quantity'])
        if not match and not count:
            raise ValueError(f"Unrecognized material quantity: {slot['quantity']}")
        result.append({'slot': slot['slot'], 'name': slot['material'],
                       'amount_scu': float(match[1]) if match else None,
                       'amount_count': float(count[1]) if count else None})
    return result


def context_rows(snapshot):
    """Keep firing mode/section headings so equal labels aren't conflated."""
    raw = snapshot['product_stats_raw']
    cursor = 0
    context = ''
    result = []
    for row in snapshot['stats']:
        position = raw.find(row['raw_text'], cursor)
        if position < 0:
            raise ValueError(f"Stat row is absent from captured product text: {row['label']}")
        prefix = raw[cursor:position].splitlines()
        for line in prefix:
            line = line.strip()
            if line == 'PRODUCT STATS' or line in ('m/s', 'km/s', 'Mm/s', 'Gm/s'):
                continue
            if re.search(r'[A-Z]', line) and (line.isupper() or re.match(r'^(Rapid|Burst|Single|Semi|Auto|Charged|Charge)(\b|[- ])', line)):
                context = line
        result.append({'label': row['label'], 'section': context, 'base': row['base'], 'kind': 'stat'})
        cursor = position + len(row['raw_text'])
    return result


def observed_value(row, resistance=False):
    value = row['modified']
    if not value or value == '—':
        return row['base']
    return re.sub(r'^→\s*', '', value) if resistance else value


def compact_recipe(entry):
    samples = entry['samples']
    base = samples.get('base') or samples['initial']
    dynamic = any(sample['quality_controls_present'] for sample in samples.values())
    stats = context_rows(base)
    stats += [{'label': row['type'], 'section': 'DAMAGE RESISTANCE', 'base': row['base'], 'kind': 'resistance'} for row in base['resistances']]
    slots = []
    for slot in base['slots']:
        selected = control(slot)
        slots.append({'slot': slot['slot'], 'material': slot['material'], 'quantity': slot['quantity'],
                      'quality': {key: selected.get(key) for key in ('min', 'max', 'step')} if selected else None,
                      'effects': [{'name': effect['name'], 'rule': rule(effect['range_raw'])} for effect in slot['effects']]})
    presets = {}
    preset_issues = 0
    chosen = PRESETS if dynamic else ('initial',)
    for label in chosen:
        sample = samples[label]
        descriptors = [(row['label'], row['section']) for row in context_rows(sample)]
        if descriptors != [(row['label'], row['section']) for row in stats if row['kind'] == 'stat']:
            raise ValueError(f"Stat layout changed across presets: {entry['recipe_id']}")
        if [row['type'] for row in sample['resistances']] != [row['label'] for row in stats if row['kind'] == 'resistance']:
            raise ValueError(f"Resistance layout changed: {entry['recipe_id']}")
        for original, observed in zip(base['slots'], sample['slots']):
            if [e['name'] for e in original['effects']] != [e['name'] for e in observed['effects']]:
                raise ValueError(f"Effects changed across presets: {entry['recipe_id']}")
        issues = []
        for slot_index, observed in enumerate(sample['slots']):
            controls = observed['quality_controls']
            selected = control(observed)
            if not selected:
                continue
            values = {item['type']: item['value'] for item in controls}
            outside = any((item.get('min') and float(item['value']) < float(item['min'])) or (item.get('max') and float(item['value']) > float(item['max'])) for item in controls)
            if len(set(values.values())) > 1 or outside:
                issues.append({'slot': slot_index, 'displayed_values': values, 'outside_range': bool(outside)})
        preset_issues += len(issues)
        presets[label] = {
            'quality_issues': issues,
            'values': [observed_value(row) for row in sample['stats']] + [observed_value(row, True) for row in sample['resistances']],
            'qualities': [control(slot)['value'] if control(slot) else None for slot in sample['slots']],
            'effects': [[{'multiplier': effect['multiplier'], 'delta': effect['delta']} for effect in slot['effects']] for slot in sample['slots']],
        }
    raw = base['product_stats_raw']
    stops = [raw.find(row['raw_text']) for row in base['stats']] + [raw.find('DAMAGE RESISTANCE')]
    stops = [value for value in stops if value >= 0]
    info = raw[:min(stops)] if stops else raw
    return {'id': entry['recipe_id'], 'title': entry['title'], 'source_url': entry['source_url'],
            'dynamic': dynamic, 'policy': base['quality_policy_raw'],
            'product_info': [line for line in info.splitlines() if line != 'PRODUCT STATS'],
            'warnings': [entry['title']] if '⚠' in entry['title'] else [],
            'dismantle_notices': list(dict.fromkeys(notice for notice in base['notices'] if 'blacklist' in notice.lower())),
            'stats': stats, 'slots': slots, 'presets': presets, 'quality_issue_count': preset_issues}


def build(capture, data_dir, capture_name, raw_sha):
    inspection = inspect(capture)
    if inspection['counts']['complete'] != inspection['counts']['recipes']:
        raise ValueError('Incomplete capture; existing publication was not replaced')
    links = defaultdict(set)
    for key, recipe_id in capture.get('card_recipe_links', []):
        parts = json.loads(key)
        raw = parts[1] if len(parts) == 3 else parts[0]
        if not isinstance(raw, str):
            raise ValueError('Invalid card link')
        links[recipe_id].add(raw)
    lookup = mineral_lookup(data_dir / 'names.zh-CN.json')
    expected_version = json.loads((data_dir / 'scminer-data.json').read_text())['game_data_version']
    if capture.get('source_version_text','').split('-')[0] != expected_version.split('-')[0]:
        raise ValueError('Capture patch version differs from local mineral/translation baseline; update source tables before building')
    translator = BlueprintTranslator(expected_version=expected_version)
    recipes, catalog, translations = [], [], []
    for index, entry in enumerate(sorted(capture['details'], key=lambda item: item['recipe_id']), 1):
        candidates = [parse_card(raw, index) for raw in sorted(links[entry['recipe_id']])]
        if not candidates:
            raise ValueError(f"Missing public card mapping: {entry['recipe_id']}")
        base = entry['samples'].get('base') or entry['samples']['initial']
        expected = material_signature(slot_materials(base['slots']))
        if any(material_signature(item['materials']) != expected for item in candidates):
            raise ValueError(f"Card/detail material mismatch: {entry['recipe_id']}")
        item = candidates[0]
        item['id'] = entry['recipe_id']
        item['name'] = item['name'].replace('⚠', '').strip()
        for material in item['materials']:
            material['mineral'] = lookup.get(material['name'].casefold())
        translations.append(translator.translate(item))
        item.pop('raw_text')
        catalog.append(item)
        recipes.append(compact_recipe(entry))
    counts = Counter(effect['rule']['kind'] for recipe in recipes for slot in recipe['slots'] for effect in slot['effects'])
    source = {'site': 'SCMDB', 'mode': 'user-exported-public-rendered-details',
              'source_url': capture['source_url'], 'captured_at': capture['captured_at'],
              'game_data_version': capture['source_version_text'], 'capture_file': capture_name, 'raw_sha256': raw_sha}
    slot_counts = Counter(material['slot'] for item in catalog for material in item['materials'])
    return {'schema_version': 1, 'source': source,
            'catalog': {'source': source, 'blueprints': catalog, 'slot_counts': dict(sorted(slot_counts.items())),
                        'counts': {'blueprints': len(catalog), 'materials': sum(slot_counts.values()), 'unparsed_cards': 0}},
            'counts': {'recipes': len(recipes), 'dynamic': sum(recipe['dynamic'] for recipe in recipes), 'rules': dict(counts), 'recipes_with_preset_display_issues': sum(recipe['quality_issue_count'] > 0 for recipe in recipes)},
            'translation_report': translator.report(translations), 'recipes': recipes}


def publish(data, output_root):
    payloads = defaultdict(dict)
    for recipe in data['recipes']:
        bucket = int(hashlib.sha256(recipe['id'].encode()).hexdigest()[:8], 16) % SHARDS
        payloads[bucket][recipe['id']] = recipe
    output = output_root / 'dist/blueprint-quality'
    output.mkdir(parents=True, exist_ok=True)
    paths = {}
    expected = set()
    for bucket, recipes in sorted(payloads.items()):
        raw = json.dumps({'schema_version': 1, 'source': data['source'], 'recipes': recipes}, ensure_ascii=False, separators=(',', ':')) + '\n'
        name = f'details-{bucket:02x}-{hashlib.sha256(raw.encode()).hexdigest()[:12]}.json'
        (output / name).write_text(raw)
        expected.add(name)
        for key in recipes:
            paths[key] = f'blueprint-quality/{name}'
    for old in output.glob('details-*.json'):
        if old.name not in expected:
            old.unlink()
    data['quality_paths'] = paths
    destination = output_root / 'data/scmdb-blueprint-quality.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    destination.with_suffix('.translation-report.md').write_text(report_markdown(data['translation_report']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path)
    parser.add_argument('--output-root', type=Path, default=ROOT / 'scminer-local')
    args = parser.parse_args()
    path = args.capture or ROOT / 'scminer-local' / BASELINE
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    data = build(json.loads(raw), args.output_root / 'data', path.name, hashlib.sha256(raw).hexdigest())
    publish(data, args.output_root)
    print(f"Built {len(data['recipes'])} blueprint quality details in {SHARDS} lazy shards; rules: {data['counts']['rules']}")


if __name__ == '__main__':
    main()
