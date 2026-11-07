import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {checkManeuver} from '../campaign/vehicle-motion.js';

// Independent production-Mission counterexamples. Times below are simulated
// seconds, not FPS. No collision/headway/goal overrides are used. `route` mode
// isolates an already-issued route from Mission.order's occupied-goal search.
// Baseline Mission SHA256 135dc49e5ae4c66b24d70adb4c0d7034c9473a98bbf09ef50089135a6722b59a:
// road width34, 2x3 spacing12: first10world [3.1,1.2,6.6,3.4,11,6.9] s,
// coordinator zero queues/decisions. Opposing long actual orders: both -44HP;
// route short: both -11.5484HP; narrow road width24: both -44HP.
export const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
export function fixture(width=0){
  const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
    gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
  if(width){
    field.roadNetwork={paths:[{id:'north',from:'a',to:'b',width,points:[{x:0,y:-1000},{x:0,y:1000}]}]};
    field.roadBlendAt=(x,y)=>Math.max(0,Math.min(1,(width/2-Math.abs(x))/2.5));
  }
  const m=new Mission(config,field);
  Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
  m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(1);
  return m;
}
const round=n=>Number.isFinite(n)?+n.toFixed(3):null;
const position=u=>({x:u.x,y:u.y,heading:u.heading});
const complete=u=>!u.task&&!u.path.length&&!u.detour;
function minimumGap(m,cars){
  let minimum=Infinity;
  for(let i=0;i<cars.length;i++)for(let j=0;j<i;j++)minimum=Math.min(minimum,vehicleClearance(cars[i],cars[j],config.worldScale,m.field));
  return minimum;
}
function traceUnit(m,u){return structuredClone({id:u.id,x:round(u.x),y:round(u.y),heading:round(u.heading),speed:round(u.driveSpeed??0),
  path:u.path.map(p=>({x:round(p.x),y:round(p.y)})),task:u.task,detour:u.detour,
  decision:m.trafficCoordinator.decisions.get(u.id),queued:m.trafficCoordinator.queueing(u),
  intent:m.trafficCoordinator.intents.get(u.id),merge:u.mergeTraffic,passing:u.passingLane,watch:u.driveWatch,traffic:u.traffic,hold:u.trafficHold});}
