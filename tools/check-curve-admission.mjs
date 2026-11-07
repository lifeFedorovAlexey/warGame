import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {driveStep} from '../campaign/vehicle-motion.js';
import {vehicleDynamics} from '../campaign/vehicle-dynamics.js';
const sourceFiles=['mission.js','vehicle-motion.js','turning-headway.js','maneuver-admission.js','vehicle-collision.js','vehicle-dynamics.js','traffic-coordinator.js'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync('campaign/'+file)).digest('hex')]));
const sourceHashes=hashes();
// Changing a waypoint must not permit a new turn above its safe speed, or
// instantaneously discard momentum. Continue along a checked current arc
// at the maximum normal braking rate until the new turn can be entered.
{
 const unit={kind:'bukhanka',x:0,y:0,heading:0,steering:0,driveSpeed:20,reversing:false};
 const dt=.1,dynamics=vehicleDynamics(unit),checked=[];
 const pose=driveStep(unit,{x:40,y:40},dt,{speed:40,grade:0,scale:4.5,tolerance:2,
  allowed:(from,to)=>{checked.push({from,to});return true;},curveLimit:curve=>Math.abs(curve)<1e-8?Infinity:5});
 assert(pose&&checked.length,'The braking continuation still requires an actual swept-body check');
 assert.equal(pose.steering,0,'Do not enter a newly unsafe turn at the old speed');
 assert(Math.abs(pose.driveSpeed-(unit.driveSpeed-dynamics.braking*dt))<1e-9,'Preserve normal braking inertia');
 assert.equal(pose.x,0);assert(pose.y>0);
}
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const data=json('tools/fixtures/turning-alternative-contact.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
const units=data.units.map(r=>m.addUnit(r.kind,'rai',r,{id:r.id,heading:r.heading}));
const give=i=>{const u=units[i],r=data.units[i],goal=r.path.at(-1);u.path=structuredClone(r.path);u.task={type:'move',...goal};
 u.commandRevision=1;u.routeOrder={revision:2,request:data.request,destination:{...goal}};};
const contacts=[],hit=m.vehicleCollision.bind(m);let minimum=Infinity;
m.vehicleCollision=(u,speed,blockers)=>{if(blockers.size)contacts.push({time:m.state.time,id:u.id,speed,blockers:[...blockers].map(b=>b.id)});return hit(u,speed,blockers);};
give(0);let issued=false;
for(let frame=0;frame<120*80;frame++){
 if(!issued&&frame/80>=data.assignmentDelay){give(1);issued=true;}
 m.advance(1/80,{budgetMs:8});m.effects=[];
 minimum=Math.min(minimum,vehicleClearance(units[0],units[1],config.worldScale,field));
 if(issued&&units.every(u=>!u.task&&!u.path.length&&!u.detour))break;
}
const errors=units.map((u,i)=>Math.hypot(u.x-data.units[i].path.at(-1).x,u.y-data.units[i].path.at(-1).y));
const sourceChanged=JSON.stringify(sourceHashes)!==JSON.stringify(hashes());
const result={passed:!sourceChanged&&!contacts.length&&minimum>=0&&errors.every(e=>e<2.5)&&units.every(u=>!u.task&&!u.path.length&&!u.detour&&u.hp===u.maxHp),
 seconds:m.state.time,minimum,errors,contacts,hp:units.map(u=>u.hp),sourceHashes,sourceChanged};
fs.writeFileSync('campaign/reports/curve-admission.json',JSON.stringify(result,null,2));
if(!result.passed)fs.writeFileSync('tools/fixtures/curve-admission-failed.json',m.save());
console.log(JSON.stringify(result));assert(result.passed,'Every executed curve must be admitted and both original destinations reached');
