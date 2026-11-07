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
export function normalizeCombatPolicy(value) {
  return Object.fromEntries(Object.keys(COMBAT_OPTIONS).map(key=>[key,
    COMBAT_OPTIONS[key].some(option=>option.value===value?.[key]) ? value[key] : DEFAULT_COMBAT_POLICY[key]]));
}
export function configureCombat(mission, ids, changes) {
  const keys=Object.keys(changes??{});
  if(!keys.length||keys.some(key=>!COMBAT_OPTIONS[key]?.some(o=>o.value===changes[key])))return mission.fail('Недопустимая настройка атаки');
  const selected=new Set(ids);let changed=0;
  for(const unit of mission.state.units) {
    if(!selected.has(unit.id)||unit.hp<=0||unit.owner!=='rai'||!mission.unitSpec(unit).damage)continue;
    unit.combatPolicy={...combatPolicy(unit),...changes};
    if(changes.retreat==='never'&&unit.combatRetreat){clearMotion(unit);cancelCombatRetreat(unit);unit.driveSpeed=0;}
    if(changes.retreat)unit.retreatSuppressed=false;
    changed++;
  }
  return changed?{ok:true,changed}:mission.fail('Выберите боевые машины');
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function rememberHostileHit(mission, unit, source) {
  if(!source?.id||!mission.config.units[unit.kind]||source.owner===unit.owner)return;
  const spec=mission.config.units[source.kind]??mission.buildingSpec(source);
  unit.lastHostileHit={id:source.id,x:source.x,y:source.y,time:mission.state.time,range:spec.range??0};
  unit.retreatSuppressed=false;
}
export function cancelCombatRetreat(unit, suppress=true) {
  delete unit.combatRetreat;
  unit.retreatSuppressed=suppress;
}
export function automaticCombatTarget(mission, unit, spec) {
  if(unit.owner!=='rai')return mission.nearestEnemy(unit,spec.range);
  const policy=combatPolicy(unit);
  if(policy.response==='ignore'||!spec.damage)return null;
  const retaliation=policy.response==='return';
  if(retaliation&&!unit.lastHostileHit)return null;
  let best=null,bestValue=Infinity,bestDistance=Infinity;
  const consider=target=>{
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
  delete unit.combatDeployment;delete unit.combatGroup;
  for(const key of ['detour','traffic','trafficHold','passage','passingLane','driveWatch','routeOrder','failedArcs','reverseDebt'])delete unit[key];
}
// Uses the existing yielding path search and swept vehicle movement. A retreat
// never jumps the vehicle to a point or disables collision checks.
export function* updateCombatRetreat(mission, unit, spec, dt) {
  if(unit.owner!=='rai'||!spec.damage)return false;
  let retreat=unit.combatRetreat;
  const threshold={light:.8,heavy:.35}[combatPolicy(unit).retreat];
  if(!retreat) {
    if(!threshold||unit.retreatSuppressed||unit.hp>unit.maxHp*threshold)return false;
    const threat=retreatThreat(mission,unit,spec);if(!threat)return false;
    clearMotion(unit);
    retreat=unit.combatRetreat={status:'planning',threat:{...threat},retryAt:0,started:mission.state.time};
  }
  if(retreat.status==='arrived') {
    unit.driveSpeed=0;
    if(unit.cooldown<=0){const target=automaticCombatTarget(mission,unit,spec);if(target)mission.attack(unit,target,spec);}
    return true;
  }
  if(!unit.path.length&&mission.state.time>=retreat.retryAt) {
    const threat=retreat.threat,scale=mission.config.worldScale;
    const live=mission.entity(threat.id);
    // Only update a contact with visible information. A hidden attacker is not tracked.
    if(live&&mission.visibleAt(live.x,live.y)){threat.x=live.x;threat.y=live.y;}
    const angle=distance(unit,threat)>.01?Math.atan2(unit.y-threat.y,unit.x-threat.x):unit.heading+Math.PI/2;
    const travel=Math.max(spec.range,threat.range)+scale*10;
    const known=[];
    for(const enemy of [...mission.nearbyUnits(unit,travel*2,unit.owner),...mission.state.buildings]) {
      if(!mission.enemyOf(unit,enemy)||!mission.visibleAt(enemy.x,enemy.y))continue;
      const weapon=mission.config.units[enemy.kind]??mission.buildingSpec(enemy);
      if(weapon.damage)known.push({x:enemy.x,y:enemy.y,range:weapon.range??0});
    }
    const safe=point=>distance(point,threat)>Math.max(distance(unit,threat)+scale*8,threat.range+scale*5)
      &&known.every(enemy=>distance(point,enemy)>enemy.range+scale*5);
    for(const turn of [0,.4,-.4,.8,-.8,1.2,-1.2]) {
      yield;
      const goal={x:unit.x+Math.cos(angle+turn)*travel,y:unit.y+Math.sin(angle+turn)*travel};
      if(!mission.inBounds(goal.x,goal.y)||!mission.exploredAt(goal.x,goal.y)||!safe(goal))continue;
      const path=yield* mission.vehiclePathSteps(unit,goal,{fallback:false,maxGoalDistance:8});
      if(!path?.length||!safe(path.at(-1)))continue;
      // Reject routes looping towards the known attacker to reach a distant endpoint.
      if(path.some(p=>distance(p,threat)<distance(unit,threat)-scale*2))continue;
      unit.path=path;unit.task={type:'move',...path.at(-1)};
      retreat.destination={...path.at(-1)};retreat.status='moving';
      break;
    }
    retreat.retryAt=mission.state.time+2;
    if(!unit.path.length){retreat.status='blocked';unit.driveSpeed=0;}
  }
  if(unit.path.length)yield* mission.moveSteps(unit,dt);
  if(retreat.destination&&!unit.path.length&&distance(unit,retreat.destination)<8){
    retreat.status='arrived';unit.task=null;unit.driveSpeed=0;
  }
  if(retreat.status!=='arrived'&&unit.cooldown<=0) {
    const target=automaticCombatTarget(mission,unit,spec);if(target)mission.attack(unit,target,spec);
  }
  return true;
}
