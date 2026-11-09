import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json');
const flat={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const actual=refineRoadHeightfield(raw);applyRoadGrades(actual,json('assets/maps/alpha/roads.json'));
const counts=(process.argv.find(a=>a.startsWith('--counts='))?.split('=')[1]??'20,50,100,200,500').split(',').map(Number);
const cases=process.argv.includes('--flat-only')?['flat']:process.argv.includes('--real-only')?['real']:['flat','real'];
const capMs=Number(process.argv.find(a=>a.startsWith('--cap-ms='))?.split('=')[1]??2000);
let deadline=Infinity;
const cap=()=>{if(performance.now()>=deadline){const error=new Error('Benchmark wall-time cap');error.code='BENCHMARK_TIMEOUT';throw error;}};
const report={kind:'CPU command/path workload; not FPS or a simultaneous movement benchmark',
 capMs,
 sourceHashes:Object.fromEntries(['campaign/mission.js','campaign/navigation.js','campaign/road-traffic.js'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),results:[]};
if(process.argv.includes('--append')&&fs.existsSync('campaign/reports/navigation-orders.json'))
 report.results=json('campaign/reports/navigation-orders.json').results;
function instrument(m){
 const counters={queries:0,computes:0,exactHits:0,lineChecks:0};
 const find=m.nav.findPathSteps,compute=m.nav.computePathSteps,line=m.nav.lineClear;
 m.nav.computePathSteps=function*(...args){cap();counters.computes++;return yield* compute.apply(this,args);};
 m.nav.findPathSteps=function*(...args){const before=counters.computes;counters.queries++;const path=yield* find.apply(this,args);if(counters.computes===before)counters.exactHits++;return path;};
 m.nav.lineClear=function(...args){counters.lineChecks++;if(counters.lineChecks%256===0)cap();return line.apply(this,args);};
 return counters;
}
function measure(m,counters,run){
 const before={...counters},searches=m.nav.searchId,start=performance.now();let value,timeout=false;
 deadline=start+capMs;
 try{value=run();}catch(error){if(error.code!=='BENCHMARK_TIMEOUT')throw error;timeout=true;value={incomplete:true,reason:error.message};}
 finally{deadline=Infinity;}
 return {cpuMs:performance.now()-start,timeout,...Object.fromEntries(Object.entries(counters).map(([k,v])=>[k,v-before[k]])),aStarSearches:m.nav.searchId-searches,value};
}
function legalStarts(m,count,origin){
 const candidates=[];
 for(let y=-42;y<=42;y++)for(let x=-42;x<=42;x++)candidates.push({x:origin.x+x*32,y:origin.y+y*32,d:x*x+y*y});
 candidates.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
 const result=[];
 for(const p of candidates){
  if(!m.nav.allowed(...m.nav.grid(p.x,p.y)))continue;
  const unit={x:p.x,y:p.y,heading:0,kind:'bukhanka',owner:'rai'};
  if(!m.vehicleMotionClear(unit,unit,unit,.52,undefined,[]))continue;
  result.push(unit);if(result.length===count)return result;
 }
 throw Error('Not enough physically legal starts: '+result.length+'/'+count);
}
function persist(){fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/navigation-orders.json',JSON.stringify(report,null,2));}
for(const type of cases)for(const count of counts){
 const field=type==='flat'?flat:actual;
 const cfg=type==='flat'?{...config,startGrid:[64,76],initialMapBounds:[0,0,127,127],finalMapBounds:[0,0,127,127]}:config;
 const m=new Mission(cfg,field);
 // Retain real authored structures. This benchmark changes no production code.
 Object.assign(m.state,{units:[],bounds:cfg.finalMapBounds.slice(),pendingCinematics:[]});
 if(type==='flat')m.state.buildings=[];
 m.updateMission=()=>{};m.visible.fill(1);m.explored.fill(1);m.rebuildNavigation();
 const origin=type==='flat'?{x:0,y:-600}:field.gridToWorld(config.startGrid);
 const poses=legalStarts(m,count,origin),cars=poses.map(p=>m.addUnit('bukhanka','rai',p,{heading:0}));
 const goal=type==='flat'?{x:0,y:700}:field.gridToWorld(config.camps.find(c=>c.id==='nw-east').gateGrid);
 const counters=instrument(m),ids=cars.map(u=>u.id),out={type,count,origin,goal,sourceHashes:report.sourceHashes};
 report.results.push(out);
 const record=(key,run)=>{out[key]=measure(m,counters,run);persist();console.log(JSON.stringify({type,count,phase:key,...out[key]}));};
 record('fresh',()=>m.order(ids,'move',goal));
 if(!out.fresh.timeout){
  record('repeat',()=>m.order(ids,'move',goal));
  if(!out.repeat.timeout){
   record('nearRepeat',()=>m.order(ids,'move',{x:goal.x+1,y:goal.y}));
   if(!out.nearRepeat.timeout)record('shift4',()=>m.order(ids,'move',{x:goal.x+4,y:goal.y}));
  }
 }
 const longGoal=type==='flat'?{x:200,y:900}:field.gridToWorld(config.camps.find(c=>c.id==='west-south').approachGrid);
 out.longGoal=longGoal;
 record('longRoutes',()=>{
  let found=0,points=0;for(const car of cars){const path=m.nav.findPath(car,longGoal,{maxGoalDistance:4});if(path?.length){found++;points+=path.length;}}
  return {found,points};
 });
 if(!out.longRoutes.timeout)record('longRoutesRepeat',()=>{
  let found=0;for(const car of cars)if(m.nav.findPath(car,longGoal,{maxGoalDistance:4})?.length)found++;return {found};
 });
 persist();
}
