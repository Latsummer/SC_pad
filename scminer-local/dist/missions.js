(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const format = (value) => value == null ? '未记录' : Number(value).toLocaleString('zh-CN');
  function compactReward(value) {
    if (value == null) return '未记录';
    const unit = Math.abs(value) >= 1000000 ? 1000000 : Math.abs(value) >= 1000 ? 1000 : 1;
    return Number((value / unit).toFixed(2)).toLocaleString('en-US', {maximumFractionDigits:2}) + (unit === 1000000 ? 'M' : unit === 1000 ? 'k' : '');
  }
  const TYPES = {'Battaglia':'巴塔利亚','RSI Discovery Event':'RSI 探索活动','Mercenary':'雇佣兵','Bounty Hunter':'赏金猎人','Delivery':'运送','Hauling':'货运','Hauling - Stellar':'星系内货运','Hauling - Planetary':'行星货运','Hauling - Interstellar':'星际货运','Hauling - Local':'本地货运','Ship Mining':'船采','Ground Vehicle Mining':'地面载具采矿','Hand Mining':'手采','Salvage':'打捞','Refueling':'加油','Maintenance':'维修','Investigation':'调查','Collection':'收集','Courier':'快递','Wikelo - Vehicles':'维克洛 · 载具','Wikelo - Other Items':'维克洛 · 物品','Other':'其他','Priority':'优先任务','PvP Missions':'玩家对抗'};
  const SYSTEMS = {Stanton:'斯坦顿',Pyro:'派罗',Nyx:'尼克斯',Multi:'跨星系',Unknown:'地点未记录'};
  const GROUPS = {overview:'任务概览', requirements:'接取条件', combat:'战斗情报', calculator:'声望规划'};
  const labels = {'BLUEPRINT REWARDS':'蓝图奖励','PROVIDED BLUEPRINT':'任务提供的蓝图','YOU RECEIVE':'可获得物品','ITEM REWARDS':'物品奖励','REQUIRED ITEMS':'交付物品','HAULING ORDERS':'运输要求','PREREQUISITE MISSIONS':'前置任务','MISSION CHAIN':'任务链','REQUIRED STANDING':'声望门槛','REPUTATION LOCKOUT':'声望排斥条件','REQUIRED SCENARIO':'所需场景／活动','AVAILABLE AT':'接取地点','AVAILABLE IN':'可出现区域','SPAWN AREA':'出现范围','LOCATION TRIGGER':'地点触发条件','LOCATION VARIANTS':'地点组合','SHIP ENCOUNTERS':'遭遇舰船','FAILURE PENALTIES':'失败惩罚'};
  const title = (m) => cleanText(m.name_zh || m.name_en).split('\n')[0].trim();
  const contractorLabels = {};
  const state = {catalog:null, all:[], quick:'all', rewardBlueprint:new URLSearchParams(location.search).get('reward_blueprint') || '', types:new Set(), visible:24, current:null, detail:null, tab:'overview', request:0};
  const shardCache = new Map();
  function matches(m) {
    const query = normalize($('missionSearch').value);
    return (!state.rewardBlueprint || (m.reward_blueprints || []).includes(state.rewardBlueprint)) && (!query || normalize([m.name_en,m.name_zh,...(m.name_notes_zh || []),m.contractor,m.contractor_zh,TYPES[m.type],m.type,m.rewards_search].join(' ')).includes(query)) &&
      ($('missionSystem').value === 'all' || m.system === $('missionSystem').value) &&
      (!state.types.size || state.types.has(m.type)) &&
      ($('missionRank').value === 'all' || ($('missionRank').value === 'unknown' ? m.minimum_rank == null : m.minimum_rank === Number($('missionRank').value))) &&
      ($('missionContractor').value === 'all' || m.contractor === $('missionContractor').value) &&
      (state.quick === 'all' || state.quick === 'blueprints' && m.blueprints || state.quick === 'shareable' && m.shareable === true || state.quick === 'legal' && m.illegal === false);
  }
  function render() {
    if (!state.catalog) return;
    const sort = $('missionSort').value;
    const results = state.all.filter(matches).sort((a,b) => sort === 'reward' ? (b.reward ?? -1)-(a.reward ?? -1) || title(a).localeCompare(title(b),'zh-CN') : sort === 'reputation' ? (b.reputation ?? -1)-(a.reputation ?? -1) || title(a).localeCompare(title(b),'zh-CN') : title(a).localeCompare(title(b),'zh-CN'));
    $('missionSummary').innerHTML = `<strong>${results.length.toLocaleString('zh-CN')}</strong> 个任务 · 已显示 ${Math.min(results.length,state.visible)}`;
    $('applyMissionFilters').textContent = `查看 ${results.length} 个任务`;
    $('missionResults').innerHTML = results.slice(0,state.visible).map((m) => `<button type="button" class="mission-card" data-mission="${escape(m.id)}" aria-label="查看任务：${escape(title(m))}"><div class="mission-card-top"><span class="mission-card-classification"><span class="mission-system-chip" data-system="${escape(m.system)}">${escape(SYSTEMS[m.system] || m.system)}</span><span class="mission-type-chip">${escape(TYPES[m.type] || m.type)}</span></span><span class="mission-tag${m.illegal ? ' danger' : ''}">${m.illegal == null ? '合法性未记录' : m.illegal ? '非法' : '合法'}</span></div><div><h2>${escape(title(m))}</h2>${m.name_notes_zh?.length ? `<div class="mission-title-notes" aria-label="社区汉化任务说明" title="社区汉化任务说明">${m.name_notes_zh.map(note => `<span>${escape(note)}</span>`).join('')}</div>` : ''}${m.name_zh ? `<div class="mission-en">${escape(m.name_en)}</div>` : ''}<div class="mission-en">${escape(m.contractor_zh || m.contractor)}</div></div><div class="mission-tags">${m.hauling?.pickups != null && m.hauling?.dropoffs != null ? `<span class="mission-tag">${m.hauling.pickups} 取 → ${m.hauling.dropoffs} 送</span>` : ''}${m.hauling?.total_scu ? `<span class="mission-tag">${escape(m.hauling.total_scu)} SCU</span>` : ''}${m.minimum_rank != null ? `<span class="mission-tag">接取 Lv.${m.minimum_rank}</span>` : ''}${m.blueprints ? '<span class="mission-tag accent">蓝图奖励</span>' : ''}${m.shareable === true ? '<span class="mission-tag">可共享</span>' : m.shareable === false ? '<span class="mission-tag">单人</span>' : ''}${m.once_only ? '<span class="mission-tag">一次性</span>' : ''}</div><div class="mission-card-stats"><div><small>基础报酬 / aUEC</small><strong>${compactReward(m.reward)}</strong></div><div><small>基础声望 / XP</small><strong class="mission-rep">${format(m.reputation)}</strong></div><span class="mission-arrow" aria-hidden="true">↗</span></div></button>`).join('') || '<div class="mission-empty">没有符合条件的任务。<br>试试其他关键词，或重置筛选条件。</div>';
    $('moreMissions').hidden = results.length <= state.visible;
    const active = [['missionSystem',SYSTEMS],['missionContractor',contractorLabels],['missionRank',Object.fromEntries([...Array(7)].map((_,n) => [String(n),`最低门槛 Lv.${n}`]).concat([['unknown','等级未记录']]))]].filter(([id]) => $(id).value !== 'all');
    $('missionActiveFilters').innerHTML = (state.rewardBlueprint ? `<button type="button" data-clear-reward-blueprint>产出蓝图：${escape(state.rewardBlueprint)} ×</button>` : '') + [...state.types].map(type => `<button type="button" data-remove-type="${escape(type)}">${escape(TYPES[type] || type)} ×</button>`).join('') + active.map(([id,map]) => `<button type="button" data-clear="${id}">${escape(map[$(id).value] || $(id).value)} ×</button>`).join('');
    $('openMissionFilters').textContent = active.length + state.types.size + Number(Boolean(state.rewardBlueprint)) ? `筛选 ${active.length + state.types.size + Number(Boolean(state.rewardBlueprint))}` : '筛选';
    renderTypeOptions();
    renderContractorOptions();
    document.querySelectorAll('[data-quick]').forEach((button) => { button.classList.toggle('active',button.dataset.quick === state.quick); button.setAttribute('aria-pressed',String(button.dataset.quick === state.quick)); });
  }
  function clearRewardBlueprint() {
    state.rewardBlueprint = '';
    const url = new URL(location.href);
    url.searchParams.delete('reward_blueprint');
    history.replaceState(null,'',url);
  }
  $('missionActiveFilters').addEventListener('click',event => {
    if (event.target.closest('[data-clear-reward-blueprint]')) { clearRewardBlueprint(); restart(); }
  });
  function renderContractorOptions() {
    const query = normalize($('missionContractorSearch').value);
    const counts = new Map();
    for (const mission of state.all) counts.set(mission.contractor,(counts.get(mission.contractor) || 0)+1);
    const names = [...counts.keys()].sort((a,b) => (contractorLabels[a] || a).localeCompare(contractorLabels[b] || b,'zh-CN')).filter(name => !query || normalize((contractorLabels[name] || name) + ' ' + name).includes(query));
    const options = [['all','全部发布方',state.all.length],...names.map(name => [name,contractorLabels[name] || name,counts.get(name)])];
    $('missionContractorOptions').innerHTML = options.map(([name,label,count]) => `<label><input type="radio" name="mission-contractor-choice" value="${escape(name)}" ${$('missionContractor').value === name ? 'checked' : ''}><span>${escape(label)}</span><small>${count}</small></label>`).join('') + (!names.length ? '<p class="mission-notice">没有匹配的发布方</p>' : '');
    $('missionContractorSummary').textContent = contractorLabels[$('missionContractor').value] || '全部发布方';
  }
  $('missionContractorSearch').addEventListener('input',renderContractorOptions);
  $('missionContractorOptions').addEventListener('change', event => {
    if (!event.target.matches('input[type="radio"]')) return;
    $('missionContractor').value = event.target.value;
    $('missionContractorPicker').open = false;
    restart();
    $('missionContractorSummary').focus();
  });
  document.addEventListener('click', event => { if (!$('missionContractorPicker').contains(event.target)) $('missionContractorPicker').open = false; });
  $('missionContractorPicker').addEventListener('keydown', event => { if (event.key === 'Escape' && $('missionContractorPicker').open) { event.preventDefault(); event.stopPropagation(); $('missionContractorPicker').open = false; $('missionContractorSummary').focus(); } });
  for (const [id,other] of [['missionTypePicker','missionContractorPicker'],['missionContractorPicker','missionTypePicker']]) $(id).addEventListener('toggle', () => { if ($(id).open) $(other).open = false; });
  function renderTypeOptions() {
    const query = normalize($('missionTypeSearch').value);
    const counts = new Map();
    for (const mission of state.all) counts.set(mission.type, (counts.get(mission.type) || 0) + 1);
    const types = [...counts.keys()].sort((a,b) => (TYPES[a] || a).localeCompare(TYPES[b] || b,'zh-CN')).filter(type => !query || normalize((TYPES[type] || type) + ' ' + type).includes(query));
    $('missionTypeOptions').innerHTML = types.map(type => `<label><input type="checkbox" value="${escape(type)}" ${state.types.has(type) ? 'checked' : ''}><span>${escape(TYPES[type] || type)}</span><small>${counts.get(type)}</small></label>`).join('') || '<p class="mission-notice">没有匹配的任务类型</p>';
    $('missionTypeSummary').textContent = !state.types.size ? '全部类型' : state.types.size === 1 ? TYPES[[...state.types][0]] || [...state.types][0] : `已选 ${state.types.size} 类`;
  }
  $('missionTypeSearch').addEventListener('input', renderTypeOptions);
  $('missionTypeOptions').addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    const value = event.target.value, scroll = $('missionTypeOptions').scrollTop;
    if (event.target.checked) state.types.add(value); else state.types.delete(value);
    restart();
    [...$('missionTypeOptions').querySelectorAll('input')].find(input => input.value === value)?.focus({preventScroll:true});
    $('missionTypeOptions').scrollTop = scroll;
  });
  $('clearMissionTypes').addEventListener('click', () => { state.types.clear(); restart(); });
  $('missionActiveFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-type]');
    if (button) { state.types.delete(button.dataset.removeType); restart(); }
  });
  document.addEventListener('click', event => { if (!$('missionTypePicker').contains(event.target)) $('missionTypePicker').open = false; });
  $('missionTypePicker').addEventListener('keydown', event => { if (event.key === 'Escape' && $('missionTypePicker').open) { event.preventDefault(); event.stopPropagation(); $('missionTypePicker').open = false; $('missionTypeSummary').focus(); } });
  function restart() { state.visible = 24; render(); }
  function sectionHeading(raw) {
    for (const [en,zh] of Object.entries(labels)) if (raw.toUpperCase().startsWith(en)) return zh;
    return raw;
  }
  function cleanText(value) { return String(value || '').replace(/<[^>]*>/g,'').replace(/\\+n/g,'\n'); }
  function conditionTerm(value) {
    const fixed = {Standing:'综合声望',Hauling:'货运声望','Bounty Hunting':'赏金猎人声望','any rank':'不限等级',Neutral:'中立',Pyro:'派罗',Nyx:'尼克斯',Stanton:'斯坦顿','Yes':'是','No':'否','Not available with':'以下阵营声望会限制接取','applies to you too':'共享接取者同样受此限制'};
    if (fixed[value]) return fixed[value];
    if (contractorLabels[value]) return contractorLabels[value];
    const faction = Object.entries(contractorLabels).find(([name]) => normalize(name) === normalize(value));
    if (faction) return faction[1];
    for (const table of state.detail?.calculator?.rank_tables || []) for (const rank of table.ranks) if (rank.rank.replace(/MIN|MAX/g,'') === value) return rank.rank_zh || value;
    const systemNames = {pyro:'派罗',stanton:'斯坦顿',nyx:'尼克斯'};
    const region = value.match(/^(Pyro|Stanton|Nyx) Region (.+)$/i);
    if (region) return `${systemNames[region[1].toLowerCase()]} ${region[2]} 区`;
    const scope = value.match(/^(Pyro|Stanton|Nyx) (?:\(SYSTEM-WIDE\)|— (.+))$/i);
    if (scope) return `${systemNames[scope[1].toLowerCase()]} · ${scope[2] ? ({HURSTON:'赫斯顿',CRUSADER:'十字军',ARCCORP:'弧光星',MICROTECH:'微科'}[scope[2].toUpperCase()] || scope[2]) : '全星系'}`;
    return value;
  }
  function conditionLinks(section) {
    const seen = new Set();
    return (section.links || []).map((link) => {
      if (!/^https:\/\/scmdb\.net\//.test(link.url)) return '';
      const id = new URL(link.url).searchParams.get('m');
      const target = state.all.find((m) => m.id === id);
      if (!target || seen.has(id)) return '';
      seen.add(id);
      return `<button type="button" class="mission-condition-link" data-related="${escape(id)}"><span>${escape(title(target))}<small>${escape(SYSTEMS[target.system] || target.system)}</small></span><span aria-hidden="true">→</span></button>`;
    }).join('');
  }
  function requirementHtml(section) {
    const heading = section.heading;
    const lines = section.text.slice(section.text.startsWith(heading) ? heading.length : 0).split('\n').map((v) => v.trim()).filter(Boolean);
    const wrap = (body, extra = '') => `<section class="mission-detail-section mission-condition ${extra}"><h3>${escape(sectionHeading(heading))}</h3>${body}</section>`;
    if (heading.startsWith('REQUIRED STANDING')) {
      const field = (key, end) => { const start = lines.indexOf(key); if (start < 0) return []; const result = []; for (const line of lines.slice(start+1)) { if (end.test(line)) break; result.push(line); } return result; };
      const min = field('MIN:', /^(MAX:|SHAREABLE TO:|⬆|Required intro)/);
      const max = field('MAX:', /^(SHAREABLE TO:|⬆|Required intro)/);
      const share = field('SHAREABLE TO:', /^(⬆|Required intro)/);
      const intro = lines.findIndex((line) => line.startsWith('Required intro'));
      const links = conditionLinks(section);
      return wrap(`${heading.match(/\(([^)]+)\)/) ? `<p class="mission-condition-note">声望轨道：${escape(conditionTerm(heading.match(/\(([^)]+)\)/)[1]))}</p>` : ''}<dl class="mission-condition-grid">${[['最低等级',min],['最高等级',max]].filter(([,values]) => values.length).map(([label,values]) => `<div><dt>${label}</dt><dd>${escape(conditionTerm(values[0]))}${values[1] ? `<small>累计 ${escape(values[1])}</small>` : ''}</dd></div>`).join('')}</dl>${share.length ? `<p class="mission-condition-note">共享给其他玩家：${escape(share.map(conditionTerm).join(' · '))}</p>` : ''}${intro >= 0 ? `<h4>需先完成引导任务</h4>${links || `<p>${escape(lines.slice(intro+1).map(conditionTerm).join(' · '))}</p>`}` : links}`);
    }
    if (heading === 'AVAILABLE IN') {
      const areas = [];
      for (let index=0; index<lines.length; index++) {
        if (/^[▸▾►▶]$/.test(lines[index]) || /^\d+$/.test(lines[index])) continue;
        const count = /^\d+$/.test(lines[index+1] || '') ? lines[index+1] : null;
        areas.push(`<li><span>${escape(conditionTerm(lines[index]))}</span>${count ? `<small>${count} 个地点</small>` : ''}</li>`);
      }
      return wrap(`<ul class="mission-condition-areas">${areas.join('')}</ul>`);
    }
    if (heading === 'REPUTATION LOCKOUT') {
      const faction = lines[lines.indexOf('Not available with')+1];
      const rankIndex = lines.indexOf('RANKS:');
      const sharedIndex = lines.indexOf('WHEN SHARED:');
      return wrap(`<p class="mission-condition-note">达到以下阵营的指定声望范围时，可能无法接取：</p><strong>${escape(conditionTerm(faction || '未记录'))}</strong>${rankIndex >= 0 ? `<p>${escape((lines[rankIndex+1] || '').split(' – ').map(conditionTerm).join(' — '))}</p>` : ''}${sharedIndex >= 0 ? `<p class="mission-condition-note">${escape(conditionTerm(lines[sharedIndex+1] || ''))}</p>` : ''}`, 'mission-condition-warning');
    }
    const links = conditionLinks(section);
    if (heading.startsWith('PREREQUISITE MISSIONS') || heading.startsWith('MISSION CHAIN')) {
      const any = lines.some((line) => /Complete any of/.test(line));
      const all = lines.some((line) => /Complete all/.test(line));
      return wrap(`${any || all ? `<p class="mission-condition-note">${any ? '完成下列任意一个任务' : '完成下列全部任务'}</p>` : ''}${links || `<ul class="mission-condition-areas">${lines.filter((line) => !/^[›▸]$/.test(line) && !/^Complete /.test(line)).map((line) => `<li>${escape(conditionTerm(line))}</li>`).join('')}</ul>`}`);
    }
    if (['AVAILABLE AT','SPAWN AREA','LOCATION TRIGGER'].includes(heading)) {
      const notes = {'AVAILABLE AT':'仅可在以下地点接取','SPAWN AREA':'任务可能在以下范围内出现','LOCATION TRIGGER':'靠近以下地点时可能出现'};
      return wrap(`<p class="mission-condition-note">${notes[heading]}</p><div class="mission-tags">${lines.filter((line) => !/^(Mission can|No specific location|Contract appears)/.test(line)).map((line) => `<span class="mission-tag">${escape(conditionTerm(line))}</span>`).join('')}</div>`);
    }
    return wrap(`<pre>${escape(lines.map(conditionTerm).join('\n'))}</pre>${links}`);
  }
  function requirementRules(raw) {
    const lines = raw.split('\n');
    const value = (key) => { const index = lines.indexOf(key); return index >= 0 ? lines[index+1] : null; };
    const rules = [['可共享',value('SHAREABLE')],['非法任务',value('ILLEGAL')],['仅限一次',value('ONCE ONLY')],['放弃后可重接',value('RE-ACCEPT AFTER ABANDON')],['失败后可重接',value('RE-ACCEPT AFTER FAIL')],['重接冷却',value('COOLDOWN')],['物品奖励仅限接取人',value('ITEM REWARDS FOR CONTRACT OWNER ONLY')],['奖励发送至家园库存',value('ITEM REWARDS SENT TO HOME INVENTORY')],['共享犯罪等级限制',value('SHARING CRIMESTAT')],['最低活动积分',value('MIN EVENT POINTS')]];
    const duration = (v) => /^\d+m$/.test(v) ? `${v.slice(0,-1)} 分钟` : /^\d+h$/.test(v) ? `${v.slice(0,-1)} 小时` : conditionTerm(v);
    return `<section class="mission-detail-section mission-condition"><h3>接取与重复规则</h3><dl class="mission-condition-grid">${[...rules, ...lines.filter((line) => /^Cooldown after (abandoning|failing):/.test(line)).map((line) => [line.includes('abandoning') ? '放弃后冷却' : '失败后冷却', line.split(':').slice(1).join(':').trim()])].filter(([,v]) => v).map(([label,v]) => `<div><dt>${label}</dt><dd>${escape(duration(v))}</dd></div>`).join('')}</dl><p class="mission-condition-note">冷却为页面记录的最短等待时间，实际可接状态还受地点与服务器情况影响。</p></section>`;
  }
  function sectionHtml(section) {
    if (section.group === 'requirements') return requirementHtml(section);
    if (section.heading === 'BLUEPRINT REWARDS' && section.blueprint_pools?.length) {
      const pools = section.blueprint_pools;
      return `<section class="mission-detail-section mission-blueprint-rewards"><h3>蓝图奖励</h3>${pools.length > 1 ? '<p class="mission-notice">各奖励组独立判定，概率指该组的奖励触发概率。</p>' : ''}${pools.map((pool,index) => `<div class="mission-reward-pool">${pools.length > 1 ? `<h4>奖励组 ${index + 1}</h4>` : ''}<p class="mission-reward-chance">触发概率 <strong>${format(pool.chance_percent)}%</strong> · 从 ${pool.candidate_count} 项中获得 1 份</p><ul>${pool.items.map((item) => `<li><span><strong>${escape(cleanText(item.name_zh || item.name_en))}</strong>${item.name_zh ? `<small>${escape(item.name_en)}</small>` : ''}</span><a href="index.html?mode=blueprints&q=${encodeURIComponent(item.name_en)}">查配方 →</a></li>`).join('')}</ul>${pool.items.length !== pool.candidate_count ? `<p class="mission-notice">当前记录了 ${pool.items.length}/${pool.candidate_count} 项候选。</p>` : ''}</div>`).join('')}</section>`;
    }
    const remainder = section.text.startsWith(section.heading) ? section.text.slice(section.heading.length).trim() : section.text;
    const links = (section.links || []).filter((link) => /^https:\/\/scmdb\.net\//.test(link.url));
    const localLinks = links.map((link) => {
      const id = new URL(link.url).searchParams.get('m');
      return id && state.all.some((m) => m.id === id) ? `<button type="button" class="text-button" data-related="${escape(id)}">${escape(link.text || '查看关联任务')} →</button>` : '';
    }).join('');
    return `<section class="mission-detail-section"><h3>${escape(sectionHeading(section.heading))}</h3><pre>${escape(remainder)}</pre>${localLinks}</section>`;
  }
  function locationTip(token) {
    for (const tab of ['overview','requirements']) {
      const tip = state.detail?.location_details?.[tab]?.placeholder_tooltips?.find((entry) => entry.placeholder === token);
      if (tip) return tip;
    }
  }
  function interactiveLocationText(value) {
    return escape(value).replace(/\[[A-Z_0-9]+\]/g, (token) => locationTip(token) ? `<button type="button" class="mission-location-token" data-location-token="${token}" aria-label="查看 ${token} 候选地点" aria-haspopup="dialog">${token}</button>` : token);
  }
  const locationDialog = document.createElement('dialog');
  locationDialog.className = 'mission-location-dialog';
  locationDialog.setAttribute('aria-label', '候选地点');
  $('missionDetail').append(locationDialog);
  locationDialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-locations]') || event.target === locationDialog) locationDialog.close();
  });
  $('missionDetail').addEventListener('click', (event) => {
    const button = event.target.closest('[data-location-token]');
    if (!button) return;
    const tip = locationTip(button.dataset.locationToken);
    if (!tip) return;
    locationDialog.innerHTML = `<header><h3>${escape(tip.placeholder)} · ${tip.items.length} 个候选地点</h3><button type="button" data-close-locations aria-label="关闭候选地点">✕</button></header><div class="mission-location-popup-body"><p class="mission-condition-note">具体地点以游戏内任务为准。</p><ul>${tip.items.map((item) => `<li>${escape(item.raw_text.startsWith(item.type) ? item.raw_text.slice(item.type.length).trim() : item.raw_text)}</li>`).join('')}</ul></div>`;
    locationDialog.showModal();
  });
  function locationDetailsHtml(detail, tab) {
    const data = detail.location_details?.[tab];
    if (!data) return '';
    const types = {'PLANETS':'行星','PLANET':'行星','MOON':'卫星','MOONS':'卫星','STATIONS':'空间站','STATION':'空间站','LAGRANGE':'拉格朗日点','ASTEROID BELTS / CLUSTERS':'小行星带／星团','OTHER':'其他','OUTPOST':'前哨站'};
    const groupsHtml = (groups) => '<div class="mission-location-groups">' + groups.map((g) => `<div class="mission-location-group"><h4>${escape(types[g.type] || g.type || '地点')}<span>${g.locations.length}</span></h4><ul>${g.locations.map((name) => `<li>${escape(name)}</li>`).join('')}</ul></div>`).join('') + '</div>';
    const placeholders = (tab === 'overview' ? [] : data.placeholder_tooltips || []).map((tip) => {
      const groups = new Map();
      for (const item of tip.items) {
        const type = item.type || '';
        const name = item.raw_text.startsWith(type) ? item.raw_text.slice(type.length).trim() : item.raw_text;
        if (!groups.has(type)) groups.set(type, []);
        groups.get(type).push(name);
      }
      return `<details class="mission-location-list"><summary>${escape(tip.placeholder)} · ${tip.items.length} 个候选地点</summary>${groupsHtml([...groups].map(([type,locations]) => ({type,locations})))}</details>`;
    }).join('');
    const regions = (data.regions || []).map((region) => `<details class="mission-location-list"><summary>${escape(conditionTerm(region.name))} · ${region.groups.reduce((n,g) => n+g.locations.length,0)} 个地点</summary>${groupsHtml(region.groups)}</details>`).join('');
    return (placeholders ? `<section class="mission-detail-section"><h3>任务地点变量</h3><p class="mission-condition-note">任务中的变量会从以下候选地点中取值，具体以游戏内任务为准。</p>${placeholders}</section>` : '') + (regions ? `<section class="mission-detail-section"><h3>可出现区域</h3>${regions}</section>` : '');
  }
  function renderDetail() {
    const m = state.current, d = state.detail;
    if (!m || !d) return;
    $('missionDetailTitle').innerHTML = interactiveLocationText(title(m));
    $('missionDetailEnglish').innerHTML = interactiveLocationText(m.name_zh ? m.name_en : '') + (m.name_notes_zh?.length ? `<span class="mission-title-notes" aria-label="社区汉化任务说明" title="社区汉化任务说明">${m.name_notes_zh.map(note => `<span>${escape(note)}</span>`).join('')}</span>` : '');
    const tabs = ['overview','requirements',...(d.combat_text ? ['combat'] : []),'calculator'];
    $('missionDetailTabs').innerHTML = tabs.map((tab) => `<button type="button" class="${tab === state.tab ? 'active' : ''}" data-detail-tab="${tab}" aria-pressed="${tab === state.tab}">${GROUPS[tab]}</button>`).join('');
    let content = '';
    if (state.tab === 'overview') {
      content = `<div class="mission-facts"><div><small>基础报酬 / aUEC</small><strong>${format(m.reward)}</strong></div><div><small>基础声望 / XP</small><strong>${format(m.reputation)}</strong></div></div><div class="mission-description">${interactiveLocationText(cleanText(d.description_zh || d.description_en))}</div>` + d.sections.filter((section) => section.group === 'overview').map(sectionHtml).join('') + locationDetailsHtml(d, 'overview');
    } else if (state.tab === 'requirements') {
      content = d.sections.filter((section) => section.group === 'requirements' && !(section.heading === 'AVAILABLE IN' && d.location_details?.requirements?.regions?.length)).map(sectionHtml).join('') + locationDetailsHtml(d, 'requirements') + requirementRules(d.requirements_text);
    } else if (state.tab === 'combat') {
      content = d.sections.filter((section) => section.group === 'combat').map(sectionHtml).join('') || `<pre>${escape(d.combat_text)}</pre>`;
    } else {
      const calc = d.calculator || {};
      content = '<p class="mission-notice">每级 XP 为填满该等级所需的差额。次数按本任务基础声望、单人完成估算，不含共享分配、失败或其他修正。</p>';
      content += (calc.reward_fields || []).map((group) => `<div class="mission-tags">${group.values.map((value) => `<span class="mission-tag">${escape(value)}</span>`).join('')}</div>`).join('');
      content += (calc.rank_tables || []).map((table) => `<h3>${escape(table.caption || '声望等级')}</h3><table class="mission-rank-table"><thead><tr><th>等级</th><th>所需 XP</th><th>预计次数</th></tr></thead><tbody>${table.ranks.map((rank) => { const xp = Number(rank.xp_to_fill_text.replace(/,/g,'')); const canEstimate = !table.caption && m.reputation > 0 && /^\d[\d,]*$/.test(rank.xp_to_fill_text); return `<tr class="${escape(rank.row_class || '')}"><td>${escape((rank.rank_zh || rank.rank.replace(/MIN|MAX/g,'')) + (rank.rank.includes('MIN') ? '（最低）' : '') + (rank.rank.includes('MAX') ? '（最高）' : ''))}</td><td>${escape(rank.xp_to_fill_text)}</td><td>${canEstimate ? format(Math.ceil(xp / m.reputation)) : '—'}</td></tr>`; }).join('')}</tbody></table>`).join('');
      if (!(calc.rank_tables || []).length) content += '<p class="mission-notice">该任务未采集到标准声望等级表，可在任务概览中查看奖励说明。</p>';
      content += (calc.rules || []).map((rule) => `<p class="mission-notice">${escape(rule)}</p>`).join('');
    }
    if (state.tab === 'overview' && d.related_blueprints?.length && !d.sections.some((section) => section.blueprint_pools?.length)) content += '<h3>查询奖励蓝图的制造配方</h3><p class="mission-notice">按同名蓝图查询当前本地配方目录，具体版本以蓝图页为准。</p>' + d.related_blueprints.map((blueprint) => `<p><a href="index.html?mode=blueprints&q=${encodeURIComponent(blueprint.name_en)}">${escape(blueprint.name_zh || blueprint.name_en)} →</a></p>`).join('');
    $('missionDetailBody').innerHTML = content + `<p class="mission-notice">来源：<a href="${escape(m.source_url)}" target="_blank" rel="noopener noreferrer">SCMDB 公开任务页面 ↗</a> · 中文参考社区翻译</p>`;
    $('missionDetailBody').scrollTop = 0;
  }
  async function openDetail(id, push = true) {
    const m = state.all.find((entry) => entry.id === id);
    if (!m) return;
    const request = ++state.request;
    state.current = m; state.detail = null; state.tab = 'overview';
    $('missionDetailTitle').textContent = title(m);
    $('missionDetailEnglish').textContent = m.name_zh ? m.name_en : '';
    $('missionDetailMeta').textContent = `${SYSTEMS[m.system] || m.system} · ${TYPES[m.type] || m.type} · ${m.contractor_zh || m.contractor}`;
    $('missionDetailTabs').innerHTML = '';
    $('missionDetailBody').innerHTML = '<p class="mission-loading" role="status">正在读取详情…</p>';
    if (!$('missionDetail').open) $('missionDetail').showModal();
    $('missionDetailBody').scrollTop = 0;
    if (push) { const url = new URL(location.href); url.searchParams.set('id',id); history.pushState({mission:id},'',url); }
    try {
      if (!shardCache.has(m.file)) {
        const response = await fetch(m.file);
        if (!response.ok) throw Error('详情下载失败');
        shardCache.set(m.file, await response.json());
      }
      if (request !== state.request || !$('missionDetail').open) return;
      state.detail = shardCache.get(m.file)[id];
      if (!state.detail) throw Error('未找到任务详情');
      renderDetail();
    } catch (_) {
      if (request !== state.request) return;
      $('missionDetailBody').innerHTML = `<div class="mission-empty">暂时无法读取详情。尚未缓存的任务需要联网后首次打开。<br><button type="button" class="text-button" data-related="${escape(id)}">重试</button></div>`;
    }
  }
  $('missionSearch').addEventListener('input',restart);
  ['missionSystem','missionContractor','missionRank','missionSort'].forEach((id) => $(id).addEventListener('change',restart));
  document.querySelectorAll('[data-quick]').forEach((button) => button.addEventListener('click',() => { state.quick = button.dataset.quick; restart(); }));
  $('resetMissionFilters').addEventListener('click',() => { ['missionSystem','missionContractor','missionRank'].forEach((id) => $(id).value = 'all'); clearRewardBlueprint(); state.types.clear(); $('missionTypeSearch').value = ''; $('missionTypePicker').open = false; $('missionContractorSearch').value = ''; $('missionContractorPicker').open = false; $('missionSearch').value = ''; state.quick = 'all'; restart(); });
  $('missionActiveFilters').addEventListener('click',(event) => { const button = event.target.closest('[data-clear]'); if (button) { $(button.dataset.clear).value = 'all'; restart(); } });
  $('missionResults').addEventListener('click',(event) => { const button = event.target.closest('[data-mission]'); if (button) openDetail(button.dataset.mission); });
  $('moreMissions').addEventListener('click',() => { state.visible += 24; render(); });
  $('closeMissionDetail').addEventListener('click',() => $('missionDetail').close());
  $('missionDetail').addEventListener('close',() => { state.request++; const url = new URL(location.href); url.searchParams.delete('id'); history.replaceState(null,'',url); });
  $('missionDetailTabs').addEventListener('click',(event) => { const button = event.target.closest('[data-detail-tab]'); if (button) { state.tab = button.dataset.detailTab; renderDetail(); } });
  $('missionDetailBody').addEventListener('click',(event) => { const button = event.target.closest('[data-related]'); if (button) { const url = new URL(location.href); url.searchParams.set('id',button.dataset.related); history.replaceState({mission:button.dataset.related},'',url); openDetail(button.dataset.related,false); } });
  $('openMissionFilters').addEventListener('click',() => { $('mobileFilterSlot').append($('missionFilterFields')); $('missionFilterDialog').showModal(); });
  ['closeMissionFilters','applyMissionFilters'].forEach((id) => $(id).addEventListener('click',() => $('missionFilterDialog').close()));
  $('missionFilterDialog').addEventListener('close',() => $('desktopFilters').insertBefore($('missionFilterFields'), $('desktopFilters').querySelector('.mission-filter-tip')));
  window.addEventListener('popstate',() => { const id = new URLSearchParams(location.search).get('id'); if (id) openDetail(id,false); else if ($('missionDetail').open) $('missionDetail').close(); });
  async function load() {
    try {
      const response = await fetch('missions/index.json');
      if (!response.ok) throw Error('索引读取失败');
      state.catalog = await response.json(); state.all = state.catalog.missions;
      state.all.forEach((m) => { contractorLabels[m.contractor] = m.contractor_zh || m.contractor; });
      const date = state.catalog.source.captured_at.slice(0,10);
      $('missionVersion').textContent = `${state.catalog.source.game_data_version || date} · 任务档案`;
      $('missionDataNote').textContent = `SCMDB 公开页面采集于 ${date}，共 ${state.all.length} 个列表任务。任务版本 ${state.catalog.source.game_data_version || '未记录'}，不代表实时可接任务或游戏全部任务。中文参考 SCMDB 社区翻译；缺失或有歧义时保留英文。`;
      for (const [id,key,map,placeholder] of [['missionSystem','system',SYSTEMS,'全部星系']]) {
        $(id).innerHTML = `<option value="all">${placeholder}</option>` + [...new Set(state.all.map((m) => m[key]))].sort().map((value) => `<option value="${escape(value)}">${escape(map[value] || value)}</option>`).join('');
      }
      render();
      const id = new URLSearchParams(location.search).get('id'); if (id) openDetail(id,false);
    } catch (_) { $('missionSummary').textContent = '任务数据暂时无法载入'; $('missionResults').innerHTML = '<div class="mission-empty">请检查网络后刷新页面重试。</div>'; }
  }
  load();
})();
