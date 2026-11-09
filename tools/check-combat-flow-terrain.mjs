import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const m=new Mission(config,field),p=field.gridToWorld(config.startGrid);
m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.pendingCinematics=[];m.updateMission=()=>{};
const units=Array.from({length:9},(_,i)=>m.addUnit('bukhanka','rai',{x:p.x+(i%3-1)*28,y:p.y-20-Math.floor(i/3)*30}));
const enemies=Array.from({length:4},(_,i)=>m.addUnit('raider','scavs',{x:p.x+(i%2?35:-35),y:p.y+165+Math.floor(i/2)*35}));
m.rebuildNavigation();m.updateFog();m.explored.fill(1);
const goal={x:p.x,y:p.y+270};assert(m.order(units.map(u=>u.id),'attack-move',goal).ok);
const acceptedSlots=units.map(u=>({x:u.task.x,y:u.task.y})),completed=new Map();
let clearedAt=null,arrivedAt=null,minimum=Infinity,maxSideDeviation=0;
for(let i=0;i<900;i++){
 m.advance(.1);m.effects=[];
 if(clearedAt===null&&enemies.every(u=>u.hp<=0))clearedAt=m.state.time;
 for(let a=0;a<units.length;a++){
  const unit=units[a];
  assert(!unit.combatDeployment||!unit.combatResume&&!unit.combatParking,'New contacts cannot retain stale march-planning state');
  if(!unit.task&&unit.combatParking&&!completed.has(unit.id))completed.set(unit.id,{time:m.state.time,x:unit.x,y:unit.y,goal:{...unit.combatParking.goal}});
  maxSideDeviation=Math.max(maxSideDeviation,Math.abs(units[a].x-goal.x));
  for(let b=a+1;b<units.length;b++)minimum=Math.min(minimum,vehicleClearance(units[a],units[b],config.worldScale,field));
 }
 if(clearedAt!==null&&units.every(u=>!u.task&&!u.path.length&&!u.detour)){arrivedAt=m.state.time;break;}
}
const result={time:m.state.time,goal,acceptedSlots,clearedAt,arrivedAt,minimum,maxSideDeviation,units:units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,task:u.task,path:u.path,parking:u.combatParking,completion:completed.get(u.id)}))};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-flow-terrain.json',JSON.stringify(result,null,2));
assert(clearedAt!==null,'Defeat moving enemies on the actual mission terrain');
assert(arrivedAt!==null,'Every vehicle must finish regrouping, not keep seeking a blocked parking place');
assert(units.every(u=>u.hp>0&&!u.combatDeployment),'Every member survives and leaves combat deployment');
// Validate the same accepted-slot contract as the rendered test. A circle
// around the click ignores initial formation offsets and terrain parking.
assert(result.units.every(u=>u.completion&&Math.hypot(u.completion.x-u.completion.goal.x,u.completion.y-u.completion.goal.y)<=config.worldScale*4),'Reach the committed goal when the order completes');
assert(units.every(u=>Math.hypot(u.combatParking.goal.x-u.combatParking.anchor.x,u.combatParking.goal.y-u.combatParking.anchor.y)<=config.worldScale*14),'Replanning remains inside the original parking area');
assert(units.every(u=>acceptedSlots.some(slot=>Math.hypot(u.combatParking.anchor.x-slot.x,u.combatParking.anchor.y-slot.y)<=config.worldScale*6+.01)),'Resumed destinations come from the original accepted formation, never from firing positions');
assert(minimum>=0,'Keep hull collisions during the fight and subsequent regrouping');
assert(maxSideDeviation<160,'Do not take the distant eastern ridge detour to an adjacent parking slot');
console.log(JSON.stringify({passed:true,clearedAt,arrivedAt,minimum,maxSideDeviation}));
// Captured after a real rendered battle. A reset of driveWatch at the end of
// each short manoeuvre used to leave u40 permanently blocked by its own group.
const captured=json('tools/fixtures/combat-arrival.json');
m.state.units=captured.units;m.state.time=captured.time;m.state.trafficControl={version:1,leases:[],waiting:{}};
m.unitIndex.rebuild(m.state.units);m.rebuildNavigation();
while(m.state.time<90-1e-6&&m.state.units.some(u=>u.task||u.path.length||u.detour)){m.advance(.1);m.effects=[];}
fs.writeFileSync('campaign/reports/combat-arrival-replay.json',JSON.stringify({time:m.state.time,units:m.state.units},null,2));
assert(m.state.units.every(u=>!u.task&&!u.path.length&&!u.detour),'The captured post-battle traffic jam must resolve');
const stopped=m.state.units.map(u=>({x:u.x,y:u.y}));
for(let step=0;step<100;step++){m.advance(.1);m.effects=[];}
assert.deepEqual(m.state.units.map(u=>({x:u.x,y:u.y})),stopped,'Finished regrouping remains idle without periodic manoeuvre retries');
console.log(JSON.stringify({capturedArrivalPassed:true,units:m.state.units.length}));
