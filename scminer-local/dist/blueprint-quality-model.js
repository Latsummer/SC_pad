/* Local estimates from explicit material rules; every model is checked against captured presets. */
(function(root){
  'use strict';
  const number=text=>Number(String(text).replace(/−/g,'-').match(/[-+]?\d+(?:\.\d+)?/)?.[0]);
  function effect(rule,q){
    if(rule.kind==='steps') return rule.tiers.find(t=>q>=t.min && q<=t.max)?.delta ?? NaN;
    if(rule.kind!=='multiplier_endpoints' || rule.quality_max<=rule.quality_min) return NaN;
    const t=Math.max(0,Math.min(1,(q-rule.quality_min)/(rule.quality_max-rule.quality_min)));
    return rule.multiplier_at_min+t*(rule.multiplier_at_max-rule.multiplier_at_min);
  }
  const mapping={'Min':['Min Temp'],'Max':['Max Temp'],'Integrity':['Integrity'],'HP':['Max. Shield Strength'],'Cooling Rate':['Coolant Rating'],'Assist Min':['Min. Assist Distance'],'Assist Max':['Max. Assist Distance'],'Drive Speed':['Quantum Speed'],'Fuel / 10Mkm':['Quantum Fuel Burn'],'Radiation Scrub Rate':['Radiation Dissipation'],'Fire Rate':['Fire Rate'],'Recoil Pitch':['Recoil Kick'],'Recoil Yaw':['Recoil Handling'],'Recoil Smooth':['Recoil Smoothness'],'Max Force':['Beam Force'],'Full Str. Dist.':['Full Strength Dist.'],'Max Distance':['Max. Distance'],'Max Volume':['Max. Volume'],'Speed':['Speed'],'Radius':['Radius'],'Efficiency':['Efficiency'],'Power Output':['Power Pips']};
  function names(stat,recipe){
    if(stat.kind==='resistance') return ['Damage Mitigation'];
    if(stat.label.includes('Damage / Shot')) return ['Impact Force'];
    if(stat.label==='DPS') return recipe.slots.some(s=>s.effects.some(e=>e.name==='Laser Power'))?['Laser Power']:['Impact Force','Fire Rate'];
    return mapping[stat.label] || [];
  }
  function precision(text){const m=String(text).match(/\d+(?:\.(\d+))?/);return m?.[1]?.length || 0;}
  function compile(recipe){
    const effects=recipe.slots.flatMap((slot,i)=>slot.effects.map((e,j)=>({...e,slot:i,index:j})));
    const validEffects=effects.map(e=>Object.values(recipe.presets).every(p=>{
      const observed=p.effects[e.slot]?.[e.index]?.multiplier;
      return observed && Math.abs(effect(e.rule,Number(p.qualities[e.slot]))-number(observed))<0.0011;
    }));
    const models=recipe.stats.map(stat=>{
      const wanted=names(stat,recipe), relevant=effects.filter(e=>wanted.includes(e.name.replace(/\s*⚠$/,'')));
      if(!relevant.length) return {fixed:Object.values(recipe.presets).every(p=>p.values[recipe.stats.indexOf(stat)]===stat.base),slots:[]};
      const calculate=qs=>{
        const factors=wanted.map(name=>1+relevant.filter(e=>e.name===name).reduce((sum,e)=>sum+effect(e.rule,qs[e.slot])-(e.rule.kind==='steps'?0:1),0));
        if(stat.label==='Power Output') return number(stat.base)+factors[0]-1;
        const factor=factors.reduce((a,b)=>a*b,1);
        return stat.kind==='resistance'?1-(1-number(stat.base))*factor:number(stat.base)*factor;
      };
      const verified=relevant.every(e=>validEffects[effects.indexOf(e)]) && Object.values(recipe.presets).every(p=>{
        const observed=p.values[recipe.stats.indexOf(stat)], value=calculate(p.qualities.map(Number));
        return Number.isFinite(value) && Math.abs(value-number(observed))<=Math.pow(10,-precision(observed))*1.05+1e-8;
      });
      return {verified,calculate,slots:[...new Set(relevant.map(e=>e.slot))]};
    });
    function format(stat,value){
      if(stat.kind==='resistance') return `×${value.toFixed(2)} (${Math.round((value-1)*100)}%)`;
      return stat.base.replace(/[-+−]?\d+(?:\.\d+)?/,value.toFixed(precision(stat.base)));
    }
    return {models,slotEnabled:recipe.slots.map((s,i)=>Boolean(s.quality && s.effects.length && effects.filter(e=>e.slot===i).every(e=>validEffects[effects.indexOf(e)]))),
      calculate(qs,fallback){return {qualities:qs,quality_issues:[],values:recipe.stats.map((s,i)=>models[i].verified?format(s,models[i].calculate(qs)):models[i].fixed?s.base:fallback.values[i]),effects:recipe.slots.map((s,i)=>s.effects.map(e=>{
        const value=effect(e.rule,qs[i]);return Number.isFinite(value)?{multiplier:e.rule.kind==='steps'?`${value>0?'+':''}${value} pips`:`×${value.toFixed(3)}`,delta:e.rule.kind==='steps'?'':`${value>=1?'+':''}${((value-1)*100).toFixed(2)}%`}:null;
      }))};}};
  }
  const api={compile,effect};
  if(typeof module!=='undefined') module.exports=api;else root.BlueprintQualityModel=api;
})(typeof window==='undefined'?{}:window);
