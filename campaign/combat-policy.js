import {expandCommandIds} from './group-command.js';
import {isCampPerimeter} from './camp-demolition.js';

// Per-unit, serializable rules. Defaults preserve the existing aggressive AI.
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
export function shouldAutoRetreat(unit,spec){
 const threshold={light:.8,heavy:.35}[combatPolicy(unit).retreat];
 return unit.owner==='rai'&&unit.hp>0&&!!spec.damage&&!!threshold&&!unit.retreatSuppressed
  &&unit.hp<=unit.maxHp*threshold;
}
export function normalizeCombatPolicy(value) {
  return Object.fromEntries(Object.keys(COMBAT_OPTIONS).map(key=>[key,
    COMBAT_OPTIONS[key].some(option=>option.value===value?.[key]) ? value[key] : DEFAULT_COMBAT_POLICY[key]]));
}
export function configureCombat(mission, ids, changes) {
  const keys=Object.keys(changes??{});
  if(!keys.length||keys.some(key=>!COMBAT_OPTIONS[key]?.some(o=>o.value===changes[key])))return mission.fail('Недопустимая настройка атаки');
  const selected=new Set(expandCommandIds(mission,ids)),urgent=[];let changed=0;
  for(const unit of mission.state.units) {
    if(!selected.has(unit.id)||unit.hp<=0||unit.owner!=='rai'||!mission.unitSpec(unit).damage)continue;
    const previous=combatPolicy(unit);
    unit.combatPolicy={...previous,...changes};
    // A newer rule must take effect during an explicit attack too. Release
    // its old target; a subsequent direct attack remains a deliberate override.
    const changedFireRule=keys.some(key=>key==='response'||key==='priority');
    const explicit=unit.pendingOrder?.type==='attack'||unit.task?.type==='attack'||unit.combatDeployment?.resume.type==='attack';
    if(changedFireRule&&explicit){urgent.push(unit.id);clearMotion(unit);unit.driveSpeed=0;}
    if(changes.retreat==='never'&&unit.combatRetreat&&!unit.combatRetreat.forced){clearMotion(unit);cancelCombatRetreat(unit);unit.driveSpeed=0;}
    if(changes.retreat)unit.retreatSuppressed=false;
    if(changes.retreat&&unit.pendingOrder&&shouldAutoRetreat(unit,mission.unitSpec(unit)))urgent.push(unit.id);
    changed++;
  }
  if(urgent.length)mission.commandPlanner?.cancel(urgent);
  return changed?{ok:true,changed}:mission.fail('Выберите боевые машины');
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function rememberHostileHit(mission, unit, source) {
  const unitSpec=mission.config.units[unit.kind];
  if(!unitSpec)return;
  const invalidate=()=>{if(unit.pendingOrder&&shouldAutoRetreat(unit,unitSpec)){delete unit.pendingOrder;delete unit.commandRevision;}};
  if(!source?.id||source.owner===unit.owner){invalidate();return;}
  const spec=mission.config.units[source.kind]??mission.buildingSpec(source);
  unit.lastHostileHit={id:source.id,x:source.x,y:source.y,time:mission.state.time,range:spec.range??0};
  unit.retreatSuppressed=false;
  if(unit.combatRetreat){unit.combatRetreat.threat={...unit.lastHostileHit};delete unit.combatRetreat.failedSignature;}
  invalidate();
}
export function cancelCombatRetreat(unit, suppress=true) {
  delete unit.combatRetreat;
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
    if(isCampPerimeter(target))return;
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
  delete unit.combatDeployment;delete unit.combatGroup;delete unit.combatResume;delete unit.combatParking;
  for(const key of ['detour','traffic','trafficHold','passage','passingLane','driveWatch','routeOrder','failedArcs','reverseDebt','yieldReturn','pendingOrder','commandRevision','resumeConstructionId','combatDisengage'])delete unit[key];
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
 return {ok:true,assigned:units.length};
}
function retreatHome(mission,unit){
  const rank={factory:0,lab:1,generator:2};
  const bases=mission.state.buildings.filter(b=>b.owner===unit.owner&&b.hp>0&&b.completed&&rank[b.kind]!=null)
    .sort((a,b)=>rank[a.kind]-rank[b.kind]||distance(unit,a)-distance(unit,b));
  const base=bases[0];
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
  const safe=p=>mission.inBounds(p.x,p.y)&&mission.exploredAt(p.x,p.y)
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
// Uses the existing yielding path search and swept vehicle movement. A retreat
// never jumps the vehicle to a point or disables collision checks.
export function* updateCombatRetreat(mission, unit, spec, dt) {
  if(unit.owner!=='rai'||!spec.damage&&!unit.combatRetreat?.forced)return false;
  let retreat=unit.combatRetreat;
  if(!retreat) {
    if(!shouldAutoRetreat(unit,spec))return false;
    const threat=retreatThreat(mission,unit,spec);
    clearMotion(unit);
    retreat=unit.combatRetreat={status:'planning',threat:threat?{...threat}:null,started:mission.state.time};
  }
  const current=()=>unit.hp>0&&unit.combatRetreat===retreat&&!unit.pendingOrder;
  // Upgrade old saves whose retreat stopped at an arbitrary escape point.
  const existingBase=retreat.home?.id&&mission.entity(retreat.home.id);
  if(!retreat.home||retreat.home.id&&(!existingBase||existingBase.hp<=0||!existingBase.completed)){
    retreat.home=retreatHome(mission,unit);
    delete retreat.failedSignature;
    if(retreat.status==='arrived')retreat.status='planning';
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
      if(unit.cooldown<=0){const target=automaticCombatTarget(mission,unit,spec);if(target)mission.attack(unit,target,spec);}
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
    for(const turn of threat?[0,.4,-.4,.8,-.8,1.2,-1.2]:[]) {
      if(home)break;
      yield;
      if(!planningCurrent())return true;
      const goal={x:unit.x+Math.cos(angle+turn)*travel,y:unit.y+Math.sin(angle+turn)*travel};
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
  if(retreat.status!=='arrived'&&unit.cooldown<=0) {
    const target=automaticCombatTarget(mission,unit,spec);if(target)mission.attack(unit,target,spec);
  }
  return true;
}
