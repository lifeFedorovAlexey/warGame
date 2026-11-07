import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {connectedSpawnFilter} from './navigation-connected-fixture.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const fixtureInput=process.argv.find(a=>a.startsWith('--fixture='))?.slice('--fixture='.length),replay=fixtureInput?json(fixtureInput):null;
const counts=replay?[replay.ids.length]:(process.argv.find(a=>a.startsWith('--counts='))?.split('=')[1]??'20,50,100,200,500').split(',').map(Number);
const capMs=Number(process.argv.find(a=>a.startsWith('--cap-ms='))?.split('=')[1]??4000);
const connected=process.argv.includes('--connected'),fixtureMode=replay?replay.fixtureMode+'-replay':connected?'connected':'mixed';
const outputBase='campaign/reports/navigation-orders-'+fixtureMode+'-after';
const percentile=(samples,p)=>samples.slice().sort((a,b)=>a-b)[Math.min(samples.length-1,Math.floor(samples.length*p))]??0;
const distribution=samples=>({p50:percentile(samples,.5),p95:percentile(samples,.95),p99:percentile(samples,.99),max:Math.max(0,...samples),sum:samples.reduce((a,b)=>a+b,0)});
const report={kind:'Actual submitOrder + budgeted advance on the authored heightfield. CPU only; no renderer/FPS claims.',capMs,fixtureMode,
 sourceHashes:Object.fromEntries(['campaign/mission.js','campaign/navigation.js','campaign/command-planner.js','campaign/arrival-planner.js','campaign/shared-route-tree.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),results:[]};
for(const count of counts){
 const m=new Mission(config,field);
 if(replay){m.load(replay.initialSave);m.state.bounds=(typeof replay.initialSave==='string'?JSON.parse(replay.initialSave):replay.initialSave).state.bounds.slice();}
 else Object.assign(m.state,{units:[],bounds:config.finalMapBounds.slice(),pendingCinematics:[]});
 m.updateMission=()=>{};m.visible.fill(1);m.explored.fill(1);m.rebuildNavigation();
 const origin=field.gridToWorld(config.startGrid),goal=replay?.goal??field.gridToWorld(config.camps.find(c=>c.id==='nw-east').gateGrid),candidates=[];
 const connectivity=connected&&!replay?connectedSpawnFilter(m,goal):null;
 for(let y=-42;y<=42;y++)for(let x=-42;x<=42;x++)candidates.push({x:origin.x+x*32,y:origin.y+y*32,d:x*x+y*y});
 candidates.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
 const units=replay?replay.ids.map(id=>m.entity(id)):[];
 for(const p of replay?[]:candidates){
  if(!m.nav.allowed(...m.nav.grid(p.x,p.y)))continue;
  if(connectivity&&!connectivity.accepts(p))continue;
  const pose={x:p.x,y:p.y,heading:0,kind:'bukhanka',owner:'rai'};
  if(!m.vehicleMotionClear(pose,pose,pose,.52,undefined,[]))continue;
  units.push(m.addUnit('bukhanka','rai',pose,{heading:0}));if(units.length===count)break;
 }
 if(units.length!==count)throw Error('Could not place '+count+' legal starts');
 const fixtureFile='campaign/reports/navigation-orders-'+fixtureMode+'-'+count+'-fixture.json';
 fs.mkdirSync('campaign/reports',{recursive:true});
 fs.writeFileSync(fixtureFile,JSON.stringify({fixtureMode,count,goal,ids:units.map(u=>u.id),initialSave:m.save()}));
 const starts=units.map(u=>({x:u.x,y:u.y,hp:u.hp})),ids=units.map(u=>u.id),beforeHeap=process.memoryUsage().heapUsed;
 let contacts=0,terrainStops=0;const collision=m.vehicleCollision;
 m.vehicleCollision=function(unit,speed,blockers){if(blockers.size)contacts++;else terrainStops++;return collision.call(this,unit,speed,blockers);};
 const submitted=performance.now(),response=m.submitOrder(ids,'move',goal),submitMs=performance.now()-submitted;
 const planner=m.commandPlanner,frames=[],planning=[];let computes=0,firstApplied=null,firstMotion=null,firstDisplacement=null,firstPhysicalSpeed=null,pendingAtFirstMotion=null,frame=0;
 const profile={};if(process.argv.includes('--profile'))for(const key of ['lineClear','travelCost','surfaceCost','nearest']){
  const original=planner.nav[key];profile[key]={calls:0,cpuMs:0};planner.nav[key]=function(...args){const started=performance.now();try{return original.apply(this,args);}finally{profile[key].calls++;profile[key].cpuMs+=performance.now()-started;}};
 }
 const searches=[],compute=planner.nav.computePathSteps;planner.nav.computePathSteps=function*(...args){computes++;const began=performance.now(),value=yield* compute.apply(this,args);
  if(process.argv.includes('--diagnose'))searches.push({from:{x:args[0].x,y:args[0].y},to:args[1],wallMs:performance.now()-began,found:!!value});return value;};
 const started=performance.now();
 for(;frame<1600&&performance.now()-started<capMs;frame++){
  const oldCpu=planner.stats.cpuMs,begin=performance.now();m.advance(1/80,{budgetMs:8});
  frames.push(performance.now()-begin);planning.push(planner.stats.cpuMs-oldCpu);
  if(firstApplied===null&&units.some(u=>!u.pendingOrder))firstApplied=(frame+1)/80;
  if(firstDisplacement===null&&units.some((u,i)=>Math.hypot(u.x-starts[i].x,u.y-starts[i].y)>.01))firstDisplacement={frameSeconds:(frame+1)/80,simSeconds:m.state.time,wallSeconds:(performance.now()-started)/1000};
  if(firstPhysicalSpeed===null&&units.some(u=>(u.driveSpeed??0)>.001))firstPhysicalSpeed={frameSeconds:(frame+1)/80,simSeconds:m.state.time,wallSeconds:(performance.now()-started)/1000};
  if(firstMotion===null&&units.some((u,i)=>Math.hypot(u.x-starts[i].x,u.y-starts[i].y)>.5)){
   firstMotion=(frame+1)/80;pendingAtFirstMotion=units.filter(u=>u.pendingOrder).length;
  }
  if(frame>80&&!m.state.commandOrders.some(r=>['queued','planning'].includes(r.status)))break;
 }
 // Snapshot BEFORE the repeat: casualties can change the selected live set,
 // making that click a new revision. It must not rewrite the measured phase.
 const snapshot={
  completedPlanning:!m.state.commandOrders.some(r=>['queued','planning'].includes(r.status)),assigned:units.filter(u=>u.hp>0&&!u.pendingOrder&&u.routeOrder).length,
  pending:units.filter(u=>u.hp>0&&u.pendingOrder?.status==='planning').length,blocked:units.filter(u=>u.hp>0&&u.pendingOrder?.status==='blocked').length,
  destroyed:units.filter(u=>u.hp<=0).length};
 const result={count,fixtureMode,fixtureFile,fixtureInput,connectivity:connectivity?.metadata??null,submitMs,response,firstApplied,firstMotion,
  firstMotionThresholdWorld:.5,firstDisplacement,firstPhysicalSpeed,pendingAtFirstMotion,
  wallMs:performance.now()-started,frameCount:frame+1,simulatedSeconds:m.state.time,
  ...snapshot,
  computes,aStarSearches:planner.nav.searchId,reachabilityRejects:planner.nav.reachabilityRejects??0,corridorHits:planner.nav.corridorHits??0,
  sharedTrees:[...(planner.nav.sharedRouteTrees?.values()??[])].map(t=>({queries:t.queries,expanded:t.expanded,typedArrayBytes:t.bytes,
   exactCostCacheEntries:t.segmentCosts.size,exactCostCacheHits:t.costCacheHits,mapOverheadBytes:null})),frameCpuMs:distribution(frames),plannerCpuMs:distribution(planning),
  heapDeltaBytes:process.memoryUsage().heapUsed-beforeHeap,contacts,terrainStops,damage:units.reduce((sum,u,i)=>sum+Math.max(0,starts[i].hp-u.hp),0),profile,
  ...(process.argv.includes('--diagnose')?{searches,activeUnit:planner.active?.runtime.currentUnit,active:units.filter(u=>u.pendingOrder).slice(0,5).map(u=>({id:u.id,x:u.x,y:u.y,pending:structuredClone(u.pendingOrder)}))}:{} )};
 const before=computes,repeatedAt=performance.now(),repeat=m.submitOrder(ids,'move',goal),repeatMs=performance.now()-repeatedAt;
 Object.assign(result,{repeatMs,repeat,repeatedSyncSearches:computes-before});
 report.results.push(result);fs.writeFileSync(outputBase+'.json',JSON.stringify(report,null,2));
 fs.appendFileSync(outputBase+'-runs.jsonl',JSON.stringify({...report,results:[result]})+'\n');
 console.log(JSON.stringify(result));
}
