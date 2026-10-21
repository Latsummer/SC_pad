/* Observed Craft presets, loaded only when a manufacturing detail is opened. */
(() => {
  'use strict';
  const catalog=window.SCMDB_BLUEPRINTS;
  if(!catalog) return;
  const words=window.SCMDB_BLUEPRINT_LOCALE?.quality || {};
  const slots=window.SCMDB_BLUEPRINT_LOCALE?.slots || {};
  const minerals=window.SCMINER_LOCALE?.minerals || {};
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const translated=(section,key)=>words[section]?.[key] || key;
  const presetNames={min:'最低',base:'基础',half:'增益中点',max:'最高',initial:'固定品质'};
  const requests=new Map();
  let sequence=0,current=null,selected='base',onlyChanges=false,returnFocus=null,panelName='product',retryItem=null,model=null,custom=null,customFallback=null;
  const dialog=document.createElement('dialog');
  dialog.className='blueprint-quality-dialog';
  dialog.setAttribute('aria-labelledby','blueprintQualityTitle');
  dialog.innerHTML='<header><div><p class="bp-quality-kicker"></p><h2 id="blueprintQualityTitle"></h2><p class="bp-quality-english"></p></div><button type="button" class="blueprint-source-close" aria-label="关闭制造详情">✕</button></header><div class="bp-quality-toolbar"></div><div class="bp-quality-body" aria-live="polite"></div>';
  document.body.append(dialog);
  const body=dialog.querySelector('.bp-quality-body');
  const toolbar=dialog.querySelector('.bp-quality-toolbar');
  function changed(recipe,preset,index) {return preset.values[index]!==recipe.stats[index].base;}
  function information(info) {
    return info.map(line=>words.tags?.[line] || words.sections?.[line] || line.replace(/^Size\s*(\d+)$/,'S$1').replace(/^Mag:\s*(\d+)$/,'弹容量 $1')).map(line=>`<span>${escape(line)}</span>`).join('');
  }
  function renderStats(recipe,preset) {
    const groups=new Map();
    recipe.stats.map((stat,index)=>({stat,index})).sort((a,b)=>Number(b.stat.kind==='resistance')-Number(a.stat.kind==='resistance')).forEach(({stat,index})=>{
      if(onlyChanges && !changed(recipe,preset,index)) return;
      const section=stat.section || '成品参数';
      if(!groups.has(section)) groups.set(section,[]);
      const value=preset.values[index];
      const estimated=selected==='custom' && model.models[index].verified;
      const unavailable=selected==='custom' && !model.models[index].verified && !model.models[index].fixed;
      groups.get(section).push(`<div class="bp-quality-stat${changed(recipe,preset,index)?' changed':''}"><span>${escape(translated('stats',stat.label))}</span><strong>${escape(value)}</strong>${estimated?'<small>估算值</small>':unavailable?'<small>规则未核对，保留预设值</small>':''}${changed(recipe,preset,index)?`<small>原始值 ${escape(stat.base)}</small>`:'<small>与原始值相同</small>'}</div>`);
    });
    if(!groups.size) return `<p class="bp-quality-empty">${onlyChanges?'此预设没有变化的参数。':'此物品没有记录数值型成品参数。'}</p>`;
    return [...groups].map(([section,rows])=>`<section class="bp-quality-stat-section"><h4>${escape(translated('sections',section))}</h4>${section==='DAMAGE RESISTANCE'?'<p class="bp-quality-caption">数值为承受伤害倍率，越低代表减伤越高。</p>':''}<div class="bp-quality-stat-grid">${rows.join('')}</div></section>`).join('');
  }
  function ruleText(rule) {
    if(rule.kind==='multiplier_endpoints') return `<p class="bp-quality-rule">品质 ${rule.quality_min}–${rule.quality_max} · 倍率 ×${rule.multiplier_at_min} → ×${rule.multiplier_at_max}<br>基础品质 ${rule.base_quality}</p>`;
    if(rule.kind==='steps') return `<details class="bp-quality-steps"><summary>查看品质分档</summary><ul>${rule.tiers.map(tier=>`<li><span>品质 ${tier.min}–${tier.max}</span><strong>${tier.delta>0?'+':''}${tier.delta} 格</strong></li>`).join('')}</ul></details>`;
    return `<p class="bp-quality-warning">源页面规则异常，暂不据此计算。</p><code class="bp-quality-raw-rule">${escape(rule.raw)}</code>`;
  }
  function renderMaterials(item,recipe,preset) {
    return recipe.slots.map((slot,index)=>{
      const material=item.materials.find(value=>value.slot===slot.slot && value.name===slot.material);
      const entry=material?.mineral && minerals[material.mineral.id];
      const name=entry?.zh ? `${entry.zh} (${entry.en})` : slot.material;
      const issue=preset.quality_issues?.find(value=>value.slot===index);
      const issueText=issue?`<p class="bp-quality-warning">来源控件显示：${Object.entries(issue.displayed_values).map(([kind,value])=>`${kind==='number'?'数字框':'滑块'} ${escape(value)}`).join(' · ')}${issue.outside_range?'；包含超出页面标注范围的数值':''}。保留原采集值。</p>`:'';
      const enabled=model?.slotEnabled[index];
      const controls=slot.quality && enabled?`<div class="bp-quality-controls"><label>材料品质 <input type="number" inputmode="numeric" min="${slot.quality.min}" max="${slot.quality.max}" step="1" data-quality-number="${index}" aria-label="${escape(slots[slot.slot]||slot.slot)}品质" value="${Math.max(Number(slot.quality.min),Number(preset.qualities[index]))}"></label><input type="range" min="${slot.quality.min}" max="${slot.quality.max}" step="1" data-quality-range="${index}" aria-label="${escape(slots[slot.slot]||slot.slot)}品质滑块" value="${Math.max(Number(slot.quality.min),Number(preset.qualities[index]))}"><div class="bp-quality-live" data-quality-live="${index}"></div></div>`:'';
      const unavailable=slot.quality && !enabled?'<p class="bp-quality-caption">此槽位规则尚未通过预设校验，暂保留采集结果。</p>':'';
      const effects=slot.effects.map((effect,number)=>{
        const label=effect.name.replace(/\s*⚠\s*$/,'');
        const observed=preset.effects[index]?.[number];
        return `<div class="bp-quality-effect"><div><strong>${escape(translated('effects',label))}</strong><span>${escape(effect.rule.kind==='steps'?(observed?.multiplier || '').replace(/\bpips?\b/g,'格'):(observed?.multiplier || ''))} ${escape(observed?.delta || '')}</span></div>${ruleText(effect.rule)}</div>`;
      }).join('');
      return `<article class="bp-quality-material"><div class="bp-quality-material-heading"><h4>${escape(slots[slot.slot] || slot.slot)}</h4><span>${escape(slot.quantity)}</span></div><p class="bp-quality-material-name">${escape(name)}</p>${slot.quality?`<p class="bp-quality-value">当前品质 <strong>${escape(preset.qualities[index])}</strong><small>可用品质 ${escape(slot.quality.min)}–${escape(slot.quality.max)}</small></p>`:'<p class="bp-quality-no-effect">此槽位没有品质加成</p>'}${controls}${unavailable}${issueText}<div data-quality-effects="${index}">${effects}</div></article>`;
    }).join('');
  }
  function render() {
    if(!current) return;
    const {item,recipe}=current;
    const preset=selected==='custom'?custom:recipe.presets[selected];
    dialog.dataset.panel=panelName;
    toolbar.innerHTML=recipe.dynamic?`<div class="bp-quality-presets" role="group" aria-label="品质预设">${['min','base','half','max'].map(name=>`<button type="button" data-quality-preset="${name}" aria-pressed="${selected===name}">${presetNames[name]}</button>`).join('')}</div><p>拖动材料品质，实时估算成品变化；预设可一键恢复。</p>`:'<p class="bp-quality-fixed">此配方的材料品质不影响成品属性。</p>';
    toolbar.innerHTML+=`<div class="bp-quality-mobile-tabs" role="group" aria-label="详情内容"><button type="button" data-quality-panel="product" aria-pressed="${panelName==='product'}">成品属性</button><button type="button" data-quality-panel="materials" aria-pressed="${panelName==='materials'}">材料品质</button></div>`;
    const warning=recipe.warnings.length?'<div class="bp-quality-warning"><strong>源页面标记此蓝图可能异常</strong><details><summary>查看来源备注</summary>'+recipe.warnings.map(text=>`<p>${escape(text)}</p>`).join('')+'</details></div>':'';
    const presetWarning=preset.quality_issues?.length?'<p class="bp-quality-warning">此预设存在来源品质控件显示不一致；结果按采集保留，“基础”不一定代表所有槽位零加成。</p>':'';
    body.innerHTML=`${warning}${presetWarning}<div class="bp-quality-product-info">${information(recipe.product_info)}</div><div class="bp-quality-layout"><section class="bp-quality-product"><div class="bp-quality-section-head"><h3>成品属性</h3>${recipe.dynamic?`<label><input type="checkbox" data-quality-changes ${onlyChanges?'checked':''}> 只看变化</label>`:''}</div><p class="bp-quality-caption">${recipe.dynamic?`当前展示：${selected==='custom'?'自定义材料品质 · 规则估算，实际以游戏为准':presetNames[selected]+'预设 · SCMDB 页面采集值'}`:'固定属性 · SCMDB 页面采集值'}</p><div class="bp-quality-stats">${renderStats(recipe,preset)}</div></section><section class="bp-quality-materials"><h3>材料与品质影响</h3>${renderMaterials(item,recipe,preset)}</section></div>${recipe.dismantle_notices.length?`<details class="bp-quality-dismantle"><summary>拆解回收限制</summary>${recipe.dismantle_notices.map(notice=>`<p>${escape(notice)}</p>`).join('')}</details>`:''}<footer><a href="missions.html?reward_blueprint=${encodeURIComponent(item.name_en || item.name)}">查询产出任务 ↗</a><a href="${escape(recipe.source_url)}" target="_blank" rel="noopener noreferrer">SCMDB 来源 ↗</a><span>来源版本 ${escape(catalog.source.game_data_version || '')}</span></footer>`;
  }
  async function open(item,trigger=null) {
    const request=++sequence;
    retryItem=item;
    current=null;selected='base';onlyChanges=false;panelName='product';
    returnFocus=trigger || document.activeElement;
    dialog.querySelector('h2').textContent=item.name_zh || item.name;
    dialog.querySelector('.bp-quality-english').textContent=item.name_en && item.name_en!==(item.name_zh||item.name)?item.name_en:'';
    dialog.querySelector('.bp-quality-kicker').textContent=[item.type_group,item.type_subtype,item.size?`S${item.size}`:''].filter(Boolean).join(' · ');
    toolbar.textContent='';body.textContent='正在载入制造详情…';
    if(!dialog.open) dialog.showModal();
    try {
      if(!item.quality_path) throw Error('未关联详情');
      if(!requests.has(item.quality_path)) requests.set(item.quality_path,fetch(item.quality_path).then(response=>{if(!response.ok) throw Error('load');return response.json();}).catch(error=>{requests.delete(item.quality_path);throw error;}));
      const data=await requests.get(item.quality_path);
      if(!dialog.open || request!==sequence) return;
      const recipe=data.recipes[item.id];
      if(!recipe || recipe.id!==item.id) throw Error('详情身份不匹配');
      model=window.BlueprintQualityModel.compile(recipe);custom=null;current={item,recipe};selected=recipe.dynamic?'base':'initial';render();
    } catch(error) {
      if(dialog.open && request===sequence) body.innerHTML='<p class="bp-quality-empty">制造详情暂时无法载入。首次查看需要联网，已查看内容可离线使用。</p><button type="button" class="secondary-button" data-quality-retry>重新载入</button>';
    }
  }
  dialog.addEventListener('click',event=>{
    if(event.target===dialog || event.target.closest('.blueprint-source-close')) {dialog.close();return;}
    const preset=event.target.closest('[data-quality-preset]');
    if(preset && current?.recipe.presets[preset.dataset.qualityPreset]) {selected=preset.dataset.qualityPreset;render();dialog.querySelector(`[data-quality-preset="${selected}"]`)?.focus();}
    const panelButton=event.target.closest('[data-quality-panel]');
    if(panelButton) {
      panelName=panelButton.dataset.qualityPanel;dialog.dataset.panel=panelName;
      dialog.querySelectorAll('[data-quality-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.qualityPanel===panelName)));
      body.scrollTop=0;
    }
    if(event.target.closest('[data-quality-retry]')) open(retryItem,returnFocus);
  });
  function updateQuality(event,commit=false){
    const target=event.target;
    const index=target.dataset.qualityRange ?? target.dataset.qualityNumber;
    if(index===undefined || !current || !model.slotEnabled[Number(index)] || target.value==='') return;
    const recipe=current.recipe, slot=recipe.slots[Number(index)];
    if(!commit && target.dataset.qualityNumber!==undefined && (Number(target.value)<Number(slot.quality.min) || Number(target.value)>Number(slot.quality.max))) return;
    const value=Math.round(Math.max(Number(slot.quality.min),Math.min(Number(slot.quality.max),Number(target.value))));
    if(!Number.isFinite(value)) return;
    const fallback=selected==='custom'?customFallback:recipe.presets[selected];customFallback=fallback;
    const qs=(selected==='custom'?custom.qualities:fallback.qualities).map((q,i)=>recipe.slots[i].quality?Math.max(Number(recipe.slots[i].quality.min),Number(q)):q);
    qs[Number(index)]=value;
    custom=model.calculate(qs,fallback);selected='custom';
    dialog.querySelectorAll('[data-quality-preset]').forEach(button=>button.setAttribute('aria-pressed','false'));
    dialog.querySelector(`[data-quality-range="${index}"]`).value=value;
    dialog.querySelector(`[data-quality-number="${index}"]`).value=value;
    dialog.querySelector('.bp-quality-stats').innerHTML=renderStats(recipe,custom);
    dialog.querySelector('.bp-quality-product > .bp-quality-caption').textContent='自定义材料品质 · 规则估算，实际以游戏为准';
    dialog.querySelectorAll('[data-quality-live]').forEach(live=>{
    live.innerHTML=recipe.stats.map((stat,i)=>model.models[i].verified && model.models[i].slots.includes(Number(live.dataset.qualityLive))?`<span>${escape(translated('stats',stat.label))}<strong>${escape(custom.values[i])}</strong></span>`:'').join('');});
    const holder=document.createElement('div');holder.innerHTML=renderMaterials(current.item,recipe,custom);
    dialog.querySelectorAll('[data-quality-effects]').forEach(node=>{node.innerHTML=holder.querySelector(`[data-quality-effects="${node.dataset.qualityEffects}"]`).innerHTML;});
    dialog.querySelectorAll('.bp-quality-value strong').forEach((node,i)=>{const qualitySlots=recipe.slots.map((s,i)=>s.quality?i:null).filter(i=>i!==null);node.textContent=custom.qualities[qualitySlots[i]];});
  }
  dialog.addEventListener('input',event=>updateQuality(event));
  dialog.addEventListener('change',event=>{
    if(event.target.dataset.qualityNumber!==undefined){updateQuality(event,true);return;}
    if(!event.target.matches('[data-quality-changes]') || !current) return;
    onlyChanges=event.target.checked;
    dialog.querySelector('.bp-quality-stats').innerHTML=renderStats(current.recipe,selected==='custom'?custom:current.recipe.presets[selected]);
  });
  dialog.addEventListener('close',()=>{sequence++;current=null;if(!document.activeElement || document.activeElement===document.body || dialog.contains(document.activeElement)) returnFocus?.focus();});
  window.BlueprintQuality={open};
})();
