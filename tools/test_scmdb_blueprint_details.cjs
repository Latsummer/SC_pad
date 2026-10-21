const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const node = (text='', map={}) => ({innerText:text,style:{},isConnected:true,querySelector:s=>(map[s]||[])[0]||null,querySelectorAll:s=>map[s]||[],setAttribute(){},removeAttribute(){},contains(){return false},addEventListener(event,fn){this[event]=fn},click(){this.click?.handler?.()},remove(){}});
class QualityInput {
  constructor(value) {this._value=value;this.min='0';this.max='1000';this.step='1';this.type='number';this.isConnected=true;}
  get value(){return this._value} set value(value){this._value=String(value)}
  dispatchEvent(){}
}
const input = new QualityInput('641');
const range = node('Q: 0–1000 · ×0.9–1.1 · Base: 500');
const effect = node('', {'.fab-mod-name':[node('Damage Mitigation')],'.fab-mod-value':[node('×1.028')],'.fab-mod-pct':[node('+2.82%')]});
effect.parentElement = node('',{'.fab-mod-shared-range':[range]});
const slot = node('Protective Sheathing\nTungsten\nQ: 0–1000', {'.fab-slot-name':[node('Protective Sheathing')],'.fab-mat-name':[node('Tungsten')],'.fab-mat-qty':[node('0.04 SCU')],'.fab-slot-quality-input, .fab-slot-quality-slider':[input],'.fab-modifier':[effect]});
let fixed = false, craft = true, presetsValid = true, snap = false;
slot.querySelector = selector => selector === '.fab-slot-quality-input' ? (!fixed && !snap ? input : null) : selector === '.fab-slot-quality-slider' ? (!fixed ? input : null) : ({'.fab-slot-name':node('Protective Sheathing'),'.fab-mat-name':node('Tungsten'),'.fab-mat-qty':node('0.04 SCU')}[selector] || null);
const mode = {classList:{contains:()=>craft}};
const detail = node('Armor public DOM', {'.fab-detail-title':[node('Test Armor')],'.fab-stats-panel':[node('Physical\n×0.70')],'.fab-slot':[slot]});
detail.querySelector = selector => selector === '.fab-quality-info' && fixed ? node('Min. quality required: 0 — higher quality has no effect') : ({'.fab-detail-title':node('Test Armor'),'.fab-stats-panel':node('Physical\n×0.70')}[selector] || null);
detail.querySelectorAll = selector => {
 if(selector === '.fab-mode-btn') return [mode,{}];
 if(selector === '.fab-slot') return [slot];
 if(selector === '.fab-slot-quality-input') return fixed ? [] : [input];
 if(selector === '.fab-preset-btn') return presetsValid ? [0,500,750,1000].map(value=>({click(){input.value=value;if(context.window.__SCMDB_PUBLIC_CAPTURE__ && onList===false && context.location.href.includes('BP_Batch')) assert.match(batchStatus.textContent,/目标 2/,'batch remains visible during each preset');}})) : [];
 if(selector === '[class*="blacklist"], .fab-quality-info') return fixed ? [node('Min. quality required: 0 — higher quality has no effect')] : [];
 return [];
};
const buttons = Object.fromEntries(['pause','export','close','detail','presets','export-details','import','batch','stop','save','restore'].map(name=>[name,node()]));
const fileInput=node();
const status = node(), batchStatus = node(), totals = node(); const panel = node();
panel.querySelector = selector => selector === '[data-group-mode]' ? {value:'current'} : selector === '[data-import-file]' ? fileInput : selector === '[data-import-same]' ? {checked:false} : selector === '[data-auto-export]' ? {checked:true} : selector === '[data-batch-limit]' ? {value:'10'} : selector.includes('data-detail-status') ? status : selector.includes('data-batch-status') ? batchStatus : selector === '#scmdb-capture-count' ? totals : buttons[selector.match(/data-action="([^"]+)"/)?.[1]];
panel.querySelectorAll = () => Object.values(buttons);
let exported, onList=false;
const card=node('Test Armor card\nTungsten (0.04 SCU)\n⏱ 190s', {'.fab-card-name':[{click(){onList=false;context.location.href='https://scmdb.net/?page=fab&fab=BP_Batch';}}]});
const card2=node('Test Armor card\nTungsten (0.04 SCU)\n⏱ 190s', {'.fab-card-name':[{click(){onList=false;context.location.href='https://scmdb.net/?page=fab&fab=BP_Batch2';}}]});
const back={click(){onList=true;context.location.href='https://scmdb.net/?page=fab';}};
const checkpoints=new Map();
const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={createObjectStore(){},close(){},transaction(){const tx={};tx.objectStore=()=>({put(value,key){const result={result:key};checkpoints.set(key,structuredClone(value));queueMicrotask(()=>tx.oncomplete());return result;},get(key){const result={result:checkpoints.get(key)};queueMicrotask(()=>tx.oncomplete());return result;}});return tx;}};request.onsuccess();});return request;}};

