import {Mission} from '../campaign/mission.js';
import {bodyContact,bodyEnvelope} from '../campaign/vehicle-overlap.js';
import {trafficCollisionRequired} from '../campaign/vehicle-collision.js';

export function motionScene(config,scenario){
 const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
  gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
 const bounds=[0,0,127,127];
 const mission=new Mission({...config,initialMapBounds:bounds,finalMapBounds:bounds},field);
 Object.assign(mission.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],pendingCinematics:[],bounds,energy:2000});
 mission.updateMission=()=>{};
 mission.explored.fill(255);
 mission.visible.fill(255);
 const cars=[],orders=[],walls=[];
 let factory,passage;
 if(scenario==='narrow-pass'){
  passage={low:-360,high:360,width:14};
  for(const x of [-1030,1030]){
   const wall={x,y:0,halfWidth:1023,halfDepth:360};
   walls.push(wall);
   mission.addStructure('generator','neutral',wall,{...wall,completed:true,progress:1,hp:100000});
  }
  for(const direction of [1,-1])for(let index=0;index<4;index++){
   const car=mission.addUnit('bukhanka','rai',{x:direction*32,y:-direction*(445+index*33)},{heading:direction>0?0:Math.PI});
   cars.push({car,direction,goal:{x:direction*32,y:direction*(620-index*33)}});
  }
 }else if(scenario==='repair-return'){
  factory=mission.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
  for(let index=0;index<6;index++){
   const car=mission.addUnit('bukhanka','rai',{x:(index-2.5)*34,y:-260},{heading:0});
   cars.push({car,goal:{x:(index-2.5)*37,y:155}});
  }
 }else throw Error(`Unknown motion scenario ${scenario}`);
 mission.rebuildNavigation();
 function start(){
  if(factory){
   const damaged=cars[2].car;
   mission.damage(damaged,220);
   orders.push({ids:cars.map(({car})=>car.id),action:'retreat',result:mission.retreat(cars.map(({car})=>car.id))});
  }else for(const {car,goal,direction} of cars){
   // Isolate admission after route publication. The current public planner
   // passes a bare exit point to vehiclePathSteps on this physical corridor.
   const gate=mission.nav.passageBetween(car,goal,config.worldScale);
   if(gate?.throat?.width!==passage.width)throw Error('Fixture must use the real single-file throat');
   car.passage={along:gate.along,direction:gate.direction,admit:gate.admit,throat:gate.throat};
   car.path=[{x:0,y:-direction*420},{x:0,y:direction*420},goal];
   car.task={type:'move',...goal};
   car.routeOrder={type:'move',destination:goal};
   orders.push({ids:[car.id],action:'seed-accepted-move',goal,result:{ok:true}});
  }
  if(orders.some(o=>!o.result.ok))throw Error(`Fixture order rejected ${JSON.stringify(orders)}`);
 }
 return {mission,cars,orders,walls,passage,factory,start};
}

