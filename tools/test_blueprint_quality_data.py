#!/usr/bin/env python3
import copy
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from build_blueprint_quality_data import BASELINE, ROOT, build, compact_recipe, publish, rule


class QualityDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path=ROOT/'scminer-local'/BASELINE
        cls.capture=json.loads(gzip.decompress(cls.path.read_bytes()))
        cls.data=build(cls.capture,ROOT/'scminer-local/data',cls.path.name,'fixture-sha')
        cls.by_id={item['id']:item for item in cls.data['recipes']}

    def test_all_identities_preserved_including_same_title(self):
        self.assertEqual(len(self.data['recipes']),1618)
        self.assertEqual(set(self.by_id),{item['recipe_id'] for item in self.capture['details']})
        same=[item for item in self.data['catalog']['blueprints'] if item['name_en']=='Inquisitor Core Olive']
        self.assertEqual(len(same),2)
        self.assertNotEqual(same[0]['id'],same[1]['id'])

    def test_discrete_pips_are_not_linear(self):
        parsed=rule('0–399: -1 pip | 400–899: +0 pips | 900–1000: +1 pip')
        self.assertEqual(parsed['kind'],'steps')
        self.assertEqual(parsed['tiers'][0]['max'],399)
        self.assertEqual(parsed['tiers'][1]['min'],400)
        self.assertEqual(parsed['tiers'][2]['delta'],1)
        self.assertEqual(rule('0–399: -1 pip | 500–1000: +1 pip')['kind'],'unverified')

    def test_component_classification_from_public_cards(self):
        catalog = {item['id']: item for item in self.data['catalog']['blueprints']}
        powerbolt = catalog['BP_CRAFT_POWR_LPLT_S01_PowerBolt_SCItem']
        self.assertEqual((powerbolt['component_class'], powerbolt['component_grade']), ('Civilian', 'C'))
        classified = [item for item in catalog.values() if item['component_class']]
        self.assertEqual(len(classified), 319)
        self.assertEqual({item['component_grade'] for item in classified}, set('ABCD'))
        self.assertEqual({item['component_class'] for item in classified}, {'Military', 'Civilian', 'Stealth', 'Industrial', 'Competition'})
        self.assertTrue(all(item['component_grade'] is None for item in catalog.values() if item['component_class'] is None))

    def test_suspect_source_rule_not_invented(self):
        self.assertEqual(rule('Q: 0–1000 · ×9–1.1')['kind'],'unverified')
        self.assertEqual(self.data['counts']['rules']['unverified'],3)
        self.assertEqual(self.data['counts']['rules']['steps'],150)

    def test_firing_modes_stay_separate(self):
        item=next(item for item in self.data['recipes'] if item['title']=='CQ7 Rifle')
        rate=[stat for stat in item['stats'] if stat['label']=='Fire Rate']
        self.assertEqual([row['section'] for row in rate],['Rapid','Burst (sequence)'])
        self.assertEqual([row['base'] for row in rate],['650 RPM','680 RPM'])

    def test_preset_outputs_align_with_source(self):
        for entry in self.capture['details']:
            recipe=self.by_id[entry['recipe_id']]
            for label,preset in recipe['presets'].items():
                original=entry['samples'][label]
                self.assertEqual(len(preset['values']),len(recipe['stats']))
                self.assertEqual(len(preset['qualities']),len(recipe['slots']))
                for source,quality in zip(original['slots'],preset['qualities']):
                    controls=source['quality_controls']
                    if controls:self.assertIn(quality,[control['value'] for control in controls])

    def test_wrong_patch_requires_updated_source_tables(self):
        capture=copy.deepcopy(self.capture)
        capture['source_version_text']='4.11.0-live.test'
        with self.assertRaisesRegex(ValueError,'patch version differs'):
            build(capture,ROOT/'scminer-local/data','fixture','sha')

    def test_source_preset_display_conflict_is_retained_and_flagged(self):
        recipe=next(item for item in self.data['recipes'] if item['title']=='OverDrive')
        self.assertTrue(recipe['presets']['base']['quality_issues'])
        self.assertEqual(recipe['presets']['base']['quality_issues'][0]['displayed_values'],{'number':'0','range':'1'})
        self.assertFalse(recipe['presets']['max']['quality_issues'])

    def test_mixed_card_cannot_attach_to_recipe(self):
        capture=copy.deepcopy(self.capture)
        capture['details']=capture['details'][:1]
        capture['card_recipe_links']=[]
        with self.assertRaisesRegex(ValueError,'Missing public card mapping'):
            build(capture,ROOT/'scminer-local/data','fixture','sha')

    def test_hashed_shards_reproduce_and_resolve(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            data=copy.deepcopy(self.data)
            publish(data,root)
            first={path.name:path.read_bytes() for path in (root/'dist/blueprint-quality').glob('*.json')}
            self.assertEqual(len(first),64)
            self.assertLess(max(map(len,first.values())),200_000)
            for recipe_id,path in data['quality_paths'].items():
                payload=json.loads(first[Path(path).name])
                self.assertEqual(payload['recipes'][recipe_id]['id'],recipe_id)
            publish(data,root)
            self.assertEqual(first,{path.name:path.read_bytes() for path in (root/'dist/blueprint-quality').glob('*.json')})


if __name__=='__main__':unittest.main()