export function startCase({width=0,columns=2,spacing=12,seconds=35,trace=false}={}){
  const m=fixture(width),cars=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',
    {x:(i%columns-(columns-1)/2)*spacing,y:-Math.floor(i/columns)*24},{heading:0}));
  const starts=cars.map(position),initialGap=minimumGap(m,cars);
  assert(initialGap>0,'The start must not contain overlapping bodies');
  const started=performance.now(),order=m.order(cars.map(u=>u.id),'move',{x:0,y:300}),orderMs=performance.now()-started;
  const initialPaths=cars.map(u=>({id:u.id,path:structuredClone(u.path),task:structuredClone(u.task)}));
  const first=cars.map(()=>null),firstHalf=cars.map(()=>null),forward10=cars.map(()=>null),cleared=cars.map(()=>null),queueSeconds=cars.map(()=>0),coordinatorStopSeconds=cars.map(()=>0);
  const traces=[];let minGap=initialGap;
  for(let tick=0;tick<seconds*10;tick++){
    m.advance(.1);m.effects=[];minGap=Math.min(minGap,minimumGap(m,cars));
    for(let i=0;i<cars.length;i++){
      const u=cars[i],s=starts[i];
      if(first[i]===null&&Math.hypot(u.x-s.x,u.y-s.y)>=.1)first[i]=round(m.state.time);
      if(firstHalf[i]===null&&Math.hypot(u.x-s.x,u.y-s.y)>=.5)firstHalf[i]=round(m.state.time);
      if(forward10[i]===null&&u.y-s.y>=10)forward10[i]=round(m.state.time);
      if(cleared[i]===null&&u.y>12)cleared[i]=round(m.state.time);
      if(m.trafficCoordinator.queueing(u))queueSeconds[i]+=.1;
      if(m.trafficCoordinator.limit(u)===0)coordinatorStopSeconds[i]+=.1;
    }
    if(trace&&tick%5===0)traces.push({time:round(m.state.time),units:cars.map(u=>traceUnit(m,u)),leases:structuredClone(m.state.trafficControl.leases)});
  }
  return {type:'start',width,columns,spacing,order,orderMs:round(orderMs),initialGap:round(initialGap),
    first,firstHalf,forward10,cleared,queueSeconds:queueSeconds.map(round),coordinatorStopSeconds:coordinatorStopSeconds.map(round),
    minGap:round(minGap),hp:cars.map(u=>u.hp),maxHp:cars.map(u=>u.maxHp),
    units:cars.map((u,i)=>({id:u.id,...position(u),complete:complete(u),goalError:round(distanceToGoal(u,initialPaths[i].task))})),...(trace?{initialPaths,traces}:{})};
}
const distanceToGoal=(unit,goal)=>Math.hypot(unit.x-goal.x,unit.y-goal.y);
export function opposingCase({name='long',range=65,goalRange=90,width=0,x=0,mode='order',seconds=60,trace=false}={}){
  const m=fixture(width),a=m.addUnit('bukhanka','rai',{x,y:-range},{heading:0}),
    b=m.addUnit('bukhanka','rai',{x,y:range},{heading:Math.PI}),cars=[a,b];
  const goals=[{x:0,y:goalRange},{x:0,y:-goalRange}],initialGap=minimumGap(m,cars);
  assert(initialGap>0,'The start must not contain overlapping bodies');
  for(let i=0;i<2;i++)if(mode==='order')m.order([cars[i].id],'move',goals[i]);
  else{cars[i].path=[{...goals[i]}];cars[i].task={type:'move',...goals[i]};}
  const initialPaths=cars.map(u=>({id:u.id,path:structuredClone(u.path),task:structuredClone(u.task)}));
  const acceptedGoals=cars.map(u=>structuredClone(u.path.at(-1)));
  const traces=[],contacts=[],collision=m.vehicleCollision.bind(m);
  m.vehicleCollision=(u,speed,blockers)=>{contacts.push({time:round(m.state.time),id:u.id,speed,pose:position(u),blockers:[...blockers].map(v=>({id:v.id,...position(v)}))});return collision(u,speed,blockers);};
  let minGap=initialGap,pass=null;
  for(let tick=0;tick<seconds*10&&cars.some(u=>!complete(u));tick++){
    m.advance(.1);m.effects=[];minGap=Math.min(minGap,minimumGap(m,cars));
    if(!pass&&a.y>b.y)pass={time:round(m.state.time),rightOffsets:[round(a.x-x),round(x-b.x)]};
    if(trace&&tick%5===0)traces.push({time:round(m.state.time),units:cars.map(u=>traceUnit(m,u))});
  }
  return {type:'opposing',name,mode,width,range,goalRange,x,initialGap:round(initialGap),minGap:round(minGap),
    pass,seconds:round(m.state.time),complete:cars.every(complete),hp:cars.map(u=>u.hp),maxHp:cars.map(u=>u.maxHp),
    requestedGoals:goals,acceptedGoals,goalErrors:cars.map((u,i)=>round(Math.hypot(u.x-goals[i].x,u.y-goals[i].y))),
    acceptedGoalErrors:cars.map((u,i)=>round(Math.hypot(u.x-acceptedGoals[i].x,u.y-acceptedGoals[i].y))),
    contacts:contacts.slice(0,12),...(trace?{initialPaths,traces}:{})};
}

