import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {automaticCombatTarget,combatPolicy,DEFAULT_COMBAT_POLICY,updateCombatRetreat} from '../campaign/combat-policy.js';
import {bodyContact,bodyEnvelope} from '../campaign/vehicle-overlap.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){const m=new Mission({...config,startGrid:[64,56]},field);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.bounds=[0,0,127,127];m.state.pendingCinematics=[];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;}
const unit=(m,kind='bukhanka',owner='rai',x=0,y=0)=>m.addUnit(kind,owner,{x,y});
const tick=(m,u)=>{m.state.time+=.1;m.updateUnit(u,.1);};
const checks=[];
function follow(u,goal,action='move'){
 u.heading=0;u.task={type:action,...goal};u.routeOrder={destination:goal};u.path=[goal];
}
{
 const m=fixture(),a=unit(m),b=unit(m,'bukhanka','rai',75,0);
 const offRoute=unit(m,'raider','scavs',19,0),body=unit(m,'raider','scavs',75,28);
 const fence=m.addStructure('scav-fence','scavs',{x:0,y:30},{completed:true,progress:1});
 m.rebuildNavigation();
 const aGoal={x:0,y:105},bGoal={x:75,y:105};
 follow(a,aGoal);follow(b,bGoal,'attack-move');
 const orders=[a.task,b.task];
 tick(m,a);tick(m,b);
 assert.deepEqual(m.drainEffects().filter(e=>e.type==='shot').map(e=>[e.from,e.targetId]),[[a.id,fence.id],[b.id,body.id]]);
 assert.equal(offRoute.hp,offRoute.maxHp,'The closer enemy beside the route does not steal the shot');
 assert.equal(a.task,orders[0]);assert.equal(b.task,orders[1]);
 assert.deepEqual([a.routeOrder.destination,b.routeOrder.destination],[aGoal,bGoal]);
 // Clear the accepted route. Ordinary targeting and driving resume using
 // the same order on the next available shot.
 fence.hp=0;body.x+=65;m.rebuildNavigation();a.cooldown=0;
 tick(m,a);
 assert.equal(m.drainEffects().find(e=>e.type==='shot')?.targetId,offRoute.id);
 for(let i=0;i<90&&a.path.length;i++)tick(m,a);
 assert(Math.hypot(a.x-aGoal.x,a.y-aGoal.y)<2);
 checks.push('separate vehicles prioritize their own hostile fence or hull and keep the original order');
}
{
 const m=fixture(),a=unit(m),blocker=unit(m,'raider','scavs',0,30),attacker=unit(m,'raider','scavs',-22,0);
 follow(a,{x:0,y:105});
 m.setCombatPolicy([a.id],{response:'ignore'});tick(m,a);
 assert(!m.drainEffects().some(e=>e.type==='shot'),'Hold fire applies to an enemy in the lane');
 m.setCombatPolicy([a.id],{response:'return'});m.damage(a,1,attacker);tick(m,a);
 assert.equal(m.drainEffects().find(e=>e.type==='shot')?.targetId,attacker.id,'Return fire still requires the actual attacker');
 m.setCombatPolicy([a.id],{response:'free'});m.visibleAt=(x,y)=>x!==blocker.x||y!==blocker.y;a.cooldown=0;tick(m,a);
 assert.equal(m.drainEffects().find(e=>e.type==='shot')?.targetId,attacker.id,'A hidden blocker cannot be targeted');
 checks.push('lane-clearing fire respects hold fire, retaliation and visibility');
}
{
 const m=fixture(),a=unit(m),ally=unit(m,'bukhanka','rai',0,24),enemy=unit(m,'raider','scavs',0,39);
 const side=unit(m,'raider','scavs',19,0);
 follow(a,{x:0,y:105});tick(m,a);
 assert.equal(m.drainEffects().find(e=>e.type==='shot')?.targetId,side.id,'The enemy behind the actual first blocker has no priority');
 ally.x=95;a.cooldown=0;tick(m,a);
 assert.equal(m.drainEffects().find(e=>e.type==='shot')?.targetId,enemy.id,'Priority follows the live obstruction');
 checks.push('a closer friendly hull shields the lane from an automatic priority change');
}
{
 const m=fixture(),a=unit(m),enemy=unit(m,'raider','scavs',0,28),side=unit(m,'raider','scavs',19,0);
 const f=m.addStructure('factory','rai',{x:0,y:220},{completed:true,progress:1});
 a.hp-=50;m.rebuildNavigation();assert(m.retreat([a.id]).ok);
 a.combatRetreat.home={id:f.id,x:f.x,y:f.y};
 follow(a,{x:0,y:139});tick(m,a);
 assert.equal(m.drainEffects().find(e=>e.type==='shot')?.targetId,enemy.id);
 assert.equal(side.hp,side.maxHp);assert.equal(a.combatRetreat.home.id,f.id);
 assert.equal(a.factoryVisit?.factoryId,f.id,'Retreat to repair remains the active trip');
 checks.push('a retreating vehicle fires at its blocker and keeps the selected factory');
}
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
 for(let i=0;i<500&&u.factoryVisit?.phase!=='inside';i++)tick(m,u);
 assert.equal(u.combatRetreat.status,'servicing');assert.equal(u.factoryVisit.phase,'inside');
 assert.equal(u.factoryVisit.factoryId,factory.id,'Retreat enters the friendly factory');
 assert(Math.hypot(u.x-factory.x,u.y-factory.y)<20,'The car is stored inside the hall');
 checks.push('retreat enters the built factory and clears interrupted attack state');
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
function withdrawalScene(response,busy=true,base={x:0,y:240}){
 const m=fixture();
 const factory=m.addStructure('factory','rai',base,{completed:true,progress:1});
 const car=unit(m),enemy=unit(m,'raider','scavs',0,-75);
 enemy.hp=enemy.maxHp=5000;
 const owner=busy?unit(m,'bukhanka','rai',base.x,base.y-81):null;
 if(owner)owner.factoryVisit={garageVersion:2,factoryId:factory.id,phase:'gate',queued:0,slot:0};
 for(const x of [-17,0,17])unit(m,'bukhanka','rai',x,41);
 m.rebuildNavigation();
 m.setCombatPolicy([car.id],{response});
 m.damage(car,90,enemy);
 assert(m.retreat([car.id]).ok);
 car.combatRetreat.home={id:factory.id,x:factory.x,y:factory.y,radius:Math.hypot(factory.halfWidth,factory.halfDepth)+config.worldScale*9};
 if(owner)car.factoryVisit={garageVersion:2,factoryId:factory.id,phase:'waiting',queued:1,slot:1};
 return {m,car,enemy,owner,factory};
}

