import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';

import {roadDrivingLane} from '../campaign/road-merge.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
if(!fs.existsSync('campaign/mission02-diagnostic.js')){console.log('SKIP: second mission is not present in this checkout');process.exit(0);}
const {prepareM02Diagnostic}=await import('../campaign/mission02-diagnostic.js');
fs.mkdirSync('campaign/previews/playtest-WG-045',{recursive:true});
const m=prepareM02Diagnostic(makeMission());
for(const b of Object.values(m.state.m02.bases))if(b.production)b.production.stopped=true;
for(const spec of Object.values(m.config.buildings))spec.damage=0;
m.state.units=[];m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);
const segments=m.nav.roads.routes.get('junction-1--junction-7-2'),at=n=>{
 const s=segments.find(p=>p.progress<=n&&p.progress+p.length>=n);if(!s)throw Error('No road segment '+n);
 return {x:s.a.x+s.ux*(n-s.progress),y:s.a.y+s.uy*(n-s.progress),heading:Math.atan2(-s.ux,s.uy),ux:s.ux,uy:s.uy};
};
const units=[];
for(let row=0;row<14&&units.length<20;row++)for(const lateral of [-8,8]){
 const p=at(440-row*25);p.x+=p.uy*lateral;p.y-=p.ux*lateral;Object.assign(p,{kind:'bukhanka',owner:'rai'});
 if(m.vehicleMotionClear(p,p,p)&&units.every(u=>vehicleClearance(p,u,m.config.worldScale,m.field)>0)){
  const u=m.addUnit('bukhanka','rai',p,{heading:p.heading});u.trafficOnScreen=true;units.push(u);
 }
}
assert.equal(units.length,20);
assert(m.setCombatPolicy(units.map(u=>u.id),{retreat:'light',response:'ignore'}).ok);
assert(m.submitOrder(units.map(u=>u.id),'attack-move',at(745)).ok);
fs.writeFileSync('campaign/previews/playtest-WG-045/m02-split-start.json',m.save());
let hit=false,last=-10,frames=0,maxShoulder=0,maxRetreat=0;const wall=performance.now(),arrived=new Set();
let damaged=[],start=[];
const enemy=m.state.buildings.find(b=>b.owner==='scavs'&&b.hp>0);
assert(enemy);
while(m.state.time<140&&performance.now()-wall<90000){
 m.advance(1/30,{budgetMs:6});frames++;
 for(const u of units.slice(10))if(u.navigation?.state==='ARRIVED'&&u.navigation.reason==='destination-reached')arrived.add(u.id);
 if(!hit&&m.state.time>=5){hit=true;damaged=units.slice(0,10);start=units.map(u=>({x:u.x,y:u.y}));
  for(const u of damaged)m.damage(u,70,enemy);fs.writeFileSync('campaign/previews/playtest-WG-045/m02-split-hit.json',m.save());console.log('damage applied',damaged.map(u=>u.id).join(','));}
 if(m.state.time>=last+10){last=Math.floor(m.state.time/10)*10;
  const shoulder=units.filter(u=>u.combatRetreat&&u.path?.length&&roadDrivingLane(m,u,u.path[0],m.config.worldScale)?.retreatShoulder).length;
  maxShoulder=Math.max(maxShoulder,shoulder);maxRetreat=Math.max(maxRetreat,units.filter(u=>u.combatRetreat).length);
  const stalled=units.filter(u=>u.navigation?.waitSeconds>5).map(u=>u.id);
  console.log(JSON.stringify({time:+m.state.time.toFixed(1),wall:+((performance.now()-wall)/1000).toFixed(1),
   moved:hit?units.filter((u,i)=>Math.hypot(u.x-start[i].x,u.y-start[i].y)>25).length:0,
   retreat:units.filter(u=>u.combatRetreat).length,shoulder,stalled}));
 }
}
const result={time:m.state.time,wall:(performance.now()-wall)/1000,maxShoulder,maxRetreat,arrived:[...arrived],units:units.map((u,i)=>({id:u.id,damaged:i<10,hp:u.hp,x:u.x,y:u.y,moved:hit?Math.hypot(u.x-start[i].x,u.y-start[i].y):0,task:u.task,nav:u.navigation,goal:u.routeOrder?.destination,retreat:u.combatRetreat}))};
fs.writeFileSync(process.argv.includes('--baseline')?'campaign/previews/playtest-WG-045/m02-combat-split-baseline.json':'campaign/previews/playtest-WG-045/m02-combat-split-result.json',JSON.stringify(result,null,2));
assert(maxRetreat===10,'The ten lightly damaged vehicles must actually retreat');
if(!process.argv.includes('--baseline'))assert(maxShoulder>0,'Retreaters must choose the shoulder when facing attackers');
assert(result.units.every(u=>u.moved>25),'Every vehicle must make real progress');
assert.equal(arrived.size,10,'The ten attackers must each reach their assigned destination');
console.log('PASS: 20 vehicles move; ten lightly damaged retreat and the ten attackers arrive');