export function passingSaveCase(range=18){
  const m=fixture(),cars=[m.addUnit('bukhanka','rai',{x:0,y:-range},{heading:0}),
    m.addUnit('bukhanka','rai',{x:0,y:range},{heading:Math.PI})];
  for(const [i,u] of cars.entries()){u.path=[{x:0,y:i?-range:range}];u.task={type:'move',...u.path[0]};}
  for(let i=0;i<20;i++)m.advance(.1);
  assert(cars.some(u=>u.passingLane),'Save while the right-side encounter is active');
  const restored=fixture();restored.load(m.save());restored.state.bounds=m.state.bounds.slice();restored.rebuildNavigation();
  const copies=cars.map(u=>restored.entity(u.id));
  assert.deepEqual(copies.map(u=>u.passingLane),cars.map(u=>u.passingLane),'Encounter reservation survives save/load');
  for(let tick=0;tick<580&&cars.some(u=>!complete(u));tick++){
    m.advance(.1);restored.advance(.1);m.effects=[];restored.effects=[];
  }
  assert.deepEqual(copies.map(u=>[u.x,u.y,u.heading,u.hp,u.task,u.path]),cars.map(u=>[u.x,u.y,u.heading,u.hp,u.task,u.path]),
    'Save/load must preserve the subsequent physical path');
  assert(cars.every(complete),'Restored encounter must finish');
  assert(cars.every((u,i)=>Math.hypot(u.x,u.y-(i?-range:range))<3),'Restored encounter preserves original destinations');
  assert(cars.every(u=>u.hp===u.maxHp),'Restored encounter must not damage friendly vehicles');
  return {type:'save',range,seconds:round(m.state.time),passed:true};
}

export function deadWreckCase(){
  const control=fixture(),withWreck=fixture();
  const cars=[control,withWreck].map(m=>m.addUnit('bukhanka','rai',{x:0,y:-65},{heading:0}));
  const wreck=withWreck.addUnit('bukhanka','rai',{x:0,y:0},{heading:0});
  wreck.hp=0;withWreck.freezeWreck(wreck);
  const goal={x:0,y:100};
  for(const [i,m] of [control,withWreck].entries())assert(m.order([cars[i].id],'move',goal).ok);
  assert.deepEqual(cars[1].path,cars[0].path,'A retained dead body must not change navigation');
  for(let tick=0;tick<200&&cars.some(u=>!complete(u));tick++){
    control.advance(.1);withWreck.advance(.1);
    assert.deepEqual([cars[1].x,cars[1].y,cars[1].heading,cars[1].driveSpeed],
      [cars[0].x,cars[0].y,cars[0].heading,cars[0].driveSpeed],'A retained wreck must not add braking or collision at tick '+tick);
  }
  assert(cars.every(complete),'Drive through the released wreck footprint to the original destination');
  assert(cars.every(u=>u.hp===u.maxHp),'A dead wreck causes no friendly impact damage');
  return {type:'wreck',seconds:round(control.state.time),passed:true};
}

export function independentParallelCase(){
  const cases=[];
  for(const spacing of [12,18,30])for(const offset of [0,7,25]){
    const m=fixture(),controls=[fixture(),fixture()];
    const cars=[0,1].map(i=>m.addUnit('bukhanka','rai',{x:(i-.5)*spacing,y:i*offset},{heading:0}));
    const copies=cars.map((u,i)=>controls[i].addUnit('bukhanka','rai',{x:u.x,y:u.y},{heading:0}));
    for(let i=0;i<2;i++)for(const u of [cars[i],copies[i]]){u.path=[{x:u.x,y:u.y+300}];u.task={type:'move',...u.path[0]};}
    let minimum=Infinity;
    for(let tick=0;tick<300&&cars.some(u=>!complete(u));tick++){
      m.advance(.1);for(const control of controls)control.advance(.1);
      minimum=Math.min(minimum,minimumGap(m,cars));
      for(let i=0;i<2;i++)assert.deepEqual([cars[i].x,cars[i].y,cars[i].heading,cars[i].driveSpeed],
        [copies[i].x,copies[i].y,copies[i].heading,copies[i].driveSpeed],
        `Unrelated parallel lane must behave like a free vehicle (spacing ${spacing}, offset ${offset}, tick ${tick})`);
    }
    assert(cars.every(complete),'Both independent lanes complete their unchanged routes');
    assert(cars.every(u=>u.hp===u.maxHp)&&minimum>0,'Parallel lanes preserve their full bodies');
    cases.push({spacing,offset,minimum:round(minimum),seconds:round(m.state.time)});
  }
  return {type:'independent-parallel',passed:true,cases};
}

