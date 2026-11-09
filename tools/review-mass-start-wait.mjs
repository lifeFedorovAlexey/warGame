import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {turningHeadway} from '../campaign/turning-headway.js';
import {driveStep} from '../campaign/vehicle-motion.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),input=json('tools/fixtures/navigation-u440-start.json'),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const m=new Mission(config,field);m.load(input.initialSave);m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
const budgetMs=Number(process.argv.find(arg=>arg.startsWith('--budget='))?.slice(9)??8);
const u=m.entity('u440'),origin={x:u.x,y:u.y},start=m.state.time,started=performance.now(),samples=[];
const response=m.submitOrder(input.ids,'move',input.goal);let last=-1,first=null,ready=null;
const brief=unit=>unit&&structuredClone({id:unit.id,x:unit.x,y:unit.y,heading:unit.heading,speed:unit.driveSpeed,steering:unit.steering,
 path:unit.path,task:unit.task,detour:unit.detour,traffic:unit.traffic,pending:unit.pendingOrder,navigation:unit.navigation,
 decision:m.trafficCoordinator.decisions.get(unit.id),intent:m.trafficCoordinator.intents.get(unit.id)});
for(let frame=0;frame<80*120&&performance.now()-started<30000;frame++){
 m.advance(1/80,{budgetMs});m.effects=[];
 if(!u.pendingOrder&&u.routeOrder&&ready===null)ready=m.state.time-start;
 if(Math.hypot(u.x-origin.x,u.y-origin.y)>.01&&first===null)first=m.state.time-start;
 if(m.state.time===last)continue;last=m.state.time;
 const chain=[],seen=new Set();let current=u;
 while(current&&!seen.has(current.id)&&chain.length<12){seen.add(current.id);chain.push(brief(current));const next=m.trafficCoordinator.decisions.get(current.id)?.yieldTo??current.navigation?.blockerId;current=m.entity(next);}
 const point=m.trafficCoordinator.intents.get(u.id)?.waypoint??u.path[0],blocked=new Set();let physical;
 if(point){const limit=turningHeadway(m,u,point,.1,config.worldScale,blocked),pose=driveStep(u,point,.1,{speed:config.units[u.kind].speed,grade:0,scale:config.worldScale,tolerance:2,trafficLimit:limit,
  allowed:(a,b)=>m.vehicleMotionClear(u,a,b),curveLimit:curve=>turningHeadway(m,u,point,.1,config.worldScale,blocked,.52,curve)});
  physical={limit,blockers:[...blocked].map(v=>v.id),hypotheticalStep:pose?Math.hypot(u.x-pose.x,u.y-pose.y):0};}
 samples.push({time:last-start,chain,physical,leases:(m.state.trafficControl?.leases??[]).filter(l=>l.a===u.id||l.b===u.id)});
 if(last-start>=8)break;
}
const report={scope:'Read-only decision/physical probes during actual submitOrder replay; no physical bypass is executed',budgetMs,response,first,ready,simulatedSeconds:m.state.time-start,wallMs:performance.now()-started,samples};
fs.writeFileSync('campaign/reports/mass-start-wait-u440-'+budgetMs+'.json',JSON.stringify(report,null,2));
fs.writeFileSync('tools/fixtures/navigation-u440-after.json',JSON.stringify({state:m.state,serial:m.serial,randomState:m.randomState,accumulator:m.accumulator}));
console.log(JSON.stringify({...report,samples:samples.filter((s,i)=>!i||s.chain.map(x=>x.id).join('|')!==samples[i-1].chain.map(x=>x.id).join('|')).map(s=>({time:s.time,chain:s.chain.map(u=>({id:u.id,x:u.x,y:u.y,speed:u.speed,decision:u.decision,pending:!!u.pending})),physical:s.physical}))}));
