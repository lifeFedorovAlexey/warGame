import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance,vehicleEnvelope,footprintSupport} from '../campaign/vehicle-collision.js';

// Independent acceptance from the owner's navigation specification, stage 10.
// Production physics, damage, goals and recovery are never replaced here.
// These CPU simulations are NOT renderer FPS/GPU benchmarks. A failing case
// still writes its exact starting save and diagnosis, then exits nonzero.
export const seed=20261108;
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const round=n=>Number.isFinite(n)?+n.toFixed(4):null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const done=u=>!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&!u.pendingOrder;
let commandMode=process.argv.includes('--sync')?'sync':'submit';
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null;
const sources=['campaign/mission.js','campaign/navigation.js','campaign/vehicle-motion.js','campaign/vehicle-collision.js',
 'campaign/traffic-coordinator.js','campaign/road-merge.js','campaign/traffic-start.js','campaign/command-planner.js',
 'campaign/passage-reservations.js','campaign/turning-headway.js','campaign/maneuver-admission.js','campaign/traffic-shortcut.js',
 'campaign/combat-deployment.js','campaign/combat-policy.js','campaign/group-command.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));

export const coverage=[
 [1,'Head-on pair','check-start-latency-coordinator.mjs --opposing --verify','14 actual/direct/save variants; original destinations, right-hand pass, contacts/HP.'],
 [2,'Simultaneous intersection','check-traffic-coordinator.mjs; review-navigation-counterexamples.mjs','Two streams covered; known four-way limitations remain.'],
 [3,'Two opposing streams of 20','opposing-40','New full-duration case.'],
 [4,'One-vehicle bridge in both directions','bridge-two-way','New physical wall corridor, admission and actual completion.'],
 [5,'Dead end','dead-end','New closed map barrier; must reject explicitly, not accept a nearby endpoint.'],
 [6,'Builder and combat vehicle leave building','mixed-building-exit','Six mixed builder/combat vehicles leave a real factory perimeter together.'],
 [7,'Long column of 30 with bends','column-30-bends','New 3.5 km-scale route with two road bends; direct existing-route contract.'],
 [8,'Twenty attackers one target','attack-20; check-navigation-required-cases.mjs','Every attacker must physically occupy a distinct usable firing position and fire; additional actual attack-move and target-death checks.'],
 [9,'Attack behind obstacle','check-combat-sight.mjs; check-combat-flow.mjs; check-tower-assault.mjs','Actual building occlusion, checked firing positions and real tower controls; each latest report must pass independently.'],
 [10,'Thirty retreating cars','retreat-30','Thirty actual attackers receive controlled damage, withdraw to their real base and remain there.'],
 [11,'Fifty arrive at one area','arrival-50','New actual common order; verify every originally accepted slot.'],
 [12,'Commander destroyed','commander-destroyed','New command member death, goal persistence and surviving group completion.'],
 [13,'Building appears during movement','dynamic-construction','New live navigation rebuild with an unfinished physical building.'],
 [14,'Opposing narrow queues','bridge-two-way','Covered by two five-car queues; not accepted unless every car crosses the actual corridor.'],
 [15,'Large-map long route','check-mountain-routing.mjs; bench-navigation-orders.mjs','Real-map path terrain and CPU measurements; not full long-route driving acceptance.'],
 [16,'100/200/500 active units','check-simulation-budget.mjs; check-damage-browser.mjs --benchmark --budget','Existing slicing/render budget controls; completed mass movement remains separate.'],
 [17,'Mass repeated changes','repeated-orders-30','New four changed common orders and repeated identical order.'],
 [18,'Terrain-isolated target','isolated-target','New continuous height barrier, explicit inability rather than indefinite wait.'],
 [19,'Front car destroyed','front-destroyed','New moving single-file leader death and continued exact destinations.'],
 [20,'Several minutes of move/attack/retreat','multi-minute','New six-minute replay; two attacks, two damaged retreats, repeated movement.']
].map(([id,name,test,limits])=>({id,name,test,limits}));

function makeField(type='flat'){
 const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
  gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
 if(type==='road'||type==='bridge'){
  const width=type==='bridge'?14:34;
  field.roadNetwork={paths:[{id:'north',from:'a',to:'b',width,points:[{x:0,y:-1900},{x:0,y:1900}]}]};
  field.roadBlendAt=(x,y)=>Math.max(0,Math.min(1,(width/2-Math.abs(x))/2.5));
 }
 if(type==='bends'){
  const points=[{x:-500,y:-1950},{x:-500,y:0},{x:500,y:0},{x:500,y:1800}];
  field.roadNetwork={paths:[{id:'bent-road',from:'a',to:'b',width:18,points}]};
  field.roadBlendAt=(x,y)=>{
   let d=Infinity;for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
    d=Math.min(d,Math.hypot(x-a.x-dx*t,y-a.y-dy*t));
   }return Math.max(0,Math.min(1,(9-d)/2.5));
  };
 }
 if(type==='island'){
  field.heightAt=(x,y)=>Math.max(0,100-5*Math.abs(Math.max(Math.abs(x),Math.abs(y))-120));
  field.gradientAt=(x,y)=>({x:(field.heightAt(x+.01,y)-field.heightAt(x-.01,y))/.02,
   y:(field.heightAt(x,y+.01)-field.heightAt(x,y-.01))/.02});
 }
 return field;
}
function setup(fieldType='flat'){
 const field=makeField(fieldType),m=new Mission({...config,startGrid:[64,84],initialMapBounds:[0,0,127,127],finalMapBounds:[0,0,127,127]},field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.state.salvage.items=[];m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);
 const c={m,fieldType,units:[],goals:new Map(),pendingGoals:new Map(),events:[],issued:[],expectedHp:new Map(),seconds:120,expectArrival:true};
 const compute=m.nav.computePathSteps;c.searches=0;
 m.nav.computePathSteps=function*(...args){c.searches++;return yield* compute.apply(this,args);};
 return c;
}
function car(c,x,y,heading=0,kind='bukhanka'){
 const u=c.m.addUnit(kind,'rai',{x,y},{heading});c.units.push(u);c.expectedHp.set(u.id,u.hp);return u;
}
function route(c,u,path){u.path=path.map(p=>({...p}));u.task={type:'move',...u.path.at(-1)};c.goals.set(u.id,{...u.path.at(-1)});}
function issue(c,units,action,target){
 const start=performance.now(),result=c.m[commandMode==='submit'?'submitOrder':'order'](units.map(u=>u.id),action,target);
 c.issued.push({time:c.m.state.time,action,target:{x:target.x,y:target.y,id:target.id},result,cpuMs:performance.now()-start});
 for(const u of units)if(result.revision)c.pendingGoals.set(u.id,result.revision);
 else if(u.routeOrder?.destination)c.goals.set(u.id,{...u.routeOrder.destination});
 return result;
}
function grid(c,count,columns,spacing=32,baseY=-300){
 return Array.from({length:count},(_,i)=>car(c,(i%columns-(columns-1)/2)*spacing,baseY-Math.floor(i/columns)*spacing));
}
function wall(c,x,y,halfWidth,halfDepth){return c.m.addStructure('generator','neutral',{x,y},{halfWidth,halfDepth,completed:true,progress:1,hp:100000});}