export function roadMergeSaveCase(){
  const m=fixture(34),cars=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',
    {x:(i%2-.5)*12,y:-Math.floor(i/2)*24},{heading:0}));
  assert(m.order(cars.map(u=>u.id),'move',{x:0,y:300}).ok);
  const goals=cars.map(u=>({...u.task}));for(let i=0;i<4;i++)m.advance(.1);
  assert(cars.some(u=>m.trafficCoordinator.intents.get(u.id)?.mergeSeparating),'Save during the physical merge departure');
  const restored=fixture(34);restored.load(m.save());restored.state.bounds=m.state.bounds.slice();restored.rebuildNavigation();
  const copies=cars.map(u=>restored.entity(u.id));
  for(let tick=0;tick<346&&cars.some(u=>!complete(u));tick++){
    m.advance(.1);restored.advance(.1);
    assert.deepEqual(copies.map(u=>[u.x,u.y,u.heading,u.hp,u.task,u.path]),cars.map(u=>[u.x,u.y,u.heading,u.hp,u.task,u.path]),
      'Road merge leases and priority preserve physical continuation through save/load');
  }
  assert(cars.every((u,i)=>complete(u)&&distanceToGoal(u,goals[i])<3&&u.hp===u.maxHp),'All restored merge cars reach their original destinations safely');
  return {type:'road-merge-save',passed:true,seconds:round(m.state.time)};
}

export function egressReleaseCase(phase='approach',verify=true,holdSeconds=.1){
  const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),
    blocker=m.addUnit('bukhanka','rai',{x:0,y:phase==='approach'?60:24},{heading:0});
  const start={x:0,y:phase==='approach'?40:0,heading:0,kind:u.kind},end={...start,y:start.y+40};
  const goal={x:0,y:150};u.path=phase==='approach'?[start,goal]:[goal];u.task={type:'move',...goal};
  // A prevalidated straight exit becomes obstructed before this unit reaches
  // it. This isolates production execution/admission from exit-plan search.
  u.passage={along:'y',direction:1,admit:20,egress:{phase,entry:{x:0,y:0},start,end,
    legs:[{direction:1,curve:0,remaining:40}]}};
  let searches=0;const plan=m.planManeuverSteps.bind(m);
  m.planManeuverSteps=function*(...args){searches++;return yield* plan(...args);};
  for(let tick=0;tick<Math.round(holdSeconds*10);tick++){
    m.advance(.1);assert.equal(u.y,0,'An occupied egress must hold admission');
  }
  const timers={admitAfter:u.passage.egress.admitAfter,retryAt:u.passage.egress.retryAt},searchesBeforeClear=searches;
  blocker.hp=0;m.freezeWreck(blocker);const clearedAt=m.state.time;
  let firstMotion=null;
  for(let tick=0;tick<50&&firstMotion===null;tick++){
    m.advance(.1);if(Math.hypot(u.x,u.y)>=.1)firstMotion=round(m.state.time-clearedAt);
  }
  const result={type:'egress-release',phase,holdSeconds,timers,firstMotion,searchesBeforeClear,searchesAfterClear:searches-searchesBeforeClear};
  if(verify){
    assert(firstMotion!==null&&firstMotion<=.5,'Clear cached exit must resume within 0.5 s: '+JSON.stringify(result));
    assert.equal(result.searchesAfterClear,0,'A cleared cached exit requires no new manoeuvre search');
    assert(searchesBeforeClear<=Math.ceil(holdSeconds/1.8),'An unchanged obstruction must not run a heavy search every step');
    assert.equal(u.hp,u.maxHp,'Releasing the egress must preserve collision safety');
  }
  return result;
}

