import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {shouldAutoRetreat} from '../campaign/combat-retreat-state.js';
import {armySelectionIds} from '../campaign/army-selection.js';
const baseline=process.argv.includes('--baseline'),results=[];
function fixture(){const m=progressMission();m.state.units=[];const builder=m.addUnit('builder','rai',{x:0,y:0}),factory=m.addStructure('factory','rai',{x:180,y:120},{completed:true,progress:1});m.state.energy=1000;m.rebuildNavigation();return {m,builder,factory};}
function until(m,done,seconds=160){const end=m.state.time+seconds,start=performance.now();while(!done()&&m.state.time<end&&performance.now()-start<30000)m.advance(.1);assert(done(),JSON.stringify({time:m.state.time,units:m.state.units.map(u=>({kind:u.kind,hp:u.hp,x:u.x,y:u.y,task:u.task,path:u.path,retreat:u.combatRetreat,visit:u.factoryVisit,wait:u.navigation}))}));}
{
 const {m,builder}=fixture(),car=m.addUnit('bukhanka','rai',{x:0,y:-70});builder.hp=builder.maxHp*.7;car.hp=car.maxHp*.7;
 const command=m.setArmyCombatPolicy({retreat:'light'});
 results.push({command,builderPolicy:builder.combatPolicy??null,builderRetreat:shouldAutoRetreat(builder,m.unitSpec(builder)),carRetreat:shouldAutoRetreat(car,m.unitSpec(car))});
 if(!baseline)assert(results[0].builderRetreat,'The retreat rule must cover builders');
 const before={x:builder.x,y:builder.y};m.retreat([builder.id]);for(let i=0;i<80;i++)m.advance(.1);
 results.push({manual:{moved:Math.hypot(builder.x-before.x,builder.y-before.y),status:builder.combatRetreat?.status}});assert(results[1].manual.moved>5);
}
if(!baseline){
 {
  const {m,builder}=fixture();m.setArmyCombatPolicy({retreat:'light'});m.damage(builder,90);
  until(m,()=>builder.factoryVisit?.phase==='inside');const repairSave=m.save(),hurt=builder.hp;
  until(m,()=>!builder.combatRetreat&&!builder.factoryVisit&&!builder.task&&!builder.pendingOrder&&builder.hp===builder.maxHp);
  assert(Math.hypot(builder.x,builder.y)<2.01);assert(m.state.energy<1000);assert(hurt<builder.maxHp);
  const restored=fixture().m;restored.load(repairSave);restored.state.bounds=[0,0,127,127];restored.rebuildNavigation();restored.visible.fill(255);restored.explored.fill(255);const loaded=restored.entity(builder.id);
  until(restored,()=>!loaded.combatRetreat&&!loaded.factoryVisit&&!loaded.task&&!loaded.pendingOrder&&loaded.hp===loaded.maxHp);assert(Math.hypot(loaded.x,loaded.y)<2.01);
  results.push({case:'idle builder automatic repair, return and save/load',time:m.state.time});
 }
 {
  const {m,builder}=fixture();m.setArmyCombatPolicy({retreat:'heavy'});
  const target=m.addStructure('bunker','rai',{x:-120,y:0},{groundHeight:0,cost:85,funding:{paid:85}});m.rebuildNavigation();const buildOrder=m.order([builder.id],'build',target);assert(buildOrder.ok,JSON.stringify(buildOrder));
  until(m,()=>target.progress>0);m.damage(builder,200,{id:'enemy',kind:'raider',owner:'scavs',x:-250,y:0});until(m,()=>!!builder.combatRetreat);
  const progress=target.progress;assert(!builder.builderWorking);assert.equal(builder.combatRetreat.resume.action,'build');
  until(m,()=>builder.factoryVisit?.phase==='inside');assert.equal(target.progress,progress,'Evacuation suspends construction');
  until(m,()=>target.completed,180);assert.equal(builder.hp,builder.maxHp);assert(!builder.combatRetreat);
  results.push({case:'working builder folds, repairs, resumes and completes its building',time:m.state.time});
 }
 {
  const {m,builder}=fixture(),other=m.addUnit('builder','rai',{x:-80,y:0}),car=m.addUnit('bukhanka','rai',{x:0,y:-100});m.rebuildNavigation();
  m.setArmyCombatPolicy({retreat:'light'});for(const u of [builder,other,car])m.damage(u,u.maxHp*.4);
  until(m,()=>[builder,other,car].every(u=>u.hp===u.maxHp&&!u.factoryVisit&&!u.combatRetreat&&!u.task&&!u.pendingOrder),240);
  assert(!armySelectionIds(m).includes(builder.id));assert(!armySelectionIds(m).includes(other.id));
  const enemy=m.addUnit('raider','scavs',{x:400,y:-200});assert(!m.order([builder.id],'attack',enemy).ok);
  results.push({case:'two builders and a combat vehicle share repair service; builders stay out of attack selection',time:m.state.time});
 }
 {
  const {m,builder}=fixture();m.setArmyCombatPolicy({retreat:'heavy'});const next=m.addUnit('builder','rai',{x:-100,y:-100});assert.equal(next.combatPolicy.retreat,'heavy');
  delete builder.combatPolicy;m.load(m.save());m.state.bounds=[0,0,127,127];m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);const loaded=m.entity(builder.id);assert.equal(loaded.combatPolicy.retreat,'heavy');
  loaded.hp=loaded.maxHp*.5;assert(!shouldAutoRetreat(loaded,m.unitSpec(loaded)));m.setArmyCombatPolicy({retreat:'light'});assert(shouldAutoRetreat(loaded,m.unitSpec(loaded)));
  until(m,()=>!!loaded.combatRetreat,5);m.setArmyCombatPolicy({retreat:'never'});assert(!loaded.combatRetreat);assert(!shouldAutoRetreat(loaded,m.unitSpec(loaded)));
  m.setArmyCombatPolicy({retreat:'light'});until(m,()=>!!loaded.combatRetreat,5);assert(m.submitOrder([loaded.id],'move',{x:-200,y:0}).ok);
  until(m,()=>!loaded.pendingOrder&&!loaded.task&&!loaded.path.length,50);assert(!loaded.combatRetreat);assert(Math.hypot(loaded.x+200,loaded.y)<2.01);
  results.push({case:'new and old saved builders inherit rules; thresholds, never and manual override'});
 }
}
console.log(JSON.stringify({baseline,passed:true,results},null,2));
