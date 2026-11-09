import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finished=(u,goal)=>goal&&!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&distance(u,goal)<2.01;
export function progressMission(){
 const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
  gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
 const m=new Mission(structuredClone(config),field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127],pendingCinematics:[]});
 // Keep the production defeat check active, without interfering with traffic.
 m.addUnit('builder','rai',{x:-1800,y:-1800});m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);return m;
}
const cases=[
 {name:'single',n:1,cols:1,dx:30,dy:30,y:0,goal:{x:0,y:450}},
 {name:'crossing-four',cross:1},
 {name:'crossing-twenty',cross:5},
 {name:'dense-nine-reverse',n:9,cols:3,dx:12,dy:26,y:0,goal:{x:0,y:-260}},
 {name:'arrival-fifty',n:50,cols:8,dx:30,dy:30,y:-300,goal:{x:200,y:600}},
 {name:'building-twelve',n:12,cols:4,dx:32,dy:32,y:-300,goal:{x:0,y:400},buildingAt:3},
 {name:'building-twenty-four',n:24,cols:6,dx:32,dy:32,y:-320,goal:{x:0,y:420},buildingAt:3},
 {name:'replacement-eighteen',n:18,cols:6,dx:30,dy:30,y:-100,goal:{x:0,y:350},events:[[3,{x:220,y:100}],[6,{x:-220,y:100}],[9,{x:0,y:-400}]]}
];
const movementFiles=['mission','navigation','navigation-state','traffic-coordinator','traffic-planner','traffic-cycle','traffic-corridor','traffic-joint','traffic-passage','traffic-start','traffic-arrival-route','traffic-shortcut',
 'command-planner','command-motion','arrival-planner','vehicle-motion','vehicle-collision','vehicle-dynamics','turning-headway','maneuver-admission','route-continuation',
 'road-traffic','road-merge','passage-reservations','street-furniture'];
