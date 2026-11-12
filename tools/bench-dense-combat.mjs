import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import inspector from 'node:inspector/promises';
const option=(n,f)=>process.argv.find(x=>x.startsWith('--'+n+'='))?.slice(n.length+3)??f;
const ref=option('baseline-ref',null),label=option('label','before'),count=Number(option('count','30')),seconds=Number(option('seconds','15'));
if(ref){const names=execFileSync('git',['diff','--diff-filter=M','--name-only',ref,'--','campaign'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(x=>x.endsWith('.js'));const sources=new Map(names.map(name=>[name,execFileSync('git',['show',ref+':'+name],{encoding:'utf8'})]));registerHooks({load(url,context,next){const name=url.slice(url.indexOf('/campaign/')+1);return sources.has(name)?{format:'module',source:sources.get(name),shortCircuit:true}:next(url,context);}});}
const {makeMission}=await import('./m02-fixture.mjs');
const {prepareM02Diagnostic}=await import('../campaign/mission02-diagnostic.js');
const m=prepareM02Diagnostic(makeMission()),base=m.state.m02.bases.energy_hub,target=m.entity(base.artifact.carrierId);
// Keep a live target for the whole measurement, rather than measuring idle
// cars after the first volley destroys the fixture's original building.
target.hp=target.maxHp=100000;
// Test data: real compound geometry and native battle controllers. No engine
// checks depend on this base, these coordinates or the number of participants.
m.state.units=m.state.units.filter(u=>u.owner!=='rai');m.updateMission=()=>{};
for(const other of Object.values(m.state.m02.bases))if(other.production)other.production.stopped=true;
const units=[];
for(let row=0;row<24&&units.length<count;row++)for(let col=0;col<23&&units.length<count;col++){
 const x=target.x+(col%2?1:-1)*Math.ceil(col/2)*23,y=target.y-100-row*23;
 const pose={x,y,heading:0,kind:'bukhanka',owner:'rai'};
 if(!m.inBounds(x,y)||!m.nav.terrainAllowed(x,y)||!m.vehicleMotionClear(pose,pose,pose))continue;
 units.push(m.addUnit('bukhanka','rai',pose));
}
assert.equal(units.length,count);m.explored.fill(255);m.visible.fill(255);m.unitIndex.rebuild(m.state.units);
const dir='campaign/reports/dense-combat/'+label;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/initial.json',m.save());
const response=m.submitOrder(units.map(u=>u.id),'attack',target);assert(response.ok);
const initial=units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp})),profile=process.argv.includes('--profile')?new inspector.Session():null;
if(profile){profile.connect();await profile.post('Profiler.enable');await profile.post('Profiler.start');}
const samples=[],start=m.state.time,at=performance.now();
for(let i=0;i<seconds*60;i++){const now=performance.now();m.advance(1/60,{budgetMs:5});samples.push(performance.now()-now);m.drainEvents();m.drainEffects();}
const cpuMs=performance.now()-at;if(profile){fs.writeFileSync(dir+'/cpu.cpuprofile',JSON.stringify((await profile.post('Profiler.stop')).profile));profile.disconnect();}
samples.sort((a,b)=>a-b);const q=p=>samples[Math.min(samples.length-1,Math.floor(samples.length*p))];
const result={baseline:ref,count,seconds,simulationSeconds:m.state.time-start,rate:(m.state.time-start)/seconds,cpuMs,callMs:{p50:q(.5),p95:q(.95),p99:q(.99),max:samples.at(-1)},enemyHp:target.hp,
 moved:initial.filter(p=>{const u=m.entity(p.id);return u&&Math.hypot(u.x-p.x,u.y-p.y)>1;}).length,
 damaged:initial.filter(p=>{const u=m.state.units.find(u=>u.id===p.id);return u.hp<p.hp;}).length,
 pending:m.state.units.filter(u=>u.pendingOrder||u.proposedOrder).length,predictive:m.trafficCoordinator.stats,command:m.commandPlanner?.stats};
fs.writeFileSync(dir+'/result.json',JSON.stringify(result,null,2));fs.writeFileSync(dir+'/final.json',m.save());console.log(JSON.stringify(result));