export function parkedForwardReleaseCase(verify=true){
  const m=fixture(),rear=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),
    front=m.addUnit('bukhanka','rai',{x:0,y:24},{heading:0});
  for(const u of [rear,front]){u.path=[{x:0,y:u.y+300}];u.task={type:'move',...u.path[0]};}
  // Real cluster recovery formerly moved the front van forward, then made it
  // wait for the van BEHIND it until age>9. No target/pose is overwritten here.
  assert(m.recoverTrafficCluster(rear,false,new Set([front])),'Construct a real recovery relocation');
  const starts=[position(rear),position(front)],goals=[{...rear.task},{...front.task}],first=[null,null];
  let releasedAt=null,origin=null,firstMotion=null,minimum=minimumGap(m,[rear,front]);
  for(let tick=0;tick<150&&firstMotion===null;tick++){
    m.advance(.1);minimum=Math.min(minimum,minimumGap(m,[rear,front]));
    for(const [i,u] of [rear,front].entries())if(first[i]===null&&Math.hypot(u.x-starts[i].x,u.y-starts[i].y)>=.1)first[i]=round(m.state.time);
    if(!releasedAt&&!front.detour&&m.vehicleMotionClear(front,front,{...front,y:front.y+10})){
      releasedAt=m.state.time;origin=position(front);
    }else if(releasedAt&&Math.hypot(front.x-origin.x,front.y-origin.y)>=.1)firstMotion=round(m.state.time-releasedAt);
  }
  while(m.state.time<60&&[rear,front].some(u=>!complete(u))){m.advance(.1);minimum=Math.min(minimum,minimumGap(m,[rear,front]));}
  const result={type:'parked-forward-release',releasedAt:round(releasedAt),firstMotion,first,minimum:round(minimum),hp:[rear.hp,front.hp],
    complete:[rear,front].every(complete),goalErrors:[rear,front].map((u,i)=>round(Math.hypot(u.x-goals[i].x,u.y-goals[i].y)))};
  if(verify){
    assert(firstMotion!==null&&firstMotion<=.5,'A checked forward relocation must not park in front of its follower: '+JSON.stringify(result));
    assert(first.every(time=>time!==null&&time<=.5),'An aligned free file must start within 0.5 s: '+JSON.stringify(result));
    assert(minimum>=0,'Recovery maintains full body clearance');
    assert([rear,front].every(u=>u.hp===u.maxHp),'Recovery causes no friendly impact damage');
    assert(result.complete&&result.goalErrors.every(error=>error<3),'Recovery must still reach both unchanged destinations');
  }
  return result;
}