const hashes=()=>({...Object.fromEntries(movementFiles.map(f=>[f,createHash('sha256').update(fs.readFileSync('campaign/'+f+'.js')).digest('hex')])),
 config:createHash('sha256').update(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json')).digest('hex')});
// Imports are cached for the whole process. A later case must not bless new
// on-disk source hashes while still executing the earlier imported modules.
const loadedHashes=hashes();
export function runProgressCase(spec,{budget=5,seconds=160,wallSeconds=180,output='campaign/reports/navigation-public-progress'}={}){
 const before=loadedHashes,m=progressMission(),units=[],goals=new Map(),commands=[],events=[],contacts=[],damage=[],goalChanges=[],history=[];
 const add=(x,y,heading=0)=>{const u=m.addUnit('bukhanka','rai',{x,y},{heading});units.push(u);return u;};
 const groups=[];
 if(spec.cross)for(let axis=0;axis<4;axis++){
  const a=axis*Math.PI/2,dx=Math.cos(a),dy=Math.sin(a),group=[];
  for(let i=0;i<spec.cross;i++)group.push(add(-(100+i*32)*dx,-(100+i*32)*dy,Math.atan2(-dx,dy)));
  groups.push({units:group,target:{x:450*dx,y:450*dy}});
 }else{
  for(let i=0;i<spec.n;i++)add((i%spec.cols-(spec.cols-1)/2)*spec.dx,spec.y-Math.floor(i/spec.cols)*spec.dy);
  groups.push({units,target:spec.goal});
 }
 let minGap=Infinity;
 const measureGap=()=>{for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(units[i],units[j],config.worldScale,m.field));};
 measureGap();assert(minGap>0,'Initial physical bodies must be separate');
 const initial=JSON.parse(m.save());
 const issue=(selected,target)=>{
  const ids=selected.map(u=>u.id),response=m.submitOrder(ids,'move',target);assert(response.ok);
  commands.push({at:m.state.time,ids,target,response});for(const u of selected)goals.delete(u.id);
 };
 for(const group of groups)issue(group.units,group.target);
 const pending=(spec.events??[]).map(([at,target])=>({at,target}));
 const records=new Map(units.map(u=>[u.id,{hp:u.hp,rock:u.contactRock?.at,maxWait:0}]));
 let frames=0,sampled=-1,logged=-1,maxAdvanceMs=0,slowFrames=0,submittedSeconds=0,firstLongWait=null,observedFixedSteps=0;
 let measuredTick=null,tickCpuMs=0,maxTickCpuMs=0;const wall=performance.now();
 const observeUnits=()=>{
  for(const u of units){
   const r=records.get(u.id);r.maxWait=Math.max(r.maxWait,u.navigation?.waitSeconds??0);
   if(u.hp<r.hp)damage.push({id:u.id,at:m.state.time,before:r.hp,after:u.hp});r.hp=u.hp;
   if(u.contactRock?.at!==r.rock){contacts.push({id:u.id,at:u.contactRock?.at});r.rock=u.contactRock?.at;}
   if(!u.pendingOrder&&u.routeOrder?.destination){const g=u.routeOrder.destination,old=goals.get(u.id);
    if(old&&distance(old,g)>.001)goalChanges.push({id:u.id,old,next:structuredClone(g)});
    if(!old)goals.set(u.id,structuredClone(g));}
  }
 };
 // One budget slice can finish a fixed step and start another. Sampling only
 // when advance() leaves no pending tick misses those completed states and
 // can even omit the first long-wait capture. Observe every real boundary.
 const continueTick=m.continueTick;
 m.continueTick=function(...args){
  const pending=this.pendingTick,result=continueTick.apply(this,args);
  if(pending&&!this.pendingTick){
   observedFixedSteps++;observeUnits();measureGap();
   if(!firstLongWait&&units.some(u=>(u.navigation?.waitSeconds??0)>10))firstLongWait=JSON.parse(m.save());
   if(Math.floor(m.state.time/5)>sampled){sampled=Math.floor(m.state.time/5);history.push({time:m.state.time,
    units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,hp:u.hp,goal:goals.get(u.id),navigation:structuredClone(u.navigation)}))});}
   if(Math.floor(m.state.time/10)>logged){logged=Math.floor(m.state.time/10);console.log(JSON.stringify({running:spec.name,seconds:m.state.time,wallSeconds:(performance.now()-wall)/1000,arrived:units.filter(u=>finished(u,goals.get(u.id))).length}));}
  }
  return result;
 };
 const collision=m.vehicleCollision;
 m.vehicleCollision=function(...args){const result=collision.apply(this,args);observeUnits();return result;};
 while((m.pendingTick||m.state.time<seconds-1e-6)&&frames<200000&&m.state.status==='running'&&performance.now()-wall<wallSeconds*1000){
  if(spec.buildingAt!==undefined&&m.state.time>=spec.buildingAt&&!events.length){
   m.addStructure('generator','rai',{x:0,y:0},{completed:false,progress:.1,halfWidth:34,halfDepth:30});m.rebuildNavigation();events.push({at:m.state.time,type:'construction'});
  }
  for(const event of pending)if(!event.done&&m.state.time>=event.at){issue(units,event.target);event.done=true;}
  // Continue suspended work after the input-time allowance is exhausted.
  // Repeated budget slices must not queue more than the scene's time limit.
  const delta=Math.min(1/80,Math.max(0,seconds-submittedSeconds));submittedSeconds+=delta;
  const frameStarted=performance.now();m.advance(delta,{budgetMs:budget});const advanceMs=performance.now()-frameStarted;
  maxAdvanceMs=Math.max(maxAdvanceMs,advanceMs);if(advanceMs>50)slowFrames++;
  if(measuredTick!==m.state.time){measuredTick=m.state.time;tickCpuMs=0;}
  tickCpuMs+=advanceMs;maxTickCpuMs=Math.max(maxTickCpuMs,tickCpuMs);
  frames++;m.effects=[];
  observeUnits();
  if(!m.pendingTick&&units.every(u=>finished(u,goals.get(u.id)))&&pending.every(e=>e.done))break;
 }
 const failures=[],arrived=units.filter(u=>finished(u,goals.get(u.id))).length,maxWait=Math.max(...[...records.values()].map(r=>r.maxWait));
 if(m.state.time>seconds+1e-6)failures.push('Simulation exceeded its permitted time horizon');
 if(arrived!==units.length)failures.push(`${arrived}/${units.length} completed their accepted destinations in ${seconds} simulation seconds`);
 // These small scenes have open space and no external traffic. A named wait
 // exceeding 5 simulated seconds fails responsiveness, even if every car
 // eventually arrives. Named reservations cannot hide that failure.
 if(maxWait>5)failures.push(`Stationary active order for ${maxWait.toFixed(1)} simulation seconds`);
 if(performance.now()-wall>=wallSeconds*1000)failures.push(`Simulation exceeded ${wallSeconds} seconds of CPU/wall execution`);
 if(Number.isFinite(budget)&&maxAdvanceMs>250)failures.push(`Budgeted simulation blocked a frame for ${maxAdvanceMs.toFixed(1)} ms`);
 if(contacts.length||damage.length||minGap<0)failures.push('Physical contact, damage or overlapping bodies');
 if(goalChanges.length)failures.push('Accepted destination changed without an explicit command');
 if(observedFixedSteps!==Math.round(m.state.time/m.config.simulationStep)-(m.pendingTick?1:0))failures.push('Completed fixed steps were not all observed');
 if(maxWait>10&&!firstLongWait)failures.push('Missing evidence capture for a long wait');
 if(JSON.stringify(before)!==JSON.stringify(hashes()))failures.push('Movement sources changed during this run');
 const result={name:spec.name,passed:!failures.length,seconds:m.state.time,frames,observedFixedSteps,budget:Number.isFinite(budget)?budget:'unlimited',
  arrived,total:units.length,maxWait,minGap,maxAdvanceMs,slowFrames,maxTickCpuMs,failures,contacts,damage,goalChanges,commands,events,
  unfinished:units.filter(u=>!finished(u,goals.get(u.id))).map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,goal:goals.get(u.id),path:u.path,task:u.task,detour:u.detour,traffic:u.traffic,yieldReturn:u.yieldReturn,navigation:u.navigation})),sourceHashes:before};
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/'+spec.name+'.json',JSON.stringify({initial,firstLongWait,history,final:JSON.parse(m.save()),result},null,2));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
 const selected=arg('--case')?.split(','),budget=arg('--budget')==='unlimited'?Infinity:Number(arg('--budget')??5),seconds=Number(arg('--seconds')??160);
 const results=cases.filter(spec=>!selected||selected.includes(spec.name)).map(spec=>{
  const result=runProgressCase(spec,{budget,seconds,wallSeconds:Number(arg('--wall-seconds')??180),...(arg('--output')?{output:arg('--output')}:{})});
  console.log(JSON.stringify({name:result.name,passed:result.passed,seconds:result.seconds,arrived:result.arrived,total:result.total,maxWait:result.maxWait,failures:result.failures}));return result;
 });
 assert(results.length,'No matching case');assert(results.every(result=>result.passed),'Public-command progress regressions failed');
}
