import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MinimapAlerts} from '../campaign/minimap-alerts.js';
import {makeMission} from './m02-fixture.mjs';
const tasks=[{id:'security',name:'Clear camps'}];
function scene(Type=MinimapAlerts){
 const m={state:{status:'running',units:[],buildings:[],artifacts:[],camps:[{id:'goal',x:100,y:100}]},config:{},inBounds:()=>true,exploredAt:()=>true,entity:()=>null};
 const a=new Type(()=>{},m);let now=0;a.observe(m,tasks,now);
 return {m,a,get now(){return now;},tick(seconds,{fire=false,hits=false,paused=false}={}){
  for(let i=0;i<seconds*4;i++){
   now+=250;if(fire&&!paused)m.lastPlayerCombatAt=now;
   if(hits&&!paused)a.event({type:'under-attack',x:500,y:500},now);
   a.observe(m,tasks,now,{paused});
  }
 }};
}
const checks=[];
for(const combat of [{fire:true},{hits:true},{fire:true,hits:true}]){
 const s=scene();s.tick(30,combat);assert(!s.a.pings.some(p=>p.reminder));
 s.tick(89.75,combat);assert(!s.a.pings.some(p=>p.reminder));
 s.tick(.25,combat);assert.equal(s.a.pings.filter(p=>p.reminder&&p.combatProtected).length,1);
 s.tick(2.75,combat);assert(s.a.pings.some(p=>p.combatProtected),'Shots cannot erase the forced three-second pulse');
 s.tick(.25,combat);assert(!s.a.active(s.now).some(p=>p.reminder));
 s.tick(116.75,combat);assert(!s.a.pings.some(p=>p.reminder));
 s.tick(.25,combat);assert(s.a.pings.some(p=>p.combatProtected),'Continuous combat repeats at 120 seconds, not 30');
}
checks.push('incoming, outgoing and two-way combat: no reminder at 30 or 119.75 seconds; protected pulses at 120 and 240, lasting exactly three seconds');
{
 const s=scene();for(let i=0;i<12;i++){tasks[0].progress=String(i);s.tick(10,{fire:true});}
 assert(s.a.pings.some(p=>p.combatProtected));delete tasks[0].progress;
 checks.push('changing objective progress restarts the 30-second delay but cannot postpone the two-minute limit');
}
{
 const s=scene();s.tick(35,{fire:true});s.tick(2.75);assert(!s.a.pings.some(p=>p.reminder));s.tick(.25);assert(s.a.pings.some(p=>p.reminder&&!p.combatProtected));
 const p=scene();p.tick(119,{hits:true});p.tick(60,{paused:true});assert(!p.a.active(p.now).some(p=>p.reminder));p.tick(1,{hits:true});assert(p.a.pings.some(p=>p.combatProtected));
 checks.push('deferred reminder resumes after three quiet seconds; a paused minute does not consume the two-minute deadline');
}
{
 const s=scene();s.tick(119,{fire:true});
 for(let i=0;i<16;i++)s.a.event({type:'under-attack',x:500+i*200,y:500},s.now+250);
 s.tick(1,{fire:true});
 assert.equal(s.a.pings.filter(p=>p.kind==='attack').length,16);assert(s.a.pings.some(p=>p.combatProtected));
 s.a.event({type:'under-attack',x:5000,y:500},s.now);assert.equal(s.a.pings.length,17);
 s.tick(3,{fire:true});assert(!s.a.pings.some(p=>p.combatProtected));
 checks.push('a full buffer of sixteen attacks neither blocks the deadline nor loses attack warnings; the extra reminder expires normally');
}
{
 const m=makeMission(),u=m.state.units.find(u=>u.kind==='bukhanka'&&u.owner==='rai');
 const enemy=m.addUnit('raider','scavs',{x:u.x+40,y:u.y});const spec=m.unitSpec(u);
 m.state.time=10;assert.equal(m.attack(u,enemy,spec),true);assert.equal(m.lastPlayerCombatAt,10);
 m.state.time=11;assert.equal(m.attack(u,enemy,spec),false);assert.equal(m.lastPlayerCombatAt,10,'Cooldown is not actual combat');
 u.cooldown=0;enemy.x+=1000;assert.equal(m.attack(u,enemy,spec),false);assert.equal(m.lastPlayerCombatAt,10,'An unfulfilled attack order is not combat');
 enemy.x=u.x+40;m.state.time=12;assert.equal(m.attack(enemy,u,m.unitSpec(enemy)),true);assert.equal(m.lastPlayerCombatAt,12);
 const bunker=m.addStructure('bunker','rai',{x:u.x,y:u.y+30},{completed:true,progress:1});m.state.time=13;
 assert.equal(m.attack(bunker,enemy,m.buildingSpec(bunker)),true);assert.equal(m.lastPlayerCombatAt,13);
 checks.push('real mission shots from friendly vehicles, enemies and defensive buildings update combat time; cooldown and out-of-range attempts do not');
}
fs.writeFileSync('docs/playtest-evidence/wg011/combat.json',JSON.stringify({checks},null,2));console.log(JSON.stringify({checks}));
