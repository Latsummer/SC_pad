(() => {
  "use strict";

  const data = window.SCMINER_DATA;
  const locale = window.SCMINER_LOCALE;
  if (!data || !locale) {
    document.body.innerHTML = '<div class="empty-list">本地数据载入失败，请重新生成 app-data.js。</div>';
    return;
  }

  const mineralById = new Map(data.minerals.map((item) => [item.id, item]));
  const locationById = new Map(data.locations.map((item) => [item.id, item]));
  const state = {
    mode: "mineral",
    selected: [],
    system: "all",
    method: "all",
    dropdownOpen: false,
  };

  const els = {
    version: document.querySelector("#versionLabel"),
    modeButtons: [...document.querySelectorAll(".mode-button")],
    mineralControls: document.querySelector("#mineralControls"),
    scanControls: document.querySelector("#scanControls"),
    mineralWorkspace: document.querySelector("#mineralWorkspace"),
    scanWorkspace: document.querySelector("#scanWorkspace"),
    search: document.querySelector("#mineralSearch"),
    dropdownToggle: document.querySelector("#mineralDropdownToggle"),
    suggestions: document.querySelector("#suggestions"),
    selected: document.querySelector("#selectedMinerals"),
    systems: document.querySelector("#systemFilters"),
    methods: document.querySelector("#methodFilters"),
    summary: document.querySelector("#summaryBar"),
    locations: document.querySelector("#locationResults"),
    details: document.querySelector("#mineralDetails"),
    reset: document.querySelector("#resetFilters"),
    scanInput: document.querySelector("#scanInput"),
    scanButton: document.querySelector("#scanButton"),
    scanResults: document.querySelector("#scanResults"),
  };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));

  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s_\-()（）]/g, "");

  function nameEntry(id, type = "minerals") {
    return locale[type]?.[id] || { en: type === "minerals" ? mineralById.get(id)?.name : locationById.get(id)?.name, zh: "", aliases_en: [], aliases_zh: [] };
  }

  function displayName(id, type = "minerals") {
    const item = nameEntry(id, type);
    return item.zh ? `${item.zh} (${item.en})` : item.en;
  }

  function searchableText(mineral) {
    const item = nameEntry(mineral.id);
    return [item.en, item.zh, ...(item.aliases_en || []), ...(item.aliases_zh || [])].map(normalize).join("|");
  }

  function formatNumber(value, maximumFractionDigits = 1) {
    if (value === null || value === undefined) return "暂无";
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits });
  }

  function methodLabel(method) {
    return { all: "全部方式", ship: "船采", roc: "ROC", fps: "手采" }[method] || method;
  }

  function setMode(mode) {
    state.mode = mode;
    els.modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const scan = mode === "scan";
    els.mineralControls.hidden = scan;
    els.scanControls.hidden = !scan;
    els.mineralWorkspace.hidden = scan;
    els.scanWorkspace.hidden = !scan;
    if (scan) els.scanInput.focus();
    else els.search.focus();
  }

  function addMineral(id) {
    if (!state.selected.includes(id)) state.selected.push(id);
    els.search.value = "";
    closeSuggestions();
    renderMineralMode();
  }

  function removeMineral(id) {
    state.selected = state.selected.filter((item) => item !== id);
    renderMineralMode();
  }

  function setDropdownState(open) {
    state.dropdownOpen = open;
    els.search.setAttribute("aria-expanded", String(open));
    els.dropdownToggle.setAttribute("aria-expanded", String(open));
    els.dropdownToggle.classList.toggle("open", open);
    els.dropdownToggle.setAttribute("aria-label", open ? "收起矿物列表" : "展开矿物列表");
    els.suggestions.hidden = !open;
  }

  function closeSuggestions() {
    setDropdownState(false);
  }

  function renderSuggestions() {
    const query = normalize(els.search.value);
    if (!state.dropdownOpen) {
      els.suggestions.hidden = true;
      return;
    }
    const matches = data.minerals
      .filter((mineral) => !state.selected.includes(mineral.id) && searchableText(mineral).includes(query))
      .sort((a, b) => displayName(a.id).localeCompare(displayName(b.id), "zh-CN"));
    els.suggestions.innerHTML = matches.map((mineral) => `
      <button class="suggestion" type="button" data-add="${mineral.id}">
        <span>${escapeHtml(displayName(mineral.id))}</span>
        <small>${escapeHtml(methodLabel(mineral.mining_methods[0]))}</small>
      </button>`).join("") || '<div class="empty-list">没有匹配的矿物</div>';
    setDropdownState(true);
  }

  function openSuggestions() {
    const wasOpen = state.dropdownOpen;
    setDropdownState(true);
    renderSuggestions();
    if (!wasOpen) els.suggestions.scrollTop = 0;
  }

  function renderSelected() {
    if (!state.selected.length) {
      els.selected.innerHTML = '<span class="selection-hint">尚未选择矿物，可从左侧下拉框中多选</span>';
      return;
    }
    els.selected.innerHTML = state.selected.map((id) => `
      <span class="mineral-chip">
        ${escapeHtml(displayName(id))}
        <button type="button" data-remove="${id}" aria-label="移除 ${escapeHtml(displayName(id))}">×</button>
      </span>`).join("");
  }

  function renderFilters() {
    const systems = ["all", ...new Set(data.locations.map((item) => item.system))];
    els.systems.innerHTML = systems.map((system) => {
      const count = state.selected.length ? matchingLocations({ system, method: state.method }).length : null;
      const label = system === "all" ? "全部星系" : system;
      const countLabel = count === null ? "—" : `${count} 处`;
      return `<button type="button" class="filter-button ${state.system === system ? "active" : ""}" data-system="${system}" aria-label="${escapeHtml(label)}，${count === null ? "选择矿物后显示匹配地点数" : `${count} 个匹配地点`}"><span>${escapeHtml(label)}</span><span class="filter-count ${count === null ? "muted" : ""}">${countLabel}</span></button>`;
    }).join("");

    els.methods.innerHTML = ["all", "ship", "roc", "fps"].map((method) => {
      const count = state.selected.length ? matchingLocations({ system: state.system, method }).length : null;
      const countLabel = count === null ? "—" : `${count} 处`;
      return `<button type="button" class="filter-button ${state.method === method ? "active" : ""}" data-method="${method}" aria-label="${methodLabel(method)}，${count === null ? "选择矿物后显示匹配地点数" : `${count} 个匹配地点`}"><span>${methodLabel(method)}</span><span class="filter-count ${count === null ? "muted" : ""}">${countLabel}</span></button>`;
    }).join("");
  }

  function matchingLocations({ system = state.system, method = state.method } = {}) {
    if (!state.selected.length) return [];
    const selectedSet = new Set(state.selected);
    const selectedMinerals = state.selected.map((id) => mineralById.get(id));
    if (method !== "all" && selectedMinerals.some((item) => !item.mining_methods.includes(method))) return [];
    const grouped = new Map();
    data.distributions.forEach((row) => {
      if (!row.available || !selectedSet.has(row.mineral_id)) return;
      if (system !== "all" && row.system !== system) return;
      if (method !== "all" && !row.mining_methods.includes(method)) return;
      if (!grouped.has(row.location_id)) grouped.set(row.location_id, new Map());
      grouped.get(row.location_id).set(row.mineral_id, row);
    });
    return [...grouped.entries()]
      .filter(([, rows]) => rows.size === state.selected.length)
      .map(([locationId, rows]) => {
        const values = state.selected.map((id) => rows.get(id).abundance);
        return { locationId, rows, minimum: Math.min(...values), total: values.reduce((sum, value) => sum + value, 0) };
      })
      .sort((a, b) => b.minimum - a.minimum || b.total - a.total || locationById.get(a.locationId).name.localeCompare(locationById.get(b.locationId).name));
  }

  function renderLocations() {
    if (!state.selected.length) {
      els.summary.innerHTML = '<span><strong>请先选择矿物</strong></span><code>支持多选与共同分布查询</code>';
      els.locations.innerHTML = '<div class="empty-list">从上方下拉框选择一种或多种矿物，这里会显示相应的推荐地点。</div>';
      return;
    }
    const results = matchingLocations();
    const selectedNames = state.selected.map((id) => displayName(id)).join(" + ");
    els.summary.innerHTML = `<span><strong>${results.length}</strong> 个共同分布地点</span><code>${escapeHtml(selectedNames)}</code>`;
    if (!results.length) {
      els.locations.innerHTML = '<div class="empty-list">当前筛选条件下没有共同分布地点。可以重置星系或采矿方式后再试。</div>';
      return;
    }
    els.locations.innerHTML = results.map((result, index) => {
      const location = locationById.get(result.locationId);
      const maximum = Math.max(...[...result.rows.values()].map((row) => row.abundance), 1);
      const rows = state.selected.map((id) => {
        const row = result.rows.get(id);
        return `<div class="abundance-row">
          <span>${escapeHtml(displayName(id))}</span>
          <span class="meter"><span style="width:${Math.max(3, row.abundance / maximum * 100)}%"></span></span>
          <strong>${formatNumber(row.abundance, 2)}%</strong>
        </div>`;
      }).join("");
      return `<article class="location-card" style="--enter-index:${index}">
        <div class="location-head">
          <div><h3>${escapeHtml(displayName(location.id, "locations"))}</h3><p class="location-meta">${escapeHtml(location.system)} · ${escapeHtml(location.body_type)} · ${escapeHtml(location.gravity)}</p></div>
          <div class="balance-score">${formatNumber(result.minimum, 2)}%<small>最低丰度</small></div>
        </div>
        <div class="abundance-list">${rows}</div>
      </article>`;
    }).join("");
  }

  function associatedButton(association) {
    return `<button type="button" class="association-button" data-add="${association.mineral_id}"><small>${association.role === "secondary" ? "次生矿" : "三级微量"}</small>${escapeHtml(displayName(association.mineral_id))}</button>`;
  }

  function reverseAssociationButton(entry) {
    const role = entry.association.role === "secondary" ? "作为次生矿" : "作为三级微量";
    return `<button type="button" class="association-button" data-add="${entry.source.id}"><small>${role}</small>${escapeHtml(displayName(entry.source.id))}</button>`;
  }

  function renderDetailCard(mineral) {
    const price = mineral.price.amount === null ? "暂无价格" : `${formatNumber(mineral.price.amount, 0)} ${mineral.price.unit}`;
    const associations = mineral.composition.associated_minerals || [];
    const reverse = data.minerals.flatMap((item) =>
      (item.composition.associated_minerals || [])
        .filter((association) => association.mineral_id === mineral.id)
        .map((association) => ({ source: item, association }))
    );
    const signatures = mineral.scan.supported_by_signature_scanner
      ? `<div class="association-block"><h3>岩石数量与扫描信号</h3><div class="signature-strip">${mineral.scan.cluster_signatures.map((value, index) => `<div class="signature-cell"><span>${index + 1} 块</span><strong>${formatNumber(value, 0)}</strong></div>`).join("")}</div></div>`
      : "";
    return `<article class="detail-card">
      <span class="detail-kicker">${escapeHtml(methodLabel(mineral.mining_methods[0]))} · ${escapeHtml(mineral.tier)}</span>
      <h2>${escapeHtml(displayName(mineral.id))}</h2>
      <div class="stat-grid">
        <div class="stat"><span>基础价格</span><strong>${escapeHtml(price)}</strong></div>
        <div class="stat"><span>单块特征</span><strong>${mineral.scan.unit_signature ? formatNumber(mineral.scan.unit_signature, 0) : "不适用"}</strong></div>
        <div class="stat"><span>不稳定性</span><strong>${escapeHtml(mineral.properties.instability)}</strong></div>
        <div class="stat"><span>抗性 / 密度</span><strong>${escapeHtml(mineral.properties.resistance)} / ${escapeHtml(mineral.properties.density)}</strong></div>
      </div>
      <div class="association-block">
        <h3>还能从哪些主矿获得当前矿物</h3>
        <p class="association-copy">挖取以下主矿时，也有机会获得 <strong>${escapeHtml(displayName(mineral.id))}</strong>：</p>
        ${reverse.length ? `<div class="association-list">${reverse.map(reverseAssociationButton).join("")}</div>` : '<span class="association-empty">没有记录为其他矿物的伴生矿</span>'}
      </div>
      <div class="association-block">
        <h3>当前矿物会伴生什么</h3>
        <p class="association-copy">以 <strong>${escapeHtml(displayName(mineral.id))}</strong> 为主矿挖取时，可能同时获得：</p>
        ${associations.length ? `<div class="association-list">${associations.map(associatedButton).join("")}</div>` : '<span class="association-empty">没有已记录的伴生矿物</span>'}
      </div>
      ${signatures}
    </article>`;
  }

  function renderDetails() {
    els.details.innerHTML = state.selected.length
      ? state.selected.map((id) => renderDetailCard(mineralById.get(id))).join("")
      : '<article class="detail-card"><span class="detail-kicker">MINERAL DETAILS</span><h2>等待选择矿物</h2><p class="reverse-note">选择后会显示价格、扫描特征、属性和伴生矿物。</p></article>';
  }

  function renderMineralMode() {
    renderSelected();
    renderFilters();
    renderLocations();
    renderDetails();
  }

  function renderScan() {
    const rawValue = els.scanInput.value.trim();
    if (!rawValue) {
      els.scanResults.innerHTML = '<div class="empty-state"><span class="empty-glyph">◎</span><h2>等待扫描信号</h2><p>输入一个正整数，即可实时反推出可能的矿石种类和岩石数量。</p></div>';
      return;
    }
    const observed = Number(rawValue);
    if (!Number.isInteger(observed) || observed <= 0) {
      els.scanResults.innerHTML = '<div class="empty-state"><span class="empty-glyph">!</span><h2>请输入有效信号</h2><p>扫描值需要是大于零的整数。</p></div>';
      return;
    }
    const exact = data.signature_index.filter((row) => row.signature === observed);
    const candidates = exact.length
      ? exact
      : [...data.signature_index].sort((a, b) => Math.abs(a.signature - observed) - Math.abs(b.signature - observed)).slice(0, 6);
    const cards = candidates.map((row, index) => {
      const mineral = mineralById.get(row.mineral_id);
      const delta = observed - row.signature;
      return `<article class="candidate" style="--enter-index:${index}">
        <div class="candidate-top"><h3>${escapeHtml(displayName(row.mineral_id))}</h3><span class="candidate-count">${row.rock_count} 块</span></div>
        <div class="candidate-meta">
          <div>单块特征<strong>${formatNumber(row.unit_signature, 0)}</strong></div>
          <div>目标信号<strong>${formatNumber(row.signature, 0)}</strong></div>
          <div>${exact.length ? "匹配状态" : "信号差值"}<strong>${exact.length ? "精确" : `${delta > 0 ? "+" : ""}${formatNumber(delta, 0)}`}</strong></div>
        </div>
        <button type="button" class="text-button" data-open-mineral="${mineral.id}">查看价格和分布 →</button>
      </article>`;
    }).join("");
    els.scanResults.innerHTML = `<div class="scan-result-header"><div><p>OBSERVED SIGNATURE</p><h2>${formatNumber(observed, 0)}</h2></div><span class="match-badge ${exact.length ? "" : "nearest"}">${exact.length ? `${exact.length} 个精确候选` : "未精确命中 · 显示最近候选"}</span></div><div class="candidate-grid">${cards}</div>`;
  }

  els.version.textContent = `${data.game_data_version} · ${data.counts.minerals} 种资源 · 离线数据`;
  els.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.search.addEventListener("focus", openSuggestions);
  els.search.addEventListener("input", openSuggestions);
  els.search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = els.suggestions.querySelector("[data-add]");
      if (first) addMineral(first.dataset.add);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      els.suggestions.querySelector("[data-add]")?.focus();
    }
    if (event.key === "Escape") closeSuggestions();
  });
  els.dropdownToggle.addEventListener("click", () => {
    if (state.dropdownOpen) closeSuggestions();
    else { openSuggestions(); els.search.focus(); }
  });
  els.suggestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (button) addMineral(button.dataset.add);
  });
  els.selected.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (button) removeMineral(button.dataset.remove);
  });
  els.systems.addEventListener("click", (event) => {
    const button = event.target.closest("[data-system]");
    if (button) { state.system = button.dataset.system; renderMineralMode(); }
  });
  els.methods.addEventListener("click", (event) => {
    const button = event.target.closest("[data-method]");
    if (button) { state.method = button.dataset.method; renderMineralMode(); }
  });
  els.reset.addEventListener("click", () => { state.system = "all"; state.method = "all"; renderMineralMode(); });
  els.details.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (button) addMineral(button.dataset.add);
  });
  els.scanInput.addEventListener("input", renderScan);
  els.scanButton.addEventListener("click", renderScan);
  els.scanInput.addEventListener("keydown", (event) => { if (event.key === "Enter") renderScan(); });
  els.scanResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-mineral]");
    if (!button) return;
    state.selected = [button.dataset.openMineral];
    setMode("mineral");
    renderMineralMode();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) closeSuggestions();
  });

  renderMineralMode();
})();