export function parkingPolylineCase(){
  const m=fixture(),leader=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:-Math.PI/2}),
    follower=m.addUnit('bukhanka','rai',{x:16,y:15},{heading:-Math.PI/2});
  leader.path=[{x:2,y:0},{x:42,y:16}];leader.task={type:'move',x:42,y:16};
  const route=structuredClone(leader.path),task=structuredClone(leader.task);
  assert(vehicleClearance(leader,follower,config.worldScale,m.field)>0,'Start with separate bodies');
  // Baseline first-segment-only acceptance chose one straight 5.4-world leg,
  // ending at (21.4,15). The following route segment penetrated it by 7.518.
  const park=m.parkingManeuver(follower,leader,(from,to)=>m.vehicleMotionClear(follower,from,to));
  assert(park,'Find a physically executable yielding manoeuvre');
  const end=checkManeuver(follower,park.legs,config.worldScale,(from,to)=>m.vehicleMotionClear(follower,from,to));
  assert(end,'Every yielding arc clears actual bodies and terrain');
  let minimum=Infinity,origin=leader;
  for(const goal of route){
    const heading=Math.atan2(origin.x-goal.x,goal.y-origin.y),length=Math.hypot(goal.x-origin.x,goal.y-origin.y);
    for(let i=0;i<=Math.ceil(length*4);i++){
      const fraction=i/Math.ceil(length*4),passing={x:origin.x+(goal.x-origin.x)*fraction,
        y:origin.y+(goal.y-origin.y)*fraction,heading,kind:leader.kind};
      minimum=Math.min(minimum,vehicleClearance(end,passing,config.worldScale,m.field));
    }
    origin=goal;
  }
  assert(minimum>=config.worldScale*.35,'Yielded body must clear the next segment after the nearby waypoint');
  assert.deepEqual(leader.path,route,'Yield planning preserves the leader route');
  assert.deepEqual(leader.task,task,'Yield planning preserves the original destination');
  return {type:'parking-polyline',minimum:round(minimum),end,legs:park.legs.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=new Set(process.argv.slice(2)),results=[],trace=args.has('--trace');
  if(args.has('--release')){
    for(const phase of ['approach','waiting'])for(const holdSeconds of [.1,3])results.push(egressReleaseCase(phase,args.has('--verify'),holdSeconds));
    results.push(parkedForwardReleaseCase(args.has('--verify')));
    results.push(parkingPolylineCase());
  }
  if(!args.has('--opposing')&&!args.has('--release'))for(const width of [0,24,34])for(const columns of [2,3])for(const spacing of [12,24])
    results.push(startCase({width,columns,spacing,trace}));
  if(!args.has('--opposing')&&!args.has('--release'))results.push(deadWreckCase());
  if(!args.has('--opposing')&&!args.has('--release'))results.push(independentParallelCase(),roadMergeSaveCase());
  if(!args.has('--start')&&!args.has('--release'))for(const mode of ['order','route'])for(const scenario of [
    {name:'long'}, {name:'short',range:18,goalRange:18}, {name:'medium',range:28,goalRange:28},
    {name:'road',width:24}, {name:'road-wide',width:34}, {name:'road-entry',width:24,x:-14}
  ])results.push(opposingCase({...scenario,mode,trace}));
  if(!args.has('--start')&&!args.has('--release'))results.push(passingSaveCase(18),passingSaveCase(65));
  const sourceHashes=Object.fromEntries(['campaign/mission.js','campaign/vehicle-motion.js','campaign/traffic-coordinator.js','campaign/road-traffic.js','campaign/road-merge.js','campaign/traffic-priority.js','campaign/passage-reservations.js','campaign/turning-headway.js']
    .map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
  for(const result of results)console.log(JSON.stringify(result));
  console.log(JSON.stringify({sourceHashes,cases:results.length}));
  if(args.has('--verify'))for(const result of results){
    if(['save','wreck','egress-release','parked-forward-release','parking-polyline','independent-parallel','road-merge-save'].includes(result.type))continue;
    assert(result.minGap>=0,'Complete body separation: '+JSON.stringify(result));
    assert.deepEqual(result.hp,result.maxHp,'No friendly impact damage: '+JSON.stringify(result));
    if(result.type==='start'){
      assert(result.firstHalf.every(time=>time!==null&&time<=.5),'Every free unit moves at least 0.5 world within 0.5 s: '+JSON.stringify(result));
      assert(result.units.every(unit=>unit.complete&&unit.goalError<3),'The same original command must actually finish: '+JSON.stringify(result));
    }
    if(result.type==='opposing'){
      assert(result.complete,'Orders must finish: '+JSON.stringify(result));
      assert.equal(result.contacts.length,0,'Predict before physical contact: '+JSON.stringify(result));
      assert(result.pass?.rightOffsets.every(offset=>offset>0),'Both vehicles pass on their own right: '+JSON.stringify(result));
      assert(result.acceptedGoalErrors.every(error=>error<3),'No later parking fallback may relocate the accepted destination: '+JSON.stringify(result));
      assert(result.goalErrors.every(error=>error<3),'Preserve requested goals for both actual commands and existing routes: '+JSON.stringify(result));
    }
  }
}
