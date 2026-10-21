/*
 * Runs only when the user activates it on https://scmdb.net/?page=fab.
 * It records blueprint cards already rendered by SCMDB's public interface;
 * it never calls SCMDB APIs or fetches /data/ resources.
 */
(() => {
  "use strict";

  if (window.__SCMDB_PUBLIC_CAPTURE__) {
    window.__SCMDB_PUBLIC_CAPTURE__.show();
    return;
  }

  if (location.hostname !== "scmdb.net" || new URLSearchParams(location.search).get("page") !== "fab") {
    alert("请先打开 SCMDB 的 Fabricator 页面，再点击采集助手。");
    return;
  }

  const records = new Map();
  const detailRecords = new Map();
  const cardRecipes = new Map();
  const runs = [];
  let batchRunning = false, stopRequested = false;
  let groupRunning = false;
  const groupedRuns = [];
  let activeGroupSession = null;
  let activeIdentity = null;
  let knownListCount = 0;
  let sampling = false;
  let disposed = false;
  let paused = false;
  let captureTimer = 0;
  const pageUrl = location.href;

  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  };

  const compact = (value) => value.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).join("\n");

  function looksLikeBlueprintCard(text) {
    return text.length >= 20
      && text.length <= 1800
      && (/(?:\(\s*\d+(?:\.\d+)?\s*(?:SCU)?\)|\b\d+(?:\.\d+)?\s*SCU\b)/i.test(text))
      && (text.includes("⏱") || /\b\d+s\b/.test(text));
  }

  function captureVisibleCards(force = false) {
    if (paused || disposed || sampling || ((batchRunning || groupRunning) && !force)) return;
    if (document.querySelector(".fab-detail")) return;
    const cards = [...document.querySelectorAll(".fab-card")];
    knownListCount = cards.length;
    const candidates = cards.length ? cards : [...document.querySelectorAll("main *, #app *, #root *")];
    candidates.forEach((element) => {
      const text = compact(element.innerText || "");
      if (!looksLikeBlueprintCard(text)) return;
      const key = hash(text);
      if (!records.has(key)) {
        records.set(key, { raw_text: text, captured_at: new Date().toISOString() });
      }
    });
    updateTotals();
    exportButton.textContent = `导出旧版配方列表（${records.size} 条）`;
  }

  function scheduleCapture() {
    if (batchRunning || sampling || groupRunning || disposed) return;
    window.clearTimeout(captureTimer);
    captureTimer = window.setTimeout(captureVisibleCards, 160);
  }

  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "SCMDB 公开页面采集助手");
  panel.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
    "width:min(310px,calc(100vw - 32px))", "padding:14px", "border:1px solid #35d9e8",
    "border-radius:12px", "background:#071114", "color:#e8f6f7", "box-shadow:0 12px 34px rgba(0,0,0,.45)",
    "font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  ].join(";");
  panel.innerHTML = `
    <strong style="display:block;margin-bottom:8px;color:#35d9e8">SCMDB 蓝图采集助手</strong>
    <p style="margin:0 0 10px;line-height:1.5;color:#b3c8ca">自动打开蓝图，记录配方、品质规则和成品属性，再返回列表。详情页也可直接启动；运行时请勿操作站点。</p>
    <label style="display:block;margin-bottom:8px">采集范围 <select data-group-mode><option value="current">当前筛选列表</option><option value="auto">自动分类分组（每组优先不超过 100 个）</option></select></label>
    <label>本批蓝图数 <input data-batch-limit type="number" min="1" max="2000" value="10" style="width:64px"></label>
    <label style="display:block;margin:8px 0"><input data-auto-export type="checkbox" checked> 完成后自动导出</label>
    <div style="margin:10px 0;padding:10px;border:1px solid #24545b;border-radius:8px;line-height:1.6">
      <p id="scmdb-capture-count" style="margin:0;color:#e8f6f7">总体：正在记录列表卡片…</p>
      <p data-batch-status style="margin:4px 0;color:#e8f6f7">本批：尚未开始</p>
      <p data-detail-status aria-live="polite" style="margin:0;color:#8cdce3">当前：等待采集详情</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" data-action="batch">自动采集详情</button>
      <button type="button" data-action="stop">停止自动采集</button>
      <button type="button" data-action="export-details">导出 JSON</button>
      <button type="button" data-action="restore">恢复上次进度</button>
      <button type="button" data-action="import">导入 JSON</button>
      <button type="button" data-action="close">关闭</button>
    </div>
    <input data-import-file type="file" accept=".json,application/json" hidden>
    <label style="display:block;margin-top:8px"><input data-import-same type="checkbox"> 文件版本缺失时，确认与当前游戏版本相同</label>
    <details style="margin-top:10px"><summary style="cursor:pointer">更多工具</summary>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button type="button" data-action="save">保存进度</button>
        <button type="button" data-action="presets">仅采当前蓝图</button>
        <button type="button" data-action="detail">记录当前快照</button>
        <button type="button" data-action="pause">暂停列表</button>
        <button type="button" data-action="export">导出旧版配方列表</button>
      </div>
    </details>
    <small style="display:block;margin-top:10px;color:#b3c8ca;line-height:1.5">每个蓝图自动保存进度。再次启动跳过已完成项，失败项可重试。自动分类会清除站点筛选，超过 100 个才继续细分，无法继续细分时采集较大组。不自动翻页；休眠或标签冻结会暂停。</small>`;
  document.body.append(panel);

  const count = panel.querySelector("#scmdb-capture-count");
  const pauseButton = panel.querySelector('[data-action="pause"]');
  const exportButton = panel.querySelector('[data-action="export"]');

  [...panel.querySelectorAll("button")].forEach((button) => {
    button.style.cssText = "min-height:34px;padding:0 10px;border:1px solid #2c7980;border-radius:7px;background:#0c2024;color:#e8f6f7;font:inherit;font-weight:700;cursor:pointer";
  });

  const detailStatus = panel.querySelector('[data-detail-status]');
  const batchStatus = panel.querySelector('[data-batch-status]');
  function updateTotals() {
    const completed=[...detailRecords.values()].filter(entry=>entry.sampling_complete).length;
    count.textContent=`总体：当前列表 ${knownListCount} 个 · 已记录卡片 ${records.size} 条 · 详情完成 ${completed} 个（已读 ${detailRecords.size} 个）`;
  }
  function updateBatch(run,finished=false) {
    if(activeGroupSession && run.group_path) {
      const session=activeGroupSession;
      batchStatus.textContent=`自动分组本批：上限 ${session.limit} · 完成 ${session.completed+run.completed} · 失败 ${session.failures+run.failures.length} · 当前分组 ${run.group_path}（${run.completed}/${run.total}）`;
      return;
    }
    batchStatus.textContent=`本批：${finished?'已结束':'采集中'} · 目标 ${run.total} · 完成 ${run.completed} · 失败 ${run.failures.length}${run.group_path?' · 分组 '+run.group_path:''} · 待处理 ${Math.max(0,run.total-run.completed-run.failures.filter(item=>item.stage!=='navigation').length)}`;
  }
  const text = node => compact(node?.innerText || '');
  const recipeId = () => new URL(location.href).searchParams.get('fab');
  // Snap mode renders ranges without number inputs. Select one writable
  // control per slot so Free mode does not duplicate the same quality value.
  const inputs = detail => [...detail.querySelectorAll('.fab-slot')].flatMap(slot => {
    const input = slot.querySelector('.fab-slot-quality-input') || slot.querySelector('.fab-slot-quality-slider');
    return input ? [input] : [];
  });
  function extractDetail() {
    const detail = document.querySelector('.fab-detail');
    if (!detail || !recipeId()) throw Error('请先打开一个蓝图详情');
    const modes = [...detail.querySelectorAll('.fab-mode-btn')];
    if (!modes.length || !modes[0].classList.contains('active')) throw Error('请切换到制造 Craft 视图');
    const info = detail.querySelector('.fab-quality-info');
    return {
      recipe_id: recipeId(), source_url: location.href, title: text(detail.querySelector('.fab-detail-title')),
      captured_at: new Date().toISOString(), mode: 'craft',
      product_stats_raw: text(detail.querySelector('.fab-stats-panel')),
      quality_policy_raw: text(info), quality_controls_present: inputs(detail).length > 0,
      notices: [...detail.querySelectorAll('[class*="blacklist"], .fab-quality-info')].map(text),
      stats: [...detail.querySelectorAll('.fab-stats-row')].map(row => ({
        label: text(row.querySelector('.fab-stats-label')), base: text(row.querySelector('.fab-stats-base')),
        modified: text(row.querySelector('.fab-stats-modified')), delta: text(row.querySelector('.fab-stats-delta')), raw_text: text(row),
      })),
      resistances: [...detail.querySelectorAll('.fab-stats-resist-item')].map(row => ({
        type: text(row.querySelector('.fab-stats-resist-type')), base: text(row.querySelector('.fab-stats-resist-value')),
        modified: text(row.querySelector('.fab-stats-resist-crafted')), raw_text: text(row),
      })),
      slots: [...detail.querySelectorAll('.fab-slot')].map(slot => ({
        slot: text(slot.querySelector('.fab-slot-name')), material: text(slot.querySelector('.fab-mat-name')),
        quantity: text(slot.querySelector('.fab-mat-qty')),
        quality_controls: [...slot.querySelectorAll('.fab-slot-quality-input, .fab-slot-quality-slider')].map(input => ({
          type: input.type, value: input.value, min: input.min, max: input.max, step: input.step,
        })),
        effects: [...slot.querySelectorAll('.fab-modifier')].map(effect => ({
          name: text(effect.querySelector('.fab-mod-name')), multiplier: text(effect.querySelector('.fab-mod-value')),
          delta: text(effect.querySelector('.fab-mod-pct')), range_raw: text(effect.parentElement.querySelector('.fab-mod-shared-range')),
        })), raw_text: text(slot),
      })), raw_text: text(detail),
    };
  }
  function recordDetail(label = 'current') {
    const snapshot = extractDetail();
    if (!snapshot.title || !snapshot.slots.length) throw Error('未识别到详情标题或材料槽位，保留为待重试');
    const entry = detailRecords.get(snapshot.recipe_id) || {recipe_id:snapshot.recipe_id, source_url:snapshot.source_url, title:snapshot.title, samples:{}};
    entry.samples[label] = snapshot;
    detailRecords.set(snapshot.recipe_id, entry);
    updateTotals();
    return snapshot;
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
  async function stable(id) {
    let previous = '', repeats = 0;
    for (let count = 0; count < 60; count++) {
      if (disposed || recipeId() !== id) throw Error('采集已停止或蓝图已切换');
      const detail = document.querySelector('.fab-detail');
      if (!detail) throw Error('蓝图详情已关闭');
      const signature = text(detail) + JSON.stringify(inputs(detail).map(input => input.value));
      repeats = signature === previous ? repeats + 1 : 0;
      if (repeats >= 2) return;
      previous = signature;
      await delay(40);
    }
    throw Error('页面尚未稳定，请重试');
  }
  async function samplePresets() {
    if (sampling) return;
    const original = extractDetail(), id = original.recipe_id;
    recordDetail('initial');
    const detail = document.querySelector('.fab-detail');
    const presets = [...detail.querySelectorAll('.fab-preset-btn')];
    if (!original.quality_controls_present) {
      if (!original.quality_policy_raw) throw Error('没有品质控件，也没有固定品质说明，请反馈详情');
      detailRecords.get(id).sampling_complete = true;
      updateTotals();
      detailStatus.textContent = `当前：${original.title} · 无品质影响，已记录`;
      return;
    }
    if (presets.length !== 4) throw Error('品质预设布局改变，停止采集并反馈');
    const saved = inputs(detail).map(input => ({input, value:input.value}));
    sampling = true;
    let success = false;
    try {
      for (const [index,label] of ['min','base','half','max'].entries()) {
        detailStatus.textContent = `当前：${original.title} · 预设 ${index+1}/4（${['最低','基础','50%','最高'][index]}）`;
        presets[index].click();
        await stable(id);
        const snapshot = recordDetail(label);
        if (!snapshot.slots.some(slot => slot.effects.length)) throw Error('品质控件存在，但没有识别到影响规则');
      }
      success = true;
    } finally {
      if (!disposed && recipeId() === id && document.querySelector('.fab-detail')) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        for (const {input,value} of saved) {
          if (!input.isConnected) continue;
          setter.call(input,value);
          input.dispatchEvent(new Event('input',{bubbles:true}));
          input.dispatchEvent(new Event('change',{bubbles:true}));
        }
        await stable(id);
        const restored = inputs(document.querySelector('.fab-detail')).map(input=>input.value);
        if (JSON.stringify(restored) !== JSON.stringify(saved.map(entry=>entry.value))) {
          detailStatus.textContent = '品质值未能恢复，请手动恢复；采样数据已保留';
          success = false;
        }
      }
      sampling = false;
      if (success) {
        detailRecords.get(id).sampling_complete = true;
        updateTotals();
        detailStatus.textContent = `当前：${original.title} · 四组预设完成，品质值已恢复`;
      }
    }
  }
  const checkpointIdentity = () => {
    const version = text(document.querySelector('select:disabled'));
    if (!version) throw Error('无法识别游戏版本，不能保存或恢复进度');
    const url = new URL(location.href);
    return JSON.stringify([version, url.searchParams.get('lang') || '', document.documentElement?.lang || '', url.searchParams.get('channel') || 'live']);
  };
  async function checkpoint(write) {
    const key = checkpointIdentity();
    if (activeIdentity && activeIdentity !== key) throw Error('游戏版本或语言已改变，请导出并重新启动助手');
    const db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('scmdb-public-fabricator-quality-helper',1);
      request.onupgradeneeded = () => request.result.createObjectStore('checkpoints');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve,reject) => {
        const tx = db.transaction('checkpoints',write ? 'readwrite' : 'readonly');
        const store = tx.objectStore('checkpoints');
        const request = write ? store.put({identity:key, saved_at:new Date().toISOString(), cards:[...records], list_count:knownListCount, details:[...detailRecords], links:[...cardRecipes], runs, grouped_runs:groupedRuns},key) : store.get(key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error || Error('进度保存失败'));
        tx.onabort = () => reject(tx.error || Error('进度事务中止'));
      });
    } finally { db.close(); }
  }
  async function waitFor(read, description) {
    for (let attempt=0;attempt<150;attempt++) {
      if (disposed) throw Error('助手已关闭');
      const value = read(); if(value) return value;
      await delay(80);
    }
    throw Error(`等待${description}超时`);
  }
  const listCards = () => [...document.querySelectorAll('.fab-card')];
  const cardText = card => text(card);
  const groupNames = {
    type:['type','类型'], armorClass:['armor class','护甲等级','护甲类型'],
    armorSlot:['armor slot','护甲部位'], subtype:['subtype','子类型'],
    ammo:['ammo type','弹药类型'], componentClass:['component class','组件类别'],
    grade:['grade','等级'], manufacturer:['manufacturer','制造商'], material:['material','材料'],
  };
  function filterGroup(key) {
    return [...document.querySelectorAll('.fab-filter-group')].find(group=>{
      const heading=group.querySelector('.fab-filter-label');
      const name=text(heading?.querySelector('span') || heading).toLowerCase();
      return groupNames[key]?.includes(name);
    });
  }
  async function expandedGroup(key) {
    let group=filterGroup(key);
    if(!group) return null;
    if(!group.querySelectorAll('.fab-chip').length) {
      group.querySelector('.fab-filter-label')?.click();
      await delay(80); group=filterGroup(key);
    }
    return group;
  }
  function filterOptionKey(key,chip) { return key==='type' ? chip.getAttribute('title') : text(chip); }
  async function filterOptions(key) {
    const group=await expandedGroup(key);
    if(!group) return [];
    return [...group.querySelectorAll('.fab-chip')].map(chip=>({value:filterOptionKey(key,chip),label:text(chip)}))
      .filter(option=>option.value && (key!=='type' || option.value!=='all'));
  }
  async function stableList() {
    let previous='',equal=0;
    for(let i=0;i<150;i++) {
      if(disposed || stopRequested) return false;
      const signature=JSON.stringify(listCards().map(card=>card.textContent ?? card.innerText ?? ''));
      equal=signature===previous?equal+1:0;
      if(!document.querySelector('.fab-detail') && equal>=2) return true;
      previous=signature; await delay(80);
    }
    throw Error('筛选列表未稳定，已停止');
  }
  async function runGrouped() {
    if(batchRunning || sampling || groupRunning) return;
    const identity=checkpointIdentity();
    groupRunning=true; stopRequested=false;
    const session={started_at:new Date().toISOString(), target_group_size:100, limit:Math.max(1,Math.min(2000,Number(panel.querySelector('[data-batch-limit]').value)||10)), completed:0, failures:0, groups:[], warnings:[]};
    groupedRuns.push(session);
    activeGroupSession=session;
    const runStartIndex=runs.length;
    let applied=[];
    const check=()=>{
      if(disposed || stopRequested) return false;
      if(checkpointIdentity()!==identity) throw Error('游戏版本或语言改变，自动分组已停止');
      return session.completed+session.failures<session.limit;
    };
    async function applyPath(path) {
      if(!check()) return false;
      let common=0;
      while(common<applied.length && common<path.length && applied[common].key===path[common].key && applied[common].value===path[common].value) common++;
      // Clear deepest child first, preserving the common parent filter.
      for(let i=applied.length-1;i>=Math.max(common,1);i--) {
        if(!check()) return false;
        const clear=filterGroup(applied[i].key)?.querySelector('.fab-clear-inline');
        if(!clear) throw Error('未找到子筛选清除按钮，请检查页面');
        clear.click(); if(!await stableList()) return false;
      }
      applied=applied.slice(0,common);
      for(let i=common;i<path.length;i++) {
        if(!check()) return false;
        const entry=path[i], group=await expandedGroup(entry.key);
        const chip=[...(group?.querySelectorAll('.fab-chip')||[])].find(node=>filterOptionKey(entry.key,node)===entry.value);
        if(!chip) throw Error(`筛选选项已改变：${entry.label}`);
        if(!chip.classList.contains('active')) chip.click();
        if(!await stableList()) return false;
        const selected=[...(filterGroup(entry.key)?.querySelectorAll('.fab-chip')||[])].find(node=>filterOptionKey(entry.key,node)===entry.value);
        if(!selected?.classList.contains('active')) throw Error(`筛选没有成功选中：${entry.label}`);
        applied.push(entry);
      }
      return true;
    }
    const priorities=type=>type==='armour' ? ['armorClass','armorSlot','subtype','manufacturer'] : type==='weapons' ? ['subtype','ammo','manufacturer'] : ['componentClass','grade','subtype','manufacturer'];
    async function walk(path,remaining,allowed=null) {
      if(!check() || !await applyPath(path)) return;
      const cards=listCards(), raw=cards.map(cardText);
      const work=new Set(raw.filter(value=>!allowed || allowed.has(value)));
      if(!work.size) return;
      const label=path.map(entry=>entry.label).join(' → ');
      batchStatus.textContent=`自动分组：已完成 ${session.completed} · 失败 ${session.failures} · 当前 ${label}（${cards.length} 个）`;
      if(cards.length>session.target_group_size) {
        for(let index=0;index<remaining.length;index++) {
          const key=remaining[index], options=await filterOptions(key);
          if(!options.length) continue;
          const covered=new Set(), next=remaining.slice(index+1);
          for(const option of options) {
            if(!check()) return;
            const child=[...path,{key,...option}];
            if(!await applyPath(child)) return;
            for(const card of listCards()) covered.add(cardText(card));
            await walk(child,next,work);
          }
          // Values like Backpack/Undersuit may have no weight class.
          // Revisit only unclassified text through the remaining filter groups.
          const leftover=new Set([...work].filter(value=>!covered.has(value)));
          if(leftover.size && check()) await walk(path,next,leftover);
          return;
        }
      }
      if(!check()) return;
      const group={path:path.map(entry=>entry.label), visible:cards.length, oversized:cards.length>session.target_group_size};
      session.groups.push(group);
      if(group.oversized) session.warnings.push(`${label}：${cards.length} 个，现有可用筛选无法继续缩小`);
      const run=await runBatch({group:true,path:path.map(entry=>entry.value),limit:session.limit-session.completed-session.failures,allowed:work});
      group.completed=run.completed; group.failures=run.failures.length;
      session.completed+=run.completed; session.failures+=run.failures.length;
    }
    try {
      if(document.querySelector('.fab-detail')) {
        const back=document.querySelector('.fab-detail .fabricator-back');
        if(!back) throw Error('未找到详情内返回列表按钮');
        back.click(); await stableList();
      }
      if(!check()) return;
      // User explicitly selected automatic classification; remove search and
      // old include/exclude filters once before discovering the type tree.
      const clear=[...document.querySelectorAll('button')].find(button=>['Clear all','清除全部','清空全部'].includes(text(button)) && !panel.contains(button));
      if(clear) {clear.click();await stableList();}
      if(!check()) return;
      captureVisibleCards(true);
      const rootRaw=new Set(listCards().map(cardText));
      session.root_cards=listCards().length;
      const types=await filterOptions('type');
      if(!types.length) throw Error('无法识别制造分类，未启动自动分组');
      const covered=new Set();
      for(const type of types) {
        if(!check()) break;
        const path=[{key:'type',...type}];
        if(!await applyPath(path)) break;
        for(const card of listCards()) covered.add(cardText(card));
        await walk(path,priorities(type.value));
      }
      session.limit_reached=session.completed+session.failures>=session.limit;
      if(!session.limit_reached && !stopRequested && !disposed) {
        session.unclassified_cards=[...rootRaw].filter(value=>!covered.has(value));
        if(session.unclassified_cards.length) session.warnings.push('有卡片未归入可识别顶级分类，请手动补采；不能视为完整采集');
      }
    } catch(error) {session.error=error.message;throw error;}
    finally {
      const sessionRuns=runs.slice(runStartIndex).filter(run=>run.group_path);
      session.completed=sessionRuns.reduce((sum,run)=>sum+run.completed,0);
      session.failures=sessionRuns.reduce((sum,run)=>sum+run.failures.length,0);
      session.finished_at=new Date().toISOString();session.stopped=stopRequested || disposed;
      groupRunning=false; activeGroupSession=null;
      try {await checkpoint(true);} catch(error) {session.save_error=error.message;}
      batchStatus.textContent=`自动分组结束：完成 ${session.completed} · 失败 ${session.failures} · 已处理 ${session.groups.length} 组`;
      detailStatus.textContent=session.error || (session.stopped?'已停止；再次启动会重新分组并跳过完成项':session.limit_reached?'已达到本批数量；再次启动继续补采':'分类遍历结束') + (session.warnings.length?`；${session.warnings.length} 条分组提示见导出`:'') + (session.save_error?'；进度保存失败，请手动导出':'');
      updateTotals();
      if(!disposed && session.completed && !session.stopped && panel.querySelector('[data-auto-export]').checked) exportDetails();
    }
  }
  async function runBatch(options={}) {
    if (batchRunning || sampling || (groupRunning && !options.group)) return;
    batchRunning=true;
    if (document.querySelector('.fab-detail')) {
      detailStatus.textContent='正在返回蓝图列表…';
      const back=document.querySelector('.fab-detail .fabricator-back');
      if(!back) throw Error('未找到返回列表入口，请手动返回后重试');
      back.click();
      await waitFor(()=>!document.querySelector('.fab-detail') && listCards().length,'蓝图列表');
    }
    const identity = checkpointIdentity();
    captureVisibleCards(true);
    const cards = listCards();
    if (!cards.length) throw Error('当前没有已加载的蓝图卡片');
    // Same-text cards can represent different recipes. Keep each occurrence;
    // require the list order to remain unchanged and resolve identity in detail.
    const signature = nodes => JSON.stringify(nodes.map(card => card.textContent ?? card.innerText ?? ''));
    const listSignature = signature(cards);
    const occurrences = new Map();
    const queue = cards.map((card,index) => {
      const raw = cardText(card), occurrence = occurrences.get(raw) || 0;
      occurrences.set(raw,occurrence+1);
      return {raw, occurrence, index, key:JSON.stringify(options.group ? [options.path,raw,occurrence] : [raw,occurrence])};
    });
    const limit = options.limit ?? Math.max(1,Math.min(2000,Number(panel.querySelector('[data-batch-limit]').value)||10));
    const pending = queue.filter(item => (!options.allowed || options.allowed.has(item.raw)) && !detailRecords.get(cardRecipes.get(item.key))?.sampling_complete).slice(0,limit);
    const run = {started_at:new Date().toISOString(), total:pending.length, completed:0, failures:[], timings:[], ...(options.group?{group_path:options.path.join(' → ')}:{})};
    runs.push(run); activeIdentity=identity; batchRunning=true; if(!options.group) stopRequested=false;
    updateBatch(run);
    detailStatus.textContent=`当前：准备打开蓝图…`;
    let saveError = '';
    try {
      for (const {key,raw,occurrence,index} of pending) {
        if(stopRequested || disposed) break;
        if(checkpointIdentity() !== identity) throw Error('游戏版本或语言改变，请停止并导出当前数据');
        let opened = false;
        const timing={card:raw.split("\n").slice(0,3).join(" ")}, start=Date.now();
        let stageStart=start;
        try {
          const currentCards=listCards();
          if(signature(currentCards)!==listSignature) {const error=Error('列表顺序或内容改变，请停止后重新启动批次');error.abortBatch=true;throw error;}
          const target = currentCards[index]?.querySelector('.fab-card-name');
          if(!target) throw Error('没有识别到蓝图入口');
          updateBatch(run);
          detailStatus.textContent=`当前：第 ${run.completed+run.failures.length+1}/${run.total} 个 · 正在打开 ${text(target)}`;
          target.click(); opened=true;
          await waitFor(()=>document.querySelector('.fab-detail') && recipeId(),'详情');
          const id=recipeId(); await stable(id);
          timing.open_ms=Date.now()-stageStart; stageStart=Date.now();
          if (!detailRecords.get(id)?.sampling_complete) await samplePresets();
          timing.sample_ms=Date.now()-stageStart;
          if(!detailRecords.get(id)?.sampling_complete) throw Error('品质采样未完成');
          cardRecipes.set(key,id); run.completed++;
        } catch(error) { if(error.abortBatch) throw error; run.failures.push({card_text:raw, occurrence, message:error.message}); }
        if(opened && !disposed) {
          const back=document.querySelector('.fab-detail .fabricator-back');
          if(!back) throw Error('无法返回列表，批次停止以免点击错误页面');
          stageStart=Date.now();
          detailStatus.textContent='正在返回列表，等待网站渲染…';
          back.click();
          await waitFor(()=>!document.querySelector('.fab-detail') && listCards().length,'列表');
          timing.return_ms=Date.now()-stageStart;
        }
        timing.total_ms=Date.now()-start; run.timings.push(timing);
        try { await checkpoint(true); saveError=''; }
        catch(error) { saveError=`；保存失败：${error.message}，请导出属性`; }
        updateBatch(run);
        updateTotals();
        detailStatus.textContent=`当前：等待下一个蓝图${saveError}`;
      }
    } catch(error) {
      run.error=error.message;
      run.failures.push({stage:'navigation',message:error.message});
      throw error;
    } finally {
      run.finished_at=new Date().toISOString(); run.stopped=stopRequested || disposed;
      batchRunning=false;
      try { await checkpoint(true); } catch(error) { saveError=`；保存失败：${error.message}，请导出属性`; }
      updateBatch(run,true); updateTotals();
      detailStatus.textContent=`当前：${run.stopped?'已停止':'批次结束'}；再次启动跳过已完成项${saveError}`;
      if(!options.group && !disposed && !run.stopped && run.completed && panel.querySelector('[data-auto-export]').checked) exportDetails();
    }
    return run;
  }
  panel.querySelector('[data-action="batch"]').addEventListener('click',()=>((panel.querySelector('[data-group-mode]').value==='auto')?runGrouped():runBatch()).catch(error=>{batchRunning=false;detailStatus.textContent=`自动采集停止：${error.message}`;}));
  panel.querySelector('[data-action="stop"]').addEventListener('click',()=>{stopRequested=true;detailStatus.textContent='将在当前蓝图采样和恢复完成后停止';});
  panel.querySelector('[data-action="save"]').addEventListener('click',()=>checkpoint(true).then(()=>{detailStatus.textContent='进度已保存到当前浏览器 IndexedDB';}).catch(error=>{detailStatus.textContent=`保存失败：${error.message}，请导出属性`;}));
  panel.querySelector('[data-action="restore"]').addEventListener('click',async()=>{
    if(batchRunning || sampling || groupRunning) return;
    try {
      const saved=await checkpoint(false);
      if(!saved) throw Error('当前版本和语言没有已保存进度');
      if(saved.identity!==checkpointIdentity()) throw Error('进度版本不匹配');
      for(const [key,entry] of saved.cards || []) records.set(key,entry);
      knownListCount = Math.max(knownListCount,saved.list_count || 0);
      for(const [id,entry] of saved.details) if(!detailRecords.get(id)?.sampling_complete) detailRecords.set(id,entry);
      for(const [key,id] of saved.links) cardRecipes.set(key,id);
      updateTotals();
      detailStatus.textContent=`已恢复 ${detailRecords.size} 个蓝图；再次启动将跳过已完成项`;
    } catch(error) {detailStatus.textContent=`恢复失败：${error.message}`;}
  });
  panel.querySelector('[data-action="detail"]').addEventListener('click', () => {
    if(batchRunning || sampling || groupRunning) return;
    try { recordDetail(); detailStatus.textContent = `已记录 ${detailRecords.size} 个蓝图属性（当前品质快照）`; }
    catch(error) { detailStatus.textContent = error.message; }
  });
  panel.querySelector('[data-action="presets"]').addEventListener('click', () => {
    if(batchRunning || groupRunning) return;
    samplePresets().catch(error => { sampling = false; detailStatus.textContent = `属性采集未完成：${error.message}；已读快照仍可导出`; });
  });
  function importData(data, confirmSameVersion=false) {
    if(batchRunning || sampling || groupRunning) throw Error('请先停止采集再导入');
    if(data.format!=='scmdb-public-fabricator-details-v1' && data.format!=='scmdb-public-fabricator-capture-v1') throw Error('不是蓝图助手导出的 JSON');
    const source=new URL(data.source_url);
    if(source.hostname!=='scmdb.net') throw Error('来源不是 SCMDB');
    const current=new URL(location.href);
    if((source.searchParams.get('channel')||'live')!==(current.searchParams.get('channel')||'live') || (source.searchParams.get('lang')||'')!==(current.searchParams.get('lang')||'')) throw Error('频道或翻译来源不同，请使用独立采集会话');
    const version=text(document.querySelector('select:disabled'));
    if(data.source_version_text && data.source_version_text!==version) throw Error('游戏版本不一致，请使用新会话重新采集；不会导入旧版本数据');
    const canResume=!!data.source_version_text || confirmSameVersion;
    if(!Array.isArray(data.cards||[]) || !Array.isArray(data.details||[]) || !Array.isArray(data.card_recipe_links||[])) throw Error('导出数组格式不正确');
    const staged=[];
    for(const entry of data.details||[]) {
      if(!entry || typeof entry.recipe_id!=='string' || !entry.samples || typeof entry.samples!=='object') throw Error('蓝图详情格式不正确');
      const url=new URL(entry.source_url);
      if(url.hostname!=='scmdb.net' || url.searchParams.get('fab')!==entry.recipe_id) throw Error('蓝图身份与来源不一致');
      const samples=Object.values(entry.samples);
      if(!samples.length || samples.some(sample=>sample.recipe_id!==entry.recipe_id || sample.mode!=='craft' || !Array.isArray(sample.slots))) throw Error('蓝图快照身份或槽位格式不正确');
      const dynamic=samples.some(sample=>sample.quality_controls_present);
      const complete=dynamic ? ['min','base','half','max'].every(label=>entry.samples[label]?.slots?.length && entry.samples[label].quality_controls_present) : samples.some(sample=>sample.quality_policy_raw && sample.slots.length);
      staged.push({...entry,sampling_complete:canResume && !!entry.sampling_complete && complete});
    }
    for(const card of data.cards||[]) if(typeof card?.raw_text!=='string') throw Error('卡片格式不正确');
    for(const link of data.card_recipe_links||[]) if(!Array.isArray(link) || link.length!==2 || link.some(value=>typeof value!=='string')) throw Error('卡片映射格式不正确');
    for(const card of data.cards||[]) records.set(hash(card.raw_text),card);
    for(const entry of staged) {
      const existing=detailRecords.get(entry.recipe_id);
      if(existing?.sampling_complete) continue;
      detailRecords.set(entry.recipe_id,{...entry,samples:{...existing?.samples,...entry.samples}});
    }
    for(const [key,id] of data.card_recipe_links||[]) if(detailRecords.has(id)) cardRecipes.set(key,id);
    updateTotals();
    detailStatus.textContent=`已导入 ${staged.length} 个蓝图详情、${(data.cards||[]).length} 条卡片；${canResume?'完成项会跳过；旧文件无映射时需打开详情确认一次':'文件版本不明，详情将重新采集；如确认同版本可勾选后重新导入'}`;
    return {details:staged.length,canResume};
  }
  const importFile=panel.querySelector('[data-import-file]');
  panel.querySelector('[data-action="import"]').addEventListener('click',()=>{if(!batchRunning && !sampling && !groupRunning) importFile.click();});
  importFile.addEventListener('change',async()=>{
    try {
      if(!importFile.files?.[0]) return;
      importData(JSON.parse(await importFile.files[0].text()),!!panel.querySelector('[data-import-same]').checked);
      try {await checkpoint(true);} catch(error) {detailStatus.textContent+=`；保存失败：${error.message}，请导出备份`;}
    } catch(error) {detailStatus.textContent=`导入失败：${error.message}`;}
    finally {importFile.value='';}
  });
  function exportDetails() {
    const payload = {format:'scmdb-public-fabricator-details-v1', helper_version:8, source_url:location.href,
      captured_at:new Date().toISOString(), source_version_text:text(document.querySelector('select:disabled')),
      note:'Public rendered Craft DOM only. Preset samples are observed outputs, not a claim that formulas are verified. No app state, shopping actions, disassembly actions or /data/ requests.',
      card_recipe_links:[...cardRecipes], page_language:document.documentElement?.lang, cards:[...records.values()], grouped_runs:groupedRuns, automation_runs:runs, details:[...detailRecords.values()]};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href = url;
    link.download = `scmdb-blueprint-details-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  panel.querySelector('[data-action="export-details"]').addEventListener('click',exportDetails);

  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "继续列表" : "暂停列表";
    if (!paused) captureVisibleCards();
  });

  exportButton.addEventListener("click", () => {
    captureVisibleCards();
    const payload = {
      format: "scmdb-public-fabricator-capture-v1",
      source_url: pageUrl,
      captured_at: new Date().toISOString(),
      note: "Captured from SCMDB's public rendered Fabricator page. No /data/ endpoint was requested by this helper.",
      cards: [...records.values()],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `scmdb-public-fabricator-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  panel.querySelector('[data-action="close"]').addEventListener("click", () => {
    disposed = true;
    window.clearTimeout(captureTimer);
    observer.disconnect();
    window.removeEventListener("scroll", scheduleCapture, true);
    panel.remove();
    delete window.__SCMDB_PUBLIC_CAPTURE__;
  });

  const observer = new MutationObserver(mutations => { if (mutations.some(mutation => !panel.contains(mutation.target))) scheduleCapture(); });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("scroll", scheduleCapture, true);
  window.__SCMDB_PUBLIC_CAPTURE__ = { show: () => panel.removeAttribute("hidden"), extractDetail, importData, runGrouped };
  captureVisibleCards();
})();
