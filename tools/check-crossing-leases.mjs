import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {vehicleEnvelope,footprintSupport,vehicleClearance} from '../campaign/vehicle-collision.js';

const cross=(a,b)=>a.x*b.y-a.y*b.x;
const results=[];
{
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:-45,y:0},{heading:-Math.PI/2}),b=m.addUnit('bukhanka','rai',{x:0,y:-45});
 const goals=[{x:90,y:0},{x:0,y:90}];
 for(const [i,u] of [a,b].entries()){u.path=[goals[i]];u.task={type:'move',...goals[i]};}
 m.advance(.1);const initial=m.state.trafficControl.leases[0],winner=m.entity(initial.winner),goal=goals[winner===a?0:1];
 for(let i=0;i<100&&Math.hypot(winner.x,winner.y)>2;i++)m.advance(.1);
 assert(Math.hypot(winner.x,winner.y)<2,'The owner must actually occupy the crossing');
 m.stop([winner.id]);const parked={x:winner.x,y:winner.y},key=initial.key;
 const restored=fixture();restored.load(m.save());restored.state.bounds=m.state.bounds.slice();restored.rebuildNavigation();
 for(let i=0;i<100;i++){
  // Isolate clock expiry from an unrelated idle-yield manoeuvre: the
  // coordinator receives the same physically occupied poses as time passes.
  for(const scene of [m,restored]){scene.state.time+=.1;scene.unitIndex.rebuild(scene.state.units);scene.trafficCoordinator.update(scene);}
  assert.equal(m.state.trafficControl.leases.find(l=>l.key===key)?.winner,winner.id,'An occupied crossing cannot expire after four seconds');
  assert.deepEqual(restored.state.trafficControl,m.state.trafficControl,'Occupied ownership survives save/load');
 }
 assert.deepEqual({x:winner.x,y:winner.y},parked);
 const loser=winner===a?b:a;
 assert(!m.vehicleMotionClear(loser,loser,winner),'Stopping must not erase the owner physical footprint');
 assert(m.order([winner.id],'move',goal).ok);
 for(let i=0;i<500&&[a,b].some(u=>u.task||u.path.length||u.detour);i++)m.advance(.1);
 assert([a,b].every((u,i)=>!u.task&&!u.path.length&&!u.detour&&Math.hypot(u.x-goals[i].x,u.y-goals[i].y)<2.5));
 assert([a,b].every(u=>u.hp===u.maxHp));assert(vehicleClearance(a,b,config.worldScale,m.field)>=0);
 assert(!m.state.trafficControl.leases.some(l=>l.key===key),'Actual full-body clearance releases the lease');
 results.push({case:'Stop inside crossing, save, resume and physical release',passed:true,seconds:m.state.time});
}
{
 const m=fixture(),units=Array.from({length:20},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%4-1.5)*35,y:-Math.floor(i/4)*35-55}));
 m.addStructure('factory','rai',{x:0,y:40},{completed:true,progress:1});
 const target=m.addStructure('camp-core','scavs',{x:0,y:140},{completed:true,progress:1,hp:100000,maxHp:100000});
 m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
 const observed=new Map(),violations=[],fired=new Set();let grants=0;
 const update=m.trafficCoordinator.update.bind(m.trafficCoordinator);
 m.trafficCoordinator.update=mission=>{
  // Independently retire a recorded promise only when the owner's complete
  // OBB is beyond the opposing physical lane, or a cancelled route is outside.
  for(const [key,o] of observed){
   const winner=m.entity(o.winner),goal=winner?.path.at(-1),waypoint=winner?.path[0];
   if(!winner||winner.hp<=0){observed.delete(key);continue;}
   const shape=vehicleEnvelope(winner,config.worldScale,m.field),side=(shape.x-o.x)*o.nx+(shape.y-o.y)*o.ny;
   const extent=footprintSupport(shape,o.nx,o.ny)+o.width;
   const leftCorridor=Math.abs((shape.x-o.x)*o.ownNx+(shape.y-o.y)*o.ownNy)>footprintSupport(shape,o.ownNx,o.ownNy)+o.ownWidth;
   const changed=!goal||goal.x!==o.goal.x||goal.y!==o.goal.y||waypoint?.x!==o.waypoint.x||waypoint?.y!==o.waypoint.y;
   if(side*o.sign>extent||leftCorridor||changed&&Math.abs(side)>extent)observed.delete(key);
  }
  update(mission);
  for(const l of m.state.trafficControl.leases){
   const prior=observed.get(l.key);
   if(prior){if(prior.winner!==l.winner)violations.push({time:m.state.time,key:l.key,before:prior.winner,after:l.winner});continue;}
   const winner=m.entity(l.winner),other=m.entity(l.winner===l.a?l.b:l.a);
   const wa=m.trafficCoordinator.intents.get(winner.id)?.course,wb=m.trafficCoordinator.intents.get(other.id)?.course;
   if(!wa||!wb||Math.abs(cross(wa,wb))<.1||wa.x*wb.x+wa.y*wb.y>.82)continue;
   const delta={x:other.x-winner.x,y:other.y-winner.y},along=cross(delta,wb)/cross(wa,wb),nx=-wb.y,ny=wb.x;
   observed.set(l.key,{winner:l.winner,x:winner.x+wa.x*along,y:winner.y+wa.y*along,nx,ny,
    width:footprintSupport(vehicleEnvelope(other,config.worldScale,m.field),nx,ny)+config.worldScale*.055,
    ownNx:-wa.y,ownNy:wa.x,ownWidth:footprintSupport(vehicleEnvelope(winner,config.worldScale,m.field),-wa.y,wa.x)+config.worldScale*.055,
    sign:Math.sign(wa.x*nx+wa.y*ny),goal:{...winner.path.at(-1)},waypoint:{...winner.path[0]}});grants++;
  }
 };
 assert(m.submitOrder(units.map(u=>u.id),'attack',target).ok);
 for(let i=0;i<80*80&&fired.size<20;i++){
  m.advance(1/80,{budgetMs:6});for(const e of m.effects)if(e.type==='shot'&&units.some(u=>u.id===e.from))fired.add(e.from);m.effects=[];
 }
 assert(grants>10,'The real twenty-car case must exercise interacting crossing promises');
 assert.deepEqual(violations,[],'A later DAG reconciliation must not reverse a physically uncleared promise');
 assert.equal(fired.size,20,'Persistent precedence must still let the whole group reach usable firing positions');
 results.push({case:'twenty interacting approach priorities',passed:true,grants,seconds:m.state.time,fired:fired.size});
}
const report={passed:true,scope:'Crossing ownership and lifetime; full contact acceptance remains in check-combat-sight.mjs',results,
 sourceSHA:createHash('sha256').update(fs.readFileSync('campaign/traffic-coordinator.js')).digest('hex')};
fs.writeFileSync('campaign/reports/crossing-leases.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
