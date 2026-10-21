#!/usr/bin/env python3
"""Inspect locally captured Craft quality samples; never modifies the recipe catalog."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit


def quality_range(text):
    text = text.replace('−','-')
    match = re.fullmatch(r'Q:\s*(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)\s*·\s*×(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)\s*·\s*Base:\s*(\d+(?:\.\d+)?)',text)
    if not match:
        return None
    q0,q1,m0,m1,base = map(float,match.groups())
    if q0>=q1 or not q0<=base<=q1:
        raise ValueError('Invalid quality range')
    return {'quality_min':q0,'quality_max':q1,'multiplier_at_min':m0,'multiplier_at_max':m1,'base_quality':base,'interpolation':'unverified'}


def inspect(data):
    if data.get('format') != 'scmdb-public-fabricator-details-v1':
        raise ValueError('Not a blueprint detail export; do not use the old card export')
    seen = set()
    results = []
    for entry in data['details']:
        key = entry['recipe_id']
        url = urlsplit(entry['source_url'])
        if key in seen or url.hostname != 'scmdb.net' or parse_qs(url.query).get('fab') != [key]:
            raise ValueError(f'Invalid/duplicate recipe identity: {key}')
        seen.add(key)
        samples = entry['samples']
        if not samples:
            raise ValueError(f'No snapshots: {key}')
        baseline = samples.get('base', samples.get('initial',next(iter(samples.values()))))
        signature = [(slot['slot'],slot['material'],slot['quantity']) for slot in baseline['slots']]
        for snapshot in samples.values():
            if snapshot['recipe_id'] != key or snapshot['mode'] != 'craft' or signature != [(slot['slot'],slot['material'],slot['quantity'])for slot in snapshot['slots']]:
                raise ValueError(f'Mixed recipe/mode/slot samples: {key}')
        dynamic = any(sample['quality_controls_present'] for sample in samples.values())
        complete = bool(entry.get('sampling_complete')) and (all(label in samples for label in ['min','base','half','max']) if dynamic else bool(baseline['quality_policy_raw']))
        ranges = []
        for slot in baseline['slots']:
            for effect in slot['effects']:
                ranges.append({'slot':slot['slot'],'material':slot['material'],'effect':effect['name'],'raw':effect['range_raw'],'range':quality_range(effect['range_raw'])})
        results.append({'recipe_id':key,'title':entry['title'],'sampling_complete':complete,'quality_controls_present':dynamic,
                        'fixed_quality_policy':baseline['quality_policy_raw'],'samples':list(samples),'slot_count':len(signature),
                        'effect_ranges':ranges,'unparsed_ranges':sum(row['range']is None for row in ranges)})
    return {'format':'scmdb-blueprint-detail-inspection-v1','source_version_text':data.get('source_version_text'),
            'counts':{'recipes':len(results),'complete':sum(row['sampling_complete']for row in results)},'recipes':results,
            'note':'Quality endpoints and observed presets do not establish interpolation, effect stacking, or final product formulas.'}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    result=inspect(json.loads(args.input.read_text()))
    rendered=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.output: args.output.write_text(rendered)
    else: print(rendered,end='')