const context = {indexedDB,URLSearchParams,window:{addEventListener(){},removeEventListener(){},clearTimeout(){},setTimeout,},location:{hostname:'scmdb.net',search:'?page=fab',href:'https://scmdb.net/?page=fab&fab=BP_Test'},document:{body:{append(){}},querySelector:s=>s==='.fab-detail'?(onList?null:detail):s==='.fab-detail .fabricator-back'?back:s==='.fabricator-back'?{click(){throw Error('Clicked global Back to SCMDB instead of detail Back to list');}}:s==='select:disabled'?node('4.10.2-live.test'):null,querySelectorAll:s=>s==='.fab-card' && onList?[card,card2]:[],createElement:tag=>tag==='section'?panel:{click(){}}},URL:class extends URL {static createObjectURL(blob){exported=blob;return 'blob:test'}static revokeObjectURL(){}},Blob,HTMLInputElement:QualityInput,Event:class{constructor(type){this.type=type}},setTimeout:fn=>{queueMicrotask(fn);return 1},MutationObserver:class{observe(){}disconnect(){}},alert:message=>{throw Error(message)}};
vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_public_capture.js`,'utf8'),context);
(async()=>{
 const current=context.window.__SCMDB_PUBLIC_CAPTURE__.extractDetail();
 assert.equal(current.slots[0].effects[0].range_raw,range.innerText,'range is sibling of modifier, not a child');
 assert.equal(current.slots[0].quality_controls[0].value,'641');
 assert.equal(current.recipe_id,'BP_Test');
 craft=false;assert.throws(()=>context.window.__SCMDB_PUBLIC_CAPTURE__.extractDetail(),/Craft/);craft=true;
 buttons.presets.click();await new Promise(setImmediate);
 assert.equal(input.value,'641','original quality must be restored after all presets');
 buttons['export-details'].click();let payload=JSON.parse(await exported.text());
 assert.equal(payload.format,'scmdb-public-fabricator-details-v1');
 assert.equal(payload.details[0].sampling_complete,true);
 assert.deepEqual(Object.keys(payload.details[0].samples),['initial','min','base','half','max']);
 assert.equal(payload.details[0].samples.min.slots[0].quality_controls[0].value,'0');
 assert.equal(payload.details[0].samples.max.slots[0].quality_controls[0].value,'1000');
 snap=true;input.type='range';input.value='779';
 context.location.href='https://scmdb.net/?page=fab&fab=BP_Snap';buttons.presets.click();await new Promise(setImmediate);buttons['export-details'].click();payload=JSON.parse(await exported.text());
 assert.equal(payload.details.find(x=>x.recipe_id==='BP_Snap').sampling_complete,true,'Snap mode must capture range-only qualities');
 assert.equal(input.value,'779','Snap quality restored');
 snap=false;input.type='number';
 fixed=true;context.location.href='https://scmdb.net/?page=fab&fab=BP_Fixed';buttons.presets.click();await new Promise(setImmediate);buttons['export-details'].click();payload=JSON.parse(await exported.text());
 assert.equal(payload.details.find(x=>x.recipe_id==='BP_Fixed').sampling_complete,true);assert.equal(payload.details.find(x=>x.recipe_id==='BP_Fixed').samples.initial.quality_controls_present,false);assert.match(payload.details.find(x=>x.recipe_id==='BP_Fixed').samples.initial.quality_policy_raw,/no effect/);
 fixed=false;presetsValid=false;context.location.href='https://scmdb.net/?page=fab&fab=BP_ChangedLayout';buttons.presets.click();await new Promise(setImmediate);assert.match(status.innerText||status.textContent,/布局改变/);
 presetsValid=true;onList=false;context.location.href='https://scmdb.net/?page=fab&fab=BP_ChangedLayout';
 buttons.batch.click();await new Promise(setImmediate);
 buttons['export-details'].click();payload=JSON.parse(await exported.text());
 assert.equal(payload.automation_runs.at(-1).completed,2);
 assert.equal(onList,true,'batch returns to the list');
 assert.match(batchStatus.textContent,/完成 2/);
 assert.match(totals.textContent,/详情完成/);
 assert.equal(checkpoints.size,1,'batch saves a browser checkpoint');
 buttons.batch.click();await new Promise(setImmediate);
 buttons['export-details'].click();payload=JSON.parse(await exported.text());
 assert.equal(payload.automation_runs.at(-1).total,0,'completed recipes are skipped');
 buttons.restore.click();await new Promise(setImmediate);assert.match(status.textContent,/已恢复/);
 const savedPayload=payload;
 onList=true;delete context.window.__SCMDB_PUBLIC_CAPTURE__;vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_public_capture.js`,'utf8'),context);
 buttons['export-details'].click();payload=JSON.parse(await exported.text());
 assert.equal(payload.cards.length,1,'list cards captured immediately before any detail is opened (identical card text deduplicated)');
 assert.match(totals.textContent,/当前列表 2 个/);
 const importer=context.window.__SCMDB_PUBLIC_CAPTURE__.importData;
 assert.throws(()=>importer({...savedPayload,source_version_text:'other'}),/版本/);
 assert.throws(()=>importer({...savedPayload,details:[{recipe_id:'bad',source_url:'https://evil.example/',samples:{}}]}),/身份/);
 importer(savedPayload);importer(savedPayload);
 buttons['export-details'].click();let imported=JSON.parse(await exported.text());
 assert.equal(imported.details.length,savedPayload.details.length,'idempotent import');
 buttons.batch.click();await new Promise(setImmediate);buttons['export-details'].click();imported=JSON.parse(await exported.text());
 assert.equal(imported.automation_runs.at(-1).total,0,'imported links skip complete recipes');
 // Legacy exports without links still resolve recipe identity after opening once.
 delete context.window.__SCMDB_PUBLIC_CAPTURE__;vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_public_capture.js`,'utf8'),context);
 context.window.__SCMDB_PUBLIC_CAPTURE__.importData({...savedPayload,card_recipe_links:[]});
 buttons.batch.click();await new Promise(setImmediate);buttons['export-details'].click();imported=JSON.parse(await exported.text());
 assert.equal(imported.automation_runs.at(-1).completed,2);
 if(process.argv[2]) {
   const actual=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
   const previous=context.document.querySelector;
   context.document.querySelector=selector=>selector==='select:disabled'?node(actual.source_version_text):previous(selector);
   const result=context.window.__SCMDB_PUBLIC_CAPTURE__.importData(actual);
   assert.equal(result.details,actual.details.length);assert.equal(result.canResume,true);
   console.log(`Imported real blueprint file: ${result.details} details`);
 }
 console.log('Blueprint quality capture fixtures passed (presets, restore, fixed quality, DOM range and layout refusal)');
})().catch(error=>{console.error(error);process.exitCode=1});
