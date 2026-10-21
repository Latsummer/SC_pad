/* Public DOM fixture for adaptive grouping, not SCMDB app state. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync(`${__dirname}/scmdb_public_capture.js`,'utf8');
function harness({limit=1000,stopAfter=0,changeAfter=0}={}) {
  let opened=null, selections={}, clicks=0, exported;
  const catalog=[];
  function add(type,count,fields={}) {for(let i=0;i<count;i++) catalog.push({type,...fields,id:`BP_${catalog.length}`});}
  add('armour',30,{armorClass:'Light',armorSlot:'Arms',subtype:'Combat'});
  add('armour',30,{armorClass:'Light',armorSlot:'Arms',subtype:'Hunter'});
  add('armour',20,{armorClass:'Light',armorSlot:'Legs',subtype:'Combat'});
  add('armour',40,{armorClass:'Heavy',armorSlot:'Arms',subtype:'Combat'});
  add('armour',5,{armorSlot:'Backpack',subtype:'Explorer'});
  add('quantumdrive',15,{componentClass:'Military',grade:'A'});
  add('shipweapon',115);
  const labels={type:'Type',armorClass:'Armor Class',armorSlot:'Armor Slot',subtype:'Subtype',componentClass:'Component Class',grade:'Grade'};
  const options={type:['armour','quantumdrive','shipweapon'],armorClass:['Light','Medium','Heavy'],armorSlot:['Arms','Legs','Backpack','Undersuit'],subtype:['Combat','Hunter','Explorer'],componentClass:['Military','Civilian'],grade:['A','B']};
  const el=(value='',extra={})=>({innerText:value,textContent:value,style:{},isConnected:true,querySelector(){return null},querySelectorAll(){return []},setAttribute(){},removeAttribute(){},contains(){return false},addEventListener(event,fn){this[event]=fn;},remove(){},click(){},...extra});
  const filtered=()=>catalog.filter(item=>Object.entries(selections).every(([key,value])=>item[key]===value));
  function group(key) {
    const heading=el(labels[key],{querySelector:s=>s==='span'?el(labels[key]):null});
    const chips=options[key].map(value=>el(value,{getAttribute:name=>name==='title'&&key==='type'?value:null,classList:{contains:name=>name==='active'&&selections[key]===value},click(){selections[key]=value;}}));
    return el('',{querySelector:s=>s==='.fab-filter-label'?heading:s==='.fab-clear-inline'&&selections[key]?el('✕',{click(){delete selections[key];}}):null,querySelectorAll:s=>s==='.fab-chip'?chips:[]});
  }
  const groups=()=>['type',...(selections.type==='armour'?['armorClass','armorSlot','subtype']:selections.type==='quantumdrive'?['componentClass','grade']:[])].map(group);
  const mode=el('',{classList:{contains:()=>true}}), slot=el('Frame\nIron\n0.01 SCU',{querySelector:s=>({'.fab-slot-name':el('Frame'),'.fab-mat-name':el('Iron'),'.fab-mat-qty':el('0.01 SCU')}[s]||null)});
  const detail=()=>el(`Detail ${opened.id}`,{querySelector:s=>({'.fab-detail-title':el(opened.id),'.fab-quality-info':el('Min. quality required: 0 — higher quality has no effect')}[s]||null),querySelectorAll:s=>s==='.fab-slot'?[slot]:s==='.fab-mode-btn'?[mode,el()]:[]});
  const buttons=Object.fromEntries(['pause','export','close','detail','presets','export-details','import','batch','stop','save','restore'].map(key=>[key,el()]));
  const fields={'[data-group-mode]':{value:'auto'},'[data-batch-limit]':{value:String(limit)},'[data-auto-export]':{checked:false},'[data-import-file]':el(),'[data-import-same]':{checked:false},'[data-detail-status]':el(),'[data-batch-status]':el(),'#scmdb-capture-count':el()};
  const panel=el('',{querySelector:s=>fields[s]||buttons[s.match(/data-action="([^"]+)"/)?.[1]],querySelectorAll:()=>Object.values(buttons)});
  const source={href:'https://scmdb.net/?page=fab',search:'?page=fab',hostname:'scmdb.net'};
  const shown=()=>opened?[]:filtered().map(item=>el(`${item.id}\nIron (0.01 SCU)\n⏱ 10s`,{querySelector:s=>s==='.fab-card-name'?el(item.id,{click(){opened=item;source.href=`https://scmdb.net/?page=fab&fab=${item.id}`;clicks++;if(stopAfter&&clicks===stopAfter) buttons.stop.click();}}):null}));
  const clear=el('Clear all',{click(){selections={};}});
  const dbData=new Map();
  const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx={};tx.objectStore=()=>({put(value,key){const operation={result:key};dbData.set(key,structuredClone(value));queueMicrotask(()=>tx.oncomplete());return operation;}});return tx;}};request.onsuccess();});return request;}};
  const context={URLSearchParams,URL:class extends URL{static createObjectURL(blob){exported=blob;return 'blob:test';}static revokeObjectURL(){}},Blob,indexedDB,location:source,window:{clearTimeout(){},setTimeout,addEventListener(){},removeEventListener(){}},setTimeout:fn=>{queueMicrotask(fn);return 1;},document:{body:{append(){}},documentElement:{lang:'en'},createElement:tag=>tag==='section'?panel:el(),querySelector:s=>s==='select:disabled'?el('4.10.2-test'):s==='.fab-detail'?(opened?detail():null):s==='.fab-detail .fabricator-back'?el('',{click(){opened=null;source.href='https://scmdb.net/?page=fab';if(changeAfter&&clicks===changeAfter) selections={type:'quantumdrive'};}}):null,querySelectorAll:s=>s==='.fab-card'?shown():s==='.fab-filter-group'?groups():s==='button'?[clear]:[]},MutationObserver:class{observe(){}disconnect(){}},alert:message=>{throw Error(message);}};
  vm.runInNewContext(script,context);
  return {run:()=>context.window.__SCMDB_PUBLIC_CAPTURE__.runGrouped(),async payload(){buttons['export-details'].click();return JSON.parse(await exported.text());},get clicks(){return clicks;},catalog,dbData,buttons};
}
(async()=>{
  const all=harness();await all.run();let data=await all.payload();
  assert.equal(data.details.length,255,'all recipes covered including classless backpacks');
  const run=data.grouped_runs[0];assert.equal(run.completed,255);assert.equal(run.failures,0);
  assert(run.groups.some(group=>group.path.includes('Backpack')),'no-weight-class fallback');
  assert(run.groups.filter(group=>!group.oversized).every(group=>group.visible<=100));
  assert.equal(run.groups.filter(group=>group.oversized).length,1,'only truly unsplittable type exceeds target');
  assert.equal(run.groups.find(group=>group.oversized).visible,115);
  const firstClicks=all.clicks;await all.run();data=await all.payload();
  assert.equal(all.clicks,firstClicks,'deterministic group mappings skip completed recipes on restart');
  const limited=harness({limit:5});await limited.run();data=await limited.payload();
  assert.equal(data.details.length,5);assert.equal(data.grouped_runs[0].limit_reached,true);
  const stopped=harness({stopAfter:1});await stopped.run();data=await stopped.payload();
  assert.equal(stopped.clicks,1);assert.equal(data.grouped_runs[0].stopped,true,'stop does not keep changing filters');
  const changed=harness({changeAfter:1});await assert.rejects(changed.run(),/列表顺序或内容改变/);data=await changed.payload();
  assert.match(data.grouped_runs[0].error,/列表顺序或内容改变/);
  assert.equal(changed.clicks,1,'unexpected filter changes abort before another card opens');
  console.log('Blueprint grouping fixtures passed (100-item target, dynamic groups, classless leftovers, oversized fallback, resume, batch cap, stop and changed-filter abort)');
})().catch(error=>{console.error(error);process.exitCode=1;});
