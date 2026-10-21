"""Conservative mission title matching; full-match rules never infer mission facts."""
import re
import unicodedata

RANKS = {'Trainee':'见习','Rookie':'新手','Junior':'初级','Member':'正式','Experienced':'资深','Senior':'高级','Master':'大师'}
CARGO = {'Extra Small':'微型','Small':'小型','Medium':'中型','Large':'大型','Bulk':'大宗'}
DANGER = {'Very Low':'极低风险','Low':'低风险','Moderate':'中等风险','High':'高风险','Very High':'极高风险','Extreme':'极端风险'}


def clean_title(value):
    value = re.sub(r'\\+n', '\n', value)
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    # Community annotations are separate bracketed Chinese lines, not game title text.
    lines = [line for line in lines if not (re.search('[\u4e00-\u9fff]', line) and re.fullmatch(r'(?:\[[^\]]*\]\s*)+', line))]
    return re.sub(r'\[(?:任务)?蓝图\]', '', ' '.join(lines)).strip()


def canonical(value):
    value = unicodedata.normalize('NFKC', clean_title(value))
    value = value.translate(str.maketrans({'’':"'",'‘':"'",'“':'"','”':'"','—':'-','–':'-'}))
    return re.sub(r'\s+', ' ', re.sub(r'\s*([:|,\-])\s*', r'\1', value)).strip().casefold()


def fill_variables(english, translated, rank_labels=None):
    values = {}
    for token, choices in [('RANK',RANKS | (rank_labels or {})),('CARGO_GRADE',CARGO)]:
        hits = [zh for en,zh in choices.items() if re.search(r'(?<!\w)'+re.escape(en)+r'(?!\w)', english, re.I)]
        # Extra Small contains Small: prefer the longest source label.
        if token == 'CARGO_GRADE' and re.search(r'Extra Small',english,re.I): hits = [CARGO['Extra Small']]
        if len(set(hits)) == 1: values[token] = hits[0]
    if 'Fuel Tanks' in english: values['OBJECTS'] = '燃料罐'
    for level,zh in sorted(DANGER.items(), key=lambda entry: -len(entry[0])):
        if english.endswith(level+'-Risk Target'): values['DANGER'] = zh; break
    match = re.fullmatch(r'(?:Minor|Moderate|Extensive) Repairs Needed: (.+)',english)
    if not match: match = re.fullmatch(r'(.+) needs (?:some|a bunch of|massive) repairs',english)
    if match: values['LOCATION'] = match[1]
    match = re.fullmatch(r'Inter-Outpost Delivery at (.+) - Multiple Boxes',english)
    if match: values['DESTINATION'] = match[1]
    for token,value in values.items(): translated = translated.replace('['+token+']',value)
    if not set(re.findall(r'\[[A-Z_0-9]+\]',translated)) <= set(re.findall(r'\[[A-Z_0-9]+\]',english)):
        return None
    return translated


