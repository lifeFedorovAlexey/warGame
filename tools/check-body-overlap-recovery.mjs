import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {trafficCollisionRequired,vehicleClearance} from '../campaign/vehicle-collision.js';
import {bodyEnvelope,bodyContact,resolveVehicleOverlapsSteps} from '../campaign/vehicle-overlap.js';

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(poses){
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],bounds:[0,0,127,127]});m.updateMission=()=>{};
 const units=poses.map(p=>m.addUnit('bukhanka','rai',p,{heading:p.heading??0}));
 m.rebuildNavigation();m.unitIndex.rebuild(m.state.units);return {m,units};
}
const gap=(m,a,b)=>bodyContact(bodyEnvelope(a,config.worldScale,m.field),bodyEnvelope(b,config.worldScale,m.field)).gap;
function step(m){m.unitIndex.rebuild(m.state.units);m.state.time+=.1;const it=resolveVehicleOverlapsSteps(m,.1);while(!it.next().done){};}
function settle(m,units,seconds=12){
 let minimum=Infinity,maxStep=0;
 for(let i=0;i<seconds*10;i++){
  const before=units.map(u=>({x:u.x,y:u.y}));step(m);minimum=Infinity;
  for(let a=0;a<units.length;a++){maxStep=Math.max(maxStep,Math.hypot(units[a].x-before[a].x,units[a].y-before[a].y));for(let b=0;b<a;b++)minimum=Math.min(minimum,gap(m,units[a],units[b]));}
  if(minimum>=config.worldScale*.055-.005)break;
 }
 assert(minimum>=config.worldScale*.055-.005,'Collision ovals must separate using the normal traffic clearance: '+JSON.stringify({minimum,stats:m.overlapStatistics}));
 assert(maxStep<=config.worldScale*.12+1e-6,'Recovery is gradual, not a teleport');return {minimum,maxStep};
}
const report=[];
// Previously expanded rectangular corners must no longer hold clear ovals.
for(const poses of [
 [{x:0,y:0,heading:2.324},{x:12.115,y:-4.643,heading:1.752}],
 [{x:0,y:0,heading:2.424},{x:-1.103,y:-18.257,heading:2.808}]
]){
 const {m,units}=fixture(poses),before=units.map(u=>[u.x,u.y]);assert(gap(m,...units)>0);
 for(let i=0;i<20;i++)step(m);assert.deepEqual(units.map(u=>[u.x,u.y]),before,'Clear vehicles keep their accepted positions');
}
for(const poses of [
 [{x:0,y:0},{x:2,y:1}],
 Array.from({length:6},(_,i)=>({x:(i%3)*6,y:Math.floor(i/3)*17}))
]){
 const {m,units}=fixture(poses),before=gap(m,...units),orders=units.map((u,i)=>u.task={type:'move',x:i*80,y:200});
 assert(before<0);const hp=units.map(u=>u.hp);const result=settle(m,units);
 units.forEach((u,i)=>{assert.equal(u.task,orders[i],'Retain the original order');assert.equal(u.hp,hp[i],'Recovery itself does not deal damage');});
 report.push({bodies:units.length,before,...result});
}
{
 const {m,units}=fixture([{x:0,y:0},{x:2,y:1}]);
 assert(vehicleClearance(...units,config.worldScale)<0,'Regression must exercise an actual oval overlap');
 for(const u of units)u.trafficOnScreen=false;
 assert(trafficCollisionRequired(...units),'Legacy camera flags never exempt two allies from collision');
 settle(m,units);
 const saved=m.save();m.load(saved);
 assert(m.state.units.every(u=>!Object.hasOwn(u,'trafficOnScreen')),'Strip the legacy camera flag on save load');
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
 // Ellipse EPA terminates at 1e-5 world units (a few micrometres here).
 assert(wallGaps.every(g=>g>=-2e-5),'Separate toward free space, not through the wall: '+wallGaps);
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
{
 const {m,units:[driver,blocker]}=fixture([{x:0,y:-25},{x:0,y:0}]);
 // One lane wide: the solid walls leave room for the car but no shoulder.
 m.state.buildings.push(...[-15,15].map((x,i)=>({id:'wall'+i,kind:'bunker',owner:'rai',x,y:30,hp:100,
  completed:true,halfWidth:8,halfDepth:100,rotation:0,queue:[]})));
 m.rebuildNavigation();
 const goal={x:0,y:65},hp=[driver.hp,blocker.hp];
 driver.path=[goal];driver.task={type:'move',...goal};driver.routeOrder={destination:goal};
 let firstPassage=null,crossed=false;
 for(let i=0;i<150&&driver.path.length;i++){
  m.advance(.1);m.finishPendingStep();
  if(!trafficCollisionRequired(driver,blocker)){
   if(!firstPassage){
    firstPassage={time:m.state.time,wait:driver.navigation.waitSeconds};
    assert(firstPassage.wait>=1-1e-6,'Require one full simulation second of blocking');
    assert(!trafficCollisionRequired(blocker,driver),'The same exemption applies from either side');
    assert(trafficCollisionRequired(driver,{...blocker,id:'another'}),'Another vehicle still collides');
    assert(trafficCollisionRequired(driver,{...blocker,owner:'scavs'}),'Enemies still collide');
    assert(trafficCollisionRequired(driver,{...blocker,factoryVisit:{phase:'leaving'}}),'Keep the factory exit protected');
    assert(trafficCollisionRequired({...driver,commandRevision:(driver.commandRevision??0)+1},blocker),'A new command invalidates the passage');
    assert(!m.vehicleMotionClear(driver,driver,{...driver,x:14}),'The permit does not bypass solid walls');
   }
   if(gap(m,driver,blocker)<0)crossed=true;
  }
 }
 assert(firstPassage&&crossed,'Two allies physically pass through with a jam permit');
 assert(Math.hypot(driver.x-goal.x,driver.y-goal.y)<2,'The original route completes');
 assert(trafficCollisionRequired(driver,blocker)&&!driver.trafficPassThrough,'Collision returns after the passage');
 assert.deepEqual([driver.hp,blocker.hp],hp,'Passage does not cause collision damage');
 report.push({jam:firstPassage,arrivedAt:m.state.time,gap:gap(m,driver,blocker)});
}
console.log(JSON.stringify({passed:true,report}));
