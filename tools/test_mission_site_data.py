#!/usr/bin/env python3
"""Integration checks for the archived mission capture and immutable site shards."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from build_mission_site_data import DEFAULT_CAPTURE, ROOT, build, public_id, minimum_rank


class MissionCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.output = Path(cls.temp.name)
        cls.catalog = build(DEFAULT_CAPTURE, cls.output)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_complete_capture_and_unique_identifiers(self):
        self.assertEqual(len(self.catalog['missions']), 1765)
        self.assertEqual(len({m['id'] for m in self.catalog['missions']}), 1765)
        special = next(m for m in self.catalog['missions'] if m['id'] == '1fmm468')
        self.assertTrue(special['debug_name'].endswith(' '))
        self.assertEqual(public_id(special['debug_name']), special['id'])
        self.assertEqual(self.catalog['source']['game_data_version'], '4.10.2')

    def test_no_guessed_title_translation_and_no_unknown_zero_rewards(self):
        title = next(m for m in self.catalog['missions'] if m['id'] == 'uxvr19')
        self.assertEqual(title['name_zh'], '[DESTINATION] 跑腿')
        self.assertEqual(title['reward'], 48250)
        self.assertEqual(title['reputation'], 50)
        self.assertTrue(any(m['reward'] is None for m in self.catalog['missions']))
        self.assertFalse(any('list_snapshots' in m for m in self.catalog['missions']))

    def test_index_shards_and_generated_files_match(self):
        index = json.loads((self.output / 'dist/missions/index.json').read_text())
        for mission in index['missions']:
            shard = json.loads((self.output / 'dist' / mission['file']).read_text())
            self.assertIn(mission['id'], shard)
            self.assertNotIn('detail', mission)
            self.assertNotIn('calculator', mission)
        for path in (self.output / 'dist/missions').glob('*.json'):
            self.assertEqual(path.read_bytes(), (ROOT / 'scminer-local/dist/missions' / path.name).read_bytes())

    def test_partial_capture_does_not_overwrite_catalog(self):
        capture = json.loads(gzip.decompress(DEFAULT_CAPTURE.read_bytes()))
        capture['completed_mission_keys'].pop()
        incomplete = self.output / 'incomplete.json'
        incomplete.write_text(json.dumps(capture))
        (self.output / 'incomplete.manifest.json').write_text(json.dumps({'game_data_version': '4.10.2'}))
        before = (self.output / 'data/scmdb-missions.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'Incomplete mission'):
            build(incomplete, self.output)
        self.assertEqual(before, (self.output / 'data/scmdb-missions.json').read_bytes())

    def test_reward_pools_are_complete_and_localized(self):
        pools = [pool for mission in self.catalog['missions'] for section in mission['detail']['sections'] for pool in section.get('blueprint_pools', [])]
        self.assertTrue(pools)
        self.assertTrue(all(len(pool['items']) == pool['candidate_count'] for pool in pools))
        mission = next(m for m in self.catalog['missions'] if m['id'] == '1atqjgz')
        pool = next(s['blueprint_pools'][0] for s in mission['detail']['sections'] if s.get('blueprint_pools'))
        self.assertEqual(pool['chance_percent'], 100)
        self.assertEqual(pool['candidate_count'], 4)
        self.assertEqual(pool['items'][0]['name_zh'], '卡纳 “命运” 步枪')

    def test_previous_catalog_read_before_overwrite(self):
        previous = self.output / 'data/scmdb-missions.json'
        build(DEFAULT_CAPTURE, self.output, previous)
        report = json.loads((self.output / 'data/scmdb-missions.diff.json').read_text())
        self.assertFalse(report['baseline'])
        self.assertEqual(report['changed'], [])
        self.assertFalse(report['removals_confirmed'])

    def test_blueprint_reverse_links_match_reward_pools(self):
        reverse = json.loads((self.output / 'dist/missions/blueprint-sources.json').read_text())['blueprints']
        expected = set()
        for mission in self.catalog['missions']:
            for section in mission['detail']['sections']:
                for pool in section.get('blueprint_pools', []):
                    for item in pool['items']:
                        expected.add((item['name_en'], mission['id']))
            self.assertEqual(set(mission['reward_blueprints']), {name for name, key in expected if key == mission['id']})
        self.assertEqual(expected, {(name, task['id']) for name,tasks in reverse.items() for task in tasks})
        self.assertTrue(reverse.get('Karna "Fate" Rifle'))

    def test_community_notes_across_mission_types(self):
        for category in ['Mercenary','Refueling','Investigation','Salvage','Delivery','Hauling - Local']:
            tasks = [m for m in self.catalog['missions'] if m['type']==category and m['name_notes_zh']]
            self.assertTrue(tasks, category)
            self.assertTrue(all(m['name_translation_method']=='community-locale' and m['name_translation_keys'] for m in tasks))
            self.assertTrue(all('<EM4>' not in m['name_zh'] and not any(note in m['name_zh'] for note in m['name_notes_zh']) for m in tasks))

    def test_hauling_title_and_route(self):
        task = next(m for m in self.catalog['missions'] if m['id'] == 'd1ahu3')
        self.assertIn('lv.4 运输老炮', task['name_zh'])
        self.assertEqual(task['hauling'], {'total_scu':'14-32', 'pickups':4, 'dropoffs':1})
        intro = next(m for m in self.catalog['missions'] if m['id'] == '1ab8sjm')
        self.assertEqual(intro['name_zh'], '成为独立货运员的机会')
        self.assertEqual(intro['hauling']['total_scu'], '6')

    def test_minimum_rank_from_captured_marker(self):
        masters = [m for m in self.catalog['missions'] if m['name_en'] == 'Master Rank - Medium Cargo Haul']
        self.assertTrue(masters)
        self.assertTrue(all(m['minimum_rank'] == 6 for m in masters))
        self.assertIsNone(minimum_rank({'rank_tables': [{'ranks': [{'rank': 'UnknownMIN', 'rank_zh': None}]}]}))
        self.assertEqual(minimum_rank({'rank_tables': [{'ranks': [{'rank': 'NeutralMIN', 'rank_zh': '中立'}]}]}), 0)
        self.assertIsNone(minimum_rank({'rank_tables': []}))
        same_rank = {'rank_tables': [{'ranks': [{'rank': 'Elite ContractorMINMAX', 'rank_zh': 'lv.6 精英承包商'}]}]}
        self.assertEqual(minimum_rank(same_rank), 6)
        self.assertEqual(minimum_rank(same_rank, 'MAX'), 6)
        self.assertTrue(any(m['minimum_rank'] == 6 and m['contractor'] == 'Headhunters' for m in self.catalog['missions']))
        capped = [m for m in self.catalog['missions'] if m['maximum_rank'] is not None and m['maximum_rank'] < 6]
        self.assertTrue(capped, 'upper bounds must be preserved for availability filtering')

    def test_location_capture_is_preserved(self):
        for mission in self.catalog['missions']:
            locations = mission['detail']['location_details']
            self.assertEqual(set(locations), {'overview', 'requirements'})
            self.assertTrue(all(value['attempted'] for value in locations.values()))
        self.assertTrue(any(m['detail']['location_details']['requirements']['regions'] for m in self.catalog['missions']))

    def test_archived_manifest_hash(self):
        manifest = json.loads(DEFAULT_CAPTURE.with_name(DEFAULT_CAPTURE.name.removesuffix('.json.gz') + '.manifest.json').read_text())
        self.assertEqual(hashlib.sha256(DEFAULT_CAPTURE.read_bytes()).hexdigest(), manifest['archive_sha256'])


if __name__ == '__main__':
    unittest.main()
