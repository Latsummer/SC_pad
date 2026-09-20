(() => {
  "use strict";
  const catalog = window.SCMDB_BLUEPRINTS;
  const mining = window.SCMINER_DATA;
  const locale = window.SCMINER_LOCALE;
  if (!catalog || !mining || !locale) { document.body.innerHTML = '<div class="empty-list">蓝图数据载入失败，请重新生成离线数据。</div>'; return; }

  const mineralById = new Map(mining.minerals.map((item) => [item.id, item]));
  const state = { selected: [], type: "all", subtype: "all", slot: "all", size: "all", visible: 24 };
  const els = {
    version: document.querySelector("#blueprintVersion"), search: document.querySelector("#blueprintSearch"),
    materialSearch: document.querySelector("#materialSearch"), suggestions: document.querySelector("#materialSuggestions"),
    selected: document.querySelector("#selectedMaterials"), type: document.querySelector("#typeFilter"), subtype: document.querySelector("#subtypeFilter"), slot: document.querySelector("#slotFilter"),
    size: document.querySelector("#sizeFilter"),
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

  function matches(item, omit = "") {
    const query = normalize(els.search.value);
    if (query && !normalize(`${item.name_zh || ""}|${item.name_en || ""}|${item.name || ""}`).includes(query)) return false;
    if (state.selected.length && !state.selected.every((id) => item.materials.some((material) => material.mineral?.id === id))) return false;
    if (omit !== "type" && state.type !== "all" && (item.type_group || "其他") !== state.type) return false;
    if (omit !== "subtype" && state.subtype !== "all" && item.type_subtype !== state.subtype) return false;
    if (omit !== "slot" && state.slot !== "all" && !item.materials.some((material) => material.slot === state.slot)) return false;
    if (omit !== "size" && state.size !== "all" && item.size !== Number(state.size)) return false;
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
    setOptions(els.type, "全部大类", countBy(catalog.blueprints.filter((item) => matches(item, "type")), "type_group"), "type");
    setOptions(els.subtype, "全部细分", countBy(catalog.blueprints.filter((item) => matches(item, "subtype")), "type_subtype"), "subtype");
    setOptions(els.slot, "全部槽位", countBy(catalog.blueprints.filter((item) => matches(item, "slot")), "slot").map(([slot, count]) => [slot, count, slotName(slot)]), "slot");
    setOptions(els.size, "全部尺寸", countBy(catalog.blueprints.filter((item) => matches(item, "size")), "size").sort((a,b) => Number(a[0]) - Number(b[0])).map(([size, count]) => [size, count, `S${size}`]), "size");
  }
  function renderMaterialPicker() {
    els.selected.innerHTML = state.selected.length ? state.selected.map((id) => `<span class="mineral-chip">${escapeHtml(mineralName(id))}<button type="button" data-remove="${id}" aria-label="移除 ${escapeHtml(mineralName(id))}">×</button></span>`).join("") : '<span class="selection-hint">未选择材料</span>';
    const query = normalize(els.materialSearch.value);
    const matches = materialIds.filter((id) => id !== undefined && !state.selected.includes(id) && normalize(mineralName(id)).includes(query)).sort((a,b) => mineralName(a).localeCompare(mineralName(b), "zh-CN"));
    els.suggestions.innerHTML = matches.map((id) => `<button class="suggestion" type="button" data-add="${id}"><span>${escapeHtml(mineralName(id))}</span><small>${catalog.blueprints.filter((item) => item.materials.some((m) => m.mineral?.id === id)).length} 张蓝图</small></button>`).join("") || '<div class="empty-list">没有匹配的已采集矿物</div>';
  }
  function renderActiveFilters() {
    if (!els.activeFilters) return;
    const tags = state.selected.map((id) => ({ key: "material", value: id, label: mineralName(id) }));
    if (state.type !== "all") tags.push({ key: "type", label: state.type });
    if (state.subtype !== "all") tags.push({ key: "subtype", label: state.subtype });
    if (state.slot !== "all") tags.push({ key: "slot", label: slotName(state.slot) });
    if (state.size !== "all") tags.push({ key: "size", label: `S${state.size}` });
    els.activeFilters.innerHTML = tags.map((tag) => `<button type="button" class="active-filter-chip" data-clear-filter="${tag.key}"${tag.value ? ` data-filter-value="${escapeHtml(tag.value)}"` : ""}><span>${escapeHtml(tag.label)}</span><b aria-hidden="true">×</b></button>`).join("");
    els.activeFilters.hidden = !tags.length;
  }
  function renderResults() {
    const filtered = catalog.blueprints.filter((item) => matches(item)).sort((a,b) => a.craft_time_seconds - b.craft_time_seconds || a.name.localeCompare(b.name, "zh-CN"));
    const activeCount = state.selected.length + [state.type, state.subtype, state.slot, state.size].filter((value) => value !== "all").length;
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
      return `<article class="blueprint-card" style="--enter-index:${index}"><div class="blueprint-card-head"><div><span class="detail-kicker">${escapeHtml(item.type_group || "其他")}${item.type_subtype ? ` · ${escapeHtml(item.type_subtype)}` : ""}${item.size ? ` · S${item.size}` : ""}</span><h2>${escapeHtml(item.name_zh || item.name)}</h2></div><time>⏱ ${formatTime(item.craft_time_seconds)}</time></div><ul class="material-list">${materials}</ul></article>`;
    }).join("");
    const remaining = filtered.length - shown.length;
    const loadMore = remaining > 0
      ? `<div class="load-more-row"><span>已显示 ${shown.length.toLocaleString("zh-CN")} / ${filtered.length.toLocaleString("zh-CN")}</span><button class="secondary-button" type="button" data-load-more>加载更多 ${Math.min(24, remaining)} 条<small>剩余 ${remaining.toLocaleString("zh-CN")} 条</small></button></div>`
      : filtered.length > 24 ? `<p class="result-limit">已显示全部 ${filtered.length.toLocaleString("zh-CN")} 条结果</p>` : "";
    els.results.innerHTML = cards + loadMore;
  }
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

  const initialMaterial = new URLSearchParams(location.search).get("material");
  if (initialMaterial && materialIds.includes(initialMaterial)) state.selected.push(initialMaterial);
  renderSelectors(); renderAll();
  if (els.version) els.version.textContent = `${catalog.counts.blueprints.toLocaleString("zh-CN")} 张蓝图 · 离线数据`;
  els.search.addEventListener("input", restartResults);
  els.materialSearch.addEventListener("focus", openSuggestions);
  els.materialSearch.addEventListener("input", openSuggestions);
  els.materialSearch.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); const first = els.suggestions.querySelector("[data-add]"); if (first) addMaterial(first.dataset.add); } if (event.key === "Escape") closeSuggestions(); });
  els.suggestions.addEventListener("click", (event) => { const button = event.target.closest("[data-add]"); if (button) addMaterial(button.dataset.add); });
  els.selected.addEventListener("click", (event) => { const button = event.target.closest("[data-remove]"); if (button) { state.selected = state.selected.filter((id) => id !== button.dataset.remove); restartResults(); } });
  els.type.addEventListener("change", () => { state.type = els.type.value; state.subtype = "all"; restartResults(); });
  [els.subtype, els.slot, els.size].forEach((element) => element.addEventListener("change", () => { state[element === els.subtype ? "subtype" : element === els.slot ? "slot" : "size"] = element.value; restartResults(); }));
  els.reset.addEventListener("click", () => { state.type = state.subtype = state.slot = state.size = "all"; els.search.value = els.materialSearch.value = ""; closeSuggestions(); restartResults(); });
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
