// Navigation fixture: stationary fortifications, disabled combat/production.
// Vehicles use public orders and normal fixed-step movement throughout.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
const dir='docs/campaign/alpha/m02/art-v3';fs.mkdirSync(dir,{recursive:true});
const m=prepareM02Diagnostic(makeMission()),start=m.field.gridToWorld(m.config.startGrid);
m.state.units=m.state.units.filter(u=>u.owner==='rai');
for(const spec of Object.values(m.config.buildings))spec.damage=0;
for(const spec of Object.values(m.config.units))spec.damage=0;
for(const b of Object.values(m.state.m02.bases))if(b.production)b.production.stopped=true;
const army=()=>m.state.units.filter(u=>u.owner==='rai'&&m.unitSpec(u).role!=='builder');
for(let row=0;row<10&&army().length<20;row++)for(let col=0;col<10&&army().length<20;col++){
 const p={x:start.x-180+col*32,y:start.y-180-row*32,kind:'bukhanka',owner:'rai',heading:0};
 if(m.vehicleMotionClear(p,p,p)&&m.state.units.every(u=>Math.hypot(u.x-p.x,u.y-p.y)>28))m.addUnit('bukhanka','rai',p);
}
assert.equal(army().length,20);const ids=army().map(u=>u.id),visits=[];
for(const id of ['east_factory','sensor_outpost','energy_hub','hill_factory','home']){
 const target=id==='home'?start:m.state.m02.bases[id].artifact.point;
 assert(m.order(ids,'move',target).ok);
 let arrived=false,seconds=0,reorders=0;
 const progress=new Map(army().map(u=>[u.id,{x:u.x,y:u.y,at:0,retries:0}]));
 for(;seconds<600;seconds++){
  m.advance(1);m.drainEvents();m.drainEffects();
  for(const u of army()){const p=progress.get(u.id);if(Math.hypot(u.x-p.x,u.y-p.y)>4)Object.assign(p,{x:u.x,y:u.y,at:seconds});}
  if(army().every(u=>Math.hypot(u.x-target.x,u.y-target.y)<170)){arrived=true;break;}
  // This is a controlled navigation tour, not proof of single-order group
  // recovery. Record bounded public retries for unassigned/stalled vehicles.
  if(seconds%10===9){
   const retry=army().filter(u=>{const p=progress.get(u.id);return p.retries<2&&Math.hypot(u.x-target.x,u.y-target.y)>=170&&(!u.task||seconds-p.at>=30);});
   if(retry.length){assert(m.order(retry.map(u=>u.id),'move',target).ok);for(const u of retry){const p=progress.get(u.id);p.retries++;p.at=seconds;}reorders++;}
  }
 }
 const distances=army().map(u=>Math.hypot(u.x-target.x,u.y-target.y));
 visits.push({id,arrived,seconds,reorders,retriedVehicles:[...progress].filter(([,p])=>p.retries).map(([id,p])=>({id,retries:p.retries})),maxDistance:Math.max(...distances)});console.log(JSON.stringify(visits.at(-1)));
 if(!arrived){fs.writeFileSync(dir+'/drive-failure.json',m.save());break;}
}
fs.writeFileSync(dir+'/drive.json',JSON.stringify({army:20,visits},null,2));assert.equal(visits.length,5);assert(visits.every(v=>v.arrived));
