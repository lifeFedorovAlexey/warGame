import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {checkManeuver} from '../campaign/vehicle-motion.js';
import {rememberYieldHome,resumeYieldHome,borrowedHomeClear} from '../campaign/traffic-start.js';

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

// A new public order must reserve the borrower's eventual home, rather than
// shifting the clicked goal into that home to avoid its temporary yield pose.
const corridorMission=fixture(),loaned=corridorMission.addUnit('bukhanka','rai',{x:0,y:0});
rememberYieldHome(loaned,[],false,0,corridorMission);
loaned.detour={legs:[{direction:1,curve:0,remaining:40}],parking:true,idleYield:true,blocked:0};
while(loaned.detour)corridorMission.advance(.1);
const arriving=corridorMission.addUnit('bukhanka','rai',{x:0,y:100},{heading:Math.PI});
assert(!borrowedHomeClear(corridorMission,arriving,{x:0,y:0,heading:Math.PI}));
assert(borrowedHomeClear(corridorMission,arriving,{x:45,y:30,heading:Math.PI}));
assert(corridorMission.vehicleMotionClear(arriving,{...arriving,x:-40,y:15,heading:-Math.PI/2},
 {...arriving,x:40,y:15,heading:-Math.PI/2}),'The inverse claim limits final parking, not safe temporary passage');
assert(corridorMission.submitOrder([arriving.id],'move',{x:0,y:30}).ok);
// Interleave command planning with the borrower's checked return. The
// temporary reservation must not turn into a permanent parking exclusion.
corridorMission.tick(.1);
assert(arriving.pendingOrder&&loaned.detour?.yieldReturning&&loaned.detour?.reservedCorridor);
for(let i=0;i<300&&(loaned.yieldReturn||arriving.pendingOrder||arriving.task);i++){
 corridorMission.advance(.1);
 if(arriving.routeOrder)assert.deepEqual(arriving.routeOrder.destination,{x:0,y:30},'The free future destination remains the exact clicked point');
}
assert(!loaned.yieldReturn&&!arriving.task&&!arriving.pendingOrder,JSON.stringify({loaned,arriving}));
assert(Math.hypot(loaned.x,loaned.y)<1e-8&&Math.hypot(arriving.x,arriving.y-30)<.65);
assert(borrowedHomeClear(corridorMission,arriving));
assert.equal(loaned.hp,loaned.maxHp);assert.equal(arriving.hp,arriving.maxHp);

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
// Stop revokes the old destination. If this idle car later lends its space,
// a temporarily blocked inverse may not resume that cancelled Move instead
// of returning to the place where Stop left it.
const revoked=fixture(),stopped=revoked.addUnit('bukhanka','rai',{x:0,y:0});
assert(revoked.submitOrder([stopped.id],'move',{x:0,y:100}).ok);
for(let i=0;i<100&&stopped.y<35;i++)revoked.advance(.1);
revoked.stop([stopped.id],{expandGroup:false});
const stoppedHome={x:stopped.x,y:stopped.y};
rememberYieldHome(stopped,[],false,revoked.state.time,revoked);
stopped.detour={legs:[{direction:1,curve:0,remaining:40}],parking:true,idleYield:true,blocked:0};
while(stopped.detour)revoked.tick(.1);
const occupiedHome=revoked.addUnit('bukhanka','rai',stoppedHome);
for(let i=0;i<40;i++)revoked.tick(.1);
assert(stopped.yieldReturn,'An occupied borrowed home must remain outstanding, not revive a cancelled goal');
occupiedHome.hp=0;
for(let i=0;i<200&&stopped.yieldReturn;i++)revoked.tick(.1);
assert(!stopped.yieldReturn&&Math.hypot(stopped.x-stoppedHome.x,stopped.y-stoppedHome.y)<2);
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
// A second requester can park across an older leg of the first borrowed
// route. Checking only the newest parking arc would strand the borrower.
const historical=fixture(),borrower=historical.addUnit('bukhanka','rai',{x:0,y:60},{heading:0});
const requester=historical.addUnit('bukhanka','rai',{x:-30,y:60},{heading:-Math.PI/2,
 path:[{x:0,y:30}],task:{type:'move',x:0,y:30}});
