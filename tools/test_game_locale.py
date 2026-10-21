import unittest
from import_game_locale import clean_translation


class GameLocaleTests(unittest.TestCase):
    def test_dynamic_tokens_and_markup(self):
        self.assertEqual(clean_translation('<EM4>~mission(Location|Address)</EM4>\\n~mission(ClaimNumber)', '[LOCATION] [CLAIM_NUMBER]'), '[LOCATION]\n[CLAIM_NUMBER]')

    def test_reward_appendix(self):
        self.assertEqual(clean_translation('正文\\n\\n********** <EM4>[任务蓝图奖励]</EM4> **********\\n附加奖励', ''), '正文')

    def test_plain_text_keeps_final_letters(self):
        self.assertEqual(clean_translation('中文 Stanton', ''), '中文 Stanton')


if __name__ == '__main__':
    unittest.main()