export const scenarios={
 'opposing-40':()=>{
  const c=setup('road');c.seconds=180;
  for(let i=0;i<20;i++)for(const sign of [-1,1]){
   const u=car(c,0,sign*(80+i*32),sign<0?0:Math.PI);
   route(c,u,[{x:0,y:-sign*(900+(19-i)*30)}]);
  }return c;
 },
 'bridge-two-way':()=>{
  const c=setup('bridge');c.seconds=180;
  wall(c,-1030,0,1023,90);wall(c,1030,0,1023,90);c.m.rebuildNavigation();
  const north=[],south=[];
  for(let i=0;i<5;i++){north.push(car(c,0,-200-i*32));south.push(car(c,0,200+i*32,Math.PI));}
  issue(c,north,'move',{x:0,y:650});issue(c,south,'move',{x:0,y:-650});
  c.bridgeCrossed=new Set();c.inspect=()=>{for(const u of c.units)if(Math.abs(u.y)<10&&Math.abs(u.x)<7)c.bridgeCrossed.add(u.id);};
  c.extraFailures=()=>c.bridgeCrossed.size===10?[]:[`Only ${c.bridgeCrossed.size}/10 cars traversed the actual one-car bridge`];return c;
 },
 'dead-end':()=>{
  const c=setup();c.seconds=12;c.expectArrival=false;
  wall(c,0,0,2048,25);c.m.rebuildNavigation();const u=car(c,0,-200);
  c.rejection=issue(c,[u],'move',{x:0,y:200});return c;
 },
 'isolated-target':()=>{
  const c=setup('island');c.seconds=12;c.expectArrival=false;const u=car(c,-300,0,-Math.PI/2);
  c.rejection=issue(c,[u],'move',{x:0,y:0});return c;
 },
 'column-30-bends':()=>{
  const c=setup('bends');c.seconds=240;
  for(let i=0;i<30;i++){const u=car(c,-500,-500-i*32);route(c,u,[{x:-500,y:0},{x:500,y:0},{x:500,y:500+(29-i)*30}]);}
  return c;
 },
 'arrival-50':()=>{
  const c=setup();c.seconds=120;const units=grid(c,50,10);
  issue(c,units,'move',{x:0,y:600});return c;
 },
 'mixed-building-exit':()=>{
  const c=setup();c.seconds=90;
  c.m.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});c.m.rebuildNavigation();
  for(let i=0;i<6;i++)car(c,-80+i%3*60,-90-Math.floor(i/3)*32,0,i%2?'builder':'bukhanka');
  issue(c,c.units,'move',{x:0,y:300});return c;
 },
 'attack-20':()=>{
  const c=setup();c.seconds=90;c.shots=new Set();grid(c,20,5,32,-80);
  const target=c.m.addStructure('generator','scavs',{x:0,y:100},{hp:100000,completed:true,progress:1});
  c.m.rebuildNavigation();c.m.updateFog();assert(issue(c,c.units,'attack',target).ok,'The actual attack target must be visible');
  c.inspect=()=>{
   for(const e of c.m.effects)if(e.type==='shot'&&c.units.some(u=>u.id===e.from))c.shots.add(e.from);
   for(const u of c.units)if(u.combatDeployment?.goal)c.goals.set(u.id,{...u.combatDeployment.goal});
  };
  c.isComplete=u=>u.combatDeployment?.status==='arrived'&&!u.path.length&&!u.detour&&!u.pendingOrder
   &&c.shots.has(u.id)&&distance(u,target)<=c.m.unitSpec(u).range&&c.m.lineOfSight(u,target);
  c.extraFailures=()=>c.shots.size===20?[]:[`Only ${c.shots.size}/20 attackers fired`];return c;
 },
 'retreat-30':()=>{
  const c=setup();c.seconds=120;c.keepRunning=true;grid(c,30,6,32,180);
  const base=c.m.addStructure('factory','rai',{x:0,y:-500},{completed:true,progress:1});
  const target=c.m.addStructure('generator','scavs',{x:0,y:360},{hp:100000,completed:true,progress:1});
  c.m.rebuildNavigation();c.m.updateFog();issue(c,c.units,'attack',target);
  c.events.push({at:20,run:()=>{
   for(const u of c.units){const before=u.hp;c.m.damage(u,70,target);c.expectedHp.set(u.id,c.expectedHp.get(u.id)-(before-u.hp));}
   c.m.setCombatPolicy(c.units.map(u=>u.id),{retreat:'light'});
  }});
  c.inspect=()=>{for(const u of c.units)if(u.combatRetreat?.phase==='home'&&u.combatRetreat.destination)c.goals.set(u.id,{...u.combatRetreat.destination});};
  c.isComplete=u=>u.combatRetreat?.status==='arrived'&&u.combatRetreat.phase==='home'
   &&u.combatRetreat.home.id===base.id&&!u.path.length&&!u.detour&&!u.pendingOrder&&!u.task;
  c.extraFailures=()=>c.units.some(u=>u.combatRetreat?.home.id!==base.id||u.task?.type==='attack'||u.combatDeployment)
   ?['A retreating unit resumed the attack or did not retain the real base destination']:[];return c;
 },
 'commander-destroyed':()=>{
  const c=setup();c.seconds=90;const commander=car(c,0,0,0,'command'),units=grid(c,10,2,32,-40);
  assert(c.m.configureGroup(c.units.map(u=>u.id),{leaderId:commander.id,formation:'concentrate'}).ok);
  const command=issue(c,[commander],'move',{x:0,y:500});
  for(const u of units)if(command.revision)c.pendingGoals.set(u.id,command.revision);
  c.extraFailures=()=>c.m.state.commandGroups.some(g=>g.leaderId===commander.id)?['Destroyed group leader was not replaced']:[];
  c.events.push({at:3,run:()=>c.m.damage(commander,commander.hp+1,units[0])});return c;
 },
 'front-destroyed':()=>{
  const c=setup();c.seconds=90;
  for(let i=0;i<12;i++){const u=car(c,0,-i*30);route(c,u,[{x:0,y:600-i*30}]);}
  c.events.push({at:3,run:()=>c.m.damage(c.units[0],c.units[0].hp+1,c.units[1])});return c;
 },
 'dynamic-construction':()=>{
  const c=setup();c.seconds=120;grid(c,12,4);issue(c,c.units,'move',{x:0,y:400});
  c.events.push({at:3,run:()=>{
   c.m.addStructure('generator','rai',{x:0,y:0},{completed:false,progress:.1,halfWidth:34,halfDepth:30});c.m.rebuildNavigation();
  }});return c;
 },
 'repeated-orders-30':()=>{
  const c=setup();c.seconds=150;grid(c,30,6);issue(c,c.units,'move',{x:0,y:450});
  for(const [at,target] of [[8,{x:400,y:400}],[16,{x:-300,y:450}],[24,{x:0,y:600}],[24.2,{x:0,y:600}]])
   c.events.push({at,run:()=>issue(c,c.units,'move',target)});return c;
 },
 'multi-minute':()=>{
  const c=setup();c.seconds=360;c.keepRunning=true;c.retreatChecks=[];c.shots=new Set();grid(c,9,3,40);
  c.m.addStructure('factory','rai',{x:0,y:-600},{completed:true,progress:1});c.m.rebuildNavigation();
  for(const base of [0,180]){
   let target;
   c.events.push({at:base,run:()=>{c.m.setCombatPolicy(c.units.map(u=>u.id),{retreat:'never'});issue(c,c.units,'move',{x:0,y:150});}});
   c.events.push({at:base+30,run:()=>{
    target=c.m.addStructure('generator','scavs',{x:0,y:360},{hp:100000,completed:true,progress:1});c.m.rebuildNavigation();c.m.updateFog();issue(c,c.units,'attack',target);
   }});
   c.events.push({at:base+60,run:()=>{
    for(const u of c.units){const before=u.hp;c.m.damage(u,70,target);c.expectedHp.set(u.id,c.expectedHp.get(u.id)-(before-u.hp));}
    c.m.setCombatPolicy(c.units.map(u=>u.id),{retreat:'light'});
   }});
   c.events.push({at:base+110,run:()=>{
    c.retreatChecks.push({time:c.m.state.time,arrived:c.units.filter(u=>u.combatRetreat?.status==='arrived').length});
    if(target.hp>0)c.m.damage(target,target.hp+1,c.units[0]);
   }});
   c.events.push({at:base+120,run:()=>{c.m.setCombatPolicy(c.units.map(u=>u.id),{retreat:'never'});issue(c,c.units,'move',{x:0,y:-250});}});
  }
  c.inspect=()=>{for(const e of c.m.effects)if(e.type==='shot'&&c.units.some(u=>u.id===e.from))c.shots.add(uId(e));};
  c.extraFailures=()=>[...(c.retreatChecks.some(r=>r.arrived!==9)?['At least one fifty-second retreat phase did not finish for every car']:[]),
   ...(c.shots.size!==9?[`Only ${c.shots.size}/9 cars fired during the repeated combat phases`]:[])];return c;
 }
};
const uId=e=>e.from;

