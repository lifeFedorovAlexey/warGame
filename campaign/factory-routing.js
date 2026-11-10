import {oilOrderProgress} from './oil-economy.js';
import {damageMobility} from './damage-state.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const assignment=u=>u.factoryVisit?.factoryId??u.combatRetreat?.home?.id;
const queueTime=u=>u.factoryVisit?.queued??u.combatRetreat?.started??0;
const queueOrder=(a,b)=>queueTime(a)-queueTime(b)||a.id.localeCompare(b.id);
const committed=u=>['gate','entering','inside','leaving','departure'].includes(u.factoryVisit?.phase);

export function needsFactoryVisit(unit,factory){
 return unit.hp<unit.maxHp||!!factory.autoModernize;
}

function arrivalSeconds(m,u,f){
 const a=f.rotation??0,scale=m.config.worldScale;
 const door={x:f.x+Math.sin(a)*18*scale,y:f.y-Math.cos(a)*18*scale};
 return distance(u,door)/Math.max(1,m.unitSpec(u).speed*damageMobility(u.damage));
}

// Estimate the single repair bay and the entrance separately. Cars already
// travelling to this factory reserve work too; otherwise a whole retreating
// group would see an empty bay and choose the same nearest factory.
export function repairCompletionSeconds(m,u,f){
 const rate=m.buildingSpec(f).repair?.hpPerSecond??40;
 const repair=v=>Math.max(0,v.maxHp-v.hp)/Math.max(1,rate);
 let bay=f.workPriority==='production'?(f.queue??[]).reduce((sum,job)=>sum+
  oilOrderProgress(job,m.config.units[job.kind]?.seconds??0,m.config).remaining,0):0;
 let entrance=0;
 const keepingPlace=assignment(u)===f.id;
 const waiting=m.state.units.filter(v=>v!==u&&v.owner===u.owner&&v.hp>0&&assignment(v)===f.id
  &&(v.factoryVisit||v.combatRetreat?.service!=='complete'&&needsFactoryVisit(v,f))
  &&!['leaving','departure'].includes(v.factoryVisit?.phase));
 const inside=waiting.filter(v=>v.factoryVisit?.phase==='inside')
  .sort((a,b)=>(a.factoryVisit.arrived??0)-(b.factoryVisit.arrived??0)||a.id.localeCompare(b.id));
 for(const v of inside)bay+=repair(v);
 const incoming=waiting.filter(v=>v.factoryVisit?.phase!=='inside'
  &&(!keepingPlace||committed(v)||queueOrder(v,u)<0))
  .sort((a,b)=>Number(committed(b))-Number(committed(a))||queueOrder(a,b));
 for(const v of incoming){
  entrance=Math.max(entrance,v.factoryVisit?.phase==='entering'?0:arrivalSeconds(m,v,f))+5;
  bay=Math.max(bay,entrance)+repair(v);
 }
 return Math.max(bay,Math.max(entrance,arrivalSeconds(m,u,f))+5)+repair(u);
}

export function chooseRepairFactory(m,u){
 const rows=m.state.buildings.filter(f=>f.kind==='factory'&&f.owner===u.owner&&f.hp>0&&f.completed)
  .map(factory=>({factory,seconds:repairCompletionSeconds(m,u,factory)}));
 rows.sort((a,b)=>a.seconds-b.seconds||distance(u,a.factory)-distance(u,b.factory)||a.factory.id.localeCompare(b.factory.id));
 const best=rows[0],current=rows.find(row=>row.factory.id===assignment(u));
 // Preserve queue position for small differences. A car at the doorway or
 // inside the hall finishes its visit instead of changing factories mid-transfer.
 if(current&&(committed(u)||best.seconds+Math.max(4,current.seconds*.15)>=current.seconds))return current.factory;
 return best?.factory;
}

export function repairChoiceDue(m,u){
 const retreat=u.combatRetreat;
 if(!retreat||retreat.service==='complete'||u.hp>=u.maxHp||committed(u)
  ||u.pendingOrder||u.detour||u.yieldReturn||m.state.time<(retreat.factoryChoiceAt??-Infinity))return false;
 retreat.factoryChoiceAt=m.state.time+2;
 return true;
}
