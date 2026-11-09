import {oilOrderProgress} from './oil-economy.js';
import {factoryProductionPaused} from './factory-garage.js';

export const productionFactories=mission=>mission.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind==='factory');

// Schedule at order time. Existing work stays in its factory, including paid
// oil, damage, repair priority and the factory's own exit/rally point.
export function chooseProductionFactory(mission,preferredId){
 const rows=productionFactories(mission).map(factory=>({factory,
  blocked:!!factory.exitBlocked||factoryProductionPaused(mission,factory),
  seconds:factory.queue.reduce((sum,job)=>sum+oilOrderProgress(job,mission.config.units[job.kind].seconds,mission.config).remaining,0)}));
 rows.sort((a,b)=>Number(a.blocked)-Number(b.blocked)||a.seconds-b.seconds
  ||Number(b.factory.id===preferredId)-Number(a.factory.id===preferredId)||a.factory.id.localeCompare(b.factory.id));
 return rows[0]?.factory;
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
