import {oilFundingRemaining,spendOil} from './oil-economy.js';
import {insideFactory,factoryPriority,factoryVisitors} from './factory-garage.js';
// Service uses the same simulation clock and oil stock as construction.
// A bay is assigned once per economy step, never once per search/frame slice.
export function factoryCanRepair(mission,factory,point){
 const service=factory&&mission.buildingSpec(factory).repair;
 return !!service&&factory.hp>0&&factory.completed
  &&Math.hypot(Math.max(0,Math.abs(point.x-factory.x)-factory.halfWidth),
   Math.max(0,Math.abs(point.y-factory.y)-factory.halfDepth))<=service.rangeMetres*mission.config.worldScale
  // A radius alone allowed repair bays on the ridge above the factory.
  // Service belongs to the factory's authored level and connected apron.
  &&mission.nav.terrainAllowed.levelAt?.(point.x,point.y)===mission.nav.terrainAllowed.levelAt?.(factory.x,factory.y)
  &&mission.nav.terrainAllowed.clearSegment(factory,point);
}
export function rememberRetreatOrder(mission,unit){
 const pending=unit.pendingOrder,task=unit.combatDeployment?.resume??unit.task;
 const origin=unit.yieldReturn?.home??unit;
 const type=pending?.type??task?.type;
 const target=pending?.target??unit.routeOrder?.destination??task??origin;
 const work=mission.unitSpec(unit).role==='builder'&&['build','repair','demolish','upgrade-power'].includes(type);
 const action=work||['move','attack-move','attack'].includes(type)?type:'move';
 const result={action,target:{x:target.x??origin.x,y:target.y??origin.y},origin:{x:origin.x,y:origin.y}};
 if(action==='attack')result.target.id=pending?.target.id??task?.targetId;
 if(work){result.target.id=pending?.target.id??task?.targetId;return result;}
 // Track a formation relative to another member's accepted slot. If that
 // group receives a later march while this car is at the factory, rejoin its
 // current destination rather than the obsolete battlefield coordinates.
 const group=mission.state.commandGroups?.find(g=>g.id===unit.commandGroupId);
 if(group&&action!=='attack'){
  result.groupId=group.id;
  result.peers=group.members.filter(id=>id!==unit.id).map(id=>{
   const peer=mission.entity(id),at=peer?.routeOrder?.destination??peer;
   return at&&{id,x:result.target.x-at.x,y:result.target.y-at.y};
  }).filter(Boolean);
 }
 return result;
}
export function retreatReturnOrder(mission,unit){
 const resume=unit.combatRetreat?.resume;if(!resume)return null;
 if(['build','repair','demolish','upgrade-power'].includes(resume.action)){
  const target=mission.entity(resume.target.id);
  const needed=target?.hp>0&&target.owner===unit.owner&&
   (resume.action==='build'?!target.completed:resume.action==='repair'?target.hp<target.maxHp:
    resume.action==='upgrade-power'?!target.powerModule:true);
  return needed?{action:resume.action,target}:{action:'move',target:resume.origin};
 }
 if(resume.action==='attack'){
  const enemy=mission.entity(resume.target.id);
  if(enemy?.hp>0&&mission.enemyOf(unit,enemy)&&mission.visibleAt(enemy.x,enemy.y))return {action:'attack',target:enemy};
  return {action:'move',target:resume.origin};
 }
 const group=mission.state.commandGroups?.find(g=>g.id===resume.groupId&&g.members.includes(unit.id));
 for(const offset of group?resume.peers??[]:[]){
  const peer=mission.entity(offset.id);
  if(!peer||peer.hp<=0||peer.combatRetreat||!group.members.includes(peer.id))continue;
  const at=peer.routeOrder?.destination??peer;
  return {action:resume.action,target:{x:at.x+offset.x,y:at.y+offset.y}};
 }
 return {action:resume.action,target:resume.target};
}
export function updateFactoryRepairs(mission,structures,dt){
 for(const factory of structures){
  if(factory.kind!=='factory')continue;
  const service=mission.buildingSpec(factory).repair??{hpPerSecond:40,energyPerSecond:1.5};factory.activeRepair=null;
  const waiting=factoryVisitors(mission,factory).filter(u=>insideFactory(u)&&!u.factoryVisit.nextFactoryId&&u.hp<u.maxHp)
   .sort((a,b)=>a.factoryVisit.arrived-b.factoryVisit.arrived||a.id.localeCompare(b.id));
  for(const [index,unit] of waiting.entries()){
   const retreat=unit.combatRetreat??={},visit=unit.factoryVisit;
   const order=factory.queue[0],productionReady=order&&!(order.progress>=1&&factory.exitBlocked)
    &&(oilFundingRemaining(order)===0||mission.state.energy>0);
   if(factoryPriority(factory)==='production'&&productionReady){retreat.service='waiting-production';continue;}
   if(index>0){retreat.service='waiting-bay';continue;}
   const seconds=Math.min(dt,(unit.maxHp-unit.hp)/service.hpPerSecond);
   const oil=mission.state.energy;
   const affordable=service.energyPerSecond>0?Math.min(seconds,oil/service.energyPerSecond):seconds;
   if(affordable<=0){retreat.service='waiting-energy';continue;}
   if(visit.repairStartHp===undefined){visit.repairStartHp=unit.hp;mission.emit('factory-repair-start',{unit:unit.id,factory:factory.id});}
   retreat.service='repairing';unit.hp=Math.min(unit.maxHp,unit.hp+service.hpPerSecond*affordable);
   spendOil(mission,service.energyPerSecond*affordable,{reserved:true});
   factory.activeRepair={unitId:unit.id,progress:(unit.hp-visit.repairStartHp)/Math.max(1,unit.maxHp-visit.repairStartHp)};
   if(unit.hp===unit.maxHp&&unit.damage){
    // Restore mechanical parts as well as HP. Keep installed upgrades and
    // cosmetic impact history; a full HP car must not return with lost wheels.
    for(const part of Object.values(unit.damage.parts)){part.damage=0;part.detached=false;}
    unit.damage.revision++;
   }
   if(unit.hp===unit.maxHp){factory.activeRepair=null;mission.emit('factory-repair-complete',{unit:unit.id,factory:factory.id});}
  }
 }
}
