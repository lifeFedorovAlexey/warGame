import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './check-start-latency-coordinator.mjs';

// The exact twenty-vehicle production submitOrder scenario from
// check-combat-sight, with a timeline retained even when the deadline passes.
// --baseline uses review-stopped-curve-baseline.mjs to change only the disputed
// four lines in memory. No files, orders, targets or collisions are replaced.
const baseline=process.argv.includes('--baseline'),m=fixture(),count=20,columns=4;
const units=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',
 {x:(i%columns-1.5)*35,y:-Math.floor(i/columns)*35-55},{heading:0}));
m.addStructure('factory','rai',{x:0,y:40},{completed:true,progress:1});
const target=m.addStructure('camp-core','scavs',{x:0,y:140},{completed:true,progress:1,hp:100000,maxHp:100000});
m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
const sources=['mission.js','vehicle-motion.js','turning-headway.js','maneuver-admission.js','traffic-coordinator.js',
 'traffic-shortcut.js','vehicle-collision.js','combat-deployment.js','command-planner.js','route-continuation.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync('campaign/'+p)).digest('hex')]));
const loadedSources=hashes(),fired=new Map(),contacts=[],history=[];
const attack=m.attack,collision=m.vehicleCollision;
m.attack=function(unit,enemy,spec){const result=attack.call(this,unit,enemy,spec);
 if(result&&unit.owner==='rai'&&!fired.has(unit.id))fired.set(unit.id,{time:m.state.time,x:unit.x,y:unit.y});return result;};
m.vehicleCollision=function(unit,speed,bodies){if(bodies.size)contacts.push({time:m.state.time,id:unit.id,speed,blockers:[...bodies].map(b=>b.id)});
 return collision.call(this,unit,speed,bodies);};
m.submitOrder(units.map(u=>u.id),'attack',target);
let last=-Infinity;
for(let frame=0;frame<6400&&fired.size<count;frame++){
 m.advance(1/80,{budgetMs:6});m.effects=[];
 if(m.state.time-last<.499)continue;last=m.state.time;
 history.push({time:m.state.time,units:units.map(u=>structuredClone({id:u.id,x:u.x,y:u.y,heading:u.heading,
  speed:u.driveSpeed,steering:u.steering,hp:u.hp,path:u.path,detour:u.detour,traffic:u.traffic,
  deployment:u.combatDeployment,navigation:u.navigation,watch:u.driveWatch,decision:m.trafficCoordinator.decisions.get(u.id)}))});
}
const report={mode:baseline?'baseline':'candidate',seconds:m.state.time,fired:[...fired],contacts,loadedSources,
 inMemorySources:globalThis.__curveBaselineSources,sourceChanged:JSON.stringify(loadedSources)!==JSON.stringify(hashes()),history};
fs.writeFileSync('campaign/reports/curve-contention-'+report.mode+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,history:undefined},null,2));