function solidGap(pose,solid,field){
 const shape=vehicleEnvelope(pose,config.worldScale,field);let gap=-Infinity;
 for(const [x,y] of [[1,0],[0,1],[shape.c,shape.s],[-shape.s,shape.c]])
  gap=Math.max(gap,Math.abs((shape.x-solid.x)*x+(shape.y-solid.y)*y)-footprintSupport(shape,x,y)
   -solid.halfWidth*Math.abs(x)-solid.halfDepth*Math.abs(y));
 return gap;
}
function arcPoses(from,to){
 const length=distance(from,to),turn=Math.atan2(Math.sin(to.heading-from.heading),Math.cos(to.heading-from.heading));
 const middle=from.heading+turn/2,direction=Math.sign((to.x-from.x)*-Math.sin(middle)+(to.y-from.y)*Math.cos(middle))||1;
 const radius=Math.abs(turn)>1e-7?length/(2*Math.sin(turn/2)):null,poses=[];
 const steps=Math.max(1,Math.ceil(length/.14),Math.ceil(Math.abs(turn)/.05));
 for(let i=1;i<=steps;i++){
  const t=i/steps,chord=radius===null?length*t:2*radius*Math.sin(turn*t/2),angle=from.heading+turn*t/2;
  poses.push({x:from.x-Math.sin(angle)*chord*direction,y:from.y+Math.cos(angle)*chord*direction,
   heading:from.heading+turn*t,kind:from.kind});
 }
 return poses;
}

