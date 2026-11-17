import unittest
import gzip
import json
from pathlib import Path
from build_blueprint_ini_locale import build

class BlueprintIniLocaleTests(unittest.TestCase):
    def test_explicit_names_and_exact_ids_only(self):
        template = {'keys': {'a': {'en': 'Gun', 'tr': 'Gun'}, 'b': {'en': 'Cooler', 'tr': 'Cooler'}, 'c': {'en': 'Unknown', 'tr': 'Unknown'}}}
        capture = {'details': [{'recipe_id': 'BP_CRAFT_gun', 'title': 'Gun'}, {'recipe_id': 'BP_CRAFT_cool', 'title': 'Cooler'}, {'recipe_id': 'BP_CRAFT_unknown', 'title': 'Unknown'}]}
        raw = 'item_Namegun=步枪\\nGun\nitem_Namecool=冷却器Cooler\\n[冷却 S1]\nitem_Nameother=其他\\nUnknown variant'.encode()
        result = build(template, capture, raw)
        self.assertEqual(result['keys']['a']['tr'], '步枪')
        self.assertEqual(result['keys']['b']['tr'], '冷却器')
        self.assertEqual(result['keys']['c']['tr'], 'Unknown')
        self.assertTrue(result['blueprint_ini_provenance']['matches'])

    def test_published_locale_rebuilds_from_archived_inputs(self):
        from build_blueprint_quality_data import BASELINE
        root = Path(__file__).resolve().parents[1] / 'scminer-local'
        template = json.loads((root / 'data/scmdb-mission-locale.zh-CN.json').read_text())
        capture = json.loads(gzip.decompress((root / BASELINE).read_bytes()))
        source = json.loads((root / 'data/game-locale.zh-CN.json').read_text())
        raw = gzip.decompress((root / 'imports/localization' / source['game_version'] / (source['source_name'] + '.gz')).read_bytes())
        expected = json.loads((root / 'data/scmdb-current-locale.zh-CN.json').read_text())
        self.assertEqual(build(template, capture, raw), expected)

    def test_conflicting_translations_stay_english(self):
        template = {'keys': {'a': {'en': 'Gun', 'tr': 'Gun'}}}
        capture = {'details': [{'recipe_id': 'BP_CRAFT_gun', 'title': 'Gun'}]}
        result = build(template, capture, 'item_Namea=甲\\nGun\nitem_Nameb=乙\\nGun'.encode())
        self.assertEqual(result['keys']['a']['tr'], 'Gun')

if __name__ == '__main__':
    unittest.main()
