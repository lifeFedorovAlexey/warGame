import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {roadTrafficRank,compareRoadTrafficRanks,roadLaneOffset} from '../campaign/traffic-priority.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const diagnose=process.argv.includes('--diagnose'),candidate=process.argv.includes('--ignore-selected');
function fixture(testField=field){const m=new Mission({...config,startGrid:[64,76],initialMapBounds:[0,0,127,127],finalMapBounds:[0,0,127,127]},testField);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],bounds:[0,0,127,127],pendingCinematics:[]});m.state.salvage.items=[];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;}
function spawn(m,heading=0){return Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%2)*50-25,y:-Math.floor(i/2)*28},{heading}));}
function issue(m,units,target){
 const original=m.vehiclePathSteps,ignoreUnits=new Set(units);
 if(candidate)m.vehiclePathSteps=function*(u,p,options={}){return yield* original.call(this,u,p,{...options,ignoreUnits});};
 const begin=performance.now();let order;
 try{order=m.order(units.map(u=>u.id),'move',target);}finally{m.vehiclePathSteps=original;}
 return {order,orderCpuMs:performance.now()-begin};
}
function run(name,{heading=0,prepare=()=>{},target={x:0,y:350},repeat=false,stop=false,packedSeed=null,road=false}={}){
 const roadField={...field,roadNetwork:{paths:[{id:'north',from:'a',to:'b',width:34,points:[{x:0,y:-1000},{x:0,y:1000}]}]},roadBlendAt:(x,y)=>Math.max(0,Math.min(1,(17-Math.abs(x))/2.5))};
 const m=fixture(road?roadField:field),units=[];
 if(packedSeed!==null){let seed=packedSeed+1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let attempt=0;units.length<6&&attempt<10000;attempt++){
   const pose={x:(random()-.5)*70,y:(random()-.5)*70,heading:(random()-.5)*Math.PI*2,kind:'bukhanka'};
   if(units.some(other=>vehicleClearance(pose,other,config.worldScale,field)<.3))continue;
   units.push(m.addUnit('bukhanka','rai',pose,{heading:pose.heading}));
  }
  assert.equal(units.length,6);
 }else if(road)units.push(...Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%2)*12-6,y:-Math.floor(i/2)*24},{heading})));
 else units.push(...spawn(m,heading));
 prepare(m,units);
 const issued=issue(m,units,target);assert(issued.order.ok,`${name}: move accepted`);
 if(repeat||stop){for(let i=0;i<10;i++)m.advance(.1);if(stop)m.stop(units.map(u=>u.id));issue(m,units,target);}
 const initial=units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,hp:u.hp})),paths=units.map(u=>u.path.map(p=>({...p}))),first=units.map(()=>null),clearedStart=units.map(()=>null),forwardTen=units.map(()=>null),samples=[];
 let startupHp;
 const firstTime=m.state.time;let minimum=Infinity;
 for(let step=0;step<200;step++){
  m.advance(.1);m.effects=[];
  if(step===9)startupHp=units.map(u=>u.hp);
  for(let i=0;i<units.length;i++){
   if(first[i]===null&&Math.hypot(units[i].x-initial[i].x,units[i].y-initial[i].y)>.5)first[i]=Number((m.state.time-firstTime).toFixed(3));
   if(clearedStart[i]===null&&Math.hypot(units[i].x-initial[i].x,units[i].y-initial[i].y)>5)clearedStart[i]=Number((m.state.time-firstTime).toFixed(3));
   const forward=((units[i].x-initial[i].x)*(target.x-initial[i].x)+(units[i].y-initial[i].y)*(target.y-initial[i].y))/Math.hypot(target.x-initial[i].x,target.y-initial[i].y);
   if(forwardTen[i]===null&&forward>10)forwardTen[i]=Number((m.state.time-firstTime).toFixed(3));
   for(let j=0;j<i;j++)minimum=Math.min(minimum,vehicleClearance(units[i],units[j],config.worldScale,field));
  }
  if(diagnose&&[0,9,29,49,99,199].includes(step))samples.push(structuredClone({time:Number((m.state.time-firstTime).toFixed(2)),units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,path:u.path,task:u.task,traffic:u.traffic,hold:u.trafficHold,watch:u.driveWatch,detour:u.detour,merge:u.mergeTraffic,retreat:u.combatRetreat,deployment:u.combatDeployment}))}));
 }
 const result={name,...issued,initial,first,clearedStart,forwardTen,allStarted:Math.max(...first.map(t=>t??Infinity)),allClear:Math.max(...clearedStart.map(t=>t??Infinity)),minimum,damage:units.map((u,i)=>initial[i].hp-u.hp),paths,...(diagnose?{samples}:{})};
 if(!diagnose){assert(minimum>=-1e-6,`${name}: no hull overlap`);assert(startupHp.every((hp,i)=>hp===initial[i].hp),`${name}: no friendly contact HP loss in the first second`);}
 return result;
}
const results=[];
assert.equal(roadLaneOffset(8,config.worldScale),0,'A narrow road falls back to its centre');
// Quantised longitudinal bands and scalar tie-breaks form a total order.
const priorityRows=Array.from({length:7},(_,i)=>roadTrafficRank({id:'r'+i,x:i%2?6:-6,y:i*.23},1000+i*.23,{x:0,y:i*.23,width:34,segment:{ux:0,uy:1}},1,config.worldScale));
for(const a of priorityRows)for(const b of priorityRows)for(const c of priorityRows)
 if(compareRoadTrafficRanks(a,b)<=0&&compareRoadTrafficRanks(b,c)<=0)assert(compareRoadTrafficRanks(a,c)<=0,'Road merge rank must be transitive');
