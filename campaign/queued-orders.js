import {inFactoryInterior,canReceiveAttack} from './combat-retreat-state.js';
import {repairableBuilding} from './builder-auto-repair.js';
import {canDemolish} from './building-demolition.js';
import {pickupTarget,canCollectPickup} from './pickup-orders.js';

const travel=new Set(['move','attack-move','attack']);
const work=new Set(['build','repair','demolish','upgrade-power']);

// Validate at submission without calculating a route from a future position.
// The ordinary order path uses the same rules when the queued order starts.
export function orderCandidates(m,ids,action,target){
 if(!travel.has(action)&&!work.has(action)||!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return m.fail('Недопустимый приказ');
 if(action==='attack'&&(target.owner==='rai'||!m.entity(target.id)||!m.visibleAt(target.x,target.y)))return m.fail('Цель не обнаружена');
 if(action==='build'&&target.clearing)return m.fail('Техника освобождает площадку');
 if(action==='upgrade-power'&&(target.kind!=='generator'||!target.completed||target.powerModule||!m.state.research['power-module']))return m.fail('АЭС не готова к установке энергомодуля');
 if(action==='demolish'&&!canDemolish(m,target))return m.fail('Выберите своё готовое здание');
 if(action==='repair'&&!repairableBuilding(m,target))return m.fail('Строители ремонтируют только готовые постройки');
 if(work.has(action)&&(target.owner!=='rai'||!m.entity(target.id)))return m.fail('Нужна своя техника или постройка');
 const selected=new Set(ids),combat=action==='attack'||action==='attack-move';
 const units=m.state.units.filter(u=>selected.has(u.id)&&u.owner==='rai'&&u.hp>0&&!inFactoryInterior(u)
  &&(!work.has(action)||m.unitSpec(u).role==='builder')&&(!combat||m.unitSpec(u).damage&&canReceiveAttack(u,m.unitSpec(u))));
 return units.length?{ok:true,units,pickup:action==='move'?pickupTarget(m,target):null}:m.fail('Не выбрана подходящая техника');
}

export function clearQueuedOrders(m,ids){
 const selected=new Set(ids);
 for(const unit of m.state.units)if(selected.has(unit.id))delete unit.orderQueue;
}

export function appendOrder(m,ids,action,target){
 const check=orderCandidates(m,ids,action,target);if(!check.ok)return check;
 let units=check.units;
 if(check.pickup){
  units=units.filter(u=>canCollectPickup(m,u,check.pickup)).sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y)||a.id.localeCompare(b.id)).slice(0,1);
  if(!units.length)return m.fail('Нет машины для этого улучшения');
 }
 const serial=m.state.orderQueueSerial=(m.state.orderQueueSerial??0)+1;
 const destination=check.pickup?.item??target,entity=work.has(action)||action==='attack'||check.pickup;
 for(const unit of units)(unit.orderQueue??=[]).push({serial,action,target:{x:destination.x,y:destination.y,...(entity?{id:destination.id}:{})},...(check.pickup?{pickup:check.pickup.kind}:{})});
 return {ok:true,queued:true,assigned:units.length,assignedIds:units.map(u=>u.id),unassigned:[]};
}

// Empty geometry alone is not completion: combat, blocked/replanned routes,
// traffic loans and garage visits all continue owning their current intent.
const ready=u=>u.hp>0&&u.owner==='rai'&&u.orderQueue?.length&&!u.task&&!u.path.length
 &&!u.pendingOrder&&!u.proposedOrder&&!u.routeContinuation&&!u.detour&&!u.yieldReturn&&!u.jointTraffic
 &&!u.combatRetreat&&!u.combatDeployment&&!u.factoryVisit;
const removeHead=(u,head)=>{if(u.orderQueue?.[0]===head){u.orderQueue.shift();if(!u.orderQueue.length)delete u.orderQueue;}};
function targetFor(m,head){
 if(head.pickup){
  const items=head.pickup==='artifact'?m.state.artifacts:m.state.salvage?.items??[];
  return items.find(item=>item.id===head.target.id&&!item.collected&&(head.pickup==='artifact'||item.expiresAt>m.state.time));
 }
 if(!head.target.id)return head.target;
 const target=m.entity(head.target.id);if(!target)return null;
 if(head.action==='build'&&target.completed||head.action==='repair'&&target.hp>=target.maxHp||head.action==='upgrade-power'&&target.powerModule)return null;
 return target;
}

// One scan per simulation step, with one planner request per ready cohort.
// Raw IDs avoid re-expanding a leader into members still on an earlier order.
export function dispatchQueuedTravel(m){
 const groups=new Map();
 for(const unit of m.state.units){
  if(!ready(unit))continue;const head=unit.orderQueue[0];
  if(!travel.has(head.action)||head.pickup||m.state.time<(head.retryAt??0))continue;
  const target=targetFor(m,head);if(!target){removeHead(unit,head);continue;}
  let group=groups.get(head.serial);if(!group)groups.set(head.serial,group={head,target,units:[]});group.units.push(unit);
 }
 for(const {head,target,units} of groups.values()){
  const result=m.submitOrder(units.map(u=>u.id),head.action,target,{expandGroup:false,preserveQueue:true});
  const accepted=new Set(result.ok?result.assignedIds:[]);
  for(const unit of units){const entry=unit.orderQueue[0];if(accepted.has(unit.id))removeHead(unit,entry);else entry.retryAt=m.state.time+1;}
 }
}

// Work and pickups use the existing cooperative controller, so a long search
// yields to input and a newer command can cancel it before publication.
export function* startQueuedWork(m,unit){
 if(!ready(unit))return;const head=unit.orderQueue[0];
 if(travel.has(head.action)&&!head.pickup||m.state.time<(head.retryAt??0))return;
 const target=targetFor(m,head);if(!target){removeHead(unit,head);return;}
 const result=yield* m.orderSteps([unit.id],head.action,target);
 if(unit.orderQueue?.[0]!==head)return;
 if(result.ok){removeHead(unit,head);m.commandPlanner?.cancel([unit.id]);}
 else head.retryAt=m.state.time+1;
}
