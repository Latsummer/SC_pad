#!/usr/bin/env python3
"""Validate and archive an English public mission export; no network requests."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
from build_mission_site_data import public_id, ROOT


def archive(path, version, output):
    raw = path.read_bytes()
    data = json.loads(raw)
    if data.get('format') != 'scmdb-public-missions-capture-v1':
        raise ValueError('Unsupported capture')
    completed = set(data['completed_mission_keys'])
    located = set(data.get('location_completed_mission_keys', []))
    ids = set()
    tabs = Counter()
    for mission in data['missions']:
        key = mission['channel'] + ':' + mission['mission_id']
        if key in ids or public_id(mission['debug_name']) != mission['mission_id']:
            raise ValueError(f'Duplicate or invalid mission identity: {key}')
        ids.add(key)
        snapshots = {s['tab_key']: s for s in mission['detail_snapshots']}
        if key not in completed or not {'overview','requirements','calculator'} <= snapshots.keys():
            raise ValueError(f'Incomplete task: {key}')
        if data.get('helper_version', 0) >= 7:
            if key not in located or not all(snapshots[t].get('location_details', {}).get('attempted') for t in ['overview','requirements']):
                raise ValueError(f'Incomplete location capture: {key}')
        tabs.update(snapshots.keys())
    if not ids:
        raise ValueError('Empty capture')
    packed = gzip.compress(raw, mtime=0)
    target = output / (path.stem + '.json.gz')
    manifest_path = output / (path.stem + '.manifest.json')
    if target.exists() or manifest_path.exists():
        raise ValueError('Archive already exists; do not overwrite source evidence')
    manifest = {'schema_version':1,'archive':target.name,'source_filename':path.name,'source_url':data['source_url'],
                'captured_at':data['captured_at'],'helper_version':data['helper_version'],
                'game_data_version':version,'game_data_version_status':'user-confirmed patch; full build not asserted',
                'content_language':'en','content_language_basis':'operator confirmed via --english; not inferred from HTML lang',
                'raw_bytes':len(raw),'archive_bytes':len(packed),'raw_sha256':hashlib.sha256(raw).hexdigest(),
                'archive_sha256':hashlib.sha256(packed).hexdigest(),
                'counts':{'listed_missions':len(ids),'completed_missions':len(ids),'location_completed_missions':len(ids & located),'tabs':dict(tabs)},
                'coverage_note':'Complete for this exported list only. Missing IDs are candidates, not confirmed removals.'}
    output.mkdir(parents=True, exist_ok=True)
    target.write_bytes(packed)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('--game-version', required=True)
    parser.add_argument('--english', action='store_true', required=True, help='Confirm the site was using original English')
    parser.add_argument('--output', type=Path, default=ROOT/'scminer-local/imports/scmdb/missions')
    args = parser.parse_args()
    archive(args.capture,args.game_version,args.output)
