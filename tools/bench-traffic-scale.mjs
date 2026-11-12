import fs from 'node:fs';
import inspector from 'node:inspector/promises';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
const option=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=')??fallback;
const baselineRef=option('baseline-ref',null),label=option('label','after'),seconds=Number(option('seconds','10'));
if(baselineRef){
 const sources=new Map(['predictive-traffic.js','vehicle-collision.js','road-traffic.js','mission.js','turning-headway.js','maneuver-admission.js','combat-sight.js'].map(name=>[name,execFileSync('git',['show',baselineRef+':campaign/'+name],{encoding:'utf8'})]));
 registerHooks({load(url,context,next){const name=url.split('/').at(-1);if(url.includes('/campaign/')&&sources.has(name))return {format:'module',source:sources.get(name),shortCircuit:true};return next(url,context);}});
}
const {bridgeTrafficFixture}=await import('./bridge-traffic-fixture.mjs');
const dir='campaign/reports/bridge-driving/'+label;fs.mkdirSync(dir,{recursive:true});
const summary=[];
for(const count of option('counts','50,100,250,500').split(',').map(Number)){
 const fixture=bridgeTrafficFixture(count,1,{opponent:process.argv.includes('--opponent')}),m=fixture.mission;
 const initial=m.state.units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}));
 fs.writeFileSync(dir+'/'+count+'-initial.json',m.save());
 const inputAt=performance.now(),orders=fixture.order(),inputMs=performance.now()-inputAt;
 const profile=process.argv.includes('--profile')?new inspector.Session():null;
 if(profile){profile.connect();await profile.post('Profiler.enable');await profile.post('Profiler.start');}
 const calls=[],frames=Math.ceil(seconds*60),start=m.state.time,started=performance.now();
 // Supply one real-time frame's delta and the same CPU budget as main.js.
 // No sleeps: wall cost and achieved simulation time are recorded separately.
 for(let i=0;i<frames;i++){const at=performance.now();m.advance(1/60,{budgetMs:m.config.simulationCpuBudgetMs});calls.push(performance.now()-at);m.drainEffects();m.drainEvents();}
 const cpuMs=performance.now()-started;
 if(profile){fs.writeFileSync(dir+'/'+count+'.cpuprofile',JSON.stringify((await profile.post('Profiler.stop')).profile));profile.disconnect();}
 calls.sort((a,b)=>a-b);
 const report={count,baselineRef,inputMs,orders,requestedSeconds:frames/60,simulationSeconds:m.state.time-start,cpuMs,
  simulationRate:(m.state.time-start)/(frames/60),callMs:{p50:calls[Math.floor(frames*.5)],p95:calls[Math.floor(frames*.95)],p99:calls[Math.floor(frames*.99)],max:calls.at(-1)},
  moved:initial.filter(p=>{const u=m.entity(p.id);return u&&Math.hypot(u.x-p.x,u.y-p.y)>1;}).length,
  damaged:initial.filter(p=>m.entity(p.id)?.hp<p.hp).length,pending:m.state.units.filter(u=>u.pendingOrder).length,
  enemies:m.state.units.filter(u=>u.owner==='scavs').length,enemyMoved:initial.filter(p=>{const u=m.entity(p.id);return u?.owner==='scavs'&&Math.hypot(u.x-p.x,u.y-p.y)>1;}).length,
  predictive:m.trafficCoordinator.stats,command:m.commandPlanner?.stats};
 fs.writeFileSync(dir+'/'+count+'.json',JSON.stringify(report,null,2));summary.push(report);console.log(JSON.stringify(report));
}
fs.writeFileSync(dir+'/scale.json',JSON.stringify(summary,null,2));