def rule_title(name, rank_labels=None):
    """Reviewed wording rules. Source must match the whole expression."""
    labels = RANKS | (rank_labels or {})
    rank = '|'.join(RANKS); cargo = '|'.join(sorted(CARGO,key=len,reverse=True))
    patterns = [
        (rf'({rank}) Hauler Needed for (Direct )?({cargo}) Shipment',lambda m:f'招募{labels[m[1]]}运输员：{CARGO[m[3]]}'+('直达' if m[2] else '')+'货运'),
        (rf'({rank}) Rank - (Direct )?({cargo}) Cargo Haul',lambda m:f'{labels[m[1]]}级别：{CARGO[m[3]]}'+('直达' if m[2] else '')+'货运'),
        (rf'DEAD SAINTS\s*--?\s*({rank}) Rank[,-]\s*({cargo})(?: Scale)? Cargo (?:Run|Haul)',lambda m:f'死亡圣徒：{labels[m[1]]}级别 · {CARGO[m[2]]}货运'),
        (rf'Ling Family ({rank}) Cargo Haul - ({cargo}) Scale',lambda m:f'凌氏家族：{labels[m[1]]}级别 · {CARGO[m[2]]}货运'),
        (r'(Minor|Moderate|Extensive) Repairs Needed: (.+)',lambda m: {'Minor':'小规模','Moderate':'常规','Extensive':'大规模'}[m[1]]+'维修需求：'+m[2]),
        (r'(.+) needs some repairs',lambda m:m[1]+'需要一些维修'),
        (r'Inter-Outpost Delivery at (.+) - Multiple Boxes',lambda m:m[1]+'前哨站间投递：多个箱子'),
        (r'Verified Bounty: (\[TARGET\]) \| (?:(HeadHunters|XenoThreat) \| )?(Very Low|Very High|Low|Moderate|High|Extreme)-Risk Target',lambda m:'已验证赏金：'+m[1]+' | '+({'HeadHunters':'猎头帮','XenoThreat':'异种威胁'}[m[2]]+' | ' if m[2] else '')+DANGER[m[3]]),
    ]
    for pattern,translate in patterns:
        match = re.fullmatch(pattern,name)
        if match: return translate(match)
    return None


def resolve_title(name, candidates, rank_labels=None):
    resolved = {}
    for candidate in candidates:
        translated = fill_variables(name,clean_title(candidate),rank_labels)
        if translated: resolved.setdefault(canonical(translated),translated)
    if len(resolved)==1: return next(iter(resolved.values())), 'locale-normalized'
    ruled = rule_title(name,rank_labels)
    if ruled: return ruled, 'reviewed-rule'
    return None, 'ambiguous' if len(resolved)>1 else 'unresolved'


def title_signature(value):
    """Match only known rank/cargo substitutions; all other title wording must agree."""
    if re.search(r'Rank|Hauler|Cargo Haul', value, re.I):
        for en in sorted(RANKS,key=len,reverse=True):
            value = re.sub(r'(?<!\w)'+en+r'(?!\w)', '[RANK]', value, flags=re.I)
        for en in sorted(CARGO,key=len,reverse=True):
            value = re.sub(r'(?<!\w)'+en+r'(?!\w)', '[CARGO_GRADE]',value,flags=re.I)
    return canonical(value)


def community_title_index(keys):
    from collections import defaultdict
    index = defaultdict(list)
    for key, entry in keys.items():
        en, translated = entry.get('en',''),entry.get('tr','')
        if not en or not re.search('[\u4e00-\u9fff]',translated) or re.search(r'等待译名|未翻译|<REDACTED>',translated):
            continue
        index[title_signature(en)].append((key,translated))
    return index


def resolve_community_title(name, index, rank_labels=None, hauling=None):
    choices = index.get(title_signature(name), [])
    if hauling and hauling.get('pickups') and hauling.get('dropoffs'):
        p,d = hauling['pickups'],hauling['dropoffs']
        direction = '一对一' if p==d==1 else '一对多' if p==1 and d>1 else '多对一' if p>1 and d==1 else '多对多'
        choices = [(k,v) for k,v in choices if not re.search(r'(一对一|一对多|多对一|多对多)',v) or direction in v]
    groups = {}
    for key,raw in choices:
        # Keep explanatory notes separately, never merge them into the game title.
        raw = re.sub(r'<[^>]*>','',re.sub(r'\\+n','\n',raw))
        lines = raw.splitlines()
        notes = []
        for line in lines[1:]:
            notes.extend(n for n in re.findall(r'\[([^\]]+)\]',line) if re.search('[\u4e00-\u9fff]',n))
        title = fill_variables(name,clean_title(raw),rank_labels)
        if title:
            item = groups.setdefault(canonical(title), {'title':title,'keys':[],'notes':None})
            item['keys'].append(key)
            item['notes'] = set(notes) if item['notes'] is None else item['notes'] & set(notes)
    if len(groups)!=1:
        return None
    item = next(iter(groups.values()))
    return {'title':item['title'],'keys':sorted(item['keys']),'notes':sorted(item['notes'] or [])}
