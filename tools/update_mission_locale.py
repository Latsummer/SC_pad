#!/usr/bin/env python3
"""Validate/archive the public SCMDB language file independently of blueprint data."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
from datetime import datetime, timezone
from urllib.request import urlopen

SOURCE = 'https://raw.githubusercontent.com/Walkersifolia/SCMDB_zh_cn/main/lang-zh_CN-live.json'
ROOT = Path(__file__).resolve().parents[1] / 'scminer-local'


def update(raw, patch, root=ROOT):
    data = json.loads(raw)
    version = data['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+-[A-Za-z0-9._-]+',version) or version.split('-')[0] != patch:
        raise ValueError('Mission locale patch mismatch')
    if data.get('sourceLanguage') != 'en' or data.get('targetLanguage') != 'zh_CN' or data.get('keyCount') != len(data['keys']):
        raise ValueError('Invalid language table metadata')
    if not all(isinstance(v.get('en'),str) and isinstance(v.get('tr'),str) for v in data['keys'].values()):
        raise ValueError('Invalid language table entries')
    archive = root / 'imports/localization' / patch / f'scmdb-lang-{version}.json.gz'
    packed = gzip.compress(raw,mtime=0)
    if archive.exists() and gzip.decompress(archive.read_bytes()) != raw:
        raise ValueError('This version already has different archived content; review source changes before replacing')
    archive.parent.mkdir(parents=True,exist_ok=True)
    if not archive.exists():
        archive.write_bytes(packed)
        archive.with_name(archive.name.removesuffix('.json.gz')+'.manifest.json').write_text(json.dumps({
            'source_url':SOURCE,'retrieved_at':datetime.now(timezone.utc).isoformat(),'version':version,
            'raw_sha256':hashlib.sha256(raw).hexdigest(),'archive_sha256':hashlib.sha256(packed).hexdigest(),
            'note':'Mission title/notes snapshot; separate from blueprint and game INI bridge.'},indent=2)+'\n')
    target = root/'data/scmdb-mission-locale.zh-CN.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(raw)
    print(f'Updated mission locale: {version}, {len(data["keys"])} keys')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-version',required=True)
    parser.add_argument('--input',type=Path,help='Read a previously downloaded file instead of requesting the public source')
    args = parser.parse_args()
    if args.input:
        payload = args.input.read_bytes()
    else:
        with urlopen(SOURCE,timeout=60) as response:
            payload = response.read()
    update(payload,args.game_version)
