// Local-only diagnostics for the owner's live play session. No simulation
// stepping, synchronous save, screenshots, or UI interaction are performed.
import {vehicleClearance,vehicleEnvelope,vehicleRadiusBound,trafficCollisionRequired,collisionStatistics} from './vehicle-collision.js';
import {steeringDamageAt,STEERING_DAMAGE,vehicleSizeScale} from './vehicle-dynamics.js';
import {isInfantry} from './scav-unit-profiles.js';
import {navigationStopDetails} from './navigation-state.js';
const endpoint='http://127.0.0.1:8767/navigation';
const round=value=>Number.isFinite(value)?Math.round(value*1000)/1000:null;
const point=p=>p&&{x:round(p.x),y:round(p.y)};
export function installNavigationTelemetry(mission,context){
 if(!['127.0.0.1','localhost'].includes(location.hostname))return null;
 const session=crypto.randomUUID(),queue=[],started=performance.now();
 let sequence=0,busy=false,dropped=0,lastSample=started,lastIssue=-Infinity,lastState='',lastSim=mission.state.time;
 let maximumAdvance=0,maximumTick=0,tickCpu=0,maximumFrameGap=0,lastFrame=started,observer;
 let telemetryCpu=0,lastRenderProbe=-Infinity,frameWork={};
 const closePairs=new Map();
 const motionHistory=new WeakMap(),motionWindow=new WeakMap();
 const record=(type,data={})=>{
  if(queue.length>=200){queue.shift();dropped++;}
  queue.push({sequence:++sequence,type,wallMs:round(performance.now()-started),sim:round(mission.state.time),...data});
 };
 mission.recordTrafficDiagnostic=data=>record('traffic-job',data);
 const unitRow=(unit,detail=false)=>({
  id:unit.id,kind:unit.kind,owner:unit.owner,trafficOnScreen:unit.trafficOnScreen??null,...point(unit),heading:round(unit.heading),speed:round(unit.driveSpeed),
  collision:(()=>{const shape=vehicleEnvelope(unit,mission.config.worldScale,mission.field);return {shape:shape.ellipse?'ellipse':'rectangle',width:round(shape.width*2),length:round(shape.depth*2),x:round(shape.x),y:round(shape.y)};})(),
  steering:round(unit.steering),steeringRequested:round(unit.steeringRequested),
  steeringFault:unit.steeringFault?{since:round(unit.steeringFault.since),...steeringDamageAt(unit.steeringFault,mission.state.time)}:null,
  reversing:!!unit.reversing,hp:round(unit.hp),maxHp:unit.maxHp,revision:unit.commandRevision,
  movementWindow:motionWindow.get(unit),
  task:unit.task&&{...unit.task},goal:unit.routeOrder?.destination,pending:unit.pendingOrder&&{...unit.pendingOrder},
  overlapRecovery:unit.overlapRecovery,proposed:unit.proposedOrder&&{...unit.proposedOrder},
  path:unit.path?.slice(0,detail?64:2),pathLength:unit.path?.length??0,
  level:mission.nav.terrainAllowed.levelAt?.(unit.x,unit.y),
  navigation:{state:unit.navigation?.state??'IDLE',reason:unit.navigation?.reason??'not-updated',wait:round(unit.navigation?.waitSeconds??0),
   blockers:unit.navigation?.blockerIds??[],defect:!!unit.navigation?.potentialDefect,next:unit.navigation?.nextAction??null,...navigationStopDetails(mission,unit)},
  yieldReturn:unit.yieldReturn&&{phase:unit.yieldReturn.phase,home:unit.yieldReturn.home,waitingFor:unit.yieldReturn.waitingFor,
   failedRoute:!!unit.yieldReturn.failedRoute,failedReturn:!!unit.yieldReturn.failedReturn,
   routeRetryAt:unit.yieldReturn.routeRetryAt,returnRetryAt:unit.yieldReturn.returnRetryAt,arrivalRetryAt:unit.yieldReturn.arrivalRetryAt,
   legs:detail?unit.yieldReturn.legs?.slice(0,64).map(leg=>({...leg})):unit.yieldReturn.legs?.length,requesters:unit.yieldReturn.requesters},
  detour:unit.detour&&{blocked:unit.detour.blocked,parking:unit.detour.parking,departure:unit.detour.departure,recoveryTurn:unit.detour.recoveryTurn,
   yieldReturning:unit.detour.yieldReturning,legs:detail?unit.detour.legs?.slice(0,64).map(leg=>({...leg})):unit.detour.legs?.length},
  joint:unit.jointTraffic,traffic:unit.traffic,trafficHold:unit.trafficHold,passage:unit.passage,passingLane:unit.passingLane,
  passingTarget:point(mission.trafficCoordinator.intents.get(unit.id)?.passingLane&&mission.trafficCoordinator.intents.get(unit.id)?.waypoint),
  factoryVisit:unit.factoryVisit&&{...unit.factoryVisit},factoryGate:unit.factoryVisit&&mission.entity(unit.factoryVisit.factoryId)?.garageGate,
  retreat:unit.combatRetreat,combatPolicy:unit.combatPolicy,contact:unit.contactRock,
  combat:unit.combatDeployment&&{status:unit.combatDeployment.status,targetId:unit.combatDeployment.targetId,
   slot:unit.combatDeployment.slot,goal:unit.combatDeployment.goal},resumingMarch:!!unit.combatResume,
 });
 const pendingTick=()=>mission.pendingTick&&{cursor:mission.pendingTick.cursor,total:mission.pendingTick.units.length,
  unit:mission.pendingTick.units[mission.pendingTick.cursor]?.id,iterator:!!mission.pendingTick.iterator,
  economy:!!mission.pendingTick.economyStarted};
 const proximity=(stage,transforms)=>{
  const focus=new Set(context().selected),seen=new Set(),poses=new Map(),now=performance.now(),scale=mission.config.worldScale;
  const rendered=unit=>{
   if(poses.has(unit.id))return poses.get(unit.id);
   const data=transforms?.get(unit.id);
   const pose=data?{kind:unit.kind,x:data.position.x,y:data.position.y,heading:data.heading}:unit;
   poses.set(unit.id,pose);return pose;
  };
  for(const unit of mission.state.units){
   if(unit.hp<=0||isInfantry(unit)||!focus.has(unit.id))continue;
   const radius=vehicleRadiusBound(unit.kind,scale)+mission.unitIndex.maxBodyRadius*scale+12;
   for(const other of mission.unitIndex.query(unit,radius)){
    if(other===unit||other.hp<=0||isInfantry(other)||!trafficCollisionRequired(unit,other))continue;
    const key=stage+':'+[unit.id,other.id].sort().join('|');if(seen.has(key))continue;seen.add(key);
    const a=rendered(unit),b=rendered(other),gap=vehicleClearance(a,b,scale,mission.field);
    if(gap>1.5)continue;
    const previous=closePairs.get(key);
    if(previous&&now-previous.at<500&&gap>previous.gap-.25)continue;
    closePairs.set(key,{at:now,gap});
    if(closePairs.size>512)closePairs.delete(closePairs.keys().next().value);
    record('near-contact',{stage,gap:round(gap),physicalGap:round(vehicleClearance(unit,other,scale,mission.field)),
     units:[unitRow(unit),unitRow(other)],rendered:transforms?[{...point(a),heading:round(a.heading)},{...point(b),heading:round(b.heading)}]:undefined});
   }
  }
  telemetryCpu+=performance.now()-now;
 };
 const flush=async()=>{
  if(busy||!queue.length)return;
  busy=true;const batch=queue.splice(0,50),abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),3000);
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({session,events:batch}),signal:abort.signal});
   if(!response.ok)throw Error('Diagnostic receiver '+response.status);
  }catch{
   queue.unshift(...batch);if(queue.length>200){dropped+=queue.length-200;queue.length=200;}
  }finally{clearTimeout(timeout);busy=false;}
 };
 const sample=()=>{
  const now=performance.now(),ui={...context(),visible:document.visibilityState},tick=pendingTick();
  if(now-lastSample<950)return;
  const gap=now-lastSample,simProgress=mission.state.time-lastSim;lastSample=now;lastSim=mission.state.time;
  const stateKey=JSON.stringify(ui);if(stateKey!==lastState){record('ui-state',ui);lastState=stateKey;}
  const units=mission.state.units.filter(unit=>unit.hp>0),active=units.filter(unit=>unit.path?.length||unit.pendingOrder||unit.yieldReturn||unit.task);
  for(const unit of units){
   const history=motionHistory.get(unit)??[],time=mission.state.time,goal=unit.routeOrder?.destination??unit.yieldReturn?.home;
   if(history.at(-1)?.time>time)history.length=0;
   history.push({time,x:unit.x,y:unit.y,goal:goal&&{...goal}});
   while(history.length>2&&history[1].time<=time-10)history.shift();
   const first=history[0],sameGoal=goal&&first.goal&&Math.hypot(goal.x-first.goal.x,goal.y-first.goal.y)<.01;
   motionWindow.set(unit,{seconds:round(time-first.time),displacement:round(Math.hypot(unit.x-first.x,unit.y-first.y)),
    goalProgress:sameGoal?round(Math.hypot(first.x-goal.x,first.y-goal.y)-Math.hypot(unit.x-goal.x,unit.y-goal.y)):null});
   motionHistory.set(unit,history);
  }
  const stalled=active.filter(unit=>(unit.navigation?.waitSeconds??0)>2);
  record('heartbeat',{trafficCamera:mission.trafficCamera,collision:{...collisionStatistics},ui,status:mission.state.status,wallGapMs:round(gap),simProgress:round(simProgress),
   total:units.length,active:active.length,stalled:stalled.map(unit=>unit.id),pendingTick:tick,
   maxAdvanceMs:round(maximumAdvance),maxTickMs:round(maximumTick),maxFrameGapMs:round(maximumFrameGap),
   dispatcher:mission.trafficCoordinator.statistics,local:mission.trafficCoordinator.stats,
   planning:mission.planningStats,frameWork,overlap:mission.overlapStatistics,
   highlightedBlockers:[...(mission.navigationDiagnostics?.blockingIds??[])],
   commandPlanner:mission.commandPlanner?.stats,routeQueue:mission.trafficCoordinator.routes?.size,
   routeJobs:[...(mission.trafficCoordinator.routes?.values()??[])].map(job=>({id:job.unit.id,kind:job.kind,
    age:round(mission.state.time-job.queuedAt),active:job===mission.trafficCoordinator.routeJob||job===mission.trafficCoordinator.maneuverJob,finished:!!job.finished})),
   recoveryPlanner:mission.trafficCoordinator.planner?.stats,recoveryJobs:mission.trafficCoordinator.planner?.jobs(mission),
   telemetryCpuMs:round(telemetryCpu),dropped});
  const issue=stalled.length||maximumAdvance>35||maximumTick>80||gap>1500||simProgress<.01&&ui.active&&!ui.paused&&ui.visible==='visible';
  record('units',{units:units.filter(unit=>unit.owner==='rai').map(unit=>unitRow(unit))});
  if(issue&&now-lastIssue>5000){
   lastIssue=now;
   record('incident',{ui,pendingTick:tick,units:units.map(unit=>unitRow(unit,true)),
    buildings:mission.state.buildings.map(building=>({id:building.id,kind:building.kind,...point(building),hp:building.hp,
     halfWidth:building.halfWidth,halfDepth:building.halfDepth,
     ...(building.kind==='factory'?{rotation:building.rotation,accessRoadVersion:building.accessRoadVersion,accessRoadFailure:building.accessRoadFailure,
      accessRoads:building.accessRoads?.map(r=>({direction:r.direction,width:r.width,points:r.points.map(point)}))}:{} )})),bounds:mission.state.bounds,
    cycles:mission.navigationDiagnostics?.recoveryCycles,dependencies:[...(mission.navigationDiagnostics?.dependencies??[])],
    decisions:[...mission.trafficCoordinator.decisions],passageDecisions:[...mission.trafficCoordinator.passageDecisions],
    approachLimits:[...mission.trafficCoordinator.intents].filter(([,intent])=>Number.isFinite(intent.trafficLimit))
     .map(([id,intent])=>({id,limit:intent.trafficLimit,yieldTo:intent.yieldTo,waypoint:intent.waypoint}))});
  }
  maximumAdvance=maximumTick=maximumFrameGap=telemetryCpu=0;frameWork={};void flush();
 };
 for(const method of ['submitOrder','order','stop','forceRetreat','setCombatPolicy','setArmyCombatPolicy']){
  if(typeof mission[method]!=='function')continue;
  const original=mission[method];
  mission[method]=function(...args){
   if(this!==mission)return original.apply(this,args);
   const at=performance.now();
   record('input',{method,args:args.map(arg=>Array.isArray(arg)?arg:arg&&typeof arg==='object'
    ?{id:arg.id,x:arg.x,y:arg.y,type:arg.type,policy:arg.policy,retreat:arg.retreat,response:arg.response,priority:arg.priority}:arg)});
   void flush();
   try{const result=original.apply(this,args);record('input-result',{method,ms:round(performance.now()-at),result});return result;}
   catch(error){record('error',{where:method,message:String(error),stack:error.stack});void flush();throw error;}
  };
 }
 const advance=mission.advance;
 mission.advance=function(...args){const at=performance.now();try{return advance.apply(this,args);}finally{maximumAdvance=Math.max(maximumAdvance,performance.now()-at);}};
 const continueTick=mission.continueTick;
 mission.continueTick=function(...args){
  const pending=this.pendingTick,at=performance.now();
  try{return continueTick.apply(this,args);}finally{
   if(pending){tickCpu+=performance.now()-at;if(!this.pendingTick){maximumTick=Math.max(maximumTick,tickCpu);tickCpu=0;proximity('simulation');}}
  }
 };
 const updateUnitSteps=mission.updateUnitSteps;
 mission.updateUnitSteps=function*(unit,dt){
  const iterator=updateUnitSteps.call(this,unit,dt);let cpu=0,slices=0,reported=0;
  try{
   while(true){
    const at=performance.now(),step=iterator.next();cpu+=performance.now()-at;slices++;
    if(cpu-reported>50||step.done&&cpu>20){
     record('slow-controller',{id:unit.id,kind:unit.kind,owner:unit.owner,cpuMs:round(cpu),slices,
      complete:step.done,task:unit.task?.type,reason:unit.navigation?.reason,detour:!!unit.detour,joint:!!unit.jointTraffic});reported=cpu;
    }
    if(step.done)return step.value;
    yield step.value;
   }
  }finally{iterator.return();}
 };
 const load=mission.load;
 mission.load=function(...args){
  const result=load.apply(this,args);tickCpu=0;lastSim=this.state.time;
  record('load',{units:this.state.units.length,controller:this.trafficCoordinator.constructor.name});void flush();return result;
 };
 const emit=mission.emit;
 mission.emit=function(type,data){
  // A planning snapshot inherits these methods. Its proposals become real
  // events only when the dispatcher publishes them into the live mission.
  if(this===mission&&/navigation|collision|destroyed|damage|field-modification|artifact-collected/.test(type))record('game-event',{name:type,data});
  return emit.call(this,type,data);
 };
 const attack=mission.attack;
 mission.attack=function(unit,target,spec){
  const retreating=!!unit.combatRetreat||!!unit.factoryVisit;
  const fired=attack.call(this,unit,target,spec);
  if(this===mission&&fired&&retreating)record('retreat-shot',{unit:unit.id,target:target.id,
   weapon:spec.weapon??(unit.kind==='flamer'?'flame':'mg'),pose:point(unit),speed:round(unit.driveSpeed??0),
   phase:unit.factoryVisit?.phase??unit.combatRetreat?.status,task:unit.task?.type,
   goal:point(unit.routeOrder?.destination??unit.combatRetreat?.destination),pathLength:unit.path?.length??0});
  return fired;
 };
 const collision=mission.vehicleCollision;
 mission.vehicleCollision=function(unit,speed,blockers){
  const bodies=[unit,...blockers],before=bodies.map(body=>({hp:body.hp,contact:body.contactRock?.at}));
  const result=collision.call(this,unit,speed,blockers);
  if(bodies.some((body,index)=>body.hp<before[index].hp||body.contactRock?.at!==before[index].contact)){
   record('physical-contact',{unit:unit.id,speed:round(speed),bodies:bodies.map(body=>unitRow(body)),before});void flush();
  }
  return result;
 };
 window.addEventListener('error',event=>{record('error',{message:event.message,source:event.filename,line:event.lineno,stack:event.error?.stack});void flush();});
 window.addEventListener('unhandledrejection',event=>{record('error',{message:String(event.reason),stack:event.reason?.stack});void flush();});
 try{
  observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())record('long-task',{ms:round(entry.duration),startMs:round(entry.startTime-started),pendingTick:pendingTick()});});
  observer.observe({type:'longtask',buffered:false});
 }catch{/* Long-task observation is optional across browsers. */}
 const timer=setInterval(sample,1000);
 window.addEventListener('pagehide',()=>{
  record('pagehide');navigator.sendBeacon(endpoint,new Blob([JSON.stringify({session,events:queue.slice(-50)})],{type:'text/plain'}));
 });
 record('session-start',{build:'live-navigation-2026-11-09-r51.1-empty-command-route',collisionModel:'ellipse-model-extrema',offscreenAlliesPassThrough:true,bukhankaSizeScale:vehicleSizeScale('bukhanka'),vehicleSizeScales:Object.fromEntries(['bukhanka','flamer','builder'].map(kind=>[kind,vehicleSizeScale(kind)])),steeringDamage:STEERING_DAMAGE,terrainPolicy:mission.nav.terrainAllowed.version,controller:mission.trafficCoordinator.constructor.name,
  simulationStep:mission.config.simulationStep,cpuBudget:mission.config.simulationCpuBudgetMs});void flush();
 return {session,record,flush,frame(now){maximumFrameGap=Math.max(maximumFrameGap,now-lastFrame);lastFrame=now;},
  frameWork(timings){for(const [stage,ms] of Object.entries(timings)){
   const entry=frameWork[stage]??={totalMs:0,maxMs:0,samples:0};entry.totalMs+=ms;entry.maxMs=Math.max(entry.maxMs,ms);entry.samples++;
  }},
  rendered(transforms){
   // Physics contacts are still observed after every completed simulation step.
   // Render interpolation diagnostics need not repeat exact gaps at 60 Hz.
   const now=performance.now();if(now-lastRenderProbe<100)return;lastRenderProbe=now;proximity('render',transforms);
  },
  dispose(){clearInterval(timer);observer?.disconnect();delete mission.recordTrafficDiagnostic;}};
}
