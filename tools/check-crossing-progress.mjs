import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {progressMission} from './check-navigation-public-progress.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const size=Number(option('--size',40)),seconds=Number(option('--seconds',160)),wallLimit=Number(option('--wall',90));
assert([20,40].includes(size));
const output=option('--output','campaign/reports/crossing-progress-'+size);
const files=fs.readdirSync('campaign').filter(p=>p.endsWith('.js')).map(p=>'campaign/'+p);
files.push('assets/campaign/alpha/mission01/gameplay.json','tools/check-crossing-progress.mjs');
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const sourceHashes=hashes(),m=progressMission(),units=[],goals=new Map(),commands=[],history=[],contacts=[],captures=[];
for(let i=0;i<size/4;i++)for(let axis=0;axis<4;axis++){
 const angle=axis*Math.PI/2,dx=Math.cos(angle),dy=Math.sin(angle),depth=180+(size/4-i)*30;
 const unit=m.addUnit('bukhanka','rai',{x:-(80+i*30)*dx,y:-(80+i*30)*dy},{heading:Math.atan2(-dx,dy)});
 units.push(unit);goals.set(unit.id,{x:depth*dx,y:depth*dy});
}
const initial=JSON.parse(m.save());
for(const unit of units){const target=goals.get(unit.id),response=m.submitOrder([unit.id],'move',target);assert(response.ok);commands.push({id:unit.id,target,response});}
const active=u=>u.pendingOrder||u.task||u.path.length||u.detour||u.yieldReturn;
const arrived=u=>!active(u)&&Math.hypot(u.x-goals.get(u.id).x,u.y-goals.get(u.id).y)<2.01;
const collide=m.vehicleCollision.bind(m);m.vehicleCollision=(u,s,b)=>{if(b.size)contacts.push({id:u.id,time:m.state.time,ids:[...b].map(v=>v.id)});return collide(u,s,b);};
let maxWait=0,minGap=Infinity,maxAdvanceMs=0,observed=0,lastSample=-1,firstStall,lastSave=initial;
const tick=m.continueTick;
m.continueTick=function(...args){
 const pending=this.pendingTick,result=tick.apply(this,args);
 if(pending&&!this.pendingTick){
  observed++;
  for(const u of units)maxWait=Math.max(maxWait,u.navigation?.waitSeconds??0);
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
  const cycles=this.navigationDiagnostics?.recoveryCycles??[];
  if(!firstStall&&maxWait>8&&cycles.length){firstStall=JSON.parse(this.save());captures.push({kind:'first-stall',time:this.state.time,cycles});fs.writeFileSync(output+'-stall.json',JSON.stringify(firstStall));}
  if(Math.floor(this.state.time)>lastSample){
   lastSample=Math.floor(this.state.time);
   history.push({time:this.state.time,cycles,statistics:structuredClone(this.trafficCoordinator.statistics),
    units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,arrived:arrived(u),navigation:structuredClone(u.navigation),
     traffic:structuredClone(u.traffic),hold:u.trafficHold,detour:structuredClone(u.detour),passingLane:structuredClone(u.passingLane),yieldReturn:structuredClone(u.yieldReturn)}))});
   lastSave=JSON.parse(this.save());
   if(lastSample%10===0)console.log(JSON.stringify({time:this.state.time,arrived:units.filter(arrived).length,maxWait,cycles,wallSeconds:(performance.now()-wall)/1000}));
  }
 }return result;
};
fs.mkdirSync('campaign/reports',{recursive:true});
const wall=performance.now();let input=0;
while((m.pendingTick||m.state.time<seconds-1e-7)&&units.some(u=>!arrived(u))&&performance.now()-wall<wallLimit*1000){
 const delta=Math.min(1/80,Math.max(0,seconds-input));input+=delta;
 const before=performance.now();m.advance(delta,{budgetMs:5});maxAdvanceMs=Math.max(maxAdvanceMs,performance.now()-before);m.effects=[];
}
const failures=[];
if(units.some(u=>!arrived(u)))failures.push('Not all public orders finish');
if(maxWait>30)failures.push('An active car waits more than 30 seconds');
if(minGap<=0||contacts.length||units.some(u=>u.hp!==u.maxHp))failures.push('Contact, overlap or damage');
const sourcesUnchanged=JSON.stringify(sourceHashes)===JSON.stringify(hashes());if(!sourcesUnchanged)failures.push('Source changed during run');
const report={size,passed:!failures.length,seconds:m.state.time,wallSeconds:(performance.now()-wall)/1000,arrived:units.filter(arrived).length,maxWait,minGap,contacts,
 maxAdvanceMs,observed,captures,failures,sourceHashes,sourcesUnchanged,commands,initial,history,lastSave};
fs.writeFileSync(output+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,sourceHashes:undefined,commands:undefined,initial:undefined,history:undefined,lastSave:undefined}));
assert(report.passed,'Every real crossing order must finish without an excessive wait');
