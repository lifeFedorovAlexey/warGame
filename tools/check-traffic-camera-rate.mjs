import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {trafficCollisionRequired} from '../campaign/vehicle-collision.js';

const results=[];
// Camera flags are inputs here; real frustum/frame ordering is checked by the
// browser companion. Exercise four physical ticks per public advance call.
for(const cameraChanges of [false,true]){
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0}),v=m.addUnit('bukhanka','rai',{x:80,y:0}),goal={x:0,y:120};
 u.path=[{...goal}];u.task={type:'move',...goal};u.routeOrder={destination:{...goal}};
 m.state.navigationSurfaceVersion='obsolete';m.trafficCoordinator.update(m);
 assert(u.routeTopologyPending);assert(m.trafficCoordinator.routes.has(u.id));
 const version=u.routeTopologyPending;let flips=0,frames=0;
 for(;frames<300&&(u.routeTopologyPending||u.path.length||u.task);frames++){
  const visible=!cameraChanges||frames%2===0;
  u.trafficOnScreen=v.trafficOnScreen=visible;if(cameraChanges)flips++;
  assert(trafficCollisionRequired(u,v),'Camera visibility must not change collision rules');
  if(!visible){v.trafficOnScreen=true;assert(trafficCollisionRequired(u,v));v.trafficOnScreen=false;}
  m.advance(.4,{rate:4});
  assert(!u.routeTopologyPending||u.routeTopologyPending===version,'Migration marker is stable across camera changes');
 }
 assert(!u.routeTopologyPending,'Checked routing releases migration hold at x4');
 assert(Math.hypot(u.x-goal.x,u.y-goal.y)<2,'Keep original destination at x4');
 assert.equal(u.hp,u.maxHp);assert.equal(v.hp,v.maxHp);
 results.push({cameraChanges,flips,frames,simSeconds:m.state.time,distance:Math.hypot(u.x-goal.x,u.y-goal.y),routes:m.trafficCoordinator.routes.size});
}
console.log(JSON.stringify({passed:true,results}));
