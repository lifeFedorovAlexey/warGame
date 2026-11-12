import fs from 'node:fs';
import inspector from 'node:inspector/promises';
import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
const option=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
if(process.argv.includes('--baseline')){
 const ref=option('baseline-ref','0b0984f'),files=execFileSync('git',['diff','--diff-filter=M','--name-only',ref,'--','campaign'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>p.endsWith('.js'));
 const sources=new Map(files.map(p=>[p,execFileSync('git',['show',ref+':'+p],{encoding:'utf8'})]));
 registerHooks({load(url,context,next){const name=url.slice(url.indexOf('/campaign/')+1);return sources.has(name)?{format:'module',source:sources.get(name),shortCircuit:true}:next(url,context);}});
}
const {bridgeTrafficFixture}=await import('./bridge-traffic-fixture.mjs');
const {PredictiveTraffic}=await import('../campaign/predictive-traffic.js'),{vehicleDynamics}=await import('../campaign/vehicle-dynamics.js');
const drive=PredictiveTraffic.prototype.driveSteps,motion={hardStops:0,maxSpeedLoss:0};
PredictiveTraffic.prototype.driveSteps=function*(mission,unit,goal,dt,...args){
 const before=unit.driveSpeed??0,result=yield* drive.call(this,mission,unit,goal,dt,...args),loss=before-(unit.driveSpeed??0);
 motion.maxSpeedLoss=Math.max(motion.maxSpeedLoss,loss);if(loss>vehicleDynamics(unit).braking*dt+.001)motion.hardStops++;
 return result;
};
const count=Number(option('count','500')),seconds=Number(option('seconds','2')),label=option('label','fixed-work');
const {mission:m,groups,targets}=bridgeTrafficFixture(count,1,{opponent:true});
// Complete the public command before the measurement so every run performs
// the same number of physical ticks with accepted routes, including enemy AI.
assertOrder(m.order(groups[0].map(u=>u.id),'attack-move',targets[0]));
function assertOrder(result){if(!result.ok)throw Error('Fixture order rejected');}
const start=m.state.units.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp}));
const session=process.argv.includes('--profile')?new inspector.Session():null;
if(session){session.connect();await session.post('Profiler.enable');await session.post('Profiler.start');}
const times=[],at=performance.now(),began=m.state.time;
for(let i=0;i<Math.round(seconds/m.config.simulationStep);i++){
 const tick=performance.now();m.tick(m.config.simulationStep);times.push(performance.now()-tick);m.drainEvents();m.drainEffects();
}
const elapsed=performance.now()-at,dir='campaign/reports/bridge-driving/'+label;fs.mkdirSync(dir,{recursive:true});
if(session){fs.writeFileSync(dir+'/fixed.cpuprofile',JSON.stringify((await session.post('Profiler.stop')).profile));session.disconnect();}
times.sort((a,b)=>a-b);
const report={baseline:process.argv.includes('--baseline'),count,ticks:times.length,simulationSeconds:m.state.time-began,cpuMs:elapsed,
 tickMs:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},
 moved:start.filter(p=>Math.hypot(m.entity(p.id).x-p.x,m.entity(p.id).y-p.y)>1).length,
 enemyMoved:start.filter(p=>m.entity(p.id).owner==='scavs'&&Math.hypot(m.entity(p.id).x-p.x,m.entity(p.id).y-p.y)>1).length,
 damaged:start.filter(p=>m.entity(p.id).hp<p.hp).length,motion,predictive:m.trafficCoordinator.stats};
fs.writeFileSync(dir+'/fixed.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
