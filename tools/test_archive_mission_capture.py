import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from archive_mission_capture import archive
from build_mission_site_data import public_id


class ArchiveTests(unittest.TestCase):
    def test_archive_preserves_bytes_and_rejects_incomplete(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            key = 'live:' + public_id('Mission ')
            fixture = {'format':'scmdb-public-missions-capture-v1','helper_version':7,'source_url':'https://scmdb.net/',
                       'captured_at':'2026-10-20T00:00:00Z','completed_mission_keys':[key],'location_completed_mission_keys':[key],
                       'missions':[{'channel':'live','mission_id':key.split(':')[1],'debug_name':'Mission ',
                                    'detail_snapshots':[{'tab_key':t, 'location_details':{'attempted':True}} for t in ['overview','requirements','calculator']]}]}
            source = root/'capture.json'
            source.write_text(json.dumps(fixture))
            archive(source,'4.10.2',root/'archive')
            packed = (root/'archive/capture.json.gz').read_bytes()
            self.assertEqual(gzip.decompress(packed),source.read_bytes())
            manifest = json.loads((root/'archive/capture.manifest.json').read_text())
            self.assertEqual(manifest['raw_sha256'],hashlib.sha256(source.read_bytes()).hexdigest())
            with self.assertRaisesRegex(ValueError,'already exists'):archive(source,'4.10.2',root/'archive')
            fixture['location_completed_mission_keys'] = []
            source.write_text(json.dumps(fixture))
            with self.assertRaisesRegex(ValueError,'Incomplete location'):archive(source,'4.10.2',root/'invalid')
            self.assertFalse((root/'invalid').exists())


if __name__ == '__main__':
    unittest.main()
