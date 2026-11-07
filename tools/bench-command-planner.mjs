import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const counts=(process.argv.find(a=>a.startsWith('--counts='))?.split('=')[1]??'20,50,100,200,500').split(',').map(Number);
const capMs=Number(process.argv.find(a=>a.startsWith('--cap-ms='))?.split('=')[1]??4000);
const percentile=(samples,p)=>samples.slice().sort((a,b)=>a-b)[Math.min(samples.length-1,Math.floor(samples.length*p))]??0;
const distribution=samples=>({p50:percentile(samples,.5),p95:percentile(samples,.95),p99:percentile(samples,.99),max:Math.max(0,...samples),sum:samples.reduce((a,b)=>a+b,0)});
const report={kind:'Actual submitOrder + budgeted advance on the authored heightfield. CPU only; no renderer/FPS claims.',capMs,
 sourceHashes:Object.fromEntries(['campaign/mission.js','campaign/navigation.js','campaign/command-planner.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),results:[]};
for(const count of counts){
 const m=new Mission(config,field);Object.assign(m.state,{units:[],bounds:config.finalMapBounds.slice(),pendingCinematics:[]});
 m.updateMission=()=>{};m.visible.fill(1);m.explored.fill(1);m.rebuildNavigation();
 const origin=field.gridToWorld(config.startGrid),goal=field.gridToWorld(config.camps.find(c=>c.id==='nw-east').gateGrid),candidates=[];
 for(let y=-42;y<=42;y++)for(let x=-42;x<=42;x++)candidates.push({x:origin.x+x*32,y:origin.y+y*32,d:x*x+y*y});
 candidates.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
 const units=[];
 for(const p of candidates){
  if(!m.nav.allowed(...m.nav.grid(p.x,p.y)))continue;
  const pose={x:p.x,y:p.y,heading:0,kind:'bukhanka',owner:'rai'};
  if(!m.vehicleMotionClear(pose,pose,pose,.52,undefined,[]))continue;
  units.push(m.addUnit('bukhanka','rai',pose,{heading:0}));if(units.length===count)break;
 }
 if(units.length!==count)throw Error('Could not place '+count+' legal starts');
 const starts=units.map(u=>({x:u.x,y:u.y,hp:u.hp})),ids=units.map(u=>u.id),beforeHeap=process.memoryUsage().heapUsed;
 const submitted=performance.now(),response=m.submitOrder(ids,'move',goal),submitMs=performance.now()-submitted;
 const planner=m.commandPlanner,frames=[],planning=[];let computes=0,firstApplied=null,firstMotion=null,pendingAtFirstMotion=null,frame=0;
 const searches=[],compute=planner.nav.computePathSteps;planner.nav.computePathSteps=function*(...args){computes++;const began=performance.now(),value=yield* compute.apply(this,args);
  if(process.argv.includes('--diagnose'))searches.push({from:{x:args[0].x,y:args[0].y},to:args[1],wallMs:performance.now()-began,found:!!value});return value;};
 const started=performance.now();
 for(;frame<1600&&performance.now()-started<capMs;frame++){
  const oldCpu=planner.stats.cpuMs,begin=performance.now();m.advance(1/80,{budgetMs:8});
  frames.push(performance.now()-begin);planning.push(planner.stats.cpuMs-oldCpu);
  if(firstApplied===null&&units.some(u=>!u.pendingOrder))firstApplied=(frame+1)/80;
  if(firstMotion===null&&units.some((u,i)=>Math.hypot(u.x-starts[i].x,u.y-starts[i].y)>.5)){
   firstMotion=(frame+1)/80;pendingAtFirstMotion=units.filter(u=>u.pendingOrder).length;
  }
  if(frame>80&&!m.state.commandOrders.some(r=>['queued','planning'].includes(r.status)))break;
 }
 const before=computes,repeatedAt=performance.now(),repeat=m.submitOrder(ids,'move',goal),repeatMs=performance.now()-repeatedAt;
 const result={count,submitMs,response,repeatMs,repeat,repeatedSyncSearches:computes-before,firstApplied,firstMotion,pendingAtFirstMotion,
  wallMs:performance.now()-started,frameCount:frame+1,simulatedSeconds:m.state.time,
  completedPlanning:!m.state.commandOrders.some(r=>['queued','planning'].includes(r.status)),assigned:units.filter(u=>!u.pendingOrder).length,
  pending:units.filter(u=>u.pendingOrder?.status==='planning').length,blocked:units.filter(u=>u.pendingOrder?.status==='blocked').length,
  computes,aStarSearches:planner.nav.searchId,reachabilityRejects:planner.nav.reachabilityRejects??0,corridorHits:planner.nav.corridorHits??0,frameCpuMs:distribution(frames),plannerCpuMs:distribution(planning),
  heapDeltaBytes:process.memoryUsage().heapUsed-beforeHeap,damage:units.reduce((sum,u,i)=>sum+Math.max(0,starts[i].hp-u.hp),0),
  ...(process.argv.includes('--diagnose')?{searches,activeUnit:planner.active?.runtime.currentUnit,active:units.filter(u=>u.pendingOrder).slice(0,5).map(u=>({id:u.id,x:u.x,y:u.y,pending:u.pendingOrder}))}:{} )};
 report.results.push(result);fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-orders-after.json',JSON.stringify(report,null,2));
 fs.appendFileSync('campaign/reports/navigation-orders-after-runs.jsonl',JSON.stringify({...report,results:[result]})+'\n');
 console.log(JSON.stringify(result));
}
