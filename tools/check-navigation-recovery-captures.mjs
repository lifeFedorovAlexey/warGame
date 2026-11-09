import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const captures=JSON.parse(fs.readFileSync('tools/fixtures/navigation-progress-captures.json','utf8'));
const at=process.argv.indexOf('--case'),selected=at<0?null:process.argv[at+1];
const results=[];
for(const {name,saved} of captures.cases.filter(c=>!selected||c.name===selected)){
 const m=progressMission();m.load(structuredClone(saved));m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 const units=m.state.units.filter(u=>u.routeOrder?.destination),goals=new Map(units.map(u=>[u.id,structuredClone(u.routeOrder.destination)]));
 const done=u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn&&Math.hypot(u.x-goals.get(u.id).x,u.y-goals.get(u.id).y)<2.01;
 const start=m.state.time,health=new Map(units.map(u=>[u.id,u.hp])),rocks=new Map(units.map(u=>[u.id,u.contactRock?.at]));
 let minGap=Infinity;const contacts=[],history=[],wall=performance.now();
 console.log(JSON.stringify({starting:name}));
 for(let tick=0;tick<1000&&!units.every(done)&&performance.now()-wall<60000;tick++){
  m.advance(.1);m.effects=[];
  for(const u of units){assert.deepEqual(u.routeOrder.destination,goals.get(u.id));
   if(u.contactRock?.at!==rocks.get(u.id)){contacts.push({id:u.id,time:m.state.time});rocks.set(u.id,u.contactRock?.at);}}
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
  if(tick%10===0)history.push({time:m.state.time,units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,done:done(u),navigation:structuredClone(u.navigation)}))});
  if(tick%100===99)console.log(JSON.stringify({name,elapsed:m.state.time-start,arrived:units.filter(done).length}));
 }
 const result={name,seconds:m.state.time-start,arrived:units.filter(done).length,total:units.length,minGap,contacts,
  damage:units.filter(u=>u.hp!==health.get(u.id)).map(u=>u.id),unfinished:units.filter(u=>!done(u))};
 result.passed=result.arrived===result.total&&minGap>=0&&!contacts.length&&!result.damage.length;
 fs.mkdirSync('campaign/reports/navigation-public-progress',{recursive:true});
 fs.writeFileSync('campaign/reports/navigation-public-progress/recovery-'+name+'.json',JSON.stringify({result,history,final:JSON.parse(m.save())},null,2));
 console.log(JSON.stringify({...result,unfinished:result.unfinished.map(u=>({id:u.id,path:u.path,traffic:u.traffic,detour:u.detour,yieldReturn:u.yieldReturn,navigation:u.navigation}))}));results.push(result);
}
assert(results.length&&results.every(r=>r.passed),'Frozen production orders must recover without another click');
