import fs from 'node:fs';
import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
const folder='campaign/previews/playtest-WG-055',reports=[];
function until(m,predicate,seconds=60){const end=m.state.time+seconds,wall=performance.now();while(!predicate()&&m.state.time<end&&performance.now()-wall<60000){m.advance(.1);m.drainEffects();}assert(predicate(),JSON.stringify({time:m.state.time,units:m.state.units.filter(u=>u.kind==='bukhanka').map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,reason:u.navigation?.reason,push:u.retreatPush,retreat:u.combatRetreat,visit:u.factoryVisit}))}));}
function fixture(hp=64){
 const m=progressMission();m.addStructure('generator','rai',{x:400,y:400},{completed:true,progress:1});const f=m.addStructure('factory','rai',{x:0,y:240},{completed:true,progress:1});
 const u=m.addUnit('bukhanka','rai',{x:0,y:-150},{heading:0});u.hp=hp;u.trafficOnScreen=true;m.rebuildNavigation();m.explored.fill(255);m.visible.fill(255);
 assert(m.retreat([u.id]).ok);until(m,()=>u.path.length&&u.driveSpeed>10,8);
 const fx=-Math.sin(u.heading),fy=Math.cos(u.heading),b=m.addUnit('bukhanka','rai',{x:u.x+fx*40,y:u.y+fy*40},{heading:u.heading});b.trafficOnScreen=true;
 return {m,u,b,f};
}
let contactSave;
{
 const {m,u,b}=fixture(),events=[],emit=m.emit.bind(m);m.emit=(type,data)=>{events.push({type,...data});return emit(type,data);};
 const hp=[u.hp,b.hp];until(m,()=>events.some(e=>e.type==='retreat-contact'),15);
 const speed=u.driveSpeed;assert(speed>20,'Use regular retreat speed at impact');contactSave=m.save();
 const once=[u.hp,b.hp];for(let i=0;i<5;i++)m.advance(.1);assert.deepEqual([u.hp,b.hp],once,'A sustained push is one damage event');
 until(m,()=>u.factoryVisit?.phase==='inside',60);until(m,()=>u.hp===u.maxHp,30);assert(b.hp>=hp[1]-30);
 reports.push({case:'public retreat, physical push, factory entry and repair',impactSpeed:speed,losses:[hp[0]-once[0],hp[1]-once[1]],events:events.filter(e=>e.type==='retreat-contact'),repairedAt:m.state.time});
}
for(const mode of ['load','stop','replace']){
 const m=progressMission();m.load(contactSave);m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.explored.fill(255);const u=m.state.units.find(u=>u.retreatPush?.contact),b=m.entity(u.retreatPush.target),hp=[u.hp,b.hp];
 assert(u&&b);const contacts=[],emit=m.emit.bind(m);m.emit=(type,data)=>{if(type==='retreat-contact')contacts.push(data);return emit(type,data);};
 if(mode==='load'){for(let i=0;i<5;i++)m.advance(.1);assert.deepEqual([u.hp,b.hp],hp);assert.equal(contacts.length,0);until(m,()=>u.factoryVisit?.phase==='inside',60);}
 else{
  const origin={x:u.x,y:u.y},goal={x:u.x-100,y:u.y-80};
  if(mode==='stop')m.stop([u.id],{expandGroup:false});else assert(m.submitOrder([u.id],'move',goal).ok);
  until(m,()=>!u.pendingOrder&&!u.proposedOrder&&!u.task&&!u.path.length,45);
  assert(!u.combatRetreat&&!u.retreatPush);assert.equal(contacts.length,0);assert(Math.hypot(u.x-(mode==='stop'?origin.x:goal.x),u.y-(mode==='stop'?origin.y:goal.y))<.65);
 }
 reports.push({case:mode+' during contact retains commands and never repeats damage',time:m.state.time});
}
fs.writeFileSync(folder+'/mission-checks.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
