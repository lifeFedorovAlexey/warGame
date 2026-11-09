import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const active=u=>u.task||u.path.length||u.pendingOrder||u.detour||u.yieldReturn;
const results=[];
for(const separation of [32,50,70,100]){
 const m=progressMission(),a=m.addUnit('bukhanka','rai',{x:0,y:0}),b=m.addUnit('bukhanka','rai',{x:0,y:-separation});
 assert(m.submitOrder([a.id],'move',{x:0,y:300}).ok);assert(m.submitOrder([b.id],'move',{x:0,y:260}).ok);
 for(let i=0;i<40;i++)m.advance(.1);
 m.stop([a.id],{expandGroup:false});const home={x:a.x,y:a.y},waits={[a.id]:0,[b.id]:0};
 let minGap=Infinity,contacts=0;const tick=m.continueTick,collision=m.vehicleCollision.bind(m);
 m.vehicleCollision=(u,s,blockers)=>{if(blockers.size)contacts++;return collision(u,s,blockers);};
 m.continueTick=function(...args){const pending=this.pendingTick,result=tick.apply(this,args);if(pending&&!this.pendingTick){
  for(const u of [a,b])waits[u.id]=Math.max(waits[u.id],u.navigation?.waitSeconds??0);
  minGap=Math.min(minGap,vehicleClearance(a,b,m.config.worldScale,m.field));
 }return result;};
 const wall=performance.now();while((active(a)||active(b))&&m.state.time<60&&performance.now()-wall<30000)m.advance(1/80,{budgetMs:5});
 const r={separation,seconds:m.state.time,waits,minGap,contacts,arrived:!active(a)&&!active(b),
  homeError:Math.hypot(a.x-home.x,a.y-home.y),goalError:Math.hypot(b.x,b.y-260),hp:[a.hp,b.hp]};results.push(r);
}
fs.writeFileSync('campaign/reports/stopped-leader-progress.json',JSON.stringify({results},null,2));console.log(JSON.stringify({results}));
for(const r of results){
 assert(r.arrived&&r.homeError<2.01&&r.goalError<2.01,JSON.stringify(r));
 assert(r.minGap>0&&r.contacts===0&&r.hp.every(hp=>hp===320),JSON.stringify(r));
 assert(Math.max(...Object.values(r.waits))<=5,'No external traffic justifies a long two-car wait: '+JSON.stringify(r));
}
