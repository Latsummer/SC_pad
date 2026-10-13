"""Offline, exact-name translation; never guess between conflicting entries."""
from collections import defaultdict
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALE = ROOT / 'scminer-local/data/scmdb-locale.zh-CN.json'
OVERRIDES = ROOT / 'scminer-local/data/blueprint-name-overrides.zh-CN.json'
SOURCE_URL = 'https://github.com/Walkersifolia/SCMDB_zh_cn/blob/bff507d0bedf34d5786b2f0664fa1eb0af6328af/lang-zh_CN-live.json'


class BlueprintTranslator:
    def __init__(self, locale_path=LOCALE, overrides_path=OVERRIDES, expected_version=None):
        raw = Path(locale_path).read_bytes()
        data = json.loads(raw)
        overrides = json.loads(Path(overrides_path).read_text())
        self.version = data['version']
        if expected_version and self.version != expected_version:
            raise ValueError(f'Translation version {self.version} does not match dataset {expected_version}')
        if overrides['version'] != self.version:
            raise ValueError('Blueprint overrides and translation versions do not match')
        self.overrides = overrides['names']
        self.forward = defaultdict(set)
        self.reverse = defaultdict(set)
        for entry in data['keys'].values():
            en, zh = entry.get('en'), entry.get('tr')
            if en and zh and en != zh and re.search('[\u4e00-\u9fff]', zh):
                self.forward[en].add(zh)
                self.reverse[zh].add(en)
        self.metadata = {'version': self.version, 'source_url': SOURCE_URL,
                         'sha256': hashlib.sha256(raw).hexdigest()}

    def translate(self, item):
        name = item['name']
        # Retain the original captured title as name; display and search use both locale fields.
        if re.search('[\u4e00-\u9fff]', name):
            candidates = sorted(self.reverse.get(name, set()))
            item.update(name_zh=name, name_en=candidates[0] if len(candidates) == 1 else None)
            return {'status': 'captured_zh' if len(candidates) <= 1 else 'ambiguous_reverse',
                    'name': name, 'candidates': candidates}
        override = self.overrides.get(name)
        if override and all(item.get(k) == override[k] for k in ('type_group', 'size') if k in override):
            item.update(name_en=name, name_zh=override['zh'])
            return {'status': 'override', 'name': name}
        candidates = sorted(self.forward.get(name, set()))
        item.update(name_en=name, name_zh=candidates[0] if len(candidates) == 1 else None)
        return {'status': 'translated' if len(candidates) == 1 else 'ambiguous' if candidates else 'missing',
                'name': name, 'candidates': candidates}

    def report(self, results):
        from collections import Counter
        return {'locale': self.metadata, 'counts': dict(Counter(r['status'] for r in results)),
                'issues': [r for r in results if r['status'] in ('missing', 'ambiguous', 'ambiguous_reverse')]}


def report_markdown(report):
    labels = {'translated': '社区表唯一匹配', 'override': '人工确认译名',
              'captured_zh': '保留中文导出名称', 'missing': '缺少中文译名',
              'ambiguous': '中文候选存在歧义', 'ambiguous_reverse': '英文反查存在歧义'}
    lines = ['# 蓝图翻译检查报告', '', f"翻译版本：`{report['locale']['version']}`", '',
             f"翻译来源：[社区翻译快照]({report['locale']['source_url']})", '',
             '## 统计', '', '| 检查结果 | 蓝图数量 |', '| --- | ---: |']
    for status, count in sorted(report['counts'].items()):
        lines.append(f'| {labels[status]} | {count} |')
    lines += ['', '## 需要核对的名称', '',
              '缺少译名或存在歧义的英文导出条目继续显示英文，不会随意选择译名。中文导出遇到反查歧义时保留中文，英文名留空。', '',
              '| 原始名称 | 原因 | 候选名称 |', '| --- | --- | --- |']
    for issue in report['issues']:
        escape = lambda text: str(text).replace('|', '\\|').replace('\n', ' ')
        candidates = '；'.join(issue.get('candidates', [])) or '暂无'
        lines.append(f"| {escape(issue['name'])} | {labels[issue['status']]} | {escape(candidates)} |")
    if not report['issues']:
        lines += ['| — | 无待核对条目 | — |']
    return '\n'.join(lines) + '\n'
