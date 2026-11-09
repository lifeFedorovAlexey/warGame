import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance,vehicleEnvelope,footprintSupport,vehicleGroundSafe} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

// Seeded integration sampling, not a collection of hand-corrected routes.
// Every candidate is chosen before submitOrder. Failed simulations are retained,
// never replaced by a more convenient seed/site. Navigation/physics methods are
// never stubbed; --navigation-only explicitly disables weapons and battle waves.
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=read('assets/campaign/alpha/mission01/gameplay.json');
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),round=n=>Number.isFinite(n)?+n.toFixed(4):null;
const sourcePaths=['campaign/mission.js','campaign/navigation.js','campaign/vehicle-motion.js','campaign/vehicle-dynamics.js','campaign/vehicle-collision.js',
 'campaign/traffic-coordinator.js','campaign/road-traffic.js','campaign/road-merge.js','campaign/traffic-start.js','campaign/command-planner.js',
 'campaign/arrival-planner.js','campaign/passage-reservations.js','campaign/turning-headway.js','campaign/maneuver-admission.js',
 'campaign/traffic-shortcut.js','campaign/traffic-cycle.js','campaign/navigation-state.js','campaign/shared-route-tree.js',
 'campaign/combat-policy.js','campaign/combat-deployment.js','campaign/combat-orders.js','campaign/group-command.js',
 'demo/map-route.js','demo/mesa-shaping.js','demo/road-heightfield.js','demo/road-grading.js','assets/campaign/alpha/mission01/gameplay.json',
 'assets/maps/alpha/heightfield.json','assets/maps/alpha/roads.json'];