export function runScenario(name,{capture=true}={}){
 const sourceBefore=hashes(),begin=performance.now(),c=scenarios[name](),{m,units}=c;
 const isComplete=c.isComplete??done;
 const initialSave=m.save(),starts=new Map(units.map(u=>[u.id,{x:u.x,y:u.y}])),rows=new Map(units.map(u=>[u.id,{id:u.id,firstMotion:null,
  distance:0,idle:0,longestIdle:0,unknownIdle:0,longestUnknownIdle:0,stops:0,reasons:{}}]));
 const cpu=[],searchAtStart=c.searches,heapStart=process.memoryUsage().heapUsed;let heapPeak=heapStart,minGap=Infinity,solidViolations=0,teleports=0,firstProblem=null,nextSample=1;
 let previousPoses=new Map();
 const contacts=[],solidEvents=[],displacementEvents=[],hit=m.vehicleCollision.bind(m);m.vehicleCollision=(u,speed,blockers)=>{
  if(contacts.length<50)contacts.push(structuredClone({time:round(m.state.time),unit:u.id,speed,blockers:[...blockers].map(b=>b.id),
   pose:{x:u.x,y:u.y,heading:u.heading,path:u.path,detour:u.detour},previous:previousPoses.get(u.id),intent:m.trafficCoordinator.intents.get(u.id),
   decision:m.trafficCoordinator.decisions.get(u.id),obstacles:[...blockers].map(b=>({id:b.id,x:b.x,y:b.y,heading:b.heading,speed:b.driveSpeed,
    path:b.path,detour:b.detour,gap:vehicleClearance(u,b,config.worldScale,m.field),intent:m.trafficCoordinator.intents.get(b.id)}))}));
  return hit(u,speed,blockers);
 };
 const brief=()=>units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,hp:u.hp,task:u.task,path:u.path,detour:u.detour,
  traffic:u.traffic,hold:u.trafficHold,passage:u.passage,navigation:u.navigation,yieldReturn:u.yieldReturn}));
 const tail=[],timeline=[],frameStep=commandMode==='submit'?1/80:.1;let frames=0;
 while(frames*frameStep<c.seconds-.00001){
  for(const e of c.events)if(!e.ran&&m.state.time+1e-6>=e.at){e.ran=true;e.run();}
  const previous=new Map(units.map(u=>[u.id,{x:u.x,y:u.y,heading:u.heading,kind:u.kind}])),started=performance.now(),logicalBefore=m.state.time;
  previousPoses=previous;
  const finishedTicks=m.advance(frameStep,commandMode==='submit'?{budgetMs:config.simulationCpuBudgetMs}:{});frames++;
  cpu.push(performance.now()-started);c.inspect?.();
  for(const [id,revision] of c.pendingGoals){const u=m.entity(id);
   if(u&&!u.pendingOrder&&u.commandRevision===revision&&u.routeOrder?.destination){c.goals.set(id,{...u.routeOrder.destination});c.pendingGoals.delete(id);}
  }
  for(const u of units){
   if(u.hp<=0)continue;const row=rows.get(u.id),travelled=distance(u,previous.get(u.id));row.distance+=travelled;
   if(row.firstMotion===null&&distance(u,starts.get(u.id))>=.5)row.firstMotion=round(frames*frameStep);
   const active=!isComplete(u)&&u.combatDeployment?.status!=='arrived'&&u.combatRetreat?.status!=='arrived';
   if(active&&travelled<1e-4){if(!row.idle)row.stops++;row.idle+=frameStep;row.longestIdle=Math.max(row.longestIdle,row.idle);
    const reason=u.navigation?.reason??'missing-diagnostic';row.reasons[reason]=(row.reasons[reason]??0)+frameStep;
    const unknown=!u.navigation||['unclassified-stop','no-order'].includes(reason);
    row.unknownIdle=unknown?row.unknownIdle+frameStep:0;row.longestUnknownIdle=Math.max(row.longestUnknownIdle,row.unknownIdle);
   }else{row.idle=0;row.unknownIdle=0;}
   // A frame can finish yesterday's suspended logical tick and also move
   // this unit in a newly started tick. state.time delta alone misses one.
   const integratedSeconds=config.simulationStep*Math.max(1,finishedTicks+(m.pendingTick?1:0));
   if(travelled>m.unitSpec(u).speed*1.8*integratedSeconds+.2){teleports++;if(displacementEvents.length<20)
    displacementEvents.push({unit:u.id,time:m.state.time,travelled,integratedSeconds,from:previous.get(u.id),to:{x:u.x,y:u.y,heading:u.heading}});}
   // Test real oriented bodies along the integrated constant-curvature arc.
   // One convex sweep for an entire frame overestimates the space at corners
   // compared with production's short sweeps and produced false positives.
   const poses=arcPoses(previous.get(u.id),u);
   const blockedSolids=m.nav.nearbySolids(u,config.worldScale*5).filter(solid=>poses.some(pose=>solidGap(pose,solid,m.field)<-1e-6));
   if(blockedSolids.length){solidViolations++;if(solidEvents.length<20)solidEvents.push({time:round(m.state.time),unit:u.id,
    from:previous.get(u.id),to:{x:u.x,y:u.y,heading:u.heading},solids:blockedSolids.map(s=>({id:s.id,x:s.x,y:s.y,halfWidth:s.halfWidth,halfDepth:s.halfDepth,hp:s.hp,clearing:s.clearing}))});}
  }
  for(let i=0;i<units.length;i++)if(units[i].hp>0)for(let j=0;j<i;j++)if(units[j].hp>0&&distance(units[i],units[j])<60)
   minGap=Math.min(minGap,vehicleClearance(units[i],units[j],config.worldScale,m.field));
  if(!firstProblem&&(contacts.length||minGap<0||solidViolations||teleports||[...rows.values()].some(r=>r.longestUnknownIdle>.50001)))
   firstProblem={time:round(m.state.time),units:structuredClone(brief()),searches:c.searches,contacts:structuredClone(contacts)};
  if(m.state.time>=nextSample){nextSample=Math.floor(m.state.time)+1;
   heapPeak=Math.max(heapPeak,process.memoryUsage().heapUsed);
   const state={time:round(m.state.time),units:structuredClone(brief())};tail.push(state);if(tail.length>12)tail.shift();
   if(Math.round(m.state.time)%30===0)timeline.push({time:round(m.state.time),arrived:units.filter(u=>u.hp>0&&isComplete(u)).length,searches:c.searches,heapUsed:process.memoryUsage().heapUsed});
  }
  m.effects=[];
  if(!c.keepRunning&&c.expectArrival&&c.events.every(e=>e.ran)&&units.filter(u=>u.hp>0).every(u=>isComplete(u)&&c.goals.has(u.id)&&distance(u,c.goals.get(u.id))<2.5))break;
 }
 const survivors=units.filter(u=>u.hp>0),arrived=survivors.filter(u=>isComplete(u)&&c.goals.has(u.id)&&distance(u,c.goals.get(u.id))<2.5),failures=[];
 if(c.expectArrival&&arrived.length!==survivors.length)failures.push(`${arrived.length}/${survivors.length} surviving cars physically reached their original accepted destinations`);
 if(!c.expectArrival){
  const rejected=commandMode==='sync'?!c.rejection.ok&&c.rejection.reason:
   units.every(u=>{
    const reason=u.pendingOrder?.reason;
    const proof=['static-disconnected','route-unreachable','destination-terrain-forbidden'].includes(reason);
    return u.pendingOrder?.status==='blocked'&&reason&&u.navigation?.state===(proof?'UNREACHABLE':'BLOCKED')
     &&(name!=='isolated-target'||proof);
   });
  if(!rejected)failures.push('An impossible exact target was not explicitly rejected with a reason');
  if(units.some(u=>u.task||u.path.length||u.detour))failures.push('The impossible order is still attempting movement');
 }
 if(minGap<0)failures.push('Vehicle hull overlap');if(solidViolations)failures.push(`${solidViolations} swept building intersections`);
 if(contacts.length)failures.push(`${contacts.length} physical contact callbacks`);
 if(survivors.some(u=>u.hp<c.expectedHp.get(u.id)-1e-7))failures.push('Unexpected friendly collision damage');
 if(teleports)failures.push(`${teleports} displacement bounds exceeded`);
 if([...rows.values()].some(r=>r.longestUnknownIdle>.50001))failures.push('Unclassified stop exceeded 500 ms');
 failures.push(...(c.extraFailures?.()??[]));
 const sourceAfter=hashes();if(JSON.stringify(sourceBefore)!==JSON.stringify(sourceAfter))failures.push('Production sources changed during the run; repeat before accepting');
 const result={name,seed,commandMode,passed:!failures.length,failures,fieldType:c.fieldType,seconds:round(m.state.time),frameSeconds:round(frames*frameStep),deadline:c.seconds,
  total:units.length,survivors:survivors.length,arrived:arrived.length,contacts,minGap:round(minGap),solidViolations,solidEvents,teleports,displacementEvents,
  cpuMs:{total:round(cpu.reduce((a,b)=>a+b,0)),p50:round(percentile(cpu,.5)),p95:round(percentile(cpu,.95)),p99:round(percentile(cpu,.99)),max:round(Math.max(...cpu)),
   scope:commandMode==='submit'?'Node wall time for production Mission.advance at 80 Hz using configured simulation budget; includes incremental commands; no renderer':
    'Node wall time for production Mission.advance(0.1), one logical 100 ms tick; no renderer; not a per-render-frame benchmark'},
  searches:{total:c.searches,afterInitialOrders:c.searches-searchAtStart,scope:'Actual navigator computePathSteps calls; includes full-grid and shortcut attempts'},
  memory:{heapStart,heapPeak,heapEnd:process.memoryUsage().heapUsed,allocations:null,reason:'Allocation counts and retained-memory leaks require a heap/GC profile; heap growth alone is not proof'},
  units:[...rows.values()].map(r=>{const u=units.find(unit=>unit.id===r.id);return {...r,distance:round(r.distance),longestIdle:round(r.longestIdle),longestUnknownIdle:round(r.longestUnknownIdle),
   goal:c.goals.get(r.id),goalError:c.goals.has(r.id)?round(distance(u,c.goals.get(r.id))):null,hp:u.hp,complete:isComplete(u),navigation:u.navigation};}),
  issued:c.issued,timeline,wallMs:round(performance.now()-begin),sourceHashes:sourceBefore};
 if(capture&&!result.passed){
  const fixturePath=`tools/fixtures/navigation-${name}-${commandMode}.json`;
  fs.writeFileSync(fixturePath,JSON.stringify({name,seed,replay:`node tools/check-navigation-scenarios.mjs --case ${name}${commandMode==='sync'?' --sync':''}`,fieldType:c.fieldType,
   sourceHashes:sourceBefore,initialSave:JSON.parse(initialSave),firstProblem,tail,finalSave:JSON.parse(m.save()),result},null,2));result.fixture=fixturePath;
 }
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),at=args.indexOf('--case'),names=at>=0?args[at+1].split(','):Object.keys(scenarios);
 for(const name of names)assert(scenarios[name],`Unknown scenario ${name}`);
 if(args.includes('--coverage')){console.log(JSON.stringify(coverage,null,2));process.exit(0);}
 fs.mkdirSync('tools/fixtures',{recursive:true});fs.mkdirSync('campaign/reports',{recursive:true});
 const results=[];for(const name of names){const result=runScenario(name);results.push(result);console.log(JSON.stringify({name,passed:result.passed,
  seconds:result.seconds,arrived:result.arrived,total:result.survivors,contacts:result.contacts.length,failures:result.failures,cpuMs:result.cpuMs,searches:result.searches,fixture:result.fixture}));}
 const report={seed,coverage,results};fs.writeFileSync(`campaign/reports/navigation-scenarios-${commandMode}${at>=0?'-'+names.join('-'):''}.json`,JSON.stringify(report,null,2));
 if(!args.includes('--diagnose'))assert(results.every(r=>r.passed),'Navigation acceptance failed; exact fixtures and measured failures were saved');
}
