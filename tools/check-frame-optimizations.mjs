import assert from 'node:assert/strict';
import {createFogMask} from '../campaign/fog-mask.js';
import {createFogMask as referenceFog} from './fixtures/fog-mask-reference.mjs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {TrafficPlanner} from '../campaign/traffic-planner.js';
import {trafficConditionKey} from '../campaign/traffic-context.js';
import {distribution} from '../campaign/performance.js';
import {installNavigationTelemetry} from '../campaign/navigation-telemetry.js';
const results=[];
{
 globalThis.location={hostname:'localhost',search:''};
 const originalTimer=globalThis.setInterval;let intervals=0;
 globalThis.setInterval=()=>{intervals++;throw Error('Telemetry timer must be opt-in');};
 try{assert.equal(installNavigationTelemetry(new Proxy({},{get(){throw Error('Disabled telemetry touched the mission');}}),()=>{throw Error('Disabled telemetry serialized context');}),null);assert.equal(intervals,0);}
 finally{globalThis.setInterval=originalTimer;delete globalThis.location;}
 results.push({case:'Disabled navigationTelemetry does not access/mutate mission, serialize context or install intervals',passed:true});
}
globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})};
const T={DataTexture:class{constructor(data){this.image={data};}}},mask=createFogMask(T),reference=referenceFog(T);
const m={state:{bounds:[0,0,127,127]},explored:new Uint8Array(128**2),visionSources:[{x:20,y:30,radius:8},{x:90,y:70,radius:13}],fogRevision:0};
for(let step=0;step<45;step++){
 m.fogRevision++;m.visionSources[0].x+=.7;m.visionSources[0].y+=.1;
 if(step===10)m.visionSources.pop();if(step===15)m.visionSources.push({x:122,y:3,radius:5});
 if(step===20)m.state.bounds=[10,5,110,120];if(step===25){m.explored.fill(0);m.state={bounds:[0,0,127,127]};}
 for(const s of m.visionSources)for(let y=Math.max(0,Math.ceil(s.y-s.radius));y<=Math.min(127,s.y+s.radius);y++)for(let x=Math.max(0,Math.ceil(s.x-s.radius));x<=Math.min(127,s.x+s.radius);x++)if(Math.hypot(x-s.x,y-s.y)<=s.radius)m.explored[y*128+x]=255;
 mask.update(m,step*250);reference.update(m);assert.deepEqual(mask.texture.image.data,reference.texture.image.data,'Exact RG bytes at update '+step);
}
const history=mask.stats.historyUpdates,updates=mask.stats.updates,bytes=mask.texture.image.data.slice();m.fogRevision++;
assert.equal(mask.update(m,11001),false,'Wall-clock throttle');mask.update(m,11250);
assert.equal(mask.stats.historyUpdates,history,'No explored change: no blur');assert.equal(mask.stats.updates,updates,'Stationary visibility: no upload');assert.deepEqual(mask.texture.image.data,bytes);
results.push({case:'45 moving, disappearing, boundary and load fog updates match the original byte for byte; unchanged history/throttle',passed:true});
{
 const m=fixture(),a=m.addUnit('bukhanka','rai',{x:-30,y:0}),b=m.addUnit('bukhanka','rai',{x:30,y:0});
 a.path=[{x:180,y:0}];a.task={type:'move',x:180,y:0};a.routeOrder={destination:{x:180,y:0}};
 a.damage={wreck:false,parts:{1:{detached:true}},cage:new Float32Array(50000)};
 a.detour={reservedCorridor:[{from:{x:0,y:0,heading:0},to:{x:10,y:0,heading:0}}],legs:[]};
 const p=new TrafficPlanner(),job=()=>p.enqueue(m,'passage',[a.id,b.id],'test');
 const first=job();p.snapshot(m,first);const original=JSON.stringify(first.shadow.state),buffer=first.buffer;
 for(const u of [a,b])assert.equal(trafficConditionKey(first.shadow,first.shadow.entity(u.id)),trafficConditionKey(m,u),'Traffic witness preserved');
 assert(!first.shadow.entity(a.id).damage.cage);assert(!first.shadow.state.salvage);
 a.x+=1;a.path[0].x+=1;a.damage.parts[1].detached=false;m.visible[0]=255;
 const second=job();p.snapshot(m,second);assert.notEqual(first.buffer,second.buffer);assert.equal(JSON.stringify(first.shadow.state),original,'Unfinished snapshot not overwritten');
 assert.equal(first.shadow.visible[0],0,'Snapshot vision is private');
 p.dispose(first);const third=job();p.snapshot(m,third);assert.equal(third.buffer,buffer,'Released buffer reused');assert.notEqual(second.shadow.state,third.shadow.state);
 assert.notEqual(third.shadow.entity(a.id).path,a.path);assert.equal(third.shadow.trafficCoordinator.liveMission,third.shadow);
 p.dispose(second);p.dispose(third);
 const times=[];for(let i=0;i<100;i++){const j=job(),start=performance.now();p.snapshot(m,j);times.push(performance.now()-start);p.dispose(j);}
 results.push({case:'Private pooled snapshots preserve witnesses and damage mobility; suspended jobs isolated',passed:true,snapshotMs:distribution(times)});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0}),goal={x:0,y:120};
 u.path=[goal];u.task={type:'move',...goal};u.routeOrder={destination:goal};m.state.navigationSurfaceVersion='obsolete';
 m.trafficCoordinator.update(m);assert(u.routeTopologyPending);assert(m.trafficCoordinator.routes.has(u.id));
 for(let i=0;i<500&&(u.routeTopologyPending||u.path.length);i++)m.advance(.1);
 assert(!u.routeTopologyPending,'Validated route releases the migration hold');assert(Math.hypot(u.x-goal.x,u.y-goal.y)<2,'Original destination is retained');
 results.push({case:'routeTopologyPending migrates a stale saved surface through checked routing and releases the hold',passed:true});
}
console.log(JSON.stringify({results},null,2));
