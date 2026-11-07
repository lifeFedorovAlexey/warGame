import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Mission} from '../campaign/mission.js';
import {fixture,config} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

// Public submitOrder only. No injected paths, rewritten destination, skipped
// collision or replay cut short after the first tiny displacement.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),round=n=>Number.isFinite(n)?+n.toFixed(4):null;
const done=u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn;
const sources=['campaign/mission.js','campaign/vehicle-motion.js','campaign/traffic-coordinator.js','campaign/traffic-start.js',
 'campaign/turning-headway.js','campaign/maneuver-admission.js','campaign/navigation.js','campaign/command-planner.js','campaign/road-merge.js',
 'campaign/vehicle-dynamics.js','campaign/arrival-planner.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
let field;
function realMission(){
 if(!field){const raw=createHeightfield(JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json')));shapeMesaRims(raw);
  field=refineRoadHeightfield(raw);applyRoadGrades(field,JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json')));}
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);return m;
}
export function createUserCase(name){
 assert(/^(opposing|centre|heap)-(flat|real)$/.test(name),`Unknown case: ${name}`);
 const real=name.endsWith('-real'),m=real?realMission():fixture(),p=real?m.field.gridToWorld(config.startGrid):{x:0,y:0};
 const units=[],requested=new Map(),commands=[];
 const add=(x,y,h=0)=>{const u=m.addUnit('bukhanka','rai',{x:p.x+x,y:p.y+y},{heading:h});units.push(u);return u;};
 const issue=(cars,goal)=>commands.push({ids:cars.map(u=>u.id),goal});
 let centre=null;
 if(name.startsWith('opposing')){
  const a=add(0,-65),b=add(0,65,Math.PI),goals=[{x:p.x,y:p.y+100},{x:p.x,y:p.y-100}];
  for(const [i,u] of [a,b].entries()){requested.set(u.id,goals[i]);issue([u],goals[i]);}
 }else{
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){const u=add(x*12,y*26);if(!x&&!y)centre=u;}
  const goal={x:p.x,y:p.y+240};
  if(name.startsWith('centre')){requested.set(centre.id,goal);issue([centre],goal);}
  else issue(units,goal);
 }
 // save() deliberately flushes pending planning. Capture before submitting,
 // otherwise the benchmark would bypass the actual incremental command path.
 const initial=JSON.parse(m.save());
 for(const command of commands){command.result=m.submitOrder(command.ids,'move',command.goal);assert(command.result.ok);}
 return {m,units,requested,commands,initial,centre:centre?.id,group:name.startsWith('heap'),real};
}
export function runUserCase(name){
 const before=hashes(),c=createUserCase(name),{m,units,initial}=c,start=new Map(units.map(u=>[u.id,{x:u.x,y:u.y,heading:u.heading}]));
 const goals=new Map(),first=new Map(),idle=new Map(),longest=new Map(),travel=new Map(),turn=new Map();
 for(const u of units){first.set(u.id,null);idle.set(u.id,0);longest.set(u.id,0);travel.set(u.id,0);turn.set(u.id,0);
  if(!u.pendingOrder&&!c.requested.has(u.id)&&!c.group)goals.set(u.id,{...start.get(u.id)});}
 const contacts=[],terrainBlocks=[],hit=m.vehicleCollision.bind(m);m.vehicleCollision=(u,speed,blockers)=>{
  const event={time:m.state.time,unit:u.id,speed,x:u.x,y:u.y,heading:u.heading,blockers:[...blockers].map(b=>b.id)};
  (blockers.size?contacts:terrainBlocks).push(event);return hit(u,speed,blockers);
 };
 let gap=Infinity,lastTick=-1;const history=[],passSide=new Map();
 for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)gap=Math.min(gap,vehicleClearance(units[i],units[j],config.worldScale,m.field));
 assert(gap>0,'The fixture must start with separate physical bodies');
 for(let frame=0;frame<90*80;frame++){
  const poses=new Map(units.map(u=>[u.id,{x:u.x,y:u.y,heading:u.heading}]));
  m.advance(1/80,{budgetMs:config.simulationCpuBudgetMs});m.effects=[];
  for(const u of units){
   if(!goals.has(u.id)&&!u.pendingOrder&&u.routeOrder?.destination)goals.set(u.id,{...u.routeOrder.destination});
   const moved=distance(u,poses.get(u.id));travel.set(u.id,travel.get(u.id)+moved);
   turn.set(u.id,turn.get(u.id)+Math.abs(Math.atan2(Math.sin(u.heading-poses.get(u.id).heading),Math.cos(u.heading-poses.get(u.id).heading))));
   if(first.get(u.id)===null&&distance(u,start.get(u.id))>=.5)first.set(u.id,(frame+1)/80);
   const waiting=!done(u)&&moved<1e-6?idle.get(u.id)+1/80:0;idle.set(u.id,waiting);longest.set(u.id,Math.max(longest.get(u.id),waiting));
  }
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)gap=Math.min(gap,vehicleClearance(units[i],units[j],config.worldScale,m.field));
  if(name.startsWith('opposing'))for(const u of units){
   const other=units.find(v=>v!==u),origin=start.get(u.id),h=origin.heading;
   const along=Math.abs((other.x-u.x)*-Math.sin(h)+(other.y-u.y)*Math.cos(h));
   if(along<(passSide.get(u.id)?.along??Infinity))passSide.set(u.id,{along,right:(u.x-origin.x)*Math.cos(h)+(u.y-origin.y)*Math.sin(h)});
  }
  if(Math.floor(m.state.time)!==lastTick){lastTick=Math.floor(m.state.time);history.push({time:m.state.time,units:structuredClone(units)});}
  if(units.every(u=>done(u)&&goals.has(u.id)&&distance(u,goals.get(u.id))<2.5))break;
 }
 const failures=[],rows=units.map(u=>({id:u.id,centre:u.id===c.centre,firstMotion:first.get(u.id),longestIdle:round(longest.get(u.id)),
  travelled:round(travel.get(u.id)),turnRadians:round(turn.get(u.id)),goal:goals.get(u.id),goalError:goals.has(u.id)?round(distance(u,goals.get(u.id))):null,
  requested:c.requested.get(u.id),requestError:c.requested.has(u.id)?round(distance(u,c.requested.get(u.id))):null,
  done:done(u),hp:u.hp,passing:passSide.get(u.id),navigation:u.navigation}));
 const arrived=rows.filter(r=>r.done&&r.goalError!==null&&r.goalError<2.5).length;
 if(arrived!==units.length)failures.push(`${arrived}/${units.length} reached the original accepted destination (uncommanded neighbours must return home)`);
 if(rows.some(r=>r.requestError!==null&&r.requestError>=2.5))failures.push('An individual requested destination was not reached');
 if(contacts.length)failures.push(`${contacts.length} actual vehicle contacts`);if(gap<0)failures.push('Hull overlap');
 if(units.some(u=>u.hp!==u.maxHp))failures.push('Unexpected vehicle damage');
 if(name.startsWith('opposing')&&rows.some(r=>!r.passing||r.passing.along>5||r.passing.right<.5))failures.push('Opposing cars did not physically pass on their own right');
 if(terrainBlocks.length)failures.push(`${terrainBlocks.length} blocked terrain/structure steps`);
 if(JSON.stringify(before)!==JSON.stringify(hashes()))failures.push('Sources changed; repeat before acceptance');
 const result={name,passed:!failures.length,seconds:round(m.state.time),arrived,total:units.length,gap:round(gap),failures,contacts,terrainBlocks,units:rows,commands:c.commands,sourceHashes:before};
 fs.writeFileSync(`tools/fixtures/user-navigation-${name}.json`,JSON.stringify({initial,history,final:JSON.parse(m.save()),result},null,2));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const at=process.argv.indexOf('--case'),names=at>=0?process.argv[at+1].split(','):['opposing-flat','opposing-real','centre-flat','centre-real','heap-flat','heap-real'];
 const results=names.map(name=>{const r=runUserCase(name);console.log(JSON.stringify({name:r.name,passed:r.passed,seconds:r.seconds,arrived:r.arrived,total:r.total,contacts:r.contacts.length,failures:r.failures}));return r;});
 fs.writeFileSync('campaign/reports/navigation-user-cases.json',JSON.stringify({results},null,2));
 if(!process.argv.includes('--diagnose'))assert(results.every(r=>r.passed));
}
