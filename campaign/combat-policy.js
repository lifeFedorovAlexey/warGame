import {expandCommandIds} from './group-command.js';
import {isCampPerimeter} from './camp-demolition.js';
import {rememberRetreatOrder,factoryCanRepair} from './factory-repair.js';
import {factoryVisitors,updateFactoryVisit} from './factory-garage.js';
import {chooseRepairFactory,needsFactoryVisit,repairChoiceDue} from './factory-routing.js';
import {shouldAutoRetreat,canAutoRetreat,isAutomaticRepair,inFactoryInterior} from './combat-retreat-state.js';
import {navigationDecision} from './navigation-state.js';
export {shouldAutoRetreat} from './combat-retreat-state.js';

// Units carry a serializable copy of the army's rules, including factory output.
export const DEFAULT_COMBAT_POLICY = Object.freeze({retreat:'never', response:'free', priority:'nearest'});
export const COMBAT_OPTIONS = Object.freeze({
  retreat: [
    {value:'never', icon:'shield', label:'Держаться до конца', detail:'Без автоотхода'},
    {value:'light', icon:'combat-retreat-light', label:'Ранний отход', detail:'HP ≤ 80%'},
    {value:'heavy', icon:'combat-retreat-heavy', label:'Поздний отход', detail:'HP ≤ 35%'},
  ],
  response: [
    {value:'ignore', icon:'combat-hold-fire', label:'Не стрелять', detail:'Огонь только по приказу'},
    {value:'return', icon:'combat-return-fire', label:'Ответный огонь', detail:'По атакующему'},
    {value:'free', icon:'combat-fire', label:'Беглый огонь', detail:'Огонь по готовности'},
  ],
  priority: [
    {value:'nearest', icon:'combat-nearest', label:'Ближайшие цели', detail:'Ближе к машине'},
    {value:'strongest', icon:'combat-armored', label:'Крепкие цели', detail:'Больше максимального HP'},
    {value:'weakest', icon:'combat-wounded', label:'Добивание', detail:'Меньше оставшегося HP'},
    {value:'dangerous', icon:'combat-threat', label:'Опасные цели', detail:'Выше урон в секунду'},
  ],
});
export const combatPolicy = unit => unit.combatPolicy ?? DEFAULT_COMBAT_POLICY;
export function normalizeCombatPolicy(value) {
  return Object.fromEntries(Object.keys(COMBAT_OPTIONS).map(key=>[key,
    COMBAT_OPTIONS[key].some(option=>option.value===value?.[key]) ? value[key] : DEFAULT_COMBAT_POLICY[key]]));
}
export function armyCombatPolicy(mission){
 if(!mission.state.armyCombatPolicy){
  // Old saves held rules on selected units. Preserve the most common explicit
  // choice rather than silently resetting a configured retreat threshold.
  const counts=new Map();
  for(const unit of mission.state.units)if(unit.owner==='rai'&&unit.hp>0&&unit.combatPolicy){
   const key=JSON.stringify(normalizeCombatPolicy(unit.combatPolicy));counts.set(key,(counts.get(key)??0)+1);
  }
  const chosen=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
  mission.state.armyCombatPolicy=chosen?JSON.parse(chosen):{...DEFAULT_COMBAT_POLICY};
 }
 return mission.state.armyCombatPolicy;
}
export function configureArmyCombat(mission,changes){
 const keys=Object.keys(changes??{});
 if(!keys.length||keys.some(key=>!COMBAT_OPTIONS[key]?.some(o=>o.value===changes[key])))return mission.fail('Недопустимый режим боя');
 const policy={...armyCombatPolicy(mission),...changes};
 const ids=mission.state.units.filter(u=>u.hp>0&&u.owner==='rai'&&(mission.unitSpec(u).damage||changes.retreat&&canAutoRetreat(mission.unitSpec(u)))).map(u=>u.id);
 // Changing modes while the army is empty still configures future production.
 const result=ids.length?configureCombat(mission,ids,changes):{ok:true,changed:0};
 if(result.ok)mission.state.armyCombatPolicy=policy;
 return result;
}
export function configureCombat(mission, ids, changes) {
  const keys=Object.keys(changes??{});
  if(!keys.length||keys.some(key=>!COMBAT_OPTIONS[key]?.some(o=>o.value===changes[key])))return mission.fail('Недопустимая настройка атаки');
  const selected=new Set(expandCommandIds(mission,ids,{includeRepairing:true})),urgent=[];let changed=0;
  for(const unit of mission.state.units) {
    if(!selected.has(unit.id)||unit.hp<=0||unit.owner!=='rai')continue;
    const spec=mission.unitSpec(unit),defensiveOnly=!spec.damage;
    if(defensiveOnly&&(!changes.retreat||!canAutoRetreat(spec)))continue;
    const previous=combatPolicy(unit);
    unit.combatPolicy={...previous,...(defensiveOnly?{retreat:changes.retreat}:changes)};
    // A newer rule must take effect during an explicit attack too. Release
    // its old target; a subsequent direct attack remains a deliberate override.
    const changedFireRule=!defensiveOnly&&keys.some(key=>key==='response'||key==='priority');
    const explicit=unit.pendingOrder?.type==='attack'||unit.task?.type==='attack'||unit.combatDeployment?.resume.type==='attack';
    if(changedFireRule&&explicit&&!isAutomaticRepair(unit,mission.unitSpec(unit))){urgent.push(unit.id);clearMotion(unit);unit.driveSpeed=0;}
    if(changes.retreat==='never'&&unit.combatRetreat&&!unit.combatRetreat.forced){clearMotion(unit);cancelCombatRetreat(unit);unit.driveSpeed=0;}
    if(changes.retreat)unit.retreatSuppressed=false;
    if(changes.retreat&&unit.pendingOrder&&shouldAutoRetreat(unit,mission.unitSpec(unit))){startAutomaticRetreat(mission,unit,mission.unitSpec(unit));urgent.push(unit.id);}
    changed++;
  }
  if(urgent.length)mission.commandPlanner?.cancel(urgent);
  return changed?{ok:true,changed}:mission.fail('Выберите боевые машины');
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function rememberHostileHit(mission, unit, source) {
  const unitSpec=mission.config.units[unit.kind];
  if(!unitSpec)return;
  const invalidate=()=>{if(unit.pendingOrder&&shouldAutoRetreat(unit,unitSpec))startAutomaticRetreat(mission,unit,unitSpec);};
  if(!source?.id||source.owner===unit.owner){invalidate();return;}
  const spec=mission.config.units[source.kind]??mission.buildingSpec(source);
  unit.lastHostileHit={id:source.id,x:source.x,y:source.y,time:mission.state.time,range:spec.range??0};
  unit.retreatSuppressed=false;
  if(unit.combatRetreat){unit.combatRetreat.threat={...unit.lastHostileHit};delete unit.combatRetreat.failedSignature;}
  invalidate();
}
export function cancelCombatRetreat(unit, suppress=true) {
  delete unit.combatRetreat;
  delete unit.retreatPush;
  if(!inFactoryInterior(unit))delete unit.factoryVisit;
  unit.retreatSuppressed=suppress;
}
export function automaticCombatTarget(mission, unit, spec, excludedIds=null) {
  if(unit.owner!=='rai')return mission.nearestEnemy(unit,spec.range);
  const policy=combatPolicy(unit);
  if(policy.response==='ignore'||!spec.damage)return null;
  const retaliation=policy.response==='return';
  if(retaliation&&!unit.lastHostileHit)return null;
  let best=null,bestValue=Infinity,bestDistance=Infinity;
  const consider=target=>{
    if(isCampPerimeter(target)||target.campResource)return;
    if(excludedIds?.includes(target.id))return;
    if(!mission.enemyOf(unit,target)||!mission.visibleAt(target.x,target.y)||retaliation&&target.id!==unit.lastHostileHit.id)return;
    const d=distance(unit,target);if(d>spec.range)return;
    const enemySpec=mission.config.units[target.kind]??mission.buildingSpec(target);
    const value=policy.priority==='strongest'?-(target.maxHp??target.hp):policy.priority==='weakest'?target.hp
      :policy.priority==='dangerous'?-(enemySpec.damage??0)/Math.max(.05,enemySpec.cooldown??1):d;
    if((value<bestValue||value===bestValue&&(d<bestDistance||d===bestDistance&&target.id<(best?.id??'')))&&mission.lineOfSight(unit,target)){best=target;bestValue=value;bestDistance=d;}
  };
  for(const target of mission.nearbyUnits(unit,spec.range,unit.owner))consider(target);
  for(const target of mission.state.buildings)consider(target);
  return best;
}
function retreatThreat(mission, unit, spec) {
  const hit=unit.lastHostileHit;
  if(hit&&mission.state.time-hit.time<=10)return hit;
  if(!['attack','attack-move','combat-position'].includes(unit.task?.type))return null;
  const targetId=unit.combatDeployment?.targetId??unit.task.targetId;
  const target=targetId?mission.entity(targetId):mission.nearestEnemy(unit,spec.vision);
  if(!target||!mission.visibleAt(target.x,target.y)||distance(unit,target)>spec.vision)return null;
  const targetSpec=mission.config.units[target.kind]??mission.buildingSpec(target);
  return {id:target.id,x:target.x,y:target.y,range:targetSpec.range??0};
}
function clearMotion(unit) {
  unit.path=[];unit.task=null;
  delete unit.retreatPush;
  delete unit.combatDeployment;delete unit.combatGroup;delete unit.combatResume;delete unit.combatParking;
  for(const key of ['detour','traffic','trafficHold','passage','passingLane','driveWatch','routeOrder','routeContinuation','failedArcs','reverseDebt','yieldReturn','pendingOrder','commandRevision','resumeConstructionId','combatDisengage'])delete unit[key];
}
export function startAutomaticRetreat(mission,unit,spec){
 const resume=unit.combatRetreat?.resume??rememberRetreatOrder(mission,unit),threat=retreatThreat(mission,unit,spec);
 clearMotion(unit);
 unit.builderWorking=false;unit.builderContact=null;
 if(unit.tool>0)unit.foldTime=Math.max(unit.foldTime??0,2.6);
 unit.combatRetreat={status:'planning',resume,threat:threat?{...threat}:null,started:mission.state.time};
 mission.radioObserver?.retreatOrder?.([unit.id],false);
 return unit.combatRetreat;
}
export function forceCombatRetreat(mission,ids){
 const selected=new Set(ids),units=mission.state.units.filter(unit=>selected.has(unit.id)&&unit.owner==='rai'&&unit.hp>0);
 if(!units.length)return mission.fail('Не выбрана техника');
 mission.commandPlanner?.cancel(units.map(unit=>unit.id));
 for(const unit of units){
  const threat=retreatThreat(mission,unit,mission.unitSpec(unit));
  clearMotion(unit);
  unit.builderWorking=false;unit.builderContact=null;
  if(unit.tool>0)unit.foldTime=Math.max(unit.foldTime??0,2.6);
  unit.combatRetreat={forced:true,status:'planning',threat:threat?{...threat}:null,started:mission.state.time};
 }
 mission.radioObserver?.retreatOrder?.(units.map(unit=>unit.id),true);
 return {ok:true,assigned:units.length};
}
function retreatHome(mission,unit){
  const rank={factory:0,lab:1,generator:2};
  const bases=mission.state.buildings.filter(b=>b.owner===unit.owner&&b.hp>0&&b.completed&&rank[b.kind]!=null)
    .sort((a,b)=>rank[a.kind]-rank[b.kind]||distance(unit,a)-distance(unit,b));
  const base=chooseRepairFactory(mission,unit)??bases[0];
  return base?{id:base.id,x:base.x,y:base.y,radius:Math.hypot(base.halfWidth,base.halfDepth)+mission.config.worldScale*9}
    :{...mission.field.gridToWorld(mission.config.startGrid),radius:mission.config.worldScale*10};
}
function retreatConditions(mission,unit,retreat){
 const home=retreat.home,margin=mission.config.worldScale*18;
 const nearby=p=>p.x>=Math.min(unit.x,home.x)-margin&&p.x<=Math.max(unit.x,home.x)+margin
  &&p.y>=Math.min(unit.y,home.y)-margin&&p.y<=Math.max(unit.y,home.y)+margin;
 const parked=mission.state.units.filter(other=>other!==unit&&other.hp>0&&nearby(other)
  &&(!other.path.length||other.combatRetreat?.destination));
 const liveThreat=retreat.threat?.id&&mission.entity(retreat.threat.id);
 const contact=liveThreat&&mission.visibleAt(liveThreat.x,liveThreat.y)?[liveThreat.id,liveThreat.x,liveThreat.y,liveThreat.hp]:retreat.threat;
 return JSON.stringify([mission.nav.topologyRevision,mission.state.bounds,unit.x,unit.y,home,contact,
  mission.inBounds(home.x,home.y),mission.exploredAt(home.x,home.y),unit.lastHostileHit,
  parked.map(other=>[other.id,other.path.length?other.combatRetreat.destination:{x:other.x,y:other.y,heading:other.heading}]),
  mission.state.buildings.filter(b=>b.owner===unit.owner&&b.hp>0&&b.completed).map(b=>[b.id,b.kind,b.x,b.y])]);
}
function* homePath(mission,unit,retreat,known){
  const home=retreat.home,scale=mission.config.worldScale,angle=Math.atan2(unit.y-home.y,unit.x-home.x);
  const goals=home.id?[]:[{x:home.x,y:home.y}];
  for(let ring=0;ring<4;ring++){
   const radius=home.radius+ring*scale*6,sectors=Math.max(12,Math.floor(Math.PI*2*radius/(scale*6)));
   for(let i=0;i<sectors;i++){
    const a=angle+(i%2?1:-1)*Math.ceil(i/2)*Math.PI*2/sectors;
    goals.push({x:home.x+Math.cos(a)*radius,y:home.y+Math.sin(a)*radius});
   }
  }
  // Keep lateral order on a common approach. Nearer members receive the
  // deeper rows, so early arrivals cannot fence off later parking slots.
  const group=mission.state.units.filter(other=>other.owner===unit.owner&&other.hp>0
    &&(other.combatRetreat?.forced||shouldAutoRetreat(other,mission.unitSpec(other))));
  if(group.length>1){
   const centre=group.reduce((p,u)=>({x:p.x+u.x/group.length,y:p.y+u.y/group.length}),{x:0,y:0});
   const length=Math.max(1,distance(centre,home)),fx=(home.x-centre.x)/length,fy=(home.y-centre.y)/length;
   const side=u=>u.x*fy-u.y*fx,along=u=>u.x*fx+u.y*fy;
   group.sort((a,b)=>Math.round(side(a)/scale)-Math.round(side(b)/scale)||along(b)-along(a)||a.id.localeCompare(b.id));
   const columns=Math.ceil(Math.sqrt(group.length)),rows=Math.ceil(group.length/columns),index=group.indexOf(unit);
   const column=Math.floor(index/rows),row=index%rows,spacing=scale*8;
   const lateral=(column-(columns-1)/2)*spacing,depth=home.radius+row*spacing;
   goals.unshift({x:home.x+fy*lateral-fx*depth,y:home.y-fx*lateral-fy*depth});
  }
  const base=home.id&&mission.entity(home.id),service=base&&mission.buildingSpec(base).repair;
  const safe=p=>mission.inBounds(p.x,p.y)&&mission.exploredAt(p.x,p.y)
    &&(!service||factoryCanRepair(mission,base,p))
    &&known.every(e=>distance(p,e)>e.range+scale*5)
    &&mission.state.units.every(other=>other===unit||other.hp<=0||distance(p,other.combatRetreat?.destination??other)>scale*5.3);
  for(const goal of goals){
    yield;if(!safe(goal))continue;
    const path=yield* mission.vehiclePathSteps(unit,goal,{fallback:false,maxGoalDistance:4});
    if(!path?.length||!safe(path.at(-1)))continue;
    // A route may turn laterally to reach a road. It must not cut deeper
    // through a known firing zone merely because its endpoint is safe.
    let from=unit,clear=true;
    for(const point of path){
      for(const enemy of known){
        const dx=point.x-from.x,dy=point.y-from.y,t=Math.max(0,Math.min(1,((enemy.x-from.x)*dx+(enemy.y-from.y)*dy)/Math.max(.01,dx*dx+dy*dy)));
        if(distance({x:from.x+dx*t,y:from.y+dy*t},enemy)<Math.min(distance(unit,enemy),enemy.range*.8)-scale*2){clear=false;break;}
      }
      if(!clear)break;from=point;
    }
    if(clear)return path;
  }
  return null;
}
// Searches and local movement can span frames. A newer player command must
// invalidate them at the next yield, before they can publish an old route.
function* currentRetreatSteps(iterator,current){
 try{
  while(current()){
   const step=iterator.next();if(step.done)return step.value;
   yield step.value;
  }
  return null;
 }finally{iterator.return();}
}

function repairBlocker(mission,unit,factory){
  const owner=factoryVisitors(mission,factory).find(other=>other!==unit&&
    ['gate','entering'].includes(other.factoryVisit.phase));
  return owner?.id??null;
}

function withdrawalPoints(origin,home,away,travel,turns=[0,.45,-.45,.9,-.9,1.35,-1.35]){
  const pointAt=angle=>({x:origin.x+Math.cos(angle)*travel,y:origin.y+Math.sin(angle)*travel});
  const escape=turns.map(turn=>pointAt(away+turn));
  const startDistance=distance(origin,home);
  const advances=point=>distance(point,home)<startDistance;
  const preferred=escape.filter(advances);
  const bearing=Math.atan2(home.y-origin.y,home.x-origin.x);
  for(const turn of [0,.45,-.45]){
    const point=pointAt(bearing+turn);
    if(advances(point)&&!preferred.some(other=>distance(point,other)<.01))preferred.push(point);
  }
  preferred.sort((a,b)=>distance(a,home)-distance(b,home));
  return [...preferred,...escape.filter(point=>!advances(point))];
}

function* withdrawalDetour(mission,unit,spec,home,current){
  const scale=mission.config.worldScale;
  const range=Math.max(spec.vision??0,spec.range??0,unit.lastHostileHit?.range??0,scale*30);
  const known=[];
  let threat,exposure=0;
  for(const enemy of [...mission.nearbyUnits(unit,range,unit.owner),...mission.state.buildings]){
    if(!mission.enemyOf(unit,enemy)||!mission.visibleAt(enemy.x,enemy.y))continue;
    const weapon=mission.config.units[enemy.kind]??mission.buildingSpec(enemy);
    if(!weapon.damage||!(weapon.range>0))continue;
    const contact={x:enemy.x,y:enemy.y,range:weapon.range};
    known.push(contact);
    const danger=weapon.range-distance(unit,enemy);
    if(danger>=exposure&&mission.lineOfSight(enemy,unit)){threat=contact;exposure=danger;}
  }
  if(!threat)return null;
  const origin={x:unit.x,y:unit.y};
  const angle=Math.atan2(origin.y-threat.y,origin.x-threat.x);
  const travel=Math.max(scale*18,exposure+scale*10);
  const safe=point=>known.every(enemy=>distance(point,enemy)>enemy.range+scale*5);
  const startDistance=distance(origin,home);
  let fallback=null;
  for(const point of withdrawalPoints(origin,home,angle,travel)){
    const towardsBase=distance(point,home)<startDistance;
    if(!towardsBase&&fallback)return fallback;
    if(!mission.inBounds(point.x,point.y)||!mission.exploredAt(point.x,point.y)||!safe(point))continue;
    yield;
    if(!current())return null;
    const path=yield* currentRetreatSteps(mission.vehiclePathSteps(unit,point,{avoidMoving:true,fallback:false,maxGoalDistance:scale}),current);
    if(!current())return null;
    if(!path?.length||!safe(path.at(-1)))continue;
    let from=origin;
    let approachesEnemy=false;
    for(const to of path){
      const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy;
      if(known.some(enemy=>{
        const t=length?Math.max(0,Math.min(1,((enemy.x-from.x)*dx+(enemy.y-from.y)*dy)/length)):0;
        const closest={x:from.x+t*dx,y:from.y+t*dy};
        return distance(closest,enemy)<Math.min(distance(origin,enemy),enemy.range)-scale*2;
      })) {approachesEnemy=true;break;}
      from=to;
    }
    if(approachesEnemy)continue;
    if(!towardsBase||distance(path.at(-1),home)<startDistance)return path;
    // The navigator may offset the requested endpoint. Keep a safe escape
    // while checking whether the remaining candidates can still gain ground.
    fallback??=path;
  }
  return fallback;
}
// Uses the existing yielding path search and swept vehicle movement. A retreat
// never jumps the vehicle to a point or disables collision checks.
export function* updateCombatRetreat(mission, unit, spec, dt) {
  if(unit.owner!=='rai'||!canAutoRetreat(spec)&&!unit.combatRetreat?.forced)return false;
  let retreat=unit.combatRetreat;
  if(!retreat) {
    if(!shouldAutoRetreat(unit,spec))return false;
    retreat=startAutomaticRetreat(mission,unit,spec);
  }
  const current=()=>unit.hp>0&&unit.combatRetreat===retreat&&!unit.pendingOrder;
  // Upgrade old saves whose retreat stopped at an arbitrary escape point.
  const existingBase=retreat.home?.id&&mission.entity(retreat.home.id);
  const replacement=!retreat.home||!existingBase||existingBase.hp<=0||!existingBase.completed||existingBase.kind!=='factory'||repairChoiceDue(mission,unit)
   ?retreatHome(mission,unit):retreat.home;
  if(!retreat.home||replacement.id!==retreat.home.id||replacement.x!==retreat.home.x||replacement.y!==retreat.home.y){
    // A destroyed factory (or a newly built one replacing the fallback base)
    // changes the service destination, including while already en route.
    if(unit.factoryVisit&&['approach','waiting'].includes(unit.factoryVisit.phase))delete unit.factoryVisit;
    if(existingBase&&replacement.id!==existingBase.id)mission.emit('factory-repair-rerouted',{unit:unit.id,from:existingBase.id,to:replacement.id});
    retreat.home=replacement;
    if(retreat.phase!=='cover'){
      clearMotion(unit);retreat.status='planning';
      delete retreat.destination;delete retreat.phase;delete retreat.service;
      delete retreat.failedSignature;
    }
  }
  const serviceBase=retreat.home?.id&&mission.entity(retreat.home.id);
  const garage=serviceBase?.kind==='factory'&&(unit.factoryVisit||retreat.service!=='complete'&&needsFactoryVisit(unit,serviceBase));
  const inCover=retreat.phase==='cover';
  const busy=garage?repairBlocker(mission,unit,serviceBase):null;
  const stalled=unit.navigation?.waitSeconds>=.6||retreat.status==='blocked';
  const stoppedInCover=inCover&&!unit.path.length;
  // A vehicle in the doorway finishes that checked transfer. Outside, keep
  // the old route until an alternative has been found.
  const visit=unit.factoryVisit;
  if(!inFactoryInterior(unit)&&visit?.phase!=='departure'&&!unit.detour&&!unit.yieldReturn&&!unit.jointTraffic
    &&(stalled||stoppedInCover||busy&&!inCover)&&mission.state.time>=(retreat.nextCoverSearchAt??0)){
    retreat.nextCoverSearchAt=mission.state.time+1.5;
    const topology=mission.nav.topologyRevision,{x,y,heading}=unit;
    const valid=()=>current()&&unit.factoryVisit===visit&&mission.nav.topologyRevision===topology&&unit.x===x&&unit.y===y&&unit.heading===heading;
    const path=yield* currentRetreatSteps(withdrawalDetour(mission,unit,spec,retreat.home,valid),valid);
    if(!valid())return true;
    if(path){
      if(serviceBase?.garageGate===unit.id)delete serviceBase.garageGate;
      delete unit.factoryVisit;
      clearMotion(unit);
      delete retreat.failedSignature;
      delete retreat.service;
      retreat.destination={...path.at(-1)};
      retreat.phase='cover';
      retreat.status='moving';
      unit.path=path;
      unit.task={type:'move',...retreat.destination};
      unit.routeOrder={revision:2,type:'retreat',request:{...retreat.destination},destination:{...retreat.destination}};
      mission.emit('retreat-detour',{unit:unit.id,blocker:busy??unit.navigation?.blockerId??null,destination:retreat.destination});
    }
  }
  if(retreat.phase==='cover'){
    if(unit.path.length||unit.detour||unit.yieldReturn){
      yield* currentRetreatSteps(mission.moveSteps(unit,dt),current);
      return true;
    }
    if(busy){
      unit.driveSpeed=0;
      navigationDecision(unit,'WAITING_RESERVATION','retreat-cover-until-repair-free',busy,'resume-repair');
      return true;
    }
    delete retreat.phase;
    delete retreat.destination;
    retreat.status='planning';
  }
  // The garage uses checked doorway routes, independent of the repair radius.
  if(serviceBase?.kind!=='factory'&&retreat.phase==='home'&&retreat.destination&&serviceBase&&mission.buildingSpec(serviceBase).repair
   &&!factoryCanRepair(mission,serviceBase,retreat.destination)){
    const rejected={...retreat.destination};clearMotion(unit);retreat.status='planning';
    delete retreat.destination;delete retreat.phase;delete retreat.service;delete retreat.failedSignature;
    mission.emit('navigation-retreat-destination-rejected',{unit:unit.id,factory:serviceBase.id,
     destination:rejected,reason:'outside-factory-apron'});
  }
  // An existing visit owns physical space at the door or inside the hall.
  // Healthy arrivals use the exterior retreat positions unless the factory
  // was explicitly configured for modernization.
  if(garage){
    return yield* updateFactoryVisit(mission,unit,serviceBase,dt);
  }
  if(retreat.status==='blocked'||retreat.status==='planning'){
    const home=retreatHome(mission,unit);
    if(home.id!==retreat.home.id||home.x!==retreat.home.x||home.y!==retreat.home.y){retreat.home=home;delete retreat.failedSignature;}
  }
  if(retreat.status==='arrived'||retreat.status==='yielding') {
    if(unit.detour||unit.yieldReturn||unit.task?.yieldHome){
      // A home position can be borrowed for a real passing vehicle. Arrival
      // must not freeze the already checked parking/return manoeuvre.
      retreat.status='yielding';yield* currentRetreatSteps(mission.moveSteps(unit,dt),current);
      if(!current())return true;
      if(unit.detour||unit.yieldReturn||unit.path.length||unit.task)return true;
    }
    if(retreat.destination&&distance(unit,retreat.destination)<2){
      retreat.status='arrived';unit.driveSpeed=0;
      return true;
    }
    // Old saves used an eight-world-unit arrival radius. Finish their real
    // approach to the same accepted destination instead of keeping that gap.
    retreat.status='moving';
  }
  const conditions=!unit.path.length?retreatConditions(mission,unit,retreat):null;
  if(!unit.path.length&&retreat.failedSignature!==conditions) {
    const topology=mission.nav.topologyRevision,x=unit.x,y=unit.y,heading=unit.heading;
    const planningCurrent=()=>current()&&mission.nav.topologyRevision===topology&&unit.x===x&&unit.y===y&&unit.heading===heading;
    const threat=retreat.threat,scale=mission.config.worldScale;
    const live=threat&&mission.entity(threat.id);
    // Only update a contact with visible information. A hidden attacker is not tracked.
    if(live&&mission.visibleAt(live.x,live.y)){threat.x=live.x;threat.y=live.y;}
    const angle=threat&&distance(unit,threat)>.01?Math.atan2(unit.y-threat.y,unit.x-threat.x):unit.heading+Math.PI/2;
    const travel=Math.max(spec.range??0,threat?.range??0)+scale*10;
    const known=[];
    for(const enemy of [...mission.nearbyUnits(unit,travel*2,unit.owner),...mission.state.buildings]) {
      if(!mission.enemyOf(unit,enemy)||!mission.visibleAt(enemy.x,enemy.y))continue;
      const weapon=mission.config.units[enemy.kind]??mission.buildingSpec(enemy);
      if(weapon.damage)known.push({x:enemy.x,y:enemy.y,range:weapon.range??0});
    }
    const returningHome=retreat.phase==='home'&&retreat.destination;
    const home=yield* currentRetreatSteps(returningHome
      ?mission.vehiclePathSteps(unit,retreat.destination,{fallback:false,maxGoalDistance:.01})
      :homePath(mission,unit,retreat,known),planningCurrent);
    if(!planningCurrent())return true;
    if(home){
      unit.path=home;unit.task={type:'move',...home.at(-1)};
      if(!returningHome)retreat.destination={...home.at(-1)};
      retreat.status='moving';retreat.phase='home';
      unit.routeOrder={revision:2,type:'retreat',request:{...retreat.destination},destination:{...retreat.destination}};
    }
    const safe=point=>distance(point,threat)>Math.max(distance(unit,threat)+scale*8,threat.range+scale*5)
      &&known.every(enemy=>distance(point,enemy)>enemy.range+scale*5);
    const escapeGoals=threat&&!home?withdrawalPoints(unit,retreat.home,angle,travel,[0,.4,-.4,.8,-.8,1.2,-1.2]):[];
    for(const goal of escapeGoals) {
      yield;
      if(!planningCurrent())return true;
      if(!mission.inBounds(goal.x,goal.y)||!mission.exploredAt(goal.x,goal.y)||!safe(goal))continue;
      const path=yield* currentRetreatSteps(mission.vehiclePathSteps(unit,goal,{fallback:false,maxGoalDistance:8}),planningCurrent);
      if(!planningCurrent())return true;
      if(!path?.length||!safe(path.at(-1)))continue;
      // Reject routes looping towards the known attacker to reach a distant endpoint.
      if(path.some(p=>distance(p,threat)<distance(unit,threat)-scale*2))continue;
      unit.path=path;unit.task={type:'move',...path.at(-1)};
      retreat.destination={...path.at(-1)};retreat.status='moving';retreat.phase='escape';
      break;
    }
    delete retreat.retryAt;
    if(!unit.path.length){retreat.failedSignature=conditions;retreat.status='blocked';unit.driveSpeed=0;}
    else delete retreat.failedSignature;
  }
  if(unit.path.length||unit.detour||unit.yieldReturn)yield* currentRetreatSteps(mission.moveSteps(unit,dt),current);
  if(!current())return true;
  if(retreat.destination&&!unit.path.length&&!unit.detour&&!unit.yieldReturn&&distance(unit,retreat.destination)<2){
    retreat.status=retreat.phase==='home'?'arrived':'planning';delete retreat.failedSignature;unit.task=null;unit.driveSpeed=0;
  }
  return true;
}
