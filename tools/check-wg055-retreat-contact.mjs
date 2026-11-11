import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {integrateControl} from '../campaign/predictive-traffic.js';
import {stepRetreatContact,applyRetreatContact,retreatContactDamage,retreatPushDelay,retreatSpeed} from '../campaign/retreat-contact.js';
import {bodyEnvelope,bodyContact} from '../campaign/vehicle-overlap.js';
import {vehicleContact} from '../campaign/vehicle-impact.js';
const reports=[];
const make=(hp=64,speed=30)=>{
 const m=progressMission(),driver=m.addUnit('bukhanka','rai',{x:0,y:-48},{heading:0}),other=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0});
 driver.hp=hp;driver.driveSpeed=speed;driver.task={type:'move',x:0,y:150};driver.path=[{x:0,y:150}];driver.routeOrder={destination:{x:0,y:150}};
 driver.combatRetreat={forced:true,status:'moving',phase:'home',destination:{x:0,y:150}};
 driver.trafficOnScreen=other.trafficOnScreen=true;m.rebuildNavigation();m.unitIndex.rebuild(m.state.units);return {m,driver,other};
};
{
 for(const speed of [0,.5,1,2.5])assert.equal(retreatContactDamage(speed,320),0);
 assert(retreatContactDamage(8)>retreatContactDamage(4));assert.equal(retreatContactDamage(100/3.6),30);assert.equal(retreatContactDamage(200/3.6),30);
 const {driver}=make();const hurt={...driver,hp:16},healthy={...driver,hp:256};assert(retreatPushDelay(hurt)<retreatPushDelay(healthy));assert(retreatSpeed(hurt,30)>retreatSpeed(healthy,30));
 reports.push({case:'speed-dependent damage capped at 30 HP at 100 km/h, harmless gentle contact and HP-dependent urgency',damageAtKmh:[0,9,20,30,50,75,100,200].map(v=>[v,retreatContactDamage(v/3.6)]),delay:[healthy,hurt].map(retreatPushDelay),speed:[healthy,hurt].map(u=>retreatSpeed(u,30))});
}
for(const closing of [1.5,6,12,100/3.6,200/3.6]){
 const {m,driver,other}=make();const hp=[driver.hp,other.hp],point=vehicleContact(driver,other,m.config.worldScale,m.field);
 const hit=applyRetreatContact(m,driver,other,closing,point);assert(hit);
 if(closing<=2.5)assert.deepEqual([driver.hp,other.hp],hp);else assert(driver.hp<hp[0]&&other.hp<hp[1]&&hp[0]-driver.hp<=30);
 const once=[driver.hp,other.hp];assert.equal(applyRetreatContact(m,driver,other,closing,point),null);assert.deepEqual([driver.hp,other.hp],once);
 driver.hp=other.hp=1;m.state.time+=4;applyRetreatContact(m,driver,other,100,point);assert.equal(driver.hp,1);assert.equal(other.hp,1);assert(!driver.damage?.wreck&&!other.damage?.wreck);
 assert(!Object.values(other.damage?.parts??{}).some(p=>p.detached));
 driver.hp=.5;other.hp=12;m.state.time+=4;applyRetreatContact(m,driver,other,100,point);assert.equal(driver.hp,.5);assert.equal(other.hp,1);
 reports.push({case:'impact '+closing+' m/s',losses:hit.losses});
}
{
 const {m,driver,other}=make();driver.y=-20;other.y=0;
 // Place the bodies at the ordinary collision hook's actual contact gap.
 driver.y-=.5-vehicleContact(driver,other,m.config.worldScale,m.field).gap;
 driver.hp=other.hp=40;
 const speed=100/3.6*m.config.worldScale;
 m.vehicleCollision(driver,speed,new Set([other]));assert.equal(driver.hp,10);assert.equal(other.hp,10);
 m.state.time+=4;m.vehicleCollision(driver,speed,new Set([other]));assert.equal(driver.hp,1);assert.equal(other.hp,1);
 reports.push({case:'legacy collision hook also caps high-speed retreat impact at 30 HP and cannot kill'});
}
{
 const {m,driver,other}=make();const before=JSON.stringify([driver,other]);assert.equal(stepRetreatContact(m,driver,0,integrateControl),false);assert.equal(JSON.stringify([driver,other]),before);
 reports.push({case:'zero-time update cannot push or damage'});
}
for(const block of ['clear','wall','third-car']){
 const {m,driver,other}=make();
 if(block==='wall')for(const x of [-15,15])m.state.buildings.push({id:'wall'+x,kind:'bunker',owner:'rai',x,y:20,hp:100,completed:true,halfWidth:8,halfDepth:70,rotation:0,queue:[]});
 if(block==='third-car')for(const x of [-14,14])m.addUnit('bukhanka','rai',{x,y:0},{heading:0});
 m.rebuildNavigation();const events=[],emit=m.emit.bind(m);m.emit=(type,data)=>{events.push({type,...data});return emit(type,data);};
 const goal=structuredClone(driver.path),initial={x:other.x,y:other.y},trace=[];let maxPush=0,minGap=Infinity;
 for(let tick=0;tick<100;tick++){
  m.state.time+=.1;m.unitIndex.rebuild(m.state.units);const old={x:other.x,y:other.y};
  const moved=stepRetreatContact(m,driver,.1,integrateControl);
  if(!moved&&!driver.retreatPush){const next=integrateControl(driver,{speed:30,steering:0},.1,m.config.worldScale);if(m.vehicleMotionClear(driver,driver,next))Object.assign(driver,next);}
  if(!moved&&driver.y>other.y+25)break;
  const push=Math.hypot(other.x-old.x,other.y-old.y);maxPush=Math.max(maxPush,push);
  const gap=bodyContact(bodyEnvelope(driver,m.config.worldScale,m.field),bodyEnvelope(other,m.config.worldScale,m.field)).gap;minGap=Math.min(minGap,gap);
  for(const third of m.state.units.filter(u=>u!==driver&&u!==other))assert(bodyContact(bodyEnvelope(other,m.config.worldScale,m.field),bodyEnvelope(third,m.config.worldScale,m.field)).gap>=-.001,block+': no pushing through a third car');
  trace.push({t:m.state.time,x:driver.x,y:driver.y,speed:driver.driveSpeed,other:{x:other.x,y:other.y},moved,gap});
 }
 const impacts=events.filter(e=>e.type==='retreat-contact');
 if(block==='clear'){assert(impacts.length===1,JSON.stringify({block,impacts,trace}));assert(Math.abs(other.x)>8,'Move the blocker aside');assert(driver.y>other.y,'Pass the blocker');assert(driver.driveSpeed>20,'Retreat does not crawl');}
 else {assert(impacts.length<=1,block+': no repeated damage while blocked');if(block==='wall')assert(Math.abs(other.x)<3,'Cannot push through the side walls');}
 assert(minGap>=-.001,'No body interpenetration');assert(maxPush<5,'A push is bounded by one physical tick');assert.deepEqual(driver.path,goal);
 reports.push({case:block,impacts:impacts.length,maxPush,minGap,driver:{x:driver.x,y:driver.y,hp:driver.hp},other:{x:other.x,y:other.y,hp:other.hp},displacement:Math.hypot(other.x-initial.x,other.y-initial.y)});
 fs.mkdirSync('campaign/previews/playtest-WG-055',{recursive:true});fs.writeFileSync('campaign/previews/playtest-WG-055/'+block+'.json',JSON.stringify({trace,events},null,2));
}
for(const mode of ['ordinary','stop','dead','interior']){
 const {m,driver,other}=make();if(mode==='ordinary')delete driver.combatRetreat;if(mode==='stop')driver.pendingOrder={type:'stop'};if(mode==='dead')driver.hp=0;if(mode==='interior')other.factoryVisit={phase:'inside'};
 const before=[driver.x,driver.y,other.x,other.y,driver.hp,other.hp];for(let i=0;i<20;i++){m.state.time+=.1;assert(!stepRetreatContact(m,driver,.1,integrateControl));}assert.deepEqual([driver.x,driver.y,other.x,other.y,driver.hp,other.hp],before);
}
fs.writeFileSync('campaign/previews/playtest-WG-055/contact-checks.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
