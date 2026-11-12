import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
const option=(name,fallback)=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const ref=option('baseline-ref',null),label=option('label',ref??'current');
if(ref){
  const names=execFileSync('git',['diff','--diff-filter=M','--name-only',ref,'--','campaign'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(name=>name.endsWith('.js'));
  const sources=new Map(names.map(name=>[name,execFileSync('git',['show',ref+':'+name],{encoding:'utf8'})]));
  registerHooks({load(url,context,next){const name=url.slice(url.indexOf('/campaign/')+1);return sources.has(name)?{format:'module',source:sources.get(name),shortCircuit:true}:next(url,context);}});
}
const {progressMission}=await import('./check-navigation-public-progress.mjs');
const {vehicleClearance,trafficCollisionRequired}=await import('../campaign/vehicle-collision.js');
const results=[];
for(const action of ['attack','attack-move']){
  const m=progressMission(),count=Number(option('count','12'));
  // Ordinary public group order, without preassigned firing positions. The
  // staggered rows start at different distances; no arrival-time oracle.
  const cars=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%3-1)*32,y:-Math.floor(i/3)*32},{heading:0}));
  const target=m.addStructure('generator','scavs',{x:0,y:190},{hp:100000,maxHp:100000,completed:true,progress:1});m.rebuildNavigation();
  m.visible.fill(255);m.explored.fill(255);
  const moves=[],record=m.recordTrafficDiagnostic?.bind(m);
  m.recordTrafficDiagnostic=event=>{if(event.event==='firing-frontage-filled')moves.push({time:m.state.time,...event});return record?.(event);};
  const goal={x:0,y:370};assert(m.order(cars.map(u=>u.id),action,action==='attack'?target:goal).ok);
  const fired=new Set(),lastShot=new Map(),firstShot=new Map();let gap=Infinity,solidGap=Infinity,checks=0,passingOverlaps=0;
  const clear=m.vehicleMotionClear.bind(m);m.vehicleMotionClear=(...args)=>{checks++;return clear(...args);};
  const start=performance.now();
  for(let tick=0;tick<400;tick++){
    m.advance(.1);m.finishPendingStep();
    for(const e of m.effects)if(e.type==='shot'&&cars.some(u=>u.id===e.from)){fired.add(e.from);lastShot.set(e.from,m.state.time);if(!firstShot.has(e.from))firstShot.set(e.from,m.state.time);}m.effects=[];
    for(let i=0;i<cars.length;i++)for(let j=0;j<i;j++){
      const clearance=vehicleClearance(cars[i],cars[j],m.config.worldScale,m.field);gap=Math.min(gap,clearance);
      if(trafficCollisionRequired(cars[i],cars[j]))solidGap=Math.min(solidGap,clearance);
      else if(clearance<0)passingOverlaps++;
    }
  }
  const result={action,count,cpuMs:performance.now()-start,checks,fired:fired.size,sustained:cars.filter(u=>lastShot.get(u.id)>37).length,gap,solidGap,passingOverlaps,
    fills:moves.length,exchanges:moves.filter(e=>e.ids.length===2).length,moves,units:cars.map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,maxHp:u.maxHp,firstShot:firstShot.get(u.id),lastShot:lastShot.get(u.id),deployment:u.combatDeployment,task:u.task,path:u.path}))};
  fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/firing-fill-'+label+'-'+action+'.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,moves:undefined,units:undefined}));
  // The existing generic jam controller can explicitly lend passing space.
  // Report those overlaps separately; never classify one as solid clearance.
  assert(solidGap>=0,'Every physical tick obeys solid hull collisions');assert(cars.every(u=>u.hp===u.maxHp),'No friendly collision damage');
  if(!ref&&!process.argv.includes('--diagnose')){assert(fired.size===cars.length,'Every car must reach firing range');assert.equal(result.sustained,cars.length,'Followers must join sustained fire, not remain trapped behind the first arrival');}
  if(action==='attack-move'){
    const resumed=cars.map(u=>structuredClone(u.combatDeployment?.resume??u.task));m.damage(target,100001,cars[0]);
    for(let i=0;i<50;i++){m.advance(.1);m.finishPendingStep();m.effects=[];}
    assert(cars.every(u=>!u.combatDeployment),'Destroyed target releases the whole deployment');
    assert(cars.every((u,i)=>u.task?.type==='attack-move'&&u.task.x===resumed[i].x&&u.task.y===resumed[i].y||!u.task),'Original march destination survives position exchanges');
  }
  results.push(result);
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/firing-fill-flow-'+label+'.json',JSON.stringify({ref,results},null,2));
