#!/usr/bin/env python3
"""Integration checks for the archived mission capture and immutable site shards."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from build_mission_site_data import DEFAULT_CAPTURE, ROOT, build, public_id


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
        before = (self.output / 'data/scmdb-missions.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'Incomplete mission'):
            build(incomplete, self.output)
        self.assertEqual(before, (self.output / 'data/scmdb-missions.json').read_bytes())

    def test_previous_catalog_read_before_overwrite(self):
        previous = self.output / 'data/scmdb-missions.json'
        build(DEFAULT_CAPTURE, self.output, previous)
        report = json.loads((self.output / 'data/scmdb-missions.diff.json').read_text())
        self.assertFalse(report['baseline'])
        self.assertEqual(report['changed'], [])
        self.assertFalse(report['removals_confirmed'])

    def test_archived_manifest_hash(self):
        manifest = json.loads(DEFAULT_CAPTURE.with_name(DEFAULT_CAPTURE.name.removesuffix('.json.gz') + '.manifest.json').read_text())
        self.assertEqual(hashlib.sha256(DEFAULT_CAPTURE.read_bytes()).hexdigest(), manifest['archive_sha256'])


if __name__ == '__main__':
    unittest.main()