if(process.argv.includes('--departure-review')){
 const create=()=>{const m=fixture(),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI}));m.departureReview=[];m.trafficDepartureDebug=({reason,distance,i,j})=>m.departureReview.push({reason,distance,i,j});assert(issue(m,units,{x:0,y:400}).order.ok);return {m,units};};
 const {m,units}=create(),targets=units.map(u=>structuredClone({task:u.task,destination:u.routeOrder.destination,request:u.routeOrder.request}));
 m.advance(.1);assert(units.every(u=>u.detour?.departure),'The full group must actually use the departure path: '+JSON.stringify(m.departureReview));
 for(let i=0;i<19;i++)m.advance(.1);
 assert.deepEqual(units.map(u=>({task:u.task,destination:u.routeOrder.destination,request:u.routeOrder.request})),targets,'Departure never replaces the accepted goals');
 const saved=m.save(),reloaded=fixture();reloaded.load(saved);
 for(let i=0;i<30;i++){m.advance(.1);reloaded.advance(.1);assert.deepEqual(reloaded.state,m.state,'Save/load must preserve departure motion and order');}
 const positions=units.map(u=>({x:u.x,y:u.y}));m.stop(units.map(u=>u.id));assert(units.every(u=>!u.detour&&!u.traffic&&!u.trafficHold));m.advance(1);
 assert.deepEqual(units.map(u=>({x:u.x,y:u.y})),positions,'Stop holds the current physical poses');
 const changed=create();changed.m.advance(.1);assert(issue(changed.m,changed.units,{x:300,y:0}).order.ok);assert(changed.units.every(u=>!u.detour?.departure),'New move cancels departure');
 const closeOrder=create();closeOrder.m.advance(.1);assert(issue(closeOrder.m,closeOrder.units,{x:0,y:404}).order.ok);assert(closeOrder.units.every(u=>!u.detour?.departure),'A fresh nearby order also cancels departure');
 const killed=create(),killedOrigins=killed.units.map(u=>({x:u.x,y:u.y}));killed.m.advance(.1);killed.m.damage(killed.units[0],400,killed.units[1]);
 for(let i=0;i<150;i++)killed.m.advance(.1);
 assert(killed.units.every((u,i)=>i===0||Math.hypot(u.x-killedOrigins[i].x,u.y-killedOrigins[i].y)>20),'A dead member must not hold the remaining convoy');
 const bounded=create();
 bounded.m.nav.terrainAllowed=(x,y)=>Math.abs(x)<20&&y>-45;
 bounded.m.advance(.1);assert(bounded.units.every(u=>!u.detour?.departure),'A turn crossing forbidden ground must be rejected');
 console.log(JSON.stringify({departureReview:true,targetsPreserved:true,saveLoad:true,stop:true,newOrder:true,deadMember:true,forbiddenGround:true}));
}else if(process.argv.includes('--road-only')){
 results.push(run('road two columns',{road:true,target:{x:0,y:300}}));
}else if(process.argv.includes('--packed-search')){
 for(let seed=0;seed<50;seed++)results.push(run('packed '+seed,{packedSeed:seed}));
}else{
for(const degrees of [0,25,45,65,90,135,180])results.push(run('fresh heading '+degrees,{heading:degrees*Math.PI/180}));
results.push(run('same move repeated',{repeat:true}));
results.push(run('move after Stop',{stop:true}));
results.push(run('destroyed van directly ahead',{prepare(m,units){const dead=m.addUnit('bukhanka','rai',{x:-25,y:24});m.damage(dead,400,units[0]);assert(dead.hp<=0&&dead.damage?.wreck);}}));
results.push(run('move cancels battle',{prepare(m,units){const target=m.addStructure('generator','scavs',{x:0,y:155},{hp:100000,maxHp:100000,completed:true,progress:1});m.rebuildNavigation();assert(m.order(units.map(u=>u.id),'attack',target).ok);for(let i=0;i<70;i++)m.advance(.1);},target:{x:300,y:-100}}));
results.push(run('move cancels retreat',{prepare(m,units){const enemy=m.addStructure('generator','scavs',{x:0,y:155},{hp:100000,maxHp:100000,completed:true,progress:1});m.rebuildNavigation();m.setCombatPolicy(units.map(u=>u.id),{retreat:'light'});assert(m.order(units.map(u=>u.id),'attack',enemy).ok);for(let i=0;i<20;i++)m.advance(.1);for(const u of units)m.damage(u,80,enemy);m.advance(.1);},target:{x:300,y:-100}}));
const road=run('road assignment agrees with merge priority',{road:true,target:{x:0,y:300}});results.push(road);
const right=road.initial.findIndex(u=>u.x===6&&u.y===0),left=road.initial.findIndex(u=>u.x===-6&&u.y===0);
assert(road.paths[right].at(-1).y>road.paths[left].at(-1).y,'The in-lane leading car owns the foremost slot');
assert(road.first[right]<=.5,'The free leading car responds in the first half second');
{
 const m=fixture(),units=spawn(m);issue(m,units,{x:0,y:300});
 // Preserve a valid merge lease on an identical command, discard both ends
 // when a genuinely new command supersedes that traffic arrangement.
 units[0].mergeTraffic={[units[1].id]:{leader:units[1].id,path:'old',direction:1,expires:100}};
 units[1].mergeTraffic={[units[0].id]:{leader:units[1].id,path:'old',direction:1,expires:100}};
 const previousPath=units[0].path,lease=units[0].mergeTraffic;
 issue(m,units,{x:0,y:300});assert.equal(units[0].path,previousPath);assert.equal(units[0].mergeTraffic,lease);
 issue(m,[units[0]],{x:150,y:300});assert(!units[0].mergeTraffic);assert(!units[1].mergeTraffic[units[0].id]);
}
}
const report={candidate,sourceHashes:Object.fromEntries(['campaign/mission.js','campaign/traffic-coordinator.js','campaign/vehicle-motion.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),results};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/start-order-latency'+(process.argv.includes('--departure-review')?'-departure-review':candidate?'-ignore-selected':'')+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:results.map(({name,orderCpuMs,first,clearedStart,forwardTen,allStarted,allClear,minimum,damage})=>({name,orderCpuMs,first,clearedStart,forwardTen,allStarted,allClear,minimum,damage}))},null,2));