for(const response of ['return','ignore']){
 const {m,car,enemy,owner,factory}=withdrawalScene(response);
 const hp=car.hp;
 let rollingShots=0,totalShots=0,minimumGap=Infinity,passedRow=false,leftRangeAt=null;
 for(let i=0;i<100;i++){
  const from={x:car.x,y:car.y};
  tick(m,car);
  const fired=m.drainEffects().filter(e=>e.type==='shot'&&e.from===car.id).length;
  totalShots+=fired;
  if(Math.hypot(car.x-from.x,car.y-from.y)>.01)rollingShots+=fired;
  if(from.y<41&&car.y>=41&&Math.abs(car.x)>27)passedRow=true;
  if(leftRangeAt===null&&Math.hypot(car.x-enemy.x,car.y-enemy.y)>m.unitSpec(enemy).range)leftRangeAt=m.state.time;
  const shape=bodyEnvelope(car,config.worldScale,m.field);
  for(const other of m.state.units.filter(u=>u!==car&&u.hp>0)){
   minimumGap=Math.min(minimumGap,bodyContact(shape,bodyEnvelope(other,config.worldScale,m.field)).gap);
  }
 }
 assert.equal(car.navigation.reason,'retreat-cover-until-repair-free');
 assert(Math.hypot(car.x-enemy.x,car.y-enemy.y)>m.unitSpec(enemy).range);
 assert(passedRow,'Withdrawal goes around the row of parked vehicles');
 assert.equal(car.hp,hp);
 assert(minimumGap>=0,'The exterior bodies remain separate');
 assert.equal(owner.factoryVisit.phase,'gate','The other vehicle keeps its doorway ownership');
 assert.equal(car.factoryVisit,undefined,'A car at cover does not occupy the repair queue');
 if(response==='return')assert(rollingShots>0,'Return fire must occur on ticks with physical movement');
 else assert.equal(totalShots,0,'Hold fire remains explicit during withdrawal');
 // Release the doorway. The next repair route must use the same factory.
 delete owner.factoryVisit;
 owner.x=220;
 owner.y=159;
 for(let i=0;i<500&&car.factoryVisit?.phase!=='inside';i++)tick(m,car);
 assert.equal(car.factoryVisit?.phase,'inside');
 assert.equal(car.factoryVisit.factoryId,factory.id);
 checks.push(`busy factory: bypass, cover and re-entry (${response}, out of range in ${leftRangeAt.toFixed(1)}s, ${rollingShots} shots while moving, gap ${minimumGap.toFixed(2)})`);
}
{
 const {m,car,owner,factory}=withdrawalScene('return');
 Object.assign(owner,{x:factory.x,y:factory.y-13.5});
 owner.factoryVisit.phase='inside';
 factory.workPriority='production';factory.queue=[{kind:'bukhanka',progress:.2}];
 tick(m,car);
 assert.equal(car.factoryVisit?.phase,'approach');
 assert.equal(car.combatRetreat.phase,'home','An occupied repair bay and production must not block driving to the factory');
 assert.deepEqual(car.routeOrder?.destination,{x:factory.x,y:factory.y-config.worldScale*18});
 checks.push('occupied interior and active production allow an approach under fire');
}
{
 const {m,car}=withdrawalScene('return',false);
 // Restore the controller state of a car that lost its approach without a
 // competing garage visitor. The recovery uses the same real movement solver.
 car.combatRetreat.status='blocked';
 for(let i=0;i<30;i++)tick(m,car);
 assert.equal(car.combatRetreat.phase,'cover');
 assert(Math.hypot(car.x,car.y)>20);
 checks.push('blocked approach under fire also triggers withdrawal with a free factory');
}
{
 const {m,car,enemy,factory}=withdrawalScene('return',true,{x:240,y:0});
 const initialDistance=Math.hypot(car.x-factory.x,car.y-factory.y);
 tick(m,car);
 const goal=car.combatRetreat.destination;
 assert.equal(car.combatRetreat.phase,'cover');
 assert(Math.hypot(goal.x-factory.x,goal.y-factory.y)<initialDistance,'Choose cover towards the base when a safe route exists');
 for(let i=0;i<99;i++)tick(m,car);
 const finalDistance=Math.hypot(car.x-factory.x,car.y-factory.y);
 assert(finalDistance<initialDistance);
 assert(Math.hypot(car.x-enemy.x,car.y-enemy.y)>m.unitSpec(enemy).range);
 checks.push(`withdrawal towards lateral base (${initialDistance.toFixed(1)} → ${finalDistance.toFixed(1)} world units)`);
}
{
 const {m,car,enemy}=withdrawalScene('return',true,{x:0,y:-300});
 for(let i=0;i<100;i++)tick(m,car);
 assert.equal(car.combatRetreat.phase,'cover');
 assert(car.y>0&&Math.hypot(car.x-enemy.x,car.y-enemy.y)>m.unitSpec(enemy).range);
 checks.push('an enemy between the car and the base keeps the safe escape available');
}
{
 const {m,car}=withdrawalScene('return');
 const search=updateCombatRetreat(m,car,m.unitSpec(car),.1);
 assert.equal(search.next().done,false,'The cover search must yield');
 m.stop([car.id]);
 assert.equal(search.next().done,true);
 assert(!car.combatRetreat&&!car.path.length&&!car.task);
 assert.deepEqual([car.x,car.y],[0,0]);
 checks.push('Stop cancels a suspended search for cover');
}
console.log(JSON.stringify({passed:checks.length,checks},null,2));
