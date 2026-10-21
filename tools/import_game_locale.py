#!/usr/bin/env python3
"""Import a user-supplied global.ini; retain only keys bridged by SCMDB English text."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def clean_translation(value, english):
    # This localization adds a community reward appendix; rewards come from captured data.
    value = re.split(r'(?:\*+\s*)?(?:<EM4>)?\[任务蓝图奖励\]', value, maxsplit=1)[0]
    value = re.sub(r'<[^>]*>', '', value).rstrip(' *')
    tokens = {re.sub(r'_', '', token).lower(): token for token in re.findall(r'\[([A-Z_0-9]+)\]', english)}
    def placeholder(match):
        name = match[1].split('|', 1)[0].strip()
        return '[' + tokens.get(name.replace('_', '').lower(), name.upper()) + ']'
    value = re.sub(r'~mission\(([^)]+)\)', placeholder, value, flags=re.I)
    return value.replace('\\n', '\n').strip()


def convert(path, version):
    raw = path.read_bytes()
    values = {}
    for line in raw.decode('utf-8-sig').splitlines():
        if '=' not in line or line.lstrip().startswith((';', '#')):
            continue
        key, value = line.split('=', 1)
        key = key.removesuffix(',P').lower()
        if key in values:
            raise ValueError(f'Duplicate language key: {key}')
        values[key] = value
    bridge = json.loads((ROOT / 'scminer-local/data/scmdb-locale.zh-CN.json').read_text())
    keys = {}
    for key, entry in bridge['keys'].items():
        if key.lower() not in values:
            continue
        translated = clean_translation(values[key.lower()], entry.get('en', ''))
        if re.search('[\u4e00-\u9fff]', translated) and not re.search(r'等待译名|未翻译|<REDACTED>', translated):
            keys[key] = translated
    return {'format': 'game-global-locale-v1', 'game_version': version, 'source_name': 'global.ini',
            'source_sha256': hashlib.sha256(raw).hexdigest(), 'source_key_count': len(values),
            'bridge_version': bridge['version'], 'keys': keys}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Local global.ini (temporary filenames also accepted)')
    parser.add_argument('--game-version', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'scminer-local/data/game-locale.zh-CN.json')
    args = parser.parse_args()
    result = convert(args.input, args.game_version)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"Imported {len(result['keys'])} bridged translations from {result['source_key_count']} language keys")
