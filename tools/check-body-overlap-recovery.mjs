import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {bodyEnvelope,bodyContact,resolveVehicleOverlapsSteps} from '../campaign/vehicle-overlap.js';

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(poses){
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],bounds:[0,0,127,127]});m.updateMission=()=>{};
 const units=poses.map(p=>m.addUnit('bukhanka','rai',p,{heading:p.heading??0}));for(const u of units)u.trafficOnScreen=true;
 m.rebuildNavigation();m.unitIndex.rebuild(m.state.units);return {m,units};
}
const gap=(m,a,b)=>bodyContact(bodyEnvelope(a,config.worldScale,m.field),bodyEnvelope(b,config.worldScale,m.field)).gap;
function step(m){m.unitIndex.rebuild(m.state.units);m.state.time+=.1;const it=resolveVehicleOverlapsSteps(m,.1);while(!it.next().done){};}
function settle(m,units,seconds=12){
 let minimum=Infinity,maxStep=0;
 for(let i=0;i<seconds*10;i++){
  const before=units.map(u=>({x:u.x,y:u.y}));step(m);minimum=Infinity;
  for(let a=0;a<units.length;a++){maxStep=Math.max(maxStep,Math.hypot(units[a].x-before[a].x,units[a].y-before[a].y));for(let b=0;b<a;b++)minimum=Math.min(minimum,gap(m,units[a],units[b]));}
  if(minimum>=config.worldScale*.3-.005)break;
 }
 assert(minimum>=config.worldScale*.3-.005,'Actual bodies must separate with a visible gap: '+JSON.stringify({minimum,stats:m.overlapStatistics}));
 assert(maxStep<=config.worldScale*.12+1e-6,'Recovery is gradual, not a teleport');return {minimum,maxStep};
}
const report=[];
// Recorded u1127/u399: the routing ovals clear by 0.41, but the bodies overlap 2.23.
for(const poses of [
 [{x:0,y:0,heading:2.324},{x:12.115,y:-4.643,heading:1.752}],
 [{x:0,y:0,heading:2.424},{x:-1.103,y:-18.257,heading:2.808}],
 [{x:0,y:0},{x:2,y:1}],
 Array.from({length:6},(_,i)=>({x:(i%3)*6,y:Math.floor(i/3)*17}))
]){
 const {m,units}=fixture(poses),before=gap(m,...units),orders=units.map((u,i)=>u.task={type:'move',x:i*80,y:200});
 assert(before<0);const hp=units.map(u=>u.hp);const result=settle(m,units);
 units.forEach((u,i)=>{assert.equal(u.task,orders[i],'Retain the original order');assert.equal(u.hp,hp[i],'Recovery itself does not deal damage');});
 report.push({bodies:units.length,before,...result});
}
{
 const {m,units}=fixture([{x:0,y:0,heading:2.324},{x:12.115,y:-4.643,heading:1.752}]);
 if(bodyEnvelope(units[0],config.worldScale).width<5)assert(vehicleClearance(...units,config.worldScale)>0,'Regression must exercise corners outside the oval');
 const snapshot=units.map(u=>[u.x,u.y]);for(const u of units)u.trafficOnScreen=false;step(m);assert.deepEqual(units.map(u=>[u.x,u.y]),snapshot,'Keep the explicit off-screen pass-through rule');
 units[0].trafficOnScreen=true;settle(m,units);
}
{
 const {m,units}=fixture([{x:0,y:0},{x:2,y:1},{x:40,y:0}]);const idle=units[2];settle(m,units);assert.equal(idle.x,40);assert.equal(idle.y,0,'Do not move an unrelated car');
}
{
 const {m,units}=fixture([{x:0,y:0},{x:2,y:1}]);
 const wall={id:'wall',x:-8,y:0,halfWidth:2,halfDepth:50};m.nav.nearbySolids=()=>[wall];
 settle(m,units);
 const box={x:wall.x,y:wall.y,width:wall.halfWidth,depth:wall.halfDepth,c:1,s:0};
 const wallGaps=units.map(u=>bodyContact(bodyEnvelope(u,config.worldScale),box).gap);
 assert(wallGaps.every(g=>g>=-1e-6),'Separate toward free space, not through the wall: '+wallGaps);
}
{
 const {m,units}=fixture([{x:0,y:0},{x:2,y:1}]);units[1].factoryVisit={phase:'inside'};
 const snapshot=units.map(u=>[u.x,u.y]);step(m);assert.deepEqual(units.map(u=>[u.x,u.y]),snapshot,'Hidden factory bays are not overlapping world bodies');
}
{
 const {m,units}=fixture([{x:0,y:0,heading:2.324},{x:12.115,y:-4.643,heading:1.752}]);
 for(let i=0;i<30;i++){m.advance(.1);m.finishPendingStep();}
 assert(gap(m,...units)>=0,'The production tick runs recovery even for idle cars');
 const snapshot=units.map(u=>[u.x,u.y]);m.advance(0);assert.deepEqual(units.map(u=>[u.x,u.y]),snapshot,'Pause cannot move the cars');
}
console.log(JSON.stringify({passed:true,report}));
