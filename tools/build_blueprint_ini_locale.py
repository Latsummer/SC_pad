#!/usr/bin/env python3
"""Supplement current blueprint names from explicit bilingual INI entries or exact item IDs."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re


def normalize(value):
    return ' '.join(value.split()).casefold()


def build(template, capture, raw):
    values = {}
    bilingual = defaultdict(set)
    for line in raw.decode('utf-8-sig').splitlines():
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        if not key.lower().startswith('item_name'):
            continue
        values[key.lower()] = (key, value)
        parts = value.split('\\n')
        embedded = re.fullmatch(r'(.+[\u4e00-\u9fff])([A-Za-z][^\u4e00-\u9fff]*)', parts[0])
        if embedded:
            bilingual[normalize(embedded[2])].add((key, embedded[1].strip()))
        if len(parts) == 2 and re.search('[\u4e00-\u9fff]', parts[0]) and not re.search('[\u4e00-\u9fff]', parts[1]):
            bilingual[normalize(parts[1])].add((key, parts[0].strip()))
    candidates = defaultdict(set)
    evidence = defaultdict(list)
    for recipe in capture['details']:
        name = recipe['title'].replace('⚠', '').strip()
        for key, zh in sorted(bilingual.get(normalize(name), set())):
            candidates[name].add(zh)
            evidence[name].append({'method': 'explicit-bilingual-name', 'key': key})
        ident = recipe['recipe_id'].removeprefix('BP_CRAFT_').lower()
        hit = values.get('item_name' + ident) or values.get('item_name_' + ident)
        if hit:
            key, value = hit
            first = value.split('\\n')[0].strip()
            # Embedded English component names are retained; annotations are separate lines.
            if re.search('[\u4e00-\u9fff]', first):
                candidates[name].add(first)
                evidence[name].append({'method': 'exact-recipe-item-key', 'key': key})
    applied = {}
    for key, entry in template['keys'].items():
        choices = candidates.get(entry['en'], set())
        # Bilingual lines often also contain the English suffix in an exact-ID entry.
        cleaned = {re.sub(re.escape(entry['en']) + r'$', '', v, flags=re.I).strip() for v in choices}
        cleaned = {v for v in cleaned if re.search('[\u4e00-\u9fff]', v)}
        if len(cleaned) == 1 and not re.search('[\u4e00-\u9fff]', entry['tr']):
            entry['tr'] = next(iter(cleaned))
            applied[key] = evidence[entry['en']]
    template['blueprint_ini_provenance'] = {'sha256': hashlib.sha256(raw).hexdigest(), 'matches': applied}
    return template


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', type=Path, required=True)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--ini', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    packed = args.capture.read_bytes()
    capture = json.loads(gzip.decompress(packed) if args.capture.suffix == '.gz' else packed)
    template = json.loads(args.template.read_text())
    if template['version'] != capture['source_version_text']:
        raise ValueError('Blueprint capture and locale build differ')
    ini_raw = args.ini.read_bytes()
    if args.ini.suffix == '.gz':
        ini_raw = gzip.decompress(ini_raw)
    result = build(template, capture, ini_raw)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"Supplemented {len(result['blueprint_ini_provenance']['matches'])} blueprint language entries")
