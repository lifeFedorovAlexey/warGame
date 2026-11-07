import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {automaticCombatTarget,combatPolicy,DEFAULT_COMBAT_POLICY} from '../campaign/combat-policy.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){const m=new Mission({...config,startGrid:[64,56]},field);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.bounds=[0,0,127,127];m.state.pendingCinematics=[];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;}
const unit=(m,kind='bukhanka',owner='rai',x=0,y=0)=>m.addUnit(kind,owner,{x,y});
const tick=(m,u)=>{m.state.time+=.1;m.updateUnit(u,.1);};
const checks=[];
{
 const m=fixture(),u=unit(m),enemy=unit(m,'raider','scavs',0,65),weak=unit(m,'raider','scavs',55,45);weak.hp=20;
 assert(m.order([u.id],'attack',enemy).ok);tick(m,u);assert(enemy.hp<enemy.maxHp);
 m.setCombatPolicy([u.id],{response:'ignore'});u.cooldown=0;const held=enemy.hp;tick(m,u);
 assert.equal(enemy.hp,held,'Changing to hold fire must stop an already-issued attack');
 assert(m.order([u.id],'attack',enemy).ok);u.cooldown=0;tick(m,u);assert(enemy.hp<held,'A new explicit order may override hold fire');
 m.setCombatPolicy([u.id],{response:'ignore'});u.cooldown=0;const reaffirmed=enemy.hp;tick(m,u);
 assert.equal(enemy.hp,reaffirmed,'Clicking the already-selected hold-fire rule still cancels a newer attack');
 m.setCombatPolicy([u.id],{response:'free'});assert(m.order([u.id],'attack',enemy).ok);
 m.setCombatPolicy([u.id],{priority:'weakest'});u.cooldown=0;const old=enemy.hp;tick(m,u);
 assert.equal(enemy.hp,old,'The old explicit target must not mask a changed priority');assert(weak.hp<20);
 checks.push('live policy changes override an older explicit target; a new attack remains explicit');
}
{
 const m=fixture(),leader=unit(m),member=unit(m,'bukhanka','rai',50,0),other=unit(m,'bukhanka','rai',100,0);
 m.configureGroup([leader.id,member.id],{leaderId:leader.id});
 assert.equal(m.setCombatPolicy([leader.id],{response:'ignore'}).changed,2,'Leader settings affect the same members as leader attack orders');
 assert.equal(combatPolicy(member).response,'ignore');assert.equal(combatPolicy(other).response,'free');
 assert.equal(m.setCombatPolicy([member.id],{response:'return'}).changed,1,'Selecting a non-leader only changes that member');
 assert.equal(combatPolicy(leader).response,'ignore');
 checks.push('commander selection applies policies to its live group only');
}
{
 const m=fixture(),u=unit(m),enemy=unit(m,'raider','scavs',0,65);
 assert(m.submitOrder([u.id],'attack',enemy).ok);assert(u.pendingOrder);
 m.setCombatPolicy([u.id],{response:'ignore'});
 for(let i=0;i<10;i++)m.advance(.1);
 assert(!u.pendingOrder&&!u.task,'A queued attack cannot return after changing the firing rule');assert.equal(enemy.hp,enemy.maxHp);
 checks.push('policy changes cancel pending explicit attack planning');
}
{
 const m=fixture(),u=unit(m),near=unit(m,'raider','scavs',0,48),weak=unit(m,'raider','scavs',-48,80),danger=unit(m,'flamer','scavs',65,70);
 const strong=m.addStructure('generator','scavs',{x:110,y:0});weak.hp=15;
 const expected={nearest:near,strongest:strong,weakest:weak,dangerous:danger};
 for(const [priority,target] of Object.entries(expected)){
  m.setCombatPolicy([u.id],{priority});assert.equal(automaticCombatTarget(m,u,m.unitSpec(u)),target,priority);
 }
 m.setCombatPolicy([u.id],{priority:'strongest'});m.visibleAt=(x,y)=>x!==strong.x||y!==strong.y;
 assert.notEqual(automaticCombatTarget(m,u,m.unitSpec(u)),strong,'hidden strongest cannot be selected');
 m.lineOfSight=(from,to)=>to!==danger;
 m.setCombatPolicy([u.id],{priority:'dangerous'});assert.notEqual(automaticCombatTarget(m,u,m.unitSpec(u)),danger,'occluded target cannot win');
 checks.push('four priorities, visibility and line of sight');
}
{
 const m=fixture(),u=unit(m),enemy=unit(m,'raider','scavs',0,65),other=unit(m,'raider','scavs',40,20);
 m.setCombatPolicy([u.id],{response:'ignore'});tick(m,u);assert.equal(enemy.hp,enemy.maxHp);assert.equal(other.hp,other.maxHp);
 assert(m.order([u.id],'attack',enemy).ok);tick(m,u);assert(enemy.hp<enemy.maxHp,'explicit attack overrides hold fire');
 m.stop([u.id]);u.cooldown=0;m.setCombatPolicy([u.id],{response:'return'});
 assert.equal(automaticCombatTarget(m,u,m.unitSpec(u)),null);
 m.damage(u,1,enemy);assert.equal(automaticCombatTarget(m,u,m.unitSpec(u)),enemy,'respond only to actual attacker');
 m.state.time+=120;assert.equal(automaticCombatTarget(m,u,m.unitSpec(u)),enemy,'return fire has no timeout');
 m.stop([u.id]);assert.equal(combatPolicy(u).response,'return','Stop preserves rules');
 const copy=fixture();copy.load(m.save());copy.state.bounds=[0,0,127,127];copy.rebuildNavigation();copy.updateFog();assert.equal(automaticCombatTarget(copy,copy.entity(u.id),copy.unitSpec(u)),copy.entity(enemy.id),'saved rules and attacker persist');
 const visibleAt=m.visibleAt;m.visibleAt=()=>false;assert.equal(automaticCombatTarget(m,u,m.unitSpec(u)),null,'hidden attacker cannot be targeted');m.visibleAt=visibleAt;
 m.damage(u,1,other);assert.equal(automaticCombatTarget(m,u,m.unitSpec(u)),other,'new attacker replaces previous contact');
 other.hp=0;assert.equal(automaticCombatTarget(m,u,m.unitSpec(u)),null,'dead attacker cannot be targeted');
 m.setCombatPolicy([u.id],{response:'ignore'});u.heading=Math.PI;assert(m.order([u.id],'attack-move',{x:0,y:-150}).ok);
 const start={x:u.x,y:u.y};for(let i=0;i<80;i++)tick(m,u);
 assert(Math.hypot(u.x-start.x,u.y-start.y)>30,'hold-fire attack-move still moves');
 checks.push('hold fire, explicit target, persistent return fire, Stop/save, moving without firing');
}
for(const [retreat,damage] of [['light',70],['heavy',220]]){
 const m=fixture(),u=unit(m),enemy=unit(m,'raider','scavs',0,-80);
 m.setCombatPolicy([u.id],{retreat,response:'ignore'});m.damage(u,damage,enemy);
 const hp=u.hp;tick(m,u);assert.equal(u.combatRetreat?.status,'moving',retreat+' schedules actual path');
 const end=u.combatRetreat.destination;
 for(let i=0;i<400&&u.combatRetreat.status!=='arrived';i++)tick(m,u);
 assert.equal(u.combatRetreat.status,'arrived',JSON.stringify({retreat,u}));
 assert.equal(u.combatRetreat.phase,'home');assert(Math.hypot(u.x,u.y-256)<100,'Retreat reaches the actual base area');
 assert(Math.hypot(u.x-end.x,u.y-end.y)<8);assert.equal(u.hp,hp,'retreat does not cause collision damage');
 const parked={x:u.x,y:u.y};for(let i=0;i<20;i++)tick(m,u);
 assert.deepEqual({x:u.x,y:u.y},parked,'does not resume cancelled attack');
 const saved=m.save(),copy=fixture();copy.load(saved);
 assert.deepEqual(copy.entity(u.id).combatPolicy,u.combatPolicy);assert.deepEqual(copy.entity(u.id).combatRetreat,u.combatRetreat);
 assert(m.order([u.id],'move',{x:u.x+110,y:u.y}).ok);assert(!u.combatRetreat,'new order cancels retreat');
 checks.push(retreat+' retreat physically reaches destination, holds, saves, accepts new order');
}
{
 const m=fixture(),u=unit(m),enemy=unit(m,'raider','scavs',0,-80);
 const factory=m.addStructure('factory','rai',{x:260,y:200},{completed:true,progress:1});m.rebuildNavigation();
 u.combatResume={group:'stale'};u.combatParking={anchor:{x:0,y:-150}};
 m.setCombatPolicy([u.id],{retreat:'light',response:'ignore'});m.damage(u,70,enemy);tick(m,u);
 assert.equal(u.combatRetreat.home.id,factory.id,'The built base takes priority over the initial landing point');
 assert(!u.combatResume&&!u.combatParking,'An interrupted combat resume cannot restart an attack during withdrawal');
 for(let i=0;i<500&&u.combatRetreat.status!=='arrived';i++)tick(m,u);
 assert.equal(u.combatRetreat.status,'arrived');assert.equal(u.combatRetreat.phase,'home');
 assert(Math.hypot(u.x-factory.x,u.y-factory.y)<u.combatRetreat.home.radius+30,'Physically park outside the friendly factory');
 assert(m.vehicleMotionClear(u,u,u),'The parked vehicle does not overlap the base');
 checks.push('retreat returns to the built factory and clears interrupted attack state');
}
{
 const m=fixture(),u=unit(m),enemy=unit(m,'raider','scavs',0,-50);
 m.setCombatPolicy([u.id],{retreat:'heavy'});m.damage(u,70,enemy);tick(m,u);assert(!u.combatRetreat,'heavy threshold is not light damage');
 m.setCombatPolicy([u.id],{retreat:'never'});m.damage(u,150,enemy);tick(m,u);assert(!u.combatRetreat,'stand firm does not withdraw');
 m.setCombatPolicy([u.id],{retreat:'heavy'});
 const inBounds=m.inBounds.bind(m);m.inBounds=(x,y)=>Math.abs(x)<60&&Math.abs(y)<60;
 tick(m,u);assert.equal(u.combatRetreat.status,'blocked');assert.equal(u.path.length,0);assert.deepEqual([u.x,u.y],[0,0]);
 m.inBounds=inBounds;for(let i=0;i<25;i++)tick(m,u);assert.equal(u.combatRetreat.status,'moving','retry when space becomes available');
 m.stop([u.id]);tick(m,u);assert(!u.combatRetreat);assert.equal(u.path.length,0);
 checks.push('thresholds, unreachable retreat, retry and Stop');
}
{
 const m=fixture(),a=unit(m),b=unit(m,'builder','rai',50,0),enemy=unit(m,'raider','scavs',100,0);
 assert.deepEqual(combatPolicy(a),DEFAULT_COMBAT_POLICY);
 assert.equal(m.setCombatPolicy([a.id,b.id,enemy.id],{response:'return'}).changed,1);
 assert(!b.combatPolicy&&!enemy.combatPolicy);assert(!m.setCombatPolicy([a.id],{priority:'bogus'}).ok);
 const data=JSON.parse(m.save());delete data.state.units[0].combatPolicy;m.load(data);
 assert.deepEqual(combatPolicy(m.entity(a.id)),DEFAULT_COMBAT_POLICY,'old saves get defaults');
 checks.push('selection eligibility, validation, legacy save');
}
console.log(JSON.stringify({passed:checks.length,checks},null,2));
