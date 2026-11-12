import fs from 'node:fs';
import inspector from 'node:inspector/promises';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';

const option=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback;
const label=option('label','after'),seconds=Number(option('seconds','20'));
const baselineRef=option('baseline-ref',null),budget=Number(option('budget','Infinity'));
if(baselineRef){
 const sources=new Map(['predictive-traffic.js','vehicle-collision.js','road-traffic.js','mission.js','turning-headway.js','maneuver-admission.js','combat-sight.js'].map(name=>[name,execFileSync('git',['show',baselineRef+':campaign/'+name],{encoding:'utf8'})]));
 registerHooks({load(url,context,next){const name=url.split('/').at(-1);if(url.includes('/campaign/')&&sources.has(name))return {format:'module',source:sources.get(name),shortCircuit:true};return next(url,context);}});
}
const {makeMission}=await import('./m02-fixture.mjs');
const {collisionStatistics}=await import('../campaign/vehicle-collision.js');
const dir='campaign/reports/bridge-driving/'+label;fs.mkdirSync(dir,{recursive:true});
const m=makeMission();m.load(JSON.parse(fs.readFileSync('docs/campaign/alpha/m02/playthrough-50.json','utf8')).state);
const army=m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&m.unitSpec(u).damage);
const positions=army.map(u=>({id:u.id,x:u.x,y:u.y}));
const counts={terrain:0,stationaryTerrain:0,motion:0,stationaryMotion:0};
if(process.argv.includes('--counts'))for(const [method,key] of [['vehicleTerrainSweep','terrain'],['vehicleMotionClear','motion']]){
 const original=m[method];m[method]=function(unit,from,to,...args){counts[key]++;if(from.x===to.x&&from.y===to.y&&from.heading===to.heading)counts[key==='terrain'?'stationaryTerrain':'stationaryMotion']++;return original.call(this,unit,from,to,...args);};
}
const result=m.submitOrder(army.map(u=>u.id),'attack-move',m.state.m02.bases.east_factory.gate);
if(!result.ok)throw Error(JSON.stringify(result));
const profile=process.argv.includes('--profile')?new inspector.Session():null;
if(profile){profile.connect();await profile.post('Profiler.enable');await profile.post('Profiler.start');}
const samples=[],start=m.state.time,started=performance.now();
const calls=[];
const advance=dt=>{const at=performance.now();m.advance(dt,{budgetMs:budget});calls.push(performance.now()-at);};
for(let i=0;i<seconds*10;i++){
 const at=performance.now();advance(.1);
 while(m.pendingTick||m.accumulator>=.1-1e-8){advance(0);if(calls.length>100000)throw Error('Simulation failed to progress');}
 samples.push(performance.now()-at);m.drainEvents();m.drainEffects();
}
const cpuMs=performance.now()-started;
if(profile){fs.writeFileSync(dir+'/simulation.cpuprofile',JSON.stringify((await profile.post('Profiler.stop')).profile));profile.disconnect();}
samples.sort((a,b)=>a-b);
calls.sort((a,b)=>a-b);
const distribution=values=>({count:values.length,p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)});
const report={label,baselineRef,budgetMs:Number.isFinite(budget)?budget:null,army:army.length,simulationSeconds:m.state.time-start,cpuMs,tickMs:distribution(samples),callMs:distribution(calls),
 counts,predictive:m.trafficCoordinator.stats,planning:m.planningStats,collision:collisionStatistics,
 units:positions.map(p=>{const u=m.entity(p.id);return {id:p.id,displacement:u?Math.hypot(u.x-p.x,u.y-p.y):null,hp:u?.hp,path:u?.path.length,reason:u?.navigation?.reason};})};
fs.writeFileSync(dir+'/simulation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
