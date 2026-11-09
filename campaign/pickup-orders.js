import {salvageRecipe,touchesSalvage} from './vehicle-salvage.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const keyFor=pickup=>pickup.kind==='artifact'?'artifactId':'salvageId';
export function pickupTarget(mission,point){
  const candidates=[...mission.state.artifacts.filter(item=>!item.collected).map(item=>({kind:'artifact',item,radius:18})),
    ...(mission.state.salvage?.items??[]).filter(item=>item.expiresAt>mission.state.time)
      .map(item=>({kind:'salvage',item,radius:mission.config.worldScale*1.5}))]
    .filter(({item})=>mission.exploredAt(item.x,item.y));
  return candidates.find(({item})=>item.id===point.id)
    ??candidates.filter(({item,radius})=>distance(item,point)<radius)
      .sort((a,b)=>distance(a.item,point)-distance(b.item,point))[0]??null;
}
function canCollect(mission,unit,pickup){
  return unit.hp>0&&unit.owner==='rai'&&(pickup.kind==='artifact'||!!salvageRecipe(mission,unit,pickup.item));
}
function inReach(mission,unit,pickup){
  return pickup.kind==='artifact'?distance(unit,pickup.item)<24
    :touchesSalvage({...unit,previousX:unit.x,previousY:unit.y,previousHeading:unit.heading},pickup.item,mission.config.worldScale);
}
function* pickupPathSteps(mission,unit,pickup){
  if(inReach(mission,unit,pickup))return [];
  if(pickup.kind==='salvage')return yield* mission.salvagePathSteps(unit,pickup.item);
  return yield* mission.movePathSteps(unit,pickup.item,[],mission.config.worldScale*4,false,
    point=>distance(point,pickup.item)<22,{fallback:false,maxGoalDistance:4});
}
function stopPickup(mission,unit){
  mission.stop([unit.id],{expandGroup:false});unit.driveSpeed=0;unit.steering=0;
  for(const key of ['routeOrder','passage','passingLane','driveWatch','failedArcs','reverseDebt','pickupRetryAt','resumeConstructionId'])delete unit[key];
}
export function orderPickup(mission,units,pickup){
  const key=keyFor(pickup),id=pickup.item.id;
  const candidates=units.filter(unit=>canCollect(mission,unit,pickup))
    .sort((a,b)=>distance(a,pickup.item)-distance(b,pickup.item)||a.id.localeCompare(b.id));
  if(!candidates.length)return mission.fail(pickup.kind==='salvage'?'Нет машины для этого улучшения':'Не выбрана подходящая техника');
  // Keep a valid owner on repeated clicks: neither reassign nor reset its turn.
  const current=candidates.find(unit=>unit.task?.[key]===id&&(unit.path.length||inReach(mission,unit,pickup)));
  let collector=current,path;
  if(!collector)for(const unit of candidates){
    const search=pickupPathSteps(mission,unit,pickup);let step;do{step=search.next();}while(!step.done);
    if(step.value){collector=unit;path=step.value;break;}
  }
  if(!collector)return mission.fail('Нет пути к предмету');
  // Clean duplicate assignments, including a repeated click from a different
  // selection. Other orders and the rest of the selection remain untouched.
  for(const other of mission.state.units)if(other!==collector&&other.owner==='rai'&&other.hp>0
    &&(other.task?.[key]===id||other.task?.type==='move'&&!other.task.artifactId&&!other.task.salvageId
      &&other.routeOrder?.request&&distance(other.routeOrder.request,pickup.item)<3))stopPickup(mission,other);
  if(!current){
    stopPickup(mission,collector);
    const end=path.at(-1)??collector;
    collector.path=path;collector.task={type:'move',x:end.x,y:end.y,[key]:id};
  }
  return {ok:true,assigned:1,assignedIds:[collector.id],unassigned:[],pickup:{kind:pickup.kind,id,unitId:collector.id}};
}

// A collected/expired item must not leave a route to an empty parking spot.
// Waiting for a falling part to settle also must not restart parking every tick.
export function* updatePickupOrder(mission,unit){
  const task=unit.task,key=task?.artifactId?'artifactId':task?.salvageId?'salvageId':null;
  if(!key)return false;
  const kind=key==='artifactId'?'artifact':'salvage';
  const item=(kind==='artifact'?mission.state.artifacts:mission.state.salvage?.items??[]).find(item=>item.id===task[key]);
  const pickup={kind,item};
  if(!item||item.collected||kind==='salvage'&&item.expiresAt<=mission.state.time||!canCollect(mission,unit,pickup)){
    stopPickup(mission,unit);return true;
  }
  if(inReach(mission,unit,pickup)){
    unit.path=[];unit.driveSpeed=0;unit.steering=0;delete unit.detour;return true;
  }
  if(unit.path.length)return false;
  if(mission.state.time<(task.pickupRepathAt??0))return true;
  task.pickupRepathAt=mission.state.time+1;
  const path=yield* pickupPathSteps(mission,unit,pickup);
  if(!path?.length){unit.driveSpeed=0;return true;}
  unit.path=path;Object.assign(task,path.at(-1));return false;
}
