"""Regression checks for English imports, Chinese captures and ambiguous translations."""
import json
from pathlib import Path
import tempfile
import unittest
from scmdb_locale import BlueprintTranslator
from import_scmdb_public_capture import parse_card, mineral_lookup


class TranslationTests(unittest.TestCase):
    def test_aluminum_alias_links_to_existing_mineral(self):
        root = Path(__file__).resolve().parents[1]
        lookup = mineral_lookup(root / 'scminer-local/data/names.zh-CN.json')
        self.assertEqual(lookup['aluminum'], lookup['aluminium'])
        self.assertEqual(lookup['aluminum']['id'], 'aluminium')
        self.assertEqual(lookup['aluminum']['zh'], '铝')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.locale, self.overrides = root / 'locale.json', root / 'overrides.json'
        self.locale.write_text(json.dumps({'version': 'test', 'keys': {
            'a': {'en': 'Probe', 'tr': '探测器'},
            'b': {'en': 'Mercury', 'tr': '水银'},
            'c': {'en': 'Mercury', 'tr': '汞'},
            'd': {'en': 'No translation', 'tr': 'No translation'},
        }}))
        self.overrides.write_text(json.dumps({'version': 'test', 'names': {
            'Mercury': {'zh': '水银', 'type_group': '冷却器', 'size': 3},
        }}))
        self.translator = BlueprintTranslator(self.locale, self.overrides, 'test')

    def test_english_and_chinese_capture(self):
        en = {'name': 'Probe'}
        self.translator.translate(en)
        self.assertEqual((en['name_en'], en['name_zh']), ('Probe', '探测器'))
        zh = {'name': '探测器'}
        self.translator.translate(zh)
        self.assertEqual((zh['name_en'], zh['name_zh']), ('Probe', '探测器'))

    def test_ambiguous_and_contextual_override(self):
        item = {'name': 'Mercury', 'type_group': '其他', 'size': 3}
        self.assertEqual(self.translator.translate(item)['status'], 'ambiguous')
        self.assertIsNone(item['name_zh'])
        item['type_group'] = '冷却器'
        self.assertEqual(self.translator.translate(item)['status'], 'override')
        self.assertEqual(item['name_zh'], '水银')

    def test_missing_keeps_english(self):
        item = {'name': 'No translation'}
        self.assertEqual(self.translator.translate(item)['status'], 'missing')
        self.assertEqual(item['name_en'], 'No translation')
        self.assertIsNone(item['name_zh'])

    def test_version_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            BlueprintTranslator(self.locale, self.overrides, 'different')


class BlueprintCategoryTests(unittest.TestCase):
    def test_component_icons_match_captured_equipment(self):
        # Representative public card headers: do not infer categories from emoji names.
        for name, icon, expected in [
            ('FR-66', '🔰 Size1', '护盾'),
            ('XL-1', '🚀 Size2', '量子驱动'),
            ('Clearcut Module', '💠 Active', '采矿模组'),
            ('Mercury', '❄️ Size3', '冷却器'),
        ]:
            with self.subTest(name=name):
                card = parse_card(f'☐\n{name}\n{icon}\nS1\nShell\nIron (0.1 SCU)\n⏱ 60s', 1)
                self.assertEqual(card['type_group'], expected)
                self.assertEqual(len(card['materials']), 1)


if __name__ == '__main__':
    unittest.main()
