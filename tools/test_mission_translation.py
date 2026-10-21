import unittest
from mission_translation import canonical, clean_title, fill_variables, resolve_title, rule_title, community_title_index, resolve_community_title


class TranslationTests(unittest.TestCase):
    def test_punctuation_equivalence(self):
        self.assertEqual(canonical('打捞许可 #[CLAIM]：[SHIP]'),canonical('打捞许可 #[CLAIM]: [SHIP]'))
        self.assertEqual(resolve_title('Claim #[CLAIM]: [SHIP]', ['打捞许可 #[CLAIM]：[SHIP]','打捞许可 #[CLAIM]: [SHIP]'])[1], 'locale-normalized')

    def test_real_ambiguity_stays_untranslated(self):
        self.assertIsNone(resolve_title('Data Transfer', ['数据转移','数据传输'])[0])

    def test_variables_are_from_source(self):
        self.assertEqual(fill_variables('Junior Rank - Extra Small Cargo Haul','[RANK] [CARGO_GRADE]货运'),'初级 微型货运')
        self.assertEqual(fill_variables('Verified Bounty: [TARGET] | Very High-Risk Target','[TARGET] [DANGER]'),'[TARGET] 极高风险')
        self.assertIsNone(fill_variables('Unknown task','[LOCATION]任务'))

    def test_annotations_and_meaningful_newlines(self):
        self.assertEqual(clean_title('任务[蓝图]\\n[社区备注]'),'任务')
        self.assertEqual(clean_title('已验证赏金：[TARGET]\\n[DANGER]'),'已验证赏金：[TARGET] [DANGER]')

    def test_captured_rank_label_takes_precedence(self):
        self.assertEqual(rule_title('Experienced Rank - Small Cargo Haul', {'Experienced':'lv.4 运输老炮'}), 'lv.4 运输老炮级别：小型货运')
        self.assertEqual(resolve_title('Experienced Rank - Small Cargo Haul', ['[RANK]级别：[CARGO_GRADE]货运'], {'Experienced':'lv.4 运输老炮'})[0], 'lv.4 运输老炮级别：小型货运')

    def test_community_templates_and_separate_notes(self):
        index = community_title_index({'cargo_title': {'en':'Senior Rank - Medium Cargo Haul', 'tr':'[RANK] 级别 - [CARGO_GRADE] 货物运输\\n[科瓦莱什 - 一对多货运]<EM4>[lv.6 蓝图]</EM4>'}})
        result = resolve_community_title('Experienced Rank - Small Cargo Haul', index, {'Experienced':'lv.4 运输老炮'}, {'pickups':1,'dropoffs':3})
        self.assertEqual(result['title'],'lv.4 运输老炮 级别 - 小型 货物运输')
        self.assertEqual(result['notes'], ['lv.6 蓝图','科瓦莱什 - 一对多货运'])
        self.assertEqual(result['keys'],['cargo_title'])
        self.assertIsNone(resolve_community_title('Experienced Rank - Small Cargo Haul', index, {}, {'pickups':4,'dropoffs':1}))
        index = community_title_index({'combat_title': {'en':'A Fond Farewell','tr':'深情告别\\n[沃恩 - 寻找尸体 VHRT]'}})
        result = resolve_community_title('A Fond Farewell',index)
        self.assertEqual(result['title'],'深情告别')
        self.assertEqual(result['notes'], ['沃恩 - 寻找尸体 VHRT'])

    def test_rules_are_full_matches(self):
        self.assertEqual(rule_title('Experienced Hauler Needed for Direct Large Shipment'),'招募资深运输员：大型直达货运')
        self.assertEqual(rule_title("Minor Repairs Needed: Yang's Place"),"小规模维修需求：Yang's Place")
        self.assertIsNone(rule_title('New Experienced Hauler Needed for Direct Large Shipment Special'))
        self.assertIsNone(rule_title('Junior Rank - Huge Cargo Haul'))


if __name__ == '__main__':
    unittest.main()