export function createMotionTrace(scene){
 const {mission:m,cars,passage,factory}=scene;
 const ticks=[],events=[],crossed=new Map(),entered=new Set(),changes=new Map();
 const scale=m.config.worldScale;
 let opposingOccupancyTicks=0;
 function sampleTick(){
  const time=m.state.time;
  const rows=cars.map(({car:u,direction})=>{
   const n=u.navigation,decision=m.trafficCoordinator.passageDecisions.get(u.id),visit=u.factoryVisit;
   const shape=bodyEnvelope(u,scale,m.field);
   const longitudinal=shape.depth*Math.abs(shape.c)+shape.width*Math.abs(shape.s);
   const lateral=shape.width*Math.abs(shape.c)+shape.depth*Math.abs(shape.s);
   const inThroat=!!passage&&Math.abs(shape.x)<passage.width/2+lateral&&shape.y+longitudinal>passage.low&&shape.y-longitudinal<passage.high;
   if(inThroat)entered.add(u.id);
   if(entered.has(u.id)&&!crossed.has(u.id)&&(direction>0?shape.y-longitudinal>passage.high:shape.y+longitudinal<passage.low))crossed.set(u.id,time);
   const row={id:u.id,kind:u.kind,owner:u.owner,x:u.x,y:u.y,heading:u.heading,driveSpeed:u.driveSpeed??0,speed:n?.speed??0,steering:u.steering??0,
    reverse:!!u.reversing,pathRemaining:u.path.length,waypoint:u.path[0]?{...u.path[0]}:null,trafficOnScreen:u.trafficOnScreen,hp:u.hp,
    state:n?.state??null,reason:n?.reason??null,control:n?.controlReason??null,blocker:n?.blockerId??null,wait:n?.waitSeconds??0,
    inThroat,direction,lease:decision?{admitted:decision.admitted,inside:decision.inside,yieldTo:decision.yieldTo,stopAt:decision.stopAt}:null,
    service:u.combatRetreat?.service??null,retreat:u.combatRetreat?.status??null,visit:visit?.phase??null};
   const signature=JSON.stringify([row.state,row.reason,row.control,row.blocker,row.lease?.admitted,row.visit,row.service,row.retreat]);
   if(signature!==changes.get(u.id)){
    changes.set(u.id,signature);
    events.push({time,...row});
   }
   return row;
  });
  if(rows.some(r=>r.inThroat&&r.direction===1)&&rows.some(r=>r.inThroat&&r.direction===-1))opposingOccupancyTicks++;
  const garage=factory?{gate:factory.garageGate??null,exit:factory.garageExit??null,repair:factory.activeRepair?.unitId??null,exitBlocked:!!factory.exitBlocked}:null;
  ticks.push({time,rows,garage});
 }
 const original=m.continueTick;
 m.continueTick=function(...args){
  const pending=this.pendingTick;
  const result=original.apply(this,args);
  if(pending&&!this.pendingTick)sampleTick();
  return result;
 };
 function report(){
  const contacts=[];
  let minGap=Infinity;
  for(const {time,rows} of ticks){
   const outside=rows.filter(row=>row.hp>0&&row.visit!=='inside');
   const shapes=outside.map(row=>bodyEnvelope(row,scale,m.field));
   for(let a=0;a<outside.length;a++)for(let b=0;b<a;b++){
    const {gap}=bodyContact(shapes[a],shapes[b]);
    minGap=Math.min(minGap,gap);
    if(gap<-.001)contacts.push({time,ids:[outside[a].id,outside[b].id],gap,trafficCollisionRequired:trafficCollisionRequired(outside[a],outside[b])});
   }
  }
  const blocked=new Set(['BLOCKED','WAITING_RESERVATION','YIELDING']);
  const units=cars.map(({car,goal})=>{
   const rows=ticks.map(t=>t.rows.find(r=>r.id===car.id));
   let distance=0,starts=0,stops=0,moving=false,everMoved=false,stoppedAt=null,steerSign=0,steerReversals=0;
   const resumeSeconds=[];
   for(const [i,row] of rows.entries()){
    if(i)distance+=Math.hypot(row.x-rows[i-1].x,row.y-rows[i-1].y)/scale;
    const next=row.speed/scale>.05;
    if(next&&!moving){starts++;everMoved=true;if(stoppedAt!==null)resumeSeconds.push(ticks[i].time-stoppedAt);stoppedAt=null;}
    if(!next&&moving&&row.pathRemaining){stops++;stoppedAt=ticks[i].time;}
    moving=next;
    const sign=Math.abs(row.steering)>.02?Math.sign(row.steering):0;
    if(sign){if(steerSign&&steerSign!==sign)steerReversals++;steerSign=sign;}
   }
   const pathSpeeds=rows.filter(r=>r.pathRemaining).map(r=>r.speed/scale);
   const first=predicate=>{const index=rows.findIndex(predicate);return index<0?null:ticks[index].time;};
   const inside=first(r=>r.visit==='inside'),exit=inside===null?null:first((r,i)=>ticks[i].time>inside&&['leaving','departure'].includes(r.visit));
   const last=rows.at(-1);
   return {id:car.id,damaged:rows.some(r=>r.hp<car.maxHp),distanceMetres:distance,starts,stops,stopsPer100m:distance?stops*100/distance:null,
    minSpeedWithPath: pathSpeeds.length?Math.min(...pathSpeeds):null,steerReversals,resumeSeconds,everMoved,
    blockedSeconds:rows.filter(r=>blocked.has(r.state)).length*m.config.simulationStep,
    crossedAt:crossed.get(car.id)??null,arrived:!car.task&&!car.path.length&&!car.pendingOrder&&(factory?
     car.combatRetreat?.status==='arrived'&&!car.factoryVisit&&car.hp===car.maxHp:Math.hypot(car.x-goal.x,car.y-goal.y)<2.1),
    service:{gate:first(r=>r.visit==='gate'||r.visit==='entering'),inside,repair:first(r=>r.service==='repairing'),exit,
     clear:exit===null?null:first((r,i)=>ticks[i].time>exit&&!r.visit)},last};
  });
  return {scale,ticks,events,contacts,units,minGap:Number.isFinite(minGap)?minGap:null,contactPairs:contacts.length,opposingOccupancyTicks,
   crossedWithin60SimSeconds:[...crossed.values()].filter(time=>time<=60.00001).length,
   emergencyStops:m.trafficCoordinator.stats.emergencyStops??0};
 }
 return {report,ticks,restore:()=>{m.continueTick=original;}};
}
