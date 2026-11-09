import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {vehicleEnvelope,footprintSupport} from '../campaign/vehicle-collision.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),capture=json('tools/fixtures/junction-occupied-start.json'),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const m=new Mission(config,field);m.state=structuredClone(capture.state);m.serial=capture.serial;m.randomState=capture.randomState;
m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);m.unitIndex.rebuild(m.state.units);
const u=m.entity('u440'),owner=m.entity('u419'),origin={x:u.x,y:u.y},goal={...u.routeOrder.destination};
const lease=m.state.trafficControl.leases.find(l=>l.key==='u419|u440'),zone=structuredClone(lease.zone),expires=lease.expires;
const clearance=()=>{const shape=vehicleEnvelope(owner,config.worldScale,field);return ((shape.x-zone.x)*zone.nx+(shape.y-zone.y)*zone.ny)*zone.exitSign
 -zone.width-footprintSupport(shape,zone.nx,zone.ny);};
const initialMargin=clearance();assert(initialMargin<0,'The recorded owner still physically occupies the crossing');
m.unitIndexActive=true;m.trafficCoordinator.update(m);m.unitIndexActive=false;
assert.equal(m.trafficCoordinator.decisions.get(u.id)?.yieldTo,owner.id);
assert.equal(m.trafficCoordinator.limit(u),0,'A live occupied promise is retained');
const contacts=[],hit=m.vehicleCollision.bind(m);
m.vehicleCollision=(unit,speed,blockers)=>{if(blockers.size)contacts.push({id:unit.id,speed,blockers:[...blockers].map(b=>b.id)});return hit(unit,speed,blockers);};
const start=m.state.time,wall=performance.now();let first=null,releaseMargin=null,firstOwner=null,firstDecision=null,retained=null;
for(let i=0;i<10000&&performance.now()-wall<30000;i++){
 m.advance(1/80,{budgetMs:8});m.effects=[];
 if(Math.hypot(u.x-origin.x,u.y-origin.y)>.01){first=m.state.time-start;releaseMargin=clearance();
  firstOwner=structuredClone(owner);firstDecision=m.trafficCoordinator.decisions.get(u.id);retained=structuredClone(m.state.trafficControl.leases.find(l=>l.key===lease.key));break;}
 if(m.state.time-start>1.5)break;
}
// The immutable lease retains its owner, while the current desired lanes
// can stop intersecting sooner than that original, slightly wider zone.
// Recompute the actual coordinator's geometric exit using its tick-start
// body pose; do not confuse removal of a current conflict with lease expiry.
const a=firstOwner&&{...firstOwner,x:firstOwner.previousX,y:firstOwner.previousY,heading:firstOwner.previousHeading},
 b={...u,...origin,heading:capture.state.units.find(v=>v.id===u.id).heading};
const course=unit=>{const p=unit.path[0],d=Math.hypot(p.x-unit.x,p.y-unit.y);return{x:(p.x-unit.x)/d,y:(p.y-unit.y)/d};};
let ownerPastMargin=null;
if(a){const ac=course(a),bc=course(b),cross=(p,q)=>p.x*q.y-p.y*q.x,den=cross(ac,bc),
 as=vehicleEnvelope(a,config.worldScale,field),bs=vehicleEnvelope(b,config.worldScale,field),
 along=cross({x:b.x-a.x,y:b.y-a.y},bc)/den,
 extent=(footprintSupport(as,-bc.y,bc.x)+footprintSupport(bs,-bc.y,bc.x))/Math.abs(den)+config.worldScale*.45;
 ownerPastMargin=-along-extent;}
const result={passed:first!==null&&first<=1&&ownerPastMargin>0&&retained?.winner===owner.id&&m.state.time<expires&&!contacts.length,
 firstMotionSeconds:first,initialReleaseMargin:initialMargin,frozenZoneMarginAtStart:releaseMargin,ownerPastCurrentCrossingMargin:ownerPastMargin,
 firstDecision,retainedWinner:retained?.winner,contacts,wallMs:performance.now()-wall,
 note:'Exact frozen physical scene, fresh tick; no claim about the discarded suspended browser generator or FPS.'};
assert.deepEqual(u.routeOrder.destination,goal,'Waiting must not replace the accepted destination');
assert.deepEqual(u.path,capture.state.units.find(v=>v.id===u.id).path,'No waypoint is consumed to manufacture a response');
fs.writeFileSync('campaign/reports/junction-occupied-start.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
assert(result.passed,'The live crossing clears while its retained owner keeps priority; no timeout or fake movement');