const hashSources=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const loadedSources=hashSources();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,12);
function random(seed){let state=seed>>>0;return ()=>{state+=0x6d2b79f5;let t=Math.imul(state^state>>>15,1|state);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
function shuffle(values,rng){const result=values.slice();for(let i=result.length-1;i;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
let field,topologyCache;
function realField(){if(!field){const raw=createHeightfield(read('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
 field=refineRoadHeightfield(raw);applyRoadGrades(field,read('assets/maps/alpha/roads.json'));}return field;}
function setup(cfg=config){const m=new Mission(cfg,realField());m.state.pendingCinematics=[];
 // Sample the authored final mission area. This unlocks visibility/bounds only;
 // terrain, building footprints, initial vehicles, enemy AI and waves are retained.
 m.state.bounds=cfg.finalMapBounds.slice();m.rebuildNavigation();m.explored.fill(1);return m;}
function disableBattle(m){
 // Keep every original live body, footprint and owner in the navigation scene.
 // No enemies are perceived/fired upon; the raid/wave schedulers cannot add new
 // combat orders. Movement, collision damage, terrain and ordinary mission logic
 // continue through the unchanged production methods.
 m.enemyOf=()=>false;m.attack=()=>{};m.updateRaid=()=>{};
 m.config={...m.config,camps:m.config.camps.map(c=>({...c,wave:null}))};
}
export {setup as createMapSampleMission,disableBattle as disableMapSampleBattle};
function solidGap(unit,solid,m){const s=vehicleEnvelope(unit,m.config.worldScale,m.field);let gap=-Infinity;
 for(const [x,y] of [[1,0],[0,1],[s.c,s.s],[-s.s,s.c]])gap=Math.max(gap,
  Math.abs((s.x-solid.x)*x+(s.y-solid.y)*y)-footprintSupport(s,x,y)-solid.halfWidth*Math.abs(x)-solid.halfDepth*Math.abs(y));return gap;}
function connectedSamples(m){
 const n=m.nav.size,key=digest({bounds:m.state.bounds,solids:m.nav.solids.map(s=>[s.id,s.x,s.y,s.halfWidth,s.halfDepth]),config:m.config});
 if(topologyCache?.key===key)return topologyCache;
 const labels=new Int32Array(n*n),queue=new Int32Array(n*n),sizes=[];let label=0;
 // Four-neighbour grid connectivity is a sampling constraint only. It does not
 // warm A* caches, prove an Ackermann route, or bypass any physical edge check.
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){
  const first=row*n+col;if(labels[first]||!m.nav.allowed(col,row))continue;label++;let head=0,tail=0;
  labels[first]=label;queue[tail++]=first;
  while(head<tail){const id=queue[head++],x=id%n,y=Math.floor(id/n);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,next=ny*n+nx;
    if(nx>=0&&ny>=0&&nx<n&&ny<n&&!labels[next]&&m.nav.allowed(nx,ny)){labels[next]=label;queue[tail++]=next;}}
  }sizes[label]=tail;
 }
 const pools={all:[],road:[],slope:[],building:[]};
 for(let row=0;row<n;row+=4)for(let col=0;col<n;col+=4){const id=row*n+col;if(!labels[id]||sizes[labels[id]]<100)continue;
  const p=m.nav.position(col,row),g=m.field.gradientAt(p.x,p.y),slope=Math.hypot(g.x,g.y),road=m.nav.roads.nearest(p,24),
   buildingDistance=Math.min(...m.nav.solids.map(s=>Math.hypot(Math.max(0,Math.abs(p.x-s.x)-s.halfWidth),Math.max(0,Math.abs(p.y-s.y)-s.halfDepth))));
  const sample={...p,component:labels[id],slope,road:road?{id:road.segment.pathId,distance:road.distance,width:road.width}:null,buildingDistance};
  pools.all.push(sample);if(road)pools.road.push(sample);if(slope>=.025&&slope<=.35)pools.slope.push(sample);
  if(buildingDistance>=35&&buildingDistance<=180)pools.building.push(sample);
 }
 return topologyCache={key,labels,sizes,pools};
}
function generate(m,seed,count){
 const rng=random(seed),topology=connectedSamples(m),mode=['road','slope','building'][seed%3],rejected=[];
 const headingOffset=[0,Math.PI/2,Math.PI,-Math.PI/2][Math.floor(seed/3)%4],columns=Math.ceil(Math.sqrt(count*1.4)),spacing=30+4*rng();
 // Building variants approach existing authored camps; other variants begin on
 // their named terrain. Enemy damage is retained and attributed in the report.
 const starts=shuffle(mode==='building'?topology.pools.all:topology.pools[mode],rng);
 for(const centre of starts.slice(0,1600)){
  const goalPool=(mode==='building'?topology.pools.building:topology.pools.all).filter(p=>p.component===centre.component&&distance(p,centre)>=400&&distance(p,centre)<=1400);
  if(!goalPool.length){rejected.push({centre,reason:'no-goal-in-same-grid-component'});continue;}
  const goal=goalPool[Math.floor(rng()*goalPool.length)],course=Math.atan2(centre.x-goal.x,goal.y-centre.y),heading=course+headingOffset;
  const c=Math.cos(heading),s=Math.sin(heading),poses=[];let reason;
  for(let i=0;i<count;i++){
   const across=(i%columns-(columns-1)/2)*spacing,along=-Math.floor(i/columns)*spacing;
   const pose={kind:'bukhanka',hp:320,heading:heading+(rng()-.5)*.08,x:centre.x+across*c-along*s,y:centre.y+across*s+along*c};
   const [col,row]=m.nav.grid(pose.x,pose.y);
   if(topology.labels[row*m.nav.size+col]!==centre.component||!vehicleGroundSafe(vehicleEnvelope(pose,m.config.worldScale,m.field),.52)
    ||!m.vehicleMotionClear(pose,pose,pose)||poses.some(p=>vehicleClearance(pose,p,m.config.worldScale,m.field)<m.config.worldScale*.055)){
    reason='initial-full-hull-or-component';break;
   }poses.push(pose);
  }
  if(reason){rejected.push({centre,goal,reason});continue;}
  return {mode,headingOffset,spacing,columns,centre,goal,poses,rejected,componentSize:topology.sizes[centre.component],
   connectivity:'Four-neighbour walkable grid; actual submitOrder and swept driving must still prove the route'};
 }
 return {mode,rejected,failure:'No legal complete starting group found in the fixed candidate limit; seed retained without replacement'};
}
export function runMapSample(seed,count,{seconds=180,directory='campaign/reports/navigation-map-samples',replay=null,navigationOnly=false}={}){
 const sources=loadedSources,begin=performance.now(),m=setup(replay?.config??config),selection=replay?.selection??generate(m,seed,count),
  profile=navigationOnly?'navigation-only':'campaign-stress';
 fs.mkdirSync(directory,{recursive:true});const file=`${directory}/seed-${seed}-n${count}.json`;
 if(selection.failure){const result={seed,count,profile,passed:false,failures:[selection.failure],selection,sourceHashes:sources,fixture:file};
  fs.writeFileSync(file,JSON.stringify({result,config:m.config,selection},null,2));return result;}
 let units;
 if(replay){const bounds=replay.initialSave.state.bounds.slice();m.load(structuredClone(replay.initialSave));m.state.bounds=bounds;m.rebuildNavigation();units=replay.ids.map(id=>m.entity(id));}
 else units=selection.poses.map(p=>m.addUnit(p.kind,'rai',p,{heading:p.heading,combatPolicy:{retreat:'never',response:'ignore',priority:'nearest'}}));
 if(navigationOnly)disableBattle(m);
 const ids=units.map(u=>u.id),initialSave=JSON.parse(m.save()),starts=new Map(units.map(u=>[u.id,{x:u.x,y:u.y,hp:u.hp}])),goals=new Map(),contacts=[],damage=[],penetrations=[],history=[],acceptedChanges=[];
 const metrics=new Map(units.map(u=>[u.id,{id:u.id,firstMotion:null,commandApplied:null,initialWaitReasons:{},travelled:0,idle:0,longestIdle:0,unclassified:0,longestUnclassified:0,reasons:{}}]));
 let collisionCount=0,minVehicleGap=Infinity,minBuildingGap=Infinity,frame=0,lastSample=-1,arrival=null;
 const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(u,speed,blockers)=>{
  if(ids.includes(u.id)){collisionCount++;contacts.push({time:m.state.time,id:u.id,speed,blockers:[...blockers].map(b=>({id:b.id,x:b.x,y:b.y,hp:b.hp})),x:u.x,y:u.y,heading:u.heading});}
  return collision(u,speed,blockers);
 };
 const applyDamage=m.damage.bind(m);m.damage=(u,amount,source,contact)=>{const before=u.hp,result=applyDamage(u,amount,source,contact);
  if(ids.includes(u.id)&&u.hp<before)damage.push({time:m.state.time,id:u.id,amount,before,after:u.hp,source:source&&{id:source.id,owner:source.owner,kind:source.kind},contact});return result;};
 const start=performance.now(),order=m.submitOrder(ids,'move',selection.goal),commandCpuMs=performance.now()-start,cpu=[];
 const completed=u=>u.hp>0&&goals.has(u.id)&&distance(u,goals.get(u.id))<2&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&!u.pendingOrder;
 while(frame/80<seconds){
  const previous=new Map(units.map(u=>[u.id,{x:u.x,y:u.y}])),started=performance.now();m.advance(1/80,{budgetMs:m.config.simulationCpuBudgetMs});cpu.push(performance.now()-started);frame++;
  for(const u of units){
   if(u.commandRevision===order.revision&&u.routeOrder?.destination){const prior=goals.get(u.id),current=u.routeOrder.destination;
    if(!prior)goals.set(u.id,{x:current.x,y:current.y});else if(distance(prior,current)>.001)acceptedChanges.push({time:m.state.time,id:u.id,prior,current:{...current}});}
   const row=metrics.get(u.id),travelled=distance(u,previous.get(u.id));row.travelled+=travelled;
   if(row.commandApplied===null&&!u.pendingOrder&&u.commandRevision===order.revision)row.commandApplied={frame:frame/80,simulation:m.state.time};
   if(row.firstMotion===null&&distance(u,starts.get(u.id))>=.5)row.firstMotion={frame:frame/80,simulation:m.state.time};
   if(row.firstMotion===null){const reason=u.navigation?.reason??(u.pendingOrder?'command-not-yet-ticked':'missing-diagnostic');
    row.initialWaitReasons[reason]=(row.initialWaitReasons[reason]??0)+1/80;}
   if(!completed(u)&&u.hp>0&&travelled<1e-4){row.idle+=1/80;row.longestIdle=Math.max(row.longestIdle,row.idle);
    const reason=u.navigation?.reason??'missing-diagnostic';row.reasons[reason]=(row.reasons[reason]??0)+1/80;
    row.unclassified=['unclassified-stop','missing-diagnostic'].includes(reason)?row.unclassified+1/80:0;
    row.longestUnclassified=Math.max(row.longestUnclassified,row.unclassified);
   }else{row.idle=0;row.unclassified=0;}
   if(travelled){for(const solid of m.nav.nearbySolids(u,40)){const gap=solidGap(u,solid,m);minBuildingGap=Math.min(minBuildingGap,gap);
     if(gap<-.0001)penetrations.push({time:m.state.time,id:u.id,solid:solid.id,gap});}
    for(const other of m.nearbyUnits(u,32)){if(other===u||other.hp<=0)continue;const gap=vehicleClearance(u,other,m.config.worldScale,m.field);minVehicleGap=Math.min(minVehicleGap,gap);
     if(gap<-.0001)penetrations.push({time:m.state.time,id:u.id,other:other.id,gap});}}
  }
  if(Math.floor(m.state.time)>lastSample){lastSample=Math.floor(m.state.time);history.push({time:m.state.time,frame:frame/80,
   units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,hp:u.hp,path:structuredClone(u.path),task:structuredClone(u.task),
    detour:structuredClone(u.detour),pendingOrder:structuredClone(u.pendingOrder),navigation:structuredClone(u.navigation),yieldReturn:structuredClone(u.yieldReturn)}))});}
  m.effects=[];if(units.every(completed)){arrival={frame:frame/80,simulation:m.state.time};break;}
 }
 const failures=[],arrived=units.filter(completed).length,dead=units.filter(u=>u.hp<=0).length;
 if(!order.ok)failures.push('Public Move was rejected');if(arrived!==count)failures.push(`${arrived}/${count} physically reached their immutable accepted goals; ${dead} dead`);
 const collisionDamage=damage.filter(d=>d.contact?.type==='collision'),enemyDamage=damage.filter(d=>d.source?.owner==='scavs'&&d.contact?.type!=='collision');
 if(collisionDamage.length)failures.push(`${collisionDamage.length} damaging collision events; all ${collisionCount} contacts recorded`);
 if(penetrations.length)failures.push(`${penetrations.length} hull penetrations`);if(acceptedChanges.length)failures.push('An accepted goal was changed during movement');
 if([...metrics.values()].some(r=>r.longestUnclassified>.50001))failures.push('An unexplained standstill exceeded 500 ms');
 const lateStarts=[...metrics.values()].filter(r=>!r.firstMotion||r.firstMotion.frame>.50001).map(r=>r.id);
 if(lateStarts.length)failures.push(`${lateStarts.length}/${count} vehicles exceeded the 500 ms first-motion diagnostic threshold; initial reasons recorded`);
 const sourceChanged=JSON.stringify(sources)!==JSON.stringify(hashSources());if(sourceChanged)failures.push('Sources changed during simulation; results cannot certify one revision');
 const sorted=cpu.slice().sort((a,b)=>a-b),result={seed,count,profile,mode:selection.mode,passed:!failures.length,failures,seconds:m.state.time,frameSeconds:frame/80,deadline:seconds,
  requestedGoal:selection.goal,order,acceptedGoals:Object.fromEntries(goals),arrived,dead,arrival,lateStarts,completionSafe:arrived===count&&!collisionDamage.length&&!penetrations.length,
  contacts,collisionCount,collisionDamage,enemyDamage,damage,penetrations,acceptedChanges,
  minVehicleGap:round(minVehicleGap),minBuildingGap:round(minBuildingGap),sourceHashes:sources,sourceChanged,fixture:file,
  units:units.map(u=>({...metrics.get(u.id),x:u.x,y:u.y,heading:u.heading,hp:u.hp,goal:goals.get(u.id),goalError:goals.has(u.id)?distance(u,goals.get(u.id)):null,
   finalNavigation:u.navigation,task:u.task,pendingOrder:u.pendingOrder})),
  cpuMs:{wall:performance.now()-begin,command:commandCpuMs,total:cpu.reduce((a,b)=>a+b,0),p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...cpu),scope:'Node simulation, not renderer FPS'}};
 fs.writeFileSync(file,JSON.stringify({replay:`node tools/check-navigation-map-samples.mjs --replay ${file}${navigationOnly?' --navigation-only':''}`,config:m.config,ids,selection,initialSave,history,finalSave:JSON.parse(m.save()),result},null,2));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const replayFile=option('--replay',null),replay=replayFile?read(replayFile):null;
 const navigationOnly=args.includes('--navigation-only')||replay?.result.profile==='navigation-only',profile=navigationOnly?'navigation-only':'campaign-stress';
 const pauseFile=option('--pause-file','campaign/reports/navigation-map-samples.pause');
 const seeds=replay?[replay.result.seed]:option('--seeds',Array.from({length:12},(_,i)=>20261108+i).join(',')).split(',').map(Number),
  counts=replay?[replay.result.count]:option('--counts','6,20,50').split(',').map(Number),seconds=Number(option('--seconds',180)),
  runId=profile+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+digest(loadedSources),directory=`campaign/reports/navigation-map-samples/${runId}`,results=[];
 fs.mkdirSync('campaign/reports',{recursive:true});
 cases:for(const seed of seeds)for(const count of counts){const result=runMapSample(seed,count,{seconds,directory,replay,navigationOnly});results.push(result);
  console.log(JSON.stringify({seed,count,mode:result.mode,passed:result.passed,failures:result.failures,arrived:result.arrived,contacts:result.collisionCount,fixture:result.fixture}));
  const report={runId,profile,scope:'Authored heightfield and building footprints; actual submitOrder, immutable seeds, no hand-authored paths',
   disabled:navigationOnly?['enemy perception (enemyOf)','weapon fire (attack)','raid scheduler (updateRaid)','camp waves (wave:null)']:[],
   visibility:'Final authored mission bounds revealed for sampling',scheduled:seeds.flatMap(seed=>counts.map(count=>({seed,count}))),
   pausedAfterCase:fs.existsSync(pauseFile),results};
  fs.writeFileSync(`campaign/reports/navigation-map-samples-${runId}.json`,JSON.stringify(report,null,2));
  fs.writeFileSync('campaign/reports/navigation-map-samples-latest.json',JSON.stringify(report,null,2));
  fs.writeFileSync(`campaign/reports/navigation-map-samples-${profile}-latest.json`,JSON.stringify(report,null,2));
  if(report.pausedAfterCase){console.log(JSON.stringify({pausedAfterCase:true,completed:results.length,requested:seeds.length*counts.length,pauseFile}));break cases;}
 }
 if(!args.includes('--diagnose'))assert(results.every(r=>r.passed),'Seeded authored-map cases failed; every result and exact initial save retained');
}
