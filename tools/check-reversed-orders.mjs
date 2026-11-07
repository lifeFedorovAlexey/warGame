import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const files=['campaign/mission.js','campaign/navigation.js','campaign/command-planner.js','campaign/arrival-planner.js'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const sourceHashes=hashes(),results=[];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const done=u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn;
const countFilter=Number(process.argv.find(a=>a.startsWith('--count='))?.split('=')[1]),intervalFilter=Number(process.argv.find(a=>a.startsWith('--interval='))?.split('=')[1]);
for(const count of [1,6])for(const interval of [.2,2]){
 if(countFilter&&countFilter!==count||intervalFilter&&intervalFilter!==interval)continue;
 const m=new Mission(config,field),p=field.gridToWorld(config.startGrid);
 Object.assign(m.state,{units:[],buildings:[],camps:[],pendingCinematics:[],artifacts:[],bounds:config.finalMapBounds.slice()});
 m.state.salvage.items=[];m.updateMission=()=>{};m.visible.fill(255);m.explored.fill(255);m.rebuildNavigation();
 const units=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',
  {x:p.x+(count===1?0:i<3?-6:6),y:p.y+(count===1?0:(i%3-1)*26)},{heading:0}));
 assert(units.every(u=>m.nav.terrainAllowed(u.x,u.y)));
 const ids=units.map(u=>u.id),goals=[{x:p.x,y:p.y+240},{x:p.x,y:p.y-240},{x:p.x,y:p.y+240}],issued=[],samples=[],finalGoals=new Map();
 let next=0,contacts=0,terrainBlocks=0,gap=Infinity,lastTime=0,postLastOrigins=null,postLastMotion=units.map(()=>null),
  postLastHalfWorld=units.map(()=>null),postLastFiveWorld=units.map(()=>null),idle=units.map(()=>0),maximumIdle=units.map(()=>0);
 const idleWindows=[],idleReasons=units.map(()=>new Map()),defects=new Set();
 const contactEvents=[],collision=m.vehicleCollision.bind(m);m.vehicleCollision=(...args)=>{if(args[2]?.size)contacts++;else terrainBlocks++;contactEvents.push({t:m.state.time,impactSpeed:args[1],
  units:[args[0],...(args[2]??[])].map(u=>({id:u?.id,x:u?.x,y:u?.y,heading:u?.heading,speed:u?.driveSpeed,detour:u?.detour?structuredClone(u.detour):null}))});return collision(...args);};
 const started=performance.now();
 for(let frame=0;frame<80*100;frame++){
  while(next<3&&frame/80+1e-9>=next*interval){
   const result=m.submitOrder(ids,'move',goals[next]);issued.push({at:frame/80,sim:m.state.time,result});
   assert(result.ok);if(next===2)postLastOrigins=units.map(u=>({x:u.x,y:u.y}));next++;
  }
  const before=units.map(u=>({x:u.x,y:u.y}));m.advance(1/80,{budgetMs:8});
  const dt=m.state.time-lastTime;
  if(dt>0){
   for(const [i,u] of units.entries()){
    if(next===3){
     if(!u.pendingOrder&&u.routeOrder&&u.commandRevision===issued[2].result.revision)finalGoals.set(u.id,{...u.routeOrder.destination});
     const displacement=distance(u,postLastOrigins[i]),elapsed=m.state.time-issued[2].sim;
     if(postLastMotion[i]===null&&displacement>.01)postLastMotion[i]=elapsed;
     if(postLastHalfWorld[i]===null&&displacement>.5)postLastHalfWorld[i]=elapsed;
     if(postLastFiveWorld[i]===null&&displacement>5)postLastFiveWorld[i]=elapsed;
     if(!done(u)&&distance(u,before[i])<1e-4){
      idle[i]+=dt;const nav=u.navigation??{},key=[nav.reason,nav.blockerId,nav.nextAction].join('|');
      idleReasons[i].set(key,{reason:nav.reason,blocker:nav.blockerId,nextAction:nav.nextAction});
     }else{
      if(idle[i]>.50001)idleWindows.push({unit:u.id,seconds:idle[i],ended:m.state.time,reasons:[...idleReasons[i].values()]});
      idle[i]=0;idleReasons[i].clear();
     }
     maximumIdle[i]=Math.max(maximumIdle[i],idle[i]);
     if(u.navigation?.potentialDefect)defects.add(u.id+':'+u.navigation.reason);
    }
    for(let j=0;j<i;j++)gap=Math.min(gap,vehicleClearance(u,units[j],config.worldScale,field));
   }
   samples.push({t:m.state.time,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,
    pending:u.pendingOrder?{...u.pendingOrder}:null,task:u.task?{...u.task}:null,route:u.routeOrder?structuredClone(u.routeOrder):null,
    detour:u.detour?structuredClone(u.detour):null,navigation:u.navigation?{...u.navigation}:null,path:u.path.map(p=>({...p})),watch:u.driveWatch?{...u.driveWatch}:null}))});
  }
  lastTime=m.state.time;
  if(next===3&&units.every(done))break;
 }
 const failures=[];
 if(units.some(u=>u.pendingOrder))failures.push('A superseded or repeated order remained pending/blocked');
 if(units.some(u=>!done(u)||!finalGoals.has(u.id)||distance(u,finalGoals.get(u.id))>=2.5))failures.push('Every final accepted destination must actually be reached');
 if(units.some(u=>distance(u.routeOrder?.request??u,goals[2])>.01))failures.push('The final request was replaced by an older order');
 if(postLastMotion.some(t=>t===null||t>.50001))failures.push('Actual movement must respond to the last command within .5s');
 if(postLastFiveWorld.some(t=>t===null||t>3))failures.push('The renewed departure must continue beyond its first tiny movement');
 if(defects.size)failures.push('Unexplained stops or waiting cycles remain');
 if(contacts||gap<0||units.some(u=>u.hp!==u.maxHp))failures.push('Reissuing commands caused contact or damage');
 const result={count,interval,issued,seconds:m.state.time,wallMs:performance.now()-started,postLastMotion,postLastHalfWorld,postLastFiveWorld,
  maximumIdle,idleWindows,defects:[...defects],contacts,terrainBlocks,contactEvents,gap,
  arrived:units.filter(done).length,passed:!failures.length,failures,finalGoals:[...finalGoals],samples};
 results.push(result);console.log(JSON.stringify({...result,samples:undefined,finalGoals:undefined}));
}
const report={sourceHashes,sourceChanged:JSON.stringify(sourceHashes)!==JSON.stringify(hashes()),results};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/reversed-orders'+(process.argv.includes('--before')?'-before':'')+'.json',JSON.stringify(report,null,2));
assert(!report.sourceChanged,'Production code changed during measurement');
assert(results.every(r=>r.passed),'Real-terrain forward/back/forward acceptance failed; inspect the recorded states');
