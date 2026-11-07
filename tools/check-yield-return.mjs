import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {checkManeuver} from '../campaign/vehicle-motion.js';
import {rememberYieldHome} from '../campaign/traffic-start.js';

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){
 const m=new Mission({...config,initialMapBounds:[0,0,127,127],finalMapBounds:[0,0,127,127]},field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.updateMission=()=>{};m.rebuildNavigation();return m;
}
const legs=[{direction:1,curve:.4,remaining:13},{direction:-1,curve:-.2,remaining:3},
 {direction:1,curve:0,remaining:8}];
const home={x:0,y:0,heading:.37,kind:'bukhanka'};
const end=checkManeuver(home,legs,config.worldScale,()=>true);
const inverse=legs.toReversed().map(l=>({...l,direction:-l.direction,curve:-l.curve}));
const roundtrip=checkManeuver(end,inverse,config.worldScale,()=>true);
assert(Math.hypot(roundtrip.x-home.x,roundtrip.y-home.y)<1e-10);
assert(Math.abs(Math.atan2(Math.sin(roundtrip.heading-home.heading),Math.cos(roundtrip.heading-home.heading)))<1e-10);

function outgoing(){
 const m=fixture(),u=m.addUnit('bukhanka','rai',home,{heading:home.heading});
 rememberYieldHome(u,[],false,m.state.time);
 u.detour={legs:structuredClone(legs),parking:true,idleYield:true,blocked:0};
 while(u.detour)m.advance(.1);
 assert(u.yieldReturn.legs.length);return {m,u};
}
const simple=outgoing(),loaded=fixture();loaded.load(simple.m.save());
for(let i=0;i<200&&simple.u.yieldReturn;i++){
 simple.m.advance(.1);loaded.advance(.1);
 const restored=loaded.state.units[0];
 assert.deepEqual([simple.u.x,simple.u.y,simple.u.heading,simple.u.yieldReturn],
  [restored.x,restored.y,restored.heading,restored.yieldReturn]);
}
assert(!simple.u.yieldReturn);
assert(Math.hypot(simple.u.x-home.x,simple.u.y-home.y)<1e-9);
assert.equal(simple.u.hp,simple.u.maxHp);

const blocked=outgoing(),blocker=blocked.m.addUnit('bukhanka','rai',home,{heading:home.heading});
const before={x:blocked.u.x,y:blocked.u.y};
blocked.m.advance(.1);
assert.equal(blocked.u.yieldReturn.phase,'waiting');
assert(Math.hypot(blocked.u.x-before.x,blocked.u.y-before.y)<1e-8);
blocker.hp=0;blocked.m.advance(.1);
assert.equal(blocked.u.yieldReturn.phase,'returning');
assert(Math.hypot(blocked.u.x-before.x,blocked.u.y-before.y)>.05,'A freed cached return resumes on the next tick');

for(const action of ['stop','move']){
 const {m,u}=outgoing();
 if(action==='stop')m.stop([u.id]);else assert(m.order([u.id],'move',{x:150,y:100}).ok);
 assert(!u.yieldReturn,'An explicit command cancels the borrowed-space return');
 if(action==='stop'){
  const pose={x:u.x,y:u.y};for(let i=0;i<20;i++)m.advance(.1);
  assert(Math.hypot(u.x-pose.x,u.y-pose.y)<1e-8);
 }
}
// B borrows A's already-vacated home on its way out. Returning A first
// would block B forever, so these two actual corridors must unwind B, A.
const nested=fixture(),a=nested.addUnit('bukhanka','rai',{x:0,y:0}),b=nested.addUnit('bukhanka','rai',{x:0,y:-30});
rememberYieldHome(a,[],false,nested.state.time);
a.detour={legs:[{direction:1,curve:0,remaining:40}],parking:true,idleYield:true,blocked:0};
while(a.detour)nested.advance(.1);
rememberYieldHome(b,[],false,nested.state.time);
b.detour={legs:[{direction:1,curve:0,remaining:45}],parking:true,idleYield:true,blocked:0};
const heldA={x:a.x,y:a.y};nested.advance(.1);
assert.equal(a.yieldReturn.waitingFor,b.id);
assert(Math.hypot(a.x-heldA.x,a.y-heldA.y)<1e-9);
for(let i=0;i<300&&(a.yieldReturn||b.yieldReturn);i++)nested.advance(.1);
assert(!a.yieldReturn&&!b.yieldReturn);
assert(Math.hypot(a.x,a.y)<1e-8&&Math.hypot(b.x,b.y+30)<1e-8);
assert.equal(a.hp,a.maxHp);assert.equal(b.hp,b.maxHp);
console.log(JSON.stringify({roundtripError:Math.hypot(roundtrip.x-home.x,roundtrip.y-home.y),
 actualReturnError:Math.hypot(simple.u.x-home.x,simple.u.y-home.y),saveLoad:'identical',resumeAfterClear:.1,checks:7}));
