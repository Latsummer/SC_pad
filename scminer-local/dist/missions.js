(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const format = (value) => value == null ? '未记录' : Number(value).toLocaleString('zh-CN');
  const TYPES = {'Mercenary':'雇佣兵','Bounty Hunter':'赏金猎人','Delivery':'运送','Hauling':'货运','Hauling - Stellar':'星系内货运','Hauling - Planetary':'行星货运','Hauling - Interstellar':'星际货运','Hauling - Local':'本地货运','Ship Mining':'船采','Ground Vehicle Mining':'地面载具采矿','Hand Mining':'手采','Salvage':'打捞','Refueling':'加油','Maintenance':'维修','Investigation':'调查','Collection':'收集','Courier':'快递','Wikelo - Vehicles':'维克洛 · 载具','Wikelo - Other Items':'维克洛 · 物品','Other':'其他','Priority':'优先任务','PvP Missions':'玩家对抗'};
  const SYSTEMS = {Stanton:'斯坦顿',Pyro:'派罗',Nyx:'尼克斯',Multi:'跨星系',Unknown:'地点未记录'};
  const GROUPS = {overview:'任务概览', requirements:'接取条件', combat:'战斗情报', calculator:'声望规划'};
  const labels = {'BLUEPRINT REWARDS':'蓝图奖励','PROVIDED BLUEPRINT':'任务提供的蓝图','YOU RECEIVE':'可获得物品','ITEM REWARDS':'物品奖励','REQUIRED ITEMS':'交付物品','HAULING ORDERS':'运输要求','PREREQUISITE MISSIONS':'前置任务','MISSION CHAIN':'任务链','REQUIRED STANDING':'声望门槛','REPUTATION LOCKOUT':'声望排斥条件','REQUIRED SCENARIO':'所需场景／活动','AVAILABLE AT':'接取地点','AVAILABLE IN':'可出现区域','SPAWN AREA':'出现范围','LOCATION TRIGGER':'地点触发条件','LOCATION VARIANTS':'地点组合','SHIP ENCOUNTERS':'遭遇舰船','FAILURE PENALTIES':'失败惩罚'};
  const title = (m) => cleanText(m.name_zh || m.name_en).split('\n')[0].trim();
  const contractorLabels = {};
  const state = {catalog:null, all:[], quick:'all', visible:24, current:null, detail:null, tab:'overview', request:0};
  const shardCache = new Map();
  function matches(m) {
    const query = normalize($('missionSearch').value);
    return (!query || normalize([m.name_en,m.name_zh,m.contractor,m.contractor_zh,TYPES[m.type],m.type,m.rewards_search].join(' ')).includes(query)) &&
      ($('missionSystem').value === 'all' || m.system === $('missionSystem').value) &&
      ($('missionType').value === 'all' || m.type === $('missionType').value) &&
      ($('missionContractor').value === 'all' || m.contractor === $('missionContractor').value) &&
      (state.quick === 'all' || state.quick === 'blueprints' && m.blueprints || state.quick === 'shareable' && m.shareable === true || state.quick === 'legal' && m.illegal === false);
  }
  function render() {
    if (!state.catalog) return;
    const sort = $('missionSort').value;
    const results = state.all.filter(matches).sort((a,b) => sort === 'reward' ? (b.reward ?? -1)-(a.reward ?? -1) || title(a).localeCompare(title(b),'zh-CN') : sort === 'reputation' ? (b.reputation ?? -1)-(a.reputation ?? -1) || title(a).localeCompare(title(b),'zh-CN') : title(a).localeCompare(title(b),'zh-CN'));
    $('missionSummary').innerHTML = `<strong>${results.length.toLocaleString('zh-CN')}</strong> 个任务 · 已显示 ${Math.min(results.length,state.visible)}`;
    $('applyMissionFilters').textContent = `查看 ${results.length} 个任务`;
    $('missionResults').innerHTML = results.slice(0,state.visible).map((m) => `<button type="button" class="mission-card" data-mission="${escape(m.id)}" aria-label="查看任务：${escape(title(m))}"><div class="mission-card-top"><span class="mission-kicker">${escape(SYSTEMS[m.system] || m.system)} · ${escape(TYPES[m.type] || m.type)}</span><span class="mission-tag${m.illegal ? ' danger' : ''}">${m.illegal == null ? '合法性未记录' : m.illegal ? '非法' : '合法'}</span></div><div><h2>${escape(title(m))}</h2>${m.name_zh ? `<div class="mission-en">${escape(m.name_en)}</div>` : ''}<div class="mission-en">${escape(m.contractor_zh || m.contractor)}</div></div><div class="mission-tags">${m.blueprints ? '<span class="mission-tag accent">蓝图奖励</span>' : ''}${m.shareable === true ? '<span class="mission-tag">可共享</span>' : m.shareable === false ? '<span class="mission-tag">单人</span>' : ''}${m.once_only ? '<span class="mission-tag">一次性</span>' : ''}</div><div class="mission-card-stats"><div><small>基础报酬 / aUEC</small><strong>${format(m.reward)}</strong></div><div><small>基础声望 / XP</small><strong class="mission-rep">${format(m.reputation)}</strong></div><span class="mission-arrow" aria-hidden="true">↗</span></div></button>`).join('') || '<div class="mission-empty">没有符合条件的任务。<br>试试其他关键词，或重置筛选条件。</div>';
    $('moreMissions').hidden = results.length <= state.visible;
    const active = [['missionSystem',SYSTEMS],['missionType',TYPES],['missionContractor',contractorLabels]].filter(([id]) => $(id).value !== 'all');
    $('missionActiveFilters').innerHTML = active.map(([id,map]) => `<button type="button" data-clear="${id}">${escape(map[$(id).value] || $(id).value)} ×</button>`).join('');
    $('openMissionFilters').textContent = active.length ? `筛选 ${active.length}` : '筛选';
    document.querySelectorAll('[data-quick]').forEach((button) => { button.classList.toggle('active',button.dataset.quick === state.quick); button.setAttribute('aria-pressed',String(button.dataset.quick === state.quick)); });
  }
  function restart() { state.visible = 24; render(); }
  function sectionHeading(raw) {
    for (const [en,zh] of Object.entries(labels)) if (raw.toUpperCase().startsWith(en)) return zh;
    return raw;
  }
  function cleanText(value) { return String(value || '').replace(/<[^>]*>/g,'').replace(/\\+n/g,'\n'); }
  function sectionHtml(section) {
    const remainder = section.text.startsWith(section.heading) ? section.text.slice(section.heading.length).trim() : section.text;
    const links = (section.links || []).filter((link) => /^https:\/\/scmdb\.net\//.test(link.url));
    const localLinks = links.map((link) => {
      const id = new URL(link.url).searchParams.get('m');
      return id && state.all.some((m) => m.id === id) ? `<button type="button" class="text-button" data-related="${escape(id)}">${escape(link.text || '查看关联任务')} →</button>` : '';
    }).join('');
    return `<section class="mission-detail-section"><h3>${escape(sectionHeading(section.heading))}</h3><pre>${escape(remainder)}</pre>${localLinks}</section>`;
  }
  function renderDetail() {
    const m = state.current, d = state.detail;
    if (!m || !d) return;
    const tabs = ['overview','requirements',...(d.combat_text ? ['combat'] : []),'calculator'];
    $('missionDetailTabs').innerHTML = tabs.map((tab) => `<button type="button" class="${tab === state.tab ? 'active' : ''}" data-detail-tab="${tab}" aria-pressed="${tab === state.tab}">${GROUPS[tab]}</button>`).join('');
    let content = '';
    if (state.tab === 'overview') {
      content = `<div class="mission-facts"><div><small>基础报酬 / aUEC</small><strong>${format(m.reward)}</strong></div><div><small>基础声望 / XP</small><strong>${format(m.reputation)}</strong></div></div><div class="mission-description">${escape(cleanText(d.description_zh || d.description_en))}</div>${d.description_zh ? `<details><summary>查看英文原文</summary><pre>${escape(d.description_en)}</pre></details>` : ''}` + d.sections.filter((section) => section.group === 'overview').map(sectionHtml).join('');
    } else if (state.tab === 'requirements') {
      content = d.sections.filter((section) => section.group === 'requirements').map(sectionHtml).join('') + `<details><summary>完整接取规则（原文）</summary><pre>${escape(d.requirements_text)}</pre></details>`;
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
    if (state.tab === 'overview' && d.related_blueprints?.length) content += '<h3>查询奖励蓝图的制造配方</h3><p class="mission-notice">按同名蓝图查询当前本地配方目录，具体版本以蓝图页为准。</p>' + d.related_blueprints.map((blueprint) => `<p><a href="index.html?mode=blueprints&q=${encodeURIComponent(blueprint.name_en)}">${escape(blueprint.name_zh || blueprint.name_en)} →</a></p>`).join('');
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
  ['missionSystem','missionType','missionContractor','missionSort'].forEach((id) => $(id).addEventListener('change',restart));
  document.querySelectorAll('[data-quick]').forEach((button) => button.addEventListener('click',() => { state.quick = button.dataset.quick; restart(); }));
  $('resetMissionFilters').addEventListener('click',() => { ['missionSystem','missionType','missionContractor'].forEach((id) => $(id).value = 'all'); $('missionSearch').value = ''; state.quick = 'all'; restart(); });
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
      for (const [id,key,map,placeholder] of [['missionSystem','system',SYSTEMS,'全部星系'],['missionType','type',TYPES,'全部类型'],['missionContractor','contractor',contractorLabels,'全部发布方']]) {
        $(id).innerHTML = `<option value="all">${placeholder}</option>` + [...new Set(state.all.map((m) => m[key]))].sort().map((value) => `<option value="${escape(value)}">${escape(map[value] || value)}</option>`).join('');
      }
      render();
      const id = new URLSearchParams(location.search).get('id'); if (id) openDetail(id,false);
    } catch (_) { $('missionSummary').textContent = '任务数据暂时无法载入'; $('missionResults').innerHTML = '<div class="mission-empty">请检查网络后刷新页面重试。</div>'; }
  }
  load();
})();
