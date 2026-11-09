import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMapSampleMission,disableMapSampleBattle} from './check-navigation-map-samples.mjs';
import {checkedRouteRejoin} from '../campaign/traffic-shortcut.js';
import {checkManeuver} from '../campaign/vehicle-motion.js';
import {vehicleEnvelope} from '../campaign/vehicle-collision.js';
import {maneuverAdmissionBlocker} from '../campaign/maneuver-admission.js';
import {fixture} from './check-start-latency-coordinator.mjs';

const data=JSON.parse(fs.readFileSync('tools/fixtures/map-route-rejoin.json'));
function restore(){const m=createMapSampleMission(data.config),save=structuredClone(data.save),bounds=save.state.bounds.slice();
 m.load(save);m.state.bounds=bounds;m.rebuildNavigation();m.updateFog();disableMapSampleBattle(m);return m;}
const finish=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),m=restore(),u=m.entity(data.unitId);
const original={route:structuredClone(u.path),task:structuredClone(u.task),order:structuredClone(u.routeOrder),debt:u.reverseDebt,x:u.x,y:u.y,heading:u.heading};
const allowed=(a,b)=>m.vehicleMotionClear(u,a,b)&&!maneuverAdmissionBlocker(m,u,a,b,.1);
const legs=finish(checkedRouteRejoin(m,u,u.path[0],allowed,.1));assert(legs);
assert.deepEqual({route:u.path,task:u.task,order:u.routeOrder,debt:u.reverseDebt,x:u.x,y:u.y,heading:u.heading},original,
 'The geometric proof cannot move the car or change its route, order or historical reverse debt');
const halfLength=vehicleEnvelope(u,m.config.worldScale,m.field).depth,end=checkManeuver(u,legs,m.config.worldScale,allowed);
const reversed=legs.filter(l=>l.direction<0).reduce((sum,l)=>sum+l.remaining,0);
assert(reversed<=halfLength+1e-6,'The complete plan has a finite footprint-derived reverse bound');
assert(end&&distance(u,u.path[0])-distance(end,u.path[0])>=halfLength-1e-6,
 'The included forward continuation must actually reduce the remaining unchanged route');

const hp=new Map(m.state.units.map(v=>[v.id,v.hp])),goals=new Map(m.state.units.filter(v=>v.routeOrder).map(v=>[v.id,structuredClone(v.routeOrder.destination)]));
let contacts=0,first=null,complete=null;const displacement={},began=m.state.time,start={x:u.x,y:u.y};
const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(...args)=>{contacts++;return collision(...args);};
for(let tick=1;tick<=600;tick++){
 m.advance(.1);const travelled=distance(u,start);
 if(first===null&&travelled>.1)first=m.state.time-began;
 if([10,30,100].includes(tick))displacement[tick/10]=travelled;
 for(const[id,goal]of goals)assert.deepEqual(m.entity(id).routeOrder?.destination,goal,'Every accepted goal remains immutable');
 if(!u.task&&distance(u,original.order.destination)<2){complete=m.state.time-began;break;}
}
assert(first!==null&&first<=.50001);assert(displacement[1]>2&&displacement[3]>5&&displacement[10]>30);
assert(complete!==null&&complete<40,'Actual mission controllers must reach the original accepted position');
assert.equal(contacts,0);for(const[id,value]of hp)assert.equal(m.entity(id).hp,value);

// No available backing arc: cache the exhausted geometric set, then respond
// to an actual opening immediately. The ordinary direct sweep stays enabled.
const blocked=fixture(),v=blocked.addUnit('bukhanka','rai',{x:0,y:0});
v.path=[{x:0,y:200}];v.task={type:'move',x:0,y:200};v.routeOrder={revision:1,destination:{x:0,y:200}};v.reverseDebt=18;
const obstacles=[[-12,0],[12,0],[0,24],[0,-24]].map(([x,y])=>blocked.addUnit('bukhanka','scav',{x,y}));
let probes=0;const blockedAllowed=(a,b)=>{probes++;return blocked.vehicleMotionClear(v,a,b);};
assert.equal(finish(checkedRouteRejoin(blocked,v,v.path[0],blockedAllowed,.1)),null);const before=probes;
for(let i=0;i<5;i++)assert.equal(finish(checkedRouteRejoin(blocked,v,v.path[0],blockedAllowed,.1)),null);
assert.equal(probes,before,'Unchanged failed geometry cannot trigger repeated expensive searches');
const savedBlocked=blocked.save(),blockedBounds=blocked.state.bounds.slice();
for(const other of obstacles)if(other.y)other.hp=0;
assert(finish(checkedRouteRejoin(blocked,v,v.path[0],blockedAllowed,.1)),'An opening invalidates the negative proof');
const loaded=fixture();loaded.load(savedBlocked);loaded.state.bounds=blockedBounds;loaded.rebuildNavigation();
const loadedUnit=loaded.entity(v.id);for(const other of obstacles)if(other.y)loaded.entity(other.id).hp=0;
assert(finish(checkedRouteRejoin(loaded,loadedUnit,loadedUnit.path[0],(a,b)=>loaded.vehicleMotionClear(loadedUnit,a,b),.1)));

for(const change of ['pending-command','revision','topology','body-pose','replacement-plan','accepted-goal','field','unit-pose','kind']){
 const pending=restore(),vehicle=pending.entity(data.unitId);pending.nav.workDeadline=-Infinity;
 const iterator=checkedRouteRejoin(pending,vehicle,vehicle.path[0],(a,b)=>pending.vehicleMotionClear(vehicle,a,b),.1);
 assert.equal(iterator.next().done,false,'The search cooperates with the navigation CPU deadline');
 if(change==='pending-command')vehicle.pendingOrder={revision:99};
 if(change==='revision')vehicle.commandRevision++;
 if(change==='topology')pending.nav.topologyRevision++;
 if(change==='body-pose')pending.entity('u32').x-=1;
 if(change==='replacement-plan')vehicle.detour={legs:[],parking:true};
 if(change==='accepted-goal')vehicle.routeOrder.destination.x+=1;
 if(change==='field')pending.field=Object.create(pending.field);
 if(change==='unit-pose')vehicle.x+=1;
 if(change==='kind')vehicle.kind='command';
 pending.nav.workDeadline=Infinity;
 assert.equal(finish(iterator),null,`Do not publish a proof invalidated by ${change}`);
}
console.log(JSON.stringify({first,complete,contacts,displacement,halfLength,reversed,
 routeProgress:distance(original,original.route[0])-distance(end,original.route[0]),goalError:distance(u,original.order.destination),
 negativeCache:'five unchanged calls, no extra probes',opening:'invalidated',saveLoad:'invalidated',staleProofs:9}));