const allowed=(from,to)=>historical.vehicleMotionClear(borrower,from,to);
const localOnly=historical.parkingManeuver(borrower,requester,allowed);
assert(localOnly,'The newest local parking arc alone has a safe inverse');
borrower.yieldReturn={home:{x:0,y:0,heading:0,kind:borrower.kind},
 legs:[{direction:1,curve:0,remaining:60}],requesters:[],phase:'waiting',since:0,rough:false};
assert.equal(historical.parkingManeuver(borrower,requester,allowed),null,
 'A later destination cannot cut through an already travelled return corridor');
const accepted=fixture(),parked=accepted.addUnit('bukhanka','rai',{x:0,y:0},{heading:0,
 routeOrder:{revision:2,request:{x:0,y:1},destination:{x:0,y:1}}});
rememberYieldHome(parked,[],false,accepted.state.time,accepted);
parked.detour={legs:[{direction:1,curve:0,remaining:20}],parking:true,idleYield:true,blocked:0};
for(let i=0;i<200&&(parked.detour||parked.yieldReturn);i++)accepted.advance(.1);
assert(!parked.detour&&!parked.yieldReturn);
assert(Math.hypot(parked.x,parked.y-1)<2&&parked.y>0,
 'A real return can stop inside its immutable goal without replaying past that goal');
assert.deepEqual(parked.routeOrder.destination,{x:0,y:1});assert.equal(parked.hp,parked.maxHp);
// A clear curve between close parked neighbours can fail a long conservative
// swept-hull union. The return proof must refine it without reducing the skin.
const narrow=fixture(),n=narrow.addUnit('bukhanka','rai',{x:0,y:26});
for(const x of [-12,12])for(const y of [0,26])narrow.addUnit('bukhanka','rai',{x,y});
rememberYieldHome(n,[],false,narrow.state.time,narrow);
n.detour={parking:true,idleYield:true,blocked:0,legs:[
 {direction:1,curve:.43853394993741707,remaining:2.97},{direction:1,curve:0,remaining:16.2},
 {direction:1,curve:.8770678998748341,remaining:21.6},{direction:1,curve:0,remaining:5.4}]};
for(let i=0;i<150&&n.detour;i++)narrow.advance(.1);
assert(!n.detour&&n.yieldReturn,'The actual outbound curve completed legally');
const back=n.yieldReturn.legs.toReversed().map(l=>({...l,direction:-l.direction,curve:-l.curve}));
assert.equal(checkManeuver(n,back,config.worldScale,(a,b)=>narrow.vehicleMotionClear(n,a,b)),null,
 'This regression must exercise a conservative coarse proof rejection');
for(let i=0;i<200&&n.yieldReturn;i++)narrow.advance(.1);
assert(!n.yieldReturn&&Math.hypot(n.x,n.y-26)<1e-8,'Refined full sweeps return to the exact borrowed pose');
assert(narrow.state.units.every(u=>u.hp===u.maxHp));
// A newer public order can arrive between slices of a return proof. The old
// inverse may not publish a detour or move the car after that command.
const interrupted=outgoing(),origin={x:interrupted.u.x,y:interrupted.u.y};
interrupted.m.nav.workDeadline=-Infinity;
const returning=resumeYieldHome(interrupted.m,interrupted.u);
assert.equal(returning.next().done,false);
assert(interrupted.m.submitOrder([interrupted.u.id],'move',{x:150,y:100}).ok);
interrupted.m.nav.workDeadline=Infinity;
let step;do{step=returning.next();}while(!step.done);
assert(interrupted.u.pendingOrder&&!interrupted.u.detour);
assert.deepEqual({x:interrupted.u.x,y:interrupted.u.y},origin);
console.log(JSON.stringify({roundtripError:Math.hypot(roundtrip.x-home.x,roundtrip.y-home.y),
 actualReturnError:Math.hypot(simple.u.x-home.x,simple.u.y-home.y),saveLoad:'identical',resumeAfterClear:.1,checks:13}));
