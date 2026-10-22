(() => {
  "use strict";
  const catalog = window.SCMDB_BLUEPRINTS;
  const mining = window.SCMINER_DATA;
  const locale = window.SCMINER_LOCALE;
  if (!catalog || !mining || !locale) { document.body.innerHTML = '<div class="empty-list">蓝图数据载入失败，请重新生成离线数据。</div>'; return; }

  const mineralById = new Map(mining.minerals.map((item) => [item.id, item]));
  const state = { selected: [], type: "all", subtype: "all", slot: "all", size: "all", component_class: "all", component_grade: "all", visible: 24 };
  const els = {
    version: document.querySelector("#blueprintVersion"), search: document.querySelector("#blueprintSearch"),
    materialSearch: document.querySelector("#materialSearch"), suggestions: document.querySelector("#materialSuggestions"),
    selected: document.querySelector("#selectedMaterials"), type: document.querySelector("#typeFilter"), subtype: document.querySelector("#subtypeFilter"), slot: document.querySelector("#slotFilter"),
    size: document.querySelector("#sizeFilter"),
    component_class: document.querySelector("#componentClassFilter"), component_grade: document.querySelector("#componentGradeFilter"),
    reset: document.querySelector("#resetBlueprintFilters"), summary: document.querySelector("#blueprintSummary"), results: document.querySelector("#blueprintResults"),
    drawer: document.querySelector("#blueprintFilterDrawer"), openFilters: document.querySelector("#openBlueprintFilters"), closeFilters: document.querySelector("#closeBlueprintFilters"),
    backdrop: document.querySelector("#blueprintFilterBackdrop"), applyFilters: document.querySelector("#applyBlueprintFilters"),
    activeFilters: document.querySelector("#activeBlueprintFilters"),
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s_\-()（）]/g, "");
  const mineralName = (id) => { const entry = locale.minerals[id]; return entry?.zh ? `${entry.zh} (${entry.en})` : entry?.en || mineralById.get(id)?.name || id; };
  const formatTime = (seconds) => seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60 ? `${seconds % 60} 秒` : ""}`.trim() : `${seconds} 秒`;
  const materialIds = [...new Set(catalog.blueprints.flatMap((item) => item.materials.map((material) => material.mineral?.id).filter(Boolean)))];
  const slotName = (slot) => window.SCMDB_BLUEPRINT_LOCALE?.slots?.[slot] || slot;

  const componentClassName = value => ({Military:"军用",Civilian:"民用",Stealth:"隐身",Industrial:"工业",Competition:"竞赛"}[value] || value);
  const collator=new Intl.Collator('zh-CN');
  const searchIndex=new Map(catalog.blueprints.map(item=>[item,normalize(`${item.name_zh || ''}|${item.name_en || ''}|${item.name || ''}`)]));
  const sortedBlueprints=[...catalog.blueprints].sort((a,b)=>a.craft_time_seconds-b.craft_time_seconds || collator.compare(a.name_zh || a.name,b.name_zh || b.name));
  const materialCounts=new Map();
  catalog.blueprints.forEach(item=>new Set(item.materials.map(m=>m.mineral?.id).filter(Boolean)).forEach(id=>materialCounts.set(id,(materialCounts.get(id)||0)+1)));
  let previousSearch=null, normalizedSearch='';
  function searchQuery(){if(previousSearch!==els.search.value){previousSearch=els.search.value;normalizedSearch=normalize(previousSearch);}return normalizedSearch;}
  function matches(item, omit = "") {
    const query = searchQuery();
    if (query && !searchIndex.get(item).includes(query)) return false;
    if (state.selected.length && !state.selected.every((id) => item.materials.some((material) => material.mineral?.id === id))) return false;
    if (omit !== "type" && state.type !== "all" && (item.type_group || "其他") !== state.type) return false;
    if (omit !== "subtype" && state.subtype !== "all" && item.type_subtype !== state.subtype) return false;
    if (omit !== "slot" && state.slot !== "all" && !item.materials.some((material) => material.slot === state.slot)) return false;
    if (omit !== "size" && state.size !== "all" && item.size !== Number(state.size)) return false;
    for (const key of ["component_class", "component_grade"]) if (omit !== key && state[key] !== "all" && item[key] !== state[key]) return false;
    return true;
  }
  function setOptions(element, label, entries, currentKey) {
    const values = new Set(entries.map(([value]) => String(value)));
    if (state[currentKey] !== "all" && !values.has(String(state[currentKey]))) state[currentKey] = "all";
    element.innerHTML = `<option value="all">${label}</option>` + entries.map(([value, count, text]) => `<option value="${escapeHtml(value)}">${escapeHtml(text || value)} · ${count}</option>`).join("");
    element.value = state[currentKey];
  }
  function countBy(items, key) {
    const counts = new Map();
    items.forEach((item) => {
      const values = key === "slot" ? [...new Set(item.materials.map((material) => material.slot))] : [item[key]];
      values.filter((value) => value !== null && value !== undefined && value !== "").forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    });
    return [...counts.entries()].sort((a,b) => String(a[0]).localeCompare(String(b[0]), "zh-CN"));
  }
  function renderSelectors() {
    for (const key of ["component_class", "component_grade"]) setOptions(els[key], key === "component_class" ? "全部用途" : "全部等级", countBy(catalog.blueprints.filter(item => matches(item, key)), key).map(([value,count]) => [value,count,key === "component_class" ? componentClassName(value) : `${value} 级`]), key);
    setOptions(els.type, "全部大类", countBy(catalog.blueprints.filter((item) => matches(item, "type")), "type_group"), "type");
    setOptions(els.subtype, "全部细分", countBy(catalog.blueprints.filter((item) => matches(item, "subtype")), "type_subtype"), "subtype");
    setOptions(els.slot, "全部槽位", countBy(catalog.blueprints.filter((item) => matches(item, "slot")), "slot").map(([slot, count]) => [slot, count, slotName(slot)]), "slot");
    setOptions(els.size, "全部尺寸", countBy(catalog.blueprints.filter((item) => matches(item, "size")), "size").sort((a,b) => Number(a[0]) - Number(b[0])).map(([size, count]) => [size, count, `S${size}`]), "size");
  }
  function renderMaterialPicker() {
    els.selected.innerHTML = state.selected.length ? state.selected.map((id) => `<span class="mineral-chip">${escapeHtml(mineralName(id))}<button type="button" data-remove="${id}" aria-label="移除 ${escapeHtml(mineralName(id))}">×</button></span>`).join("") : '<span class="selection-hint">未选择材料</span>';
    const query = normalize(els.materialSearch.value);
    const matches = materialIds.filter((id) => id !== undefined && !state.selected.includes(id) && normalize(mineralName(id)).includes(query)).sort((a,b) => mineralName(a).localeCompare(mineralName(b), "zh-CN"));
    els.suggestions.innerHTML = matches.map((id) => `<button class="suggestion" type="button" data-add="${id}"><span>${escapeHtml(mineralName(id))}</span><small>${materialCounts.get(id) || 0} 张蓝图</small></button>`).join("") || '<div class="empty-list">没有匹配的已采集矿物</div>';
  }
  function renderActiveFilters() {
    if (!els.activeFilters) return;
    const tags = state.selected.map((id) => ({ key: "material", value: id, label: mineralName(id) }));
    if (state.type !== "all") tags.push({ key: "type", label: state.type });
    if (state.subtype !== "all") tags.push({ key: "subtype", label: state.subtype });
    if (state.slot !== "all") tags.push({ key: "slot", label: slotName(state.slot) });
    if (state.size !== "all") tags.push({ key: "size", label: `S${state.size}` });
    if (state.component_class !== "all") tags.push({key:"component_class",label:componentClassName(state.component_class)});
    if (state.component_grade !== "all") tags.push({key:"component_grade",label:`${state.component_grade} 级`});
    els.activeFilters.innerHTML = tags.map((tag) => `<button type="button" class="active-filter-chip" data-clear-filter="${tag.key}"${tag.value ? ` data-filter-value="${escapeHtml(tag.value)}"` : ""}><span>${escapeHtml(tag.label)}</span><b aria-hidden="true">×</b></button>`).join("");
    els.activeFilters.hidden = !tags.length;
  }
  function renderResults() {
    const filtered = sortedBlueprints.filter((item) => matches(item));
    const activeCount = state.selected.length + [state.type, state.subtype, state.slot, state.size, state.component_class, state.component_grade].filter((value) => value !== "all").length;
    if (els.openFilters) els.openFilters.textContent = activeCount ? `筛选 ${activeCount}` : "筛选";
    if (els.applyFilters) els.applyFilters.textContent = `查看 ${filtered.length.toLocaleString("zh-CN")} 条结果`;
    const shown = filtered.slice(0, state.visible);
    els.summary.innerHTML = `<span><strong>${filtered.length}</strong> 张匹配蓝图</span><code>${state.selected.length ? state.selected.map(mineralName).join(" + ") : "全部已采集蓝图"}</code>`;
    if (!filtered.length) { els.results.innerHTML = '<div class="empty-list">没有符合条件的蓝图。可以清除部分材料或重置筛选。</div>'; return; }
    const cards = shown.map((item, index) => {
      const materials = item.materials.map((material) => {
        const name = material.mineral ? mineralName(material.mineral.id) : material.name;
        const amount = material.amount_scu !== null ? `${material.amount_scu} SCU` : `×${material.amount_count}`;
        return `<li><span>${escapeHtml(slotName(material.slot))}</span><strong>${escapeHtml(name)}</strong><em>${escapeHtml(amount)}</em></li>`;
      }).join("");
      return `<article class="blueprint-card" data-recipe-id="${escapeHtml(item.id)}" style="--enter-index:${index}"><div class="blueprint-card-head"><div><span class="detail-kicker">${escapeHtml(item.type_group || "其他")}${item.type_subtype ? ` · ${escapeHtml(item.type_subtype)}` : ""}${item.size ? ` · S${item.size}` : ""}${item.component_class ? ` · ${escapeHtml(componentClassName(item.component_class))} ${escapeHtml(item.component_grade)}` : ""}</span><h2>${escapeHtml(item.name_zh || item.name)}</h2></div><time>⏱ ${formatTime(item.craft_time_seconds)}</time></div><ul class="material-list">${materials}</ul><div class="blueprint-card-actions">${item.quality_path?`<button type="button" class="blueprint-quality-trigger" data-quality-id="${escapeHtml(item.id)}" aria-haspopup="dialog">制造详情 <span aria-hidden="true">↗</span></button>`:""}<button type="button" class="blueprint-source-trigger" data-blueprint-name="${escapeHtml(item.name_en || item.name)}" data-blueprint-title="${escapeHtml(item.name_zh || item.name)}" aria-haspopup="dialog">查询产出任务 <span aria-hidden="true">↗</span></button></div></article>`;
    }).join("");
    const remaining = filtered.length - shown.length;
    const loadMore = remaining > 0
      ? `<div class="load-more-row"><span>已显示 ${shown.length.toLocaleString("zh-CN")} / ${filtered.length.toLocaleString("zh-CN")}</span><button class="secondary-button" type="button" data-load-more>加载更多 ${Math.min(24, remaining)} 条<small>剩余 ${remaining.toLocaleString("zh-CN")} 条</small></button></div>`
      : filtered.length > 24 ? `<p class="result-limit">已显示全部 ${filtered.length.toLocaleString("zh-CN")} 条结果</p>` : "";
    els.results.innerHTML = cards + loadMore;
  }
  els.results.addEventListener('click',event=>{
    const button=event.target.closest('[data-quality-id]');
    if(!button) return;
    const item=catalog.blueprints.find(value=>value.id===button.dataset.qualityId);
    if(item) window.BlueprintQuality?.open(item,button);
  });
  let missionSourcesPromise, sourceRequest = 0;
  const sourcesDialog = document.createElement('dialog');
  sourcesDialog.className = 'blueprint-sources-dialog';
  sourcesDialog.setAttribute('aria-labelledby','blueprintSourceTitle');
  sourcesDialog.innerHTML = '<header><div><p>蓝图产出任务</p><h2 id="blueprintSourceTitle"></h2></div><button type="button" class="blueprint-source-close" aria-label="关闭产出任务">✕</button></header><div class="blueprint-mission-list" aria-live="polite"></div>';
  document.body.append(sourcesDialog);
  sourcesDialog.addEventListener('click', event => {
    if (event.target === sourcesDialog || event.target.closest('.blueprint-source-close')) sourcesDialog.close();
  });
  sourcesDialog.addEventListener('close', () => { sourceRequest++; });
  els.results.addEventListener('click', async (event) => {
    const button = event.target.closest('.blueprint-source-trigger');
    if (!button) return;
    const request = ++sourceRequest;
    const name = button.dataset.blueprintName;
    sourcesDialog.querySelector('h2').textContent = button.dataset.blueprintTitle;
    const body = sourcesDialog.querySelector('.blueprint-mission-list');
    body.textContent = '正在查询产出任务…';
    if (!sourcesDialog.open) sourcesDialog.showModal();
    try {
      if (!missionSourcesPromise) missionSourcesPromise = fetch('missions/blueprint-sources.json?v=643f365edb18').then(response => { if (!response.ok) throw Error('load'); return response.json(); }).catch(error => { missionSourcesPromise = null; throw error; });
      const data = await missionSourcesPromise;
      if (!sourcesDialog.open || request !== sourceRequest) return;
      const tasks = data.blueprints[name] || [];
      const systems = {Nyx:'尼克斯',Pyro:'派罗',Stanton:'斯坦顿',Multi:'跨星系'};
      body.innerHTML = tasks.length ? `<p class="blueprint-source-note">已记录 ${tasks.length} 个产出任务。概率为奖励池触发率，不是单张蓝图掉落率。</p><div class="blueprint-source-grid">` + tasks.map(task => `<a class="blueprint-source-task" href="missions.html?id=${encodeURIComponent(task.id)}"><span class="blueprint-source-meta">${escapeHtml(systems[task.system] || task.system)}${task.minimum_rank != null ? ` · 接取 Lv.${task.minimum_rank}` : ''}</span><strong>${escapeHtml(task.name)}</strong><small>${task.pools.map(pool => `${pool.chance_percent}% 触发 · ${pool.candidate_count} 选 1`).join('；')} →</small></a>`).join('') + `</div><a class="blueprint-source-all" href="missions.html?reward_blueprint=${encodeURIComponent(name)}">在任务页查看全部 ${tasks.length} 个任务 →</a>` : '<p class="blueprint-source-note">当前采集数据未记录产出此蓝图的任务，不代表游戏中无法通过任务获得。</p>';
    } catch (_) {
      if (sourcesDialog.open && request === sourceRequest) body.textContent = '任务来源暂时无法载入，请联网后关闭并重新查询。';
    }
  });
  function renderAll() { renderSelectors(); renderMaterialPicker(); renderActiveFilters(); renderResults(); }
  function restartResults() { state.visible = 24; renderAll(); }
  function closeSuggestions() { els.suggestions.hidden = true; els.materialSearch.setAttribute("aria-expanded", "false"); }
  function openSuggestions() { els.suggestions.hidden = false; els.materialSearch.setAttribute("aria-expanded", "true"); renderMaterialPicker(); }
  function addMaterial(id) { if (!state.selected.includes(id)) state.selected.push(id); els.materialSearch.value = ""; closeSuggestions(); restartResults(); }
  function setDrawer(open) {
    if (!els.drawer || !els.openFilters) return;
    document.body.classList.toggle("filter-drawer-open", open);
    els.drawer.classList.toggle("open", open);
    els.backdrop?.classList.toggle("open", open);
    els.openFilters.setAttribute("aria-expanded", String(open));
    if (open) window.setTimeout(() => els.closeFilters?.focus(), 180);
    else els.openFilters.focus();
  }

  els.search.value = new URLSearchParams(location.search).get("q") || "";
  const initialMaterials = new URLSearchParams(location.search).getAll("material");
  initialMaterials.forEach((id) => {
    if (materialIds.includes(id) && !state.selected.includes(id)) state.selected.push(id);
  });
  renderAll();
  const initialRecipe=new URLSearchParams(location.search).get('blueprint');
  if(initialRecipe) {const item=catalog.blueprints.find(value=>value.id===initialRecipe);if(item) window.BlueprintQuality?.open(item);}
  if (els.version) els.version.textContent = `${catalog.counts.blueprints.toLocaleString("zh-CN")} 张蓝图 · 离线数据`;
  els.search.addEventListener("input", restartResults);
  els.materialSearch.addEventListener("focus", openSuggestions);
  els.materialSearch.addEventListener("input", openSuggestions);
  els.materialSearch.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); const first = els.suggestions.querySelector("[data-add]"); if (first) addMaterial(first.dataset.add); } if (event.key === "Escape") closeSuggestions(); });
  els.suggestions.addEventListener("click", (event) => { const button = event.target.closest("[data-add]"); if (button) addMaterial(button.dataset.add); });
  els.selected.addEventListener("click", (event) => { const button = event.target.closest("[data-remove]"); if (button) { state.selected = state.selected.filter((id) => id !== button.dataset.remove); restartResults(); } });
  els.type.addEventListener("change", () => { state.type = els.type.value; state.subtype = "all"; restartResults(); });
  [els.component_class, els.component_grade].forEach(element => element.addEventListener("change", () => { state[element === els.component_class ? "component_class" : "component_grade"] = element.value; restartResults(); }));
  [els.subtype, els.slot, els.size].forEach((element) => element.addEventListener("change", () => { state[element === els.subtype ? "subtype" : element === els.slot ? "slot" : "size"] = element.value; restartResults(); }));
  els.reset.addEventListener("click", () => { state.type = state.subtype = state.slot = state.size = state.component_class = state.component_grade = "all"; els.search.value = els.materialSearch.value = ""; closeSuggestions(); restartResults(); });
  els.openFilters?.addEventListener("click", () => setDrawer(true));
  els.closeFilters?.addEventListener("click", () => setDrawer(false));
  els.backdrop?.addEventListener("click", () => setDrawer(false));
  els.applyFilters?.addEventListener("click", () => { setDrawer(false); els.summary.scrollIntoView({ behavior: "smooth", block: "start" }); });
  els.activeFilters?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-clear-filter]");
    if (!chip) return;
    const key = chip.dataset.clearFilter;
    if (key === "material") state.selected = state.selected.filter((id) => id !== chip.dataset.filterValue);
    else state[key] = "all";
    restartResults();
  });
  els.results.addEventListener("click", (event) => {
    if (!event.target.closest("[data-load-more]")) return;
    state.visible += 24;
    renderResults();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && els.drawer?.classList.contains("open")) setDrawer(false); });
  document.addEventListener("click", (event) => { if (!event.target.closest(".material-picker")) closeSuggestions(); });
})();
