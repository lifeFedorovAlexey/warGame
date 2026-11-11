export const repairableBuilding=(mission,target)=>!!target&&!!mission.config.buildings[target.kind]&&target.owner==='rai'&&target.completed&&target.hp>0&&!target.clearing;

export function setBuilderAutoRepair(mission,enabled){
 if(typeof enabled!=='boolean')return mission.fail('Недопустимый режим ремонта');
 mission.state.builderAutoRepair=enabled;
 for(const unit of mission.state.units){
  if(unit.owner!=='rai'||mission.unitSpec(unit).role!=='builder')continue;
  delete unit.autoRepairCheckAt;
  if(!enabled&&unit.task?.autoRepair){
   unit.task=null;unit.path=[];unit.driveSpeed=0;unit.builderWorking=false;unit.builderContact=null;
   for(const key of ['detour','driveWatch','trafficHold','routeOrder','routeContinuation'])delete unit[key];
  }
 }
 mission.trafficCoordinator.intentChanged();
 return {ok:true,enabled};
}

const stopped=unit=>!unit.path.length&&!unit.pendingOrder&&!unit.detour&&!unit.combatRetreat&&!unit.factoryVisit;
export function* assignAutomaticRepair(mission,unit){
 if(!mission.state.builderAutoRepair||unit.owner!=='rai'||unit.task||unit.orderQueue?.length||!stopped(unit)||unit.yieldReturn)return;
 if(mission.state.time<(unit.autoRepairCheckAt??0))return;
 unit.autoRepairCheckAt=mission.state.time+.4;
 const range=mission.unitSpec(unit).vision,claimed=new Set(mission.state.units
  .filter(other=>other!==unit&&other.hp>0&&other.task?.type==='repair').map(other=>other.task.targetId));
 const candidates=[];
 for(const target of mission.state.buildings){
  if(target===unit||target.owner!==unit.owner||target.hp<=0||target.hp>=target.maxHp||claimed.has(target.id)||target.damage?.wreck||target.clearing)continue;
  if(!repairableBuilding(mission,target))continue;
  const distance=Math.hypot(Math.max(0,Math.abs(target.x-unit.x)-(target.halfWidth??0)),Math.max(0,Math.abs(target.y-unit.y)-(target.halfDepth??0)));
  if(distance<=range&&mission.visibleAt(target.x,target.y))candidates.push({target,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance||a.target.id.localeCompare(b.target.id));
 for(const {target} of candidates.slice(0,3)){
  // Reserve before yielding route search, so two workers cannot choose it.
  const task={type:'repair',targetId:target.id,x:target.x,y:target.y,autoRepair:true};unit.task=task;
  const path=yield* mission.workPathSteps(unit,target);
  if(unit.task!==task)return; // A manual command or disabling auto wins while planning.
  if(path){unit.path=path;mission.trafficCoordinator.intentChanged();return;}
  unit.task=null;
 }
}

export function releaseInvalidRepairTarget(mission,unit){
 if(unit.task?.type!=='repair'||repairableBuilding(mission,mission.entity(unit.task.targetId)))return;
 unit.task=null;unit.path=[];unit.driveSpeed=0;unit.builderWorking=false;unit.builderContact=null;
 for(const key of ['detour','driveWatch','trafficHold','routeOrder','routeContinuation'])delete unit[key];
}
