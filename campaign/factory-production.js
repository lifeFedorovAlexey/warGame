import {oilOrderProgress} from './oil-economy.js';
import {factoryRepairQueue,factoryArrivalSeconds} from './factory-routing.js';

export const productionFactories=mission=>mission.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind==='factory');

export function productionCompletionSeconds(mission,factory,job){
 let seconds=factory.queue.reduce((sum,item)=>sum+oilOrderProgress(item,mission.config.units[item.kind].seconds,mission.config).remaining,0);
 if(job)seconds+=oilOrderProgress(job,mission.config.units[job.kind].seconds,mission.config).remaining;
 if((factory.workPriority??'repair')==='repair'){
  const rate=mission.buildingSpec(factory).repair?.hpPerSecond??40;
  const repairs=factoryRepairQueue(mission,factory).map(u=>({u,arrival:u.factoryVisit?.phase==='inside'?0:factoryArrivalSeconds(mission,u,factory)+5}));
  repairs.sort((a,b)=>a.arrival-b.arrival||a.u.id.localeCompare(b.u.id));
  for(const {u,arrival} of repairs){
   if(arrival<=seconds)seconds+=Math.max(0,u.maxHp-u.hp)/rate;
  }
 }
 return seconds+(factory.exitBlocked?30:0);
}

// Compare completion times, including the actual repair work ahead. A busy
// bay is a finite delay, not a permanent ban on this factory's production.
export function chooseProductionFactory(mission,preferredId,job){
 const rows=productionFactories(mission).map(factory=>({factory,
  seconds:productionCompletionSeconds(mission,factory,job)}));
 rows.sort((a,b)=>a.seconds-b.seconds
  ||Number(b.factory.id===preferredId)-Number(a.factory.id===preferredId)||a.factory.id.localeCompare(b.factory.id));
 return rows[0]?.factory;
}

export function rebalanceProduction(mission){
 if(mission.state.time<(mission.factoryBalanceAt??-Infinity))return;
 mission.factoryBalanceAt=mission.state.time+1;
 const factories=productionFactories(mission);if(factories.length<2)return;
 const pending=[];
 for(const f of factories)for(const job of f.queue)
  if(job.autoFactory!==false&&job.funding&&!(job.progress>0)&&!(job.funding.paid>0))pending.push({job,from:f.id});
 if(!pending.length)return;
 const movable=new Set(pending.map(x=>x.job));
 for(const f of factories)f.queue=f.queue.filter(job=>!movable.has(job));
 pending.sort((a,b)=>(a.job.orderSerial??0)-(b.job.orderSerial??0)||a.from.localeCompare(b.from));
 for(const {job,from} of pending){
  const f=chooseProductionFactory(mission,from,job);f.queue.push(job);
  if(f.id!==from)mission.emit('factory-order-redistributed',{from,to:f.id,order:job.orderSerial});
 }
}

export function productionCancellation(mission,projectId,projects=mission.factoryProjects()){
 const rows=[];
 for(const factory of productionFactories(mission)){
  const index=factory.queue.findLastIndex(job=>mission.productionProjectId(job,projects)===projectId);
  if(index<0)continue;
  const job=factory.queue[index],started=(job.progress??0)>0||index===0&&(job.funding?.paid??0)>0;
  rows.push({factory,index,job,started});
 }
 // Cancel waiting orders before active work, newest first across factories.
 rows.sort((a,b)=>Number(a.started)-Number(b.started)||(b.job.orderSerial??b.index)-(a.job.orderSerial??a.index));
 return rows[0];
}
