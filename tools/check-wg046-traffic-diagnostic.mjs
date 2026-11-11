import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

const m=prepareM02Diagnostic(makeMission());
for(const b of Object.values(m.state.m02.bases))if(b.production)b.production.stopped=true;
for(const spec of Object.values(m.config.buildings))spec.damage=0;
m.state.units=[];m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);
const segments=m.nav.roads.routes.get('junction-1--junction-7-2'),at=n=>{
 const s=segments.find(p=>p.progress<=n&&p.progress+p.length>=n);
 return {x:s.a.x+s.ux*(n-s.progress),y:s.a.y+s.uy*(n-s.progress),heading:Math.atan2(-s.ux,s.uy),ux:s.ux,uy:s.uy};
};
const units=[];
for(let row=0;row<14&&units.length<20;row++)for(const lateral of [-8,8]){
 const p=at(440-row*25);p.x+=p.uy*lateral;p.y-=p.ux*lateral;Object.assign(p,{kind:'bukhanka',owner:'rai'});
 if(m.vehicleMotionClear(p,p,p)&&units.every(u=>vehicleClearance(p,u,m.config.worldScale,m.field)>0)){
  const u=m.addUnit('bukhanka','rai',p,{heading:p.heading});u.trafficOnScreen=true;units.push(u);
 }
}
if(units.length!==20)throw Error('Could not place 20 vehicles');
m.setCombatPolicy(units.map(u=>u.id),{retreat:'light',response:'ignore'});
m.submitOrder(units.map(u=>u.id),'attack-move',at(745));
const enemy=m.state.buildings.find(b=>b.owner==='scavs'&&b.hp>0),samples=[],wall=performance.now();
let hit=false,calls=0;
while(m.state.time<35&&performance.now()-wall<30000){
 const start=performance.now();m.advance(1/30,{budgetMs:6});const ms=performance.now()-start;
 samples.push({ms,time:m.state.time,pending:units.filter(u=>u.pendingOrder||u.proposedOrder).length,retreat:units.filter(u=>u.combatRetreat).length});calls++;
 if(!hit&&m.state.time>=5){hit=true;for(const u of units.slice(0,10))m.damage(u,70,enemy);}
}
const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b),atPercent=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
console.log(JSON.stringify({context:'M02 synthetic 20 vehicles, 10 retreat, simulation only; no rendering',units:units.length,simulatedSeconds:m.state.time,wallSeconds:(performance.now()-wall)/1000,calls,p50:atPercent(.5),p95:atPercent(.95),p99:atPercent(.99),max:sorted.at(-1),over16:samples.filter(s=>s.ms>16).length,over50:samples.filter(s=>s.ms>50).length,worst:samples.sort((a,b)=>b.ms-a.ms).slice(0,10),planning:m.planningStats}));
