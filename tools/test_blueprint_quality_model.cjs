/* Check estimates against every observed recipe, plus independent-slot and tier boundaries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compile,effect}=require('../scminer-local/dist/blueprint-quality-model.js');
const root=path.join(__dirname,'../scminer-local/dist/blueprint-quality');
const recipes=Object.assign({},...fs.readdirSync(root).map(f=>JSON.parse(fs.readFileSync(path.join(root,f))).recipes));
const armor=recipes.BP_CRAFT_ccc_medium_armor_arms_01_01_01;
const model=compile(armor),q=[800,250,null],result=model.calculate(q,armor.presets.base);
assert.equal(result.values[0],'-54.9°C');assert.equal(result.values[1],'81.9°C');
assert.equal(result.values[5],'×0.68 (-32%)');
assert.equal(result.effects[0][0].multiplier,'×1.060');
assert(model.models.every(m=>m.fixed||m.verified));
let checks=0,estimated=0;
for(const r of Object.values(recipes)){
 const m=compile(r);
 for(const p of Object.values(r.presets)){
  const output=m.calculate(p.qualities.map(Number),p);
  m.models.forEach((s,i)=>{
   if(!s.verified)return;estimated++;
   const numeric=x=>Number(x.replace('−','-').match(/[-+]?\d+(?:\.\d+)?/)[0]);
   const decimals=(p.values[i].match(/\d+\.(\d+)/)||[])[1]?.length||0;
   assert(Math.abs(numeric(output.values[i])-numeric(p.values[i]))<=1.1*Math.pow(10,-decimals)+1e-8,`${r.id} ${r.stats[i].label}`);
  });checks++;
 }
}
const power=Object.values(recipes).find(r=>r.slots.some(s=>s.effects.some(e=>e.rule.kind==='steps')));
const tier=power.slots.flatMap(s=>s.effects).find(e=>e.rule.kind==='steps').rule;
for(const t of tier.tiers){assert.equal(effect(tier,t.min),t.delta);assert.equal(effect(tier,t.max),t.delta);}
const abnormal=Object.values(recipes).find(r=>r.slots.some(s=>s.effects.some(e=>e.rule.kind==='unverified')));
assert.equal(compile(abnormal).slotEnabled[0],false);
const broken=JSON.parse(JSON.stringify(armor));broken.presets.half.values[5]='×0.10 (−90%)';
assert.equal(compile(broken).models[5].verified,false,'mismatched snapshots must not become a predictive model');
assert.equal(compile(broken).calculate(q,broken.presets.base).values[5],broken.presets.base.values[5]);
console.log(`Quality model passed: ${checks} snapshots, ${estimated} estimated values, mixed slots, tier edges and anomaly refusal`);
