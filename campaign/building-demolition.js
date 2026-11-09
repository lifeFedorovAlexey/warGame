import {oilRefund} from './oil-economy.js';

export function canDemolish(mission,target){
 const spec=target&&mission.config.buildings[target.kind];
 return !!(spec&&!spec.storyOnly&&!spec.enemyOnly&&target.owner==='rai'&&target.hp>0&&target.completed&&mission.state.buildings.includes(target));
}
export const demolitionWorkers=(mission,id)=>mission.state.units.filter(u=>u.hp>0&&u.task?.type==='demolish'&&u.task.targetId===id);

export function requestDemolition(mission,id){
 mission.finishPendingStep();const target=mission.entity(id);
 if(!canDemolish(mission,target))return mission.fail('Выберите своё готовое здание');
 const current=demolitionWorkers(mission,id);if(current.length)return {ok:true,assigned:current.length};
 const builders=mission.state.units.filter(u=>u.hp>0&&u.owner==='rai'&&mission.unitSpec(u).role==='builder');
 if(!builders.length)return mission.fail('Нет строителя для сноса');
 builders.sort((a,b)=>Number(!!a.task)-Number(!!b.task)||Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y));
 for(const builder of builders){const result=mission.order([builder.id],'demolish',target);if(result.ok)return result;}
 return mission.fail('Строители не могут подъехать к зданию');
}

export function cancelDemolition(mission,id){
 mission.finishPendingStep();const target=mission.entity(id);
 if(!canDemolish(mission,target))return mission.fail('Здание уже недоступно');
 const workers=demolitionWorkers(mission,id);if(workers.length)mission.stop(workers.map(u=>u.id),{expandGroup:false});
 delete target.demolitionProgress;return {ok:true};
}

export function advanceDemolition(mission,worker,target,dt){
 if(!canDemolish(mission,target))return false;
 const seconds=Math.max(4,(mission.buildingSpec(target).seconds??20)*.35);
 target.demolitionProgress=Math.min(1,(target.demolitionProgress??0)+dt/seconds);
 if(target.demolitionProgress<1)return true;
 // Cancel unfinished factory/research orders exactly once, with the same
 // remaining-oil refund as normal cancellation. A finished building is spent.
 const refund=[...(target.queue??[]),target.research].filter(Boolean).reduce((sum,job)=>sum+oilRefund(job),0);
 target.queue=[];target.research=null;
 mission.state.energy=Math.min(mission.config.energyCapacity,mission.state.energy+refund);
 target.demolished=true;
 mission.damage(target,target.hp,worker,{type:'shell',point:[0,0,1],normal:[0,0,1],direction:[0,0,-1],worldDirection:[0,0,-1],partId:0,partSpec:{material:'concrete'}});
 for(const unit of mission.state.units)if(unit.task?.targetId===target.id){
  unit.task=null;unit.path=[];unit.builderWorking=false;unit.builderContact=null;unit.foldTime=2.6;delete unit.resumeConstructionId;
 }
 mission.emit('building-demolished',{building:target.id,kind:target.kind});
 return false;
}
