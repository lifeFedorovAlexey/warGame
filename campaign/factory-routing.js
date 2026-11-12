import {oilOrderProgress} from './oil-economy.js';
import {damageMobility} from './damage-state.js';
import {needsModernization} from './factory-modernization.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const assignment=u=>u.factoryVisit?.factoryId??u.combatRetreat?.home?.id;
const queueTime=u=>u.factoryVisit?.queued??u.combatRetreat?.started??0;
const queueOrder=(a,b)=>queueTime(a)-queueTime(b)||a.id.localeCompare(b.id);
const committed=u=>['gate','entering','inside','leaving','departure'].includes(u.factoryVisit?.phase);

export function needsFactoryVisit(m,unit,factory){
 return unit.hp<unit.maxHp||needsModernization(m,factory,unit);
}

export function factoryRepairQueue(m,f){
 return m.state.units.filter(u=>u.owner===f.owner&&u.hp>0&&assignment(u)===f.id
  &&!['leaving','departure'].includes(u.factoryVisit?.phase)
  &&(u.factoryVisit||u.combatRetreat?.service!=='complete')&&u.hp<u.maxHp);
}

function factoryDoor(m,f){
 const a=f.rotation??0,scale=m.config.worldScale;
 return {x:f.x+Math.sin(a)*18*scale,y:f.y-Math.cos(a)*18*scale};
}
export function factoryArrivalSeconds(m,u,f){
 return distance(u,factoryDoor(m,f))/Math.max(1,m.unitSpec(u).speed*damageMobility(u.damage));
}

// Estimate the single repair bay and the entrance separately. Cars already
// travelling to this factory reserve work too; otherwise a whole retreating
// group would see an empty bay and choose the same nearest factory.
export function repairCompletionSeconds(m,u,f){
 const rate=m.buildingSpec(f).repair?.hpPerSecond??40;
 const repair=v=>Math.max(0,v.maxHp-v.hp)/Math.max(1,rate);
 let bay=f.workPriority==='production'&&!f.exitBlocked?(f.queue??[]).reduce((sum,job)=>sum+
  oilOrderProgress(job,m.config.units[job.kind]?.seconds??0,m.config).remaining,0):0;
 let entrance=0;
 const keepingPlace=assignment(u)===f.id;
 const waiting=m.state.units.filter(v=>v!==u&&v.owner===u.owner&&v.hp>0&&assignment(v)===f.id
  &&(v.factoryVisit||v.combatRetreat?.service!=='complete'&&needsFactoryVisit(m,v,f))
  &&!['leaving','departure'].includes(v.factoryVisit?.phase));
 const inside=waiting.filter(v=>v.factoryVisit?.phase==='inside')
  .sort((a,b)=>(a.factoryVisit.arrived??0)-(b.factoryVisit.arrived??0)||a.id.localeCompare(b.id));
 for(const v of inside)bay+=repair(v);
 const incoming=waiting.filter(v=>v.factoryVisit?.phase!=='inside'
  &&(!keepingPlace||committed(v)||queueOrder(v,u)<0))
  .sort((a,b)=>Number(committed(b))-Number(committed(a))||queueOrder(a,b));
 for(const v of incoming){
  entrance=Math.max(entrance,v.factoryVisit?.phase==='entering'?0:factoryArrivalSeconds(m,v,f))+5;
  bay=Math.max(bay,entrance)+repair(v);
 }
 return Math.max(bay,Math.max(entrance,factoryArrivalSeconds(m,u,f))+5)+repair(u);
}

export function chooseRepairFactory(m,u){
 const rows=m.state.buildings.filter(f=>f.kind==='factory'&&f.owner===u.owner&&f.hp>0&&f.completed)
  .map(factory=>{
   const failed=u.combatRetreat?.unavailableFactories?.[factory.id];
   const unavailable=failed&&failed.revision===m.nav.topologyRevision&&m.state.time-failed.at<8&&distance(u,failed)<m.config.worldScale*10;
   return {factory,seconds:repairCompletionSeconds(m,u,factory)+(unavailable?120:0)};
  });
 rows.sort((a,b)=>a.seconds-b.seconds||distance(u,a.factory)-distance(u,b.factory)||a.factory.id.localeCompare(b.factory.id));
 const best=rows[0],current=rows.find(row=>row.factory.id===assignment(u));
 // A stalled car already at another door can leave the conflicting stream
 // between adjacent factories. Avoid switching in the middle of a transfer.
 if(current&&!committed(u)&&u.navigation?.waitSeconds>=3){
  const currentDistance=distance(u,factoryDoor(m,current.factory)),scale=m.config.worldScale;
  const alternative=rows.find(row=>{
   const door=factoryDoor(m,row.factory),d=distance(u,door);
   const nearby=d<scale*8&&d+scale*2<currentDistance;
   const opposing=u.navigation.waitCycle&&d+scale<currentDistance
    &&assignment(m.entity(u.navigation.blockerId)??{})===row.factory.id;
   return (nearby||opposing)&&m.nav.lineClear(u,door,false,true);
  });
  if(alternative)return alternative.factory;
 }
 // Finish the last few metres at a clear doorway. Farther away, substantial
 // queue changes or a newly available factory can improve the assignment.
 if(current&&u.factoryVisit?.phase==='approach'&&distance(u,factoryDoor(m,current.factory))<m.config.worldScale*8
  &&!(u.navigation?.waitSeconds>=3)&&u.navigation?.reason!=='factory-route-unavailable')return current.factory;
 // Preserve queue position for small differences. A car at the doorway or
 // inside the hall finishes its visit instead of changing factories mid-transfer.
 if(current&&(committed(u)||best.seconds+Math.max(4,current.seconds*.15)>=current.seconds))return current.factory;
 return best?.factory;
}

export function repairChoiceDue(m,u){
 const retreat=u.combatRetreat;
 if(!retreat||retreat.service==='complete'||u.hp>=u.maxHp&&!u.modernizationRequested||committed(u)
  ||u.pendingOrder||u.detour||u.yieldReturn||m.state.time<(retreat.factoryChoiceAt??-Infinity))return false;
 retreat.factoryChoiceAt=m.state.time+2;
 return true;
}
