import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {TrafficPlanner} from '../campaign/traffic-planner.js';
import {trafficBodyKey,trafficReservationKey,trafficConditionKey,trafficWitness} from '../campaign/traffic-context.js';

const m=fixture(),planner=new TrafficPlanner();
const units=Array.from({length:24},(_,i)=>m.addUnit(i%3?'bukhanka':'builder',i%5?'rai':'scav',{x:(i%6)*30,y:Math.floor(i/6)*40}));
const a=units[0],b=units[1],point={x:150,y:160};
Object.assign(a,{hp:50,maxHp:100,heading:.2,trafficOnScreen:true,commandRevision:3,
 pendingOrder:{type:'move',goal:point},path:[point],task:{type:'move',...point},routeOrder:{destination:point},
 reverseDebt:1,driveSpeed:2,reversing:false,steering:.1,steeringFault:{since:1},
 damage:{wreck:false,parts:Object.fromEntries([1,2,3,4].map(i=>[i,{detached:false}]))},
 detour:{reservedCorridor:[{from:{x:0,y:0,heading:0},to:{x:20,y:10,heading:.2}}],legs:[{distance:3,steering:.2}],blocked:0},
 traffic:{passageCorridor:[{from:{x:5,y:5,heading:0},to:{x:25,y:15,heading:.1}}]},trafficHold:{until:4},
 passage:{leader:b.id},passingLane:{offset:3},yieldReturn:{home:{x:1,y:2}},jointTraffic:{members:[a.id,b.id],phase:0},
 cycleContinuation:{goal:point},tool:'folded',foldTime:.5,builderWorking:false,combatPolicy:{retreat:'light'},
 retreatSuppressed:false,combatRetreat:{home:{x:2,y:3},threat:{x:200,y:200}},combatDeployment:{phase:'moving'},combatResume:{goal:point}});
m.trafficCoordinator.decisions.set(a.id,{type:'wait',until:3});
m.trafficCoordinator.passageDecisions.set(a.id,{leader:b.id,stage:1});
// Track actual reads, including absent nested properties (especially damage,
// whose snapshot deliberately carries only a mobility summary). JSON's own
// toJSON/array-length probes are not gameplay dependencies.
const reads=new Set(),nestedReads=new Set();
function track(object,prefix=[]){return new Proxy(object,{get(o,k){
 const value=Reflect.get(o,k);
 if(typeof k!=='string'||k==='toJSON'||Array.isArray(o)&&k==='length')return value;
 const path=[...prefix,k];nestedReads.add(path.join('.'));if(!prefix.length)reads.add(k);
 return value&&typeof value==='object'?track(value,path):value;
}});}
const tracked=track(a);
trafficConditionKey(m,tracked);
const baseline=structuredClone(a),ids=units.map(u=>u.id),region={left:-500,right:500,bottom:-500,top:500};
const witness=view=>trafficWitness(view,region,ids);
const snapshot=()=>{const j=planner.enqueue(m,'passage',[b.id,units[2].id],'field-contract');planner.snapshot(m,j);return j;};
const reset=()=>{for(const key of Object.keys(a))delete a[key];Object.assign(a,structuredClone(baseline));};
const cases=[];
const add=(field,value,label=field)=>cases.push({field,label,mutate:()=>a[field]=structuredClone(value)});
for(const [field,value] of Object.entries({id:'renamed',x:5,y:7,heading:.8,kind:'bukhanka',owner:'rai',hp:0,maxHp:40,trafficOnScreen:false,
 commandRevision:4,pendingOrder:null,path:[],task:null,routeOrder:null,reverseDebt:2,driveSpeed:3,reversing:true,steering:.3,
 steeringFault:{since:2},detour:null,traffic:null,trafficHold:null,passage:null,passingLane:null,yieldReturn:null,jointTraffic:null,
 cycleContinuation:null,tool:'working',foldTime:2,builderWorking:true,combatPolicy:{retreat:'heavy'},retreatSuppressed:true,
 combatRetreat:null,combatDeployment:null,combatResume:null,damage:{wreck:true,parts:{}}}))add(field,value);
assert.deepEqual([...reads].sort(),[...new Set(cases.map(c=>c.field))].sort(),'Every key dependency must have a sensitivity case');
// Deterministic nested mutations exercise JSON-shaped paths/reservations,
// including every wheel and all coordinates, not just two empty bodies.
let seed=0x51a7;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const nested=['pendingOrder','path','task','routeOrder','steeringFault','detour','traffic','trafficHold','passage','passingLane','yieldReturn','jointTraffic','cycleContinuation','combatPolicy','combatRetreat','combatDeployment','combatResume','damage'];
function leaves(value,path=[]){return value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>leaves(v,[...path,k])):[path];}
for(const field of nested)for(const path of leaves(baseline[field])){
 if(field==='detour'&&path[0]==='blocked'||field==='combatRetreat'&&path[0]==='threat')continue;
 cases.push({field,label:[field,...path].join('.'),mutate(){let obj=a[field];for(const k of path.slice(0,-1))obj=obj[k];const k=path.at(-1),v=obj[k];obj[k]=typeof v==='number'?v+1+random()*10:typeof v==='boolean'?!v:v+'-changed';}});
}
const covered=cases.map(c=>c.label);
for(const path of nestedReads){
 if(path==='detour.blocked'||path==='combatRetreat.threat'||path.startsWith('combatRetreat.threat.'))continue;
 assert(covered.some(c=>c===path||c.startsWith(path+'.')),'Every nested key dependency must have a sensitivity case: '+path);
}
const old=snapshot(),original=witness(old.shadow);let tested=0;
for(const c of cases){
 reset();const before=trafficConditionKey(m,a);c.mutate();
 assert.notEqual(trafficConditionKey(m,a),before,'Live key must react: '+c.label);
 const job=snapshot(),copy=job.shadow.state.units.find(u=>u.id===a.id);
 assert(copy,'Copied identity '+c.label);
 assert.equal(trafficBodyKey(copy),trafficBodyKey(a),'Body '+c.label);
 assert.equal(trafficReservationKey(job.shadow,copy),trafficReservationKey(m,a),'Reservation '+c.label);
 assert.equal(witness(job.shadow),witness(m),'Witness '+c.label);
 assert.equal(witness(old.shadow),original,'Unfinished snapshot isolation '+c.label);
 planner.dispose(job);tested++;
}
reset();
for(const name of ['decisions','passageDecisions']){
 const map=m.trafficCoordinator[name],before=witness(m);map.get(a.id).extra={revision:17};
 assert.notEqual(witness(m),before);const job=snapshot();assert.equal(witness(job.shadow),witness(m));
 map.get(a.id).extra.revision++;assert.notEqual(witness(job.shadow),witness(m),'Private coordinator '+name);planner.dispose(job);tested++;
}
planner.dispose(old);
console.log(JSON.stringify({passed:true,units:units.length,topLevelDependencies:[...reads].sort(),nestedReadPaths:nestedReads.size,mutations:tested,seed:'0x51a7'}));
