import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const dir='docs/campaign/alpha/m02',source=JSON.parse(fs.readFileSync(dir+'/playthrough-50.json','utf8'));
const m=makeMission();m.load(source.state);
const army=()=>m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&m.unitSpec(u).damage);
const start=new Map(army().map(u=>[u.id,{x:u.x,y:u.y}])),target=m.field.gridToWorld([39.5,91]);
const audit={ticks:0,minimumGap:null,intersections:[]};
for(let tick=0;tick<3000&&m.state.status==='running';tick++){
 m.advance(.1);m.drainEvents();m.drainEffects();audit.ticks++;
 const cars=army().filter(u=>u.factoryVisit?.phase!=='inside');
 for(let a=0;a<cars.length;a++)for(let b=0;b<a;b++){
  if(Math.hypot(cars[a].x-cars[b].x,cars[a].y-cars[b].y)>40)continue;
  const gap=vehicleClearance(cars[a],cars[b],m.config.worldScale,m.field);audit.minimumGap=Math.min(audit.minimumGap??Infinity,gap);
  if(gap<-.05&&audit.intersections.length<20)audit.intersections.push({time:m.state.time,ids:[cars[a].id,cars[b].id],gap});
 }
}
const units=army().map(u=>({id:u.id,x:u.x,y:u.y,distance:Math.hypot(u.x-target.x,u.y-target.y),moved:Math.hypot(u.x-start.get(u.id).x,u.y-start.get(u.id).y),navigation:u.navigation,task:u.task}));
const report={from:source.state.state.time,to:m.state.time,audit,units};
fs.writeFileSync(dir+'/group-return.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({time:m.state.time,audit,units:units.map(u=>({id:u.id,distance:Math.round(u.distance),moved:Math.round(u.moved),state:u.navigation?.state}))}));
assert.equal(audit.intersections.length,0,'No physical intersections during the return');
assert(units.every(u=>u.distance<240),'Every surviving vehicle reaches the southern assembly area');
