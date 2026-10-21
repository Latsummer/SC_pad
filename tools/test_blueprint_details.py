import copy
import unittest
from inspect_blueprint_details import inspect, quality_range


class DetailInspectionTests(unittest.TestCase):
    def fixture(self):
        snapshot={'recipe_id':'BP_Test','mode':'craft','quality_controls_present':True,'quality_policy_raw':'',
                  'slots':[{'slot':'Frame','material':'Aluminum','quantity':'0.03 SCU','effects':[{'name':'Recoil Kick','range_raw':'Q: 0–1000 · ×1.2–0.8 · Base: 500'}]}]}
        return {'format':'scmdb-public-fabricator-details-v1','source_version_text':'4.10.2',
                'details':[{'recipe_id':'BP_Test','source_url':'https://scmdb.net/?page=fab&fab=BP_Test','title':'Test','sampling_complete':True,
                            'samples':{label:copy.deepcopy(snapshot)for label in ['min','base','half','max']}}]}

    def test_descending_multiplier_endpoints_are_preserved(self):
        rule=quality_range('Q: 0–1000 · ×1.2–0.8 · Base: 500')
        self.assertEqual(rule['multiplier_at_min'],1.2)
        self.assertEqual(rule['multiplier_at_max'],0.8)
        self.assertEqual(rule['interpolation'],'unverified')
        self.assertIsNone(quality_range('new unknown wording'))

    def test_full_and_partial_presets(self):
        data=self.fixture()
        self.assertEqual(inspect(data)['counts'],{'recipes':1,'complete':1})
        del data['details'][0]['samples']['max']
        self.assertEqual(inspect(data)['counts']['complete'],0)

    def test_fixed_quality_needs_explicit_policy(self):
        data=self.fixture();snapshot=data['details'][0]['samples']['base']
        snapshot.update(quality_controls_present=False,quality_policy_raw='Min. quality required: 0 — higher quality has no effect')
        snapshot['slots'][0]['effects']=[]
        data['details'][0]['samples']={'initial':snapshot}
        self.assertTrue(inspect(data)['recipes'][0]['sampling_complete'])
        snapshot['quality_policy_raw']=''
        self.assertFalse(inspect(data)['recipes'][0]['sampling_complete'])

    def test_mixed_recipe_samples_are_rejected(self):
        data=self.fixture();data['details'][0]['samples']['max']['slots'][0]['material']='Iron'
        with self.assertRaisesRegex(ValueError,'Mixed recipe'):inspect(data)
        data=self.fixture();data['details'][0]['source_url']='https://scmdb.net/?fab=BP_Other'
        with self.assertRaisesRegex(ValueError,'identity'):inspect(data)


if __name__=='__main__':unittest.main()
