import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {checkManeuver} from '../campaign/vehicle-motion.js';
import {commitJointPlan,stepJointTraffic} from '../campaign/traffic-joint.js';
import {recordYieldStep} from '../campaign/traffic-start.js';

// A transaction contract, not a public-order throughput benchmark. Use a
// captured borrower and add a genuinely checked short arc to its existing
// history. Its older debt must survive whether it owns or joins the exchange.
const capture=JSON.parse(fs.readFileSync('tools/fixtures/navigation-progress-captures.json')).cases.find(c=>c.name==='fifty-return-boxed');
const length=legs=>legs.reduce((sum,l)=>sum+l.remaining,0),results=[];
for(const role of ['owner','participant'])for(const action of ['complete','reload','invalidate']){
 let m=progressMission();m.load(structuredClone(capture.saved));m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 let borrower=m.entity('u78');
 const borrowerId=borrower.id,ownerId=role==='owner'?borrowerId:m.state.units.find(u=>!u.yieldReturn&&!u.detour&&!u.pendingOrder).id;
 let owner=m.entity(ownerId);
 const before={home:structuredClone(borrower.yieldReturn.home),goal:structuredClone(borrower.routeOrder.destination),
  length:length(borrower.yieldReturn.legs),wheel:borrower.wheelDistance??0};
 const allowed=(from,to)=>m.vehicleMotionClear(borrower,from,to);
 const leg=[1,-1].flatMap(direction=>[0,.4,-.4].map(curve=>({direction,curve,remaining:1})))
  .find(leg=>checkManeuver(borrower,[leg],m.config.worldScale,allowed));
 assert(leg,'The captured borrower has a clear one-unit arc');
 const plan=commitJointPlan(m,owner,owner.routeOrder?.destination??owner,
  [{body:borrower,from:borrower,legs:[leg],allowed,arrival:false}],()=>assert.fail('Existing loan must not be replaced'),()=>true,{preserveLoans:true});
 assert(plan);owner.detour=plan;
 stepJointTraffic(m,borrower,.1,recordYieldStep);
 assert(length(borrower.yieldReturn.legs)>before.length,'Consumed motion is recorded even when the borrower owns the transaction');
 if(action==='reload'){
  const saved=m.save();m=progressMission();m.load(saved);m.state.bounds=[0,0,127,127];m.rebuildNavigation();
  borrower=m.entity(borrowerId);owner=m.entity(ownerId);
 }
 if(action==='invalidate'){
  m.addStructure('generator','rai',{x:-1400,y:-1400},{halfWidth:3,halfDepth:3});m.rebuildNavigation();
 }
 for(let i=0;i<100&&borrower.jointTraffic;i++)stepJointTraffic(m,borrower,.1,recordYieldStep);
 assert(!borrower.jointTraffic&&!owner.detour?.joint);
 assert(borrower.yieldReturn,'An intermediate exchange cannot erase the original home obligation');
 assert.deepEqual(borrower.yieldReturn.home,before.home);assert.deepEqual(borrower.routeOrder.destination,before.goal);
 const consumed=(borrower.wheelDistance??0)-before.wheel;
 assert(Math.abs(length(borrower.yieldReturn.legs)-before.length-consumed)<1e-6,'Only actually executed arc lengths enter the history');
 if(action!=='invalidate')assert(Math.abs(consumed-1)<1e-6);
 // Resume the production controllers from this altered but physically proved
 // state. The original accepted destination still has to be reached.
 for(let i=0;i<1000&&(borrower.task||borrower.path.length||borrower.detour||borrower.yieldReturn);i++)m.advance(.1);
 assert(!borrower.task&&!borrower.path.length&&!borrower.detour&&!borrower.yieldReturn);
 assert(Math.hypot(borrower.x-before.goal.x,borrower.y-before.goal.y)<2.01);
 assert.equal(borrower.hp,borrower.maxHp);
 results.push({role,action,consumed,seconds:m.state.time});
}
fs.writeFileSync('campaign/reports/joint-loan-history.json',JSON.stringify({passed:true,results},null,2));
console.log(JSON.stringify({passed:true,results}));
