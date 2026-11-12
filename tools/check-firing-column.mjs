import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {firingSlots} from '../campaign/firing-positions.js';
import {vehicleClearance,trafficCollisionRequired} from '../campaign/vehicle-collision.js';
const results=[];
for(const {count,startY=0} of [{count:1},{count:8},{count:12},{count:8,startY:90}]){
  const m=progressMission(),cars=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:0,y:startY-i*42}));
  const target=m.addStructure('generator','scavs',{x:0,y:190},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
  m.visible.fill(255);m.explored.fill(255);
  assert(m.submitOrder(cars.map(u=>u.id),'attack-move',{x:0,y:400}).ok);
  const fired=new Set(),firstShot=new Map(),lastShot=new Map();let firstReservation=null,minGap=Infinity;
  const inner=Math.min(...firingSlots(m.unitSpec(cars[0]),m.config.worldScale,-Math.PI/2,target).map(p=>Math.hypot(p.x-target.x,p.y-target.y)));
  const start=performance.now();
  for(let tick=0;tick<600;tick++){
    m.advance(.1);m.finishPendingStep();
    const slot=cars[0].combatDeployment?.slot;
    if(!firstReservation&&slot){
      firstReservation={time:m.state.time,range:Math.hypot(slot.x-target.x,slot.y-target.y)};
      assert(Math.abs(firstReservation.range-inner)<.01,'The first contact takes a free front row before followers arrive');
    }
    for(const e of m.effects)if(e.type==='shot'){fired.add(e.from);firstShot.set(e.from,firstShot.get(e.from)??m.state.time);lastShot.set(e.from,m.state.time);}m.effects=[];
    for(let i=0;i<cars.length;i++)for(let j=0;j<i;j++)if(trafficCollisionRequired(cars[i],cars[j]))minGap=Math.min(minGap,vehicleClearance(cars[i],cars[j],m.config.worldScale,m.field));
    for(const u of cars)if(u.combatDeployment?.status==='arrived'){
      const slot=u.combatDeployment.slot;assert(Math.hypot(u.x-slot.x,u.y-slot.y)<2,'First arrival must actually fill its slot, not stop early to shoot');
    }
  }
  assert(firstReservation);assert.equal(fired.size,count);assert(cars.every(u=>lastShot.get(u.id)>55));assert(minGap>=0);
  results.push({count,startY,cpuMs:performance.now()-start,firstReservation,fired:fired.size,minGap,shots:cars.map(u=>({id:u.id,first:firstShot.get(u.id),last:lastShot.get(u.id)}))});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/firing-column.json',JSON.stringify({results},null,2));console.log(JSON.stringify({results}));
