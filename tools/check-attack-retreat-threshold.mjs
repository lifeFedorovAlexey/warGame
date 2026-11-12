import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {expandCommandIds} from '../campaign/group-command.js';
import {retreatThresholdReached} from '../campaign/combat-retreat-state.js';
import {CommandPlanner} from '../campaign/command-planner.js';
import {applyRouteContinuations} from '../campaign/route-continuation.js';
const results=[];
function setup(){const m=fixture();m.visible.fill(255);m.explored.fill(255);const enemy=m.addStructure('camp-core','scavs',{x:0,y:150},{hp:100000,completed:true,progress:1});m.rebuildNavigation();return {m,enemy};}
function car(m,hp,policy,x=0){const u=m.addUnit('bukhanka','rai',{x,y:0},{hp,maxHp:100});m.setCombatPolicy([u.id],{retreat:policy});u.retreatSuppressed=true;return u;}
for(const policy of ['light','heavy','never'])for(const action of ['attack','attack-move'])for(const asynchronous of [false,true]){
 const {m,enemy}=setup(),threshold=policy==='light'?80:policy==='heavy'?35:0;
 const cars=[car(m,threshold||1,policy,-60),car(m,threshold+1||1,policy,0),car(m,100,policy,60)],ids=cars.map(u=>u.id);
 const eligible=cars.filter(u=>!retreatThresholdReached(u,m.unitSpec(u))).map(u=>u.id),blocked=cars.filter(u=>!eligible.includes(u.id));
 const before=blocked.map(u=>structuredClone(u));
 const response=m[asynchronous?'submitOrder':'order'](ids,action,action==='attack'?enemy:{x:0,y:250});assert(response.ok);
 assert.deepEqual(new Set(response.assignedIds),new Set(eligible));
 for(let i=0;i<blocked.length;i++)assert.deepEqual(blocked[i],before[i],'A right-click cannot cancel or replace an excluded car\'s movement');
 if(blocked.length){const response=m.submitOrder(blocked.map(u=>u.id),action,action==='attack'?enemy:{x:0,y:250});assert(!response.ok,'Selecting only injured cars is not an attack override');}
 results.push({policy,action,asynchronous,assigned:eligible.length});
}
{
 const {m}=setup(),hurt=car(m,20,'light');hurt.combatRetreat={status:'blocked'};
 const response=m.submitOrder([hurt.id],'move',{x:120,y:0});assert(response.ok,'Left-click still moves an explicitly selected injured car');
 for(let i=0;i<100&&(hurt.pendingOrder||hurt.proposedOrder);i++)m.advance(1/60,{budgetMs:5});
 assert(!hurt.combatRetreat);assert.equal(hurt.routeOrder.destination.x,120);assert(hurt.retreatSuppressed);
 assert(!m.submitOrder([hurt.id],'attack-move',{x:0,y:150}).ok,'Manual movement suppression cannot admit a later right-click attack');
 results.push({case:'left move remains authoritative; right attack respects HP'});
}
{
 const {m}=setup(),leader=car(m,20,'light',-60),healthy=car(m,100,'light',0),hurt=car(m,60,'light',60);
 m.configureGroup([leader.id,healthy.id,hurt.id],{leaderId:leader.id});
 assert.deepEqual(expandCommandIds(m,[leader.id],{action:'attack'}),[healthy.id]);
 assert.deepEqual(m.submitOrder([leader.id],'attack-move',{x:0,y:240}).assignedIds,[healthy.id]);
 results.push({case:'injured commander expands only eligible members'});
}
for(const proposed of [false,true]){
 const {m,enemy}=setup(),u=car(m,100,'never');
 if(proposed){m.order([u.id],'move',{x:100,y:0});assert(u.path.length);}
 m.submitOrder([u.id],'attack',enemy);assert(proposed?u.proposedOrder:u.pendingOrder);
 u.hp=30;m.setCombatPolicy([u.id],{retreat:'heavy'});
 assert(u.combatRetreat);assert(!u.pendingOrder&&!u.proposedOrder);
 for(let i=0;i<20;i++)m.advance(1/60,{budgetMs:5});
 assert(u.combatRetreat);assert(!['attack','attack-move','combat-position'].includes(u.task?.type));
 results.push({case:'policy cancels '+(proposed?'proposed':'pending')+' attack'});
}
{
 const {m,enemy}=setup(),u=car(m,100,'light');m.submitOrder([u.id],'attack',enemy);
 for(let i=0;i<60&&(u.pendingOrder||u.proposedOrder);i++)m.advance(1/60,{budgetMs:5});
 assert(!u.retreatSuppressed,'A successful attack keeps the auto-retreat policy active');
 m.damage(u,30,enemy);m.updateUnit(u,.1);assert(u.combatRetreat);
 results.push({case:'new damage during an accepted attack triggers withdrawal'});
}
for(const action of ['attack','attack-move','move']){
 const {m,enemy}=setup(),u=car(m,100,'light');
 u.task={type:action,x:0,y:150,...(action==='attack'?{targetId:enemy.id}:{})};
 u.retreatSuppressed=true;u.hp=60;
 const copy=setup().m;copy.load(m.save());const restored=copy.entity(u.id);
 assert.equal(restored.retreatSuppressed,action==='move','Loading restores auto-retreat for old attacks and preserves manual movement');
 if(action!=='move'){copy.updateUnit(restored,.1);assert(restored.combatRetreat,'Existing damage in an old attack starts retreat without another hostile hit');}
 results.push({case:'saved '+action+' restores appropriate retreat ownership'});
}
{
 const {m,enemy}=setup(),hurt=car(m,20,'light',-40),healthy=car(m,100,'light',40);
 assert.deepEqual(m.submitOrder([hurt.id,healthy.id],'attack',enemy,{append:true}).assignedIds,[healthy.id]);
 assert(!hurt.orderQueue);healthy.hp=20;m.advance(.1);
 assert(!['attack','attack-move'].includes(healthy.pendingOrder?.type));
 results.push({case:'queued attack filters HP at submission and execution'});
}
{
 const {m,enemy}=setup(),players=[],opponents=[];
 for(let i=0;i<250;i++){
  const u=car(m,i%2?81:80,'light',(i%25-12)*22);u.y=-Math.floor(i/25)*24;players.push(u);
  opponents.push(m.addUnit('raider','scavs',{x:u.x,y:500+Math.floor(i/25)*24}));
 }
 const opponentsBefore=structuredClone(opponents),ids=m.state.units.map(u=>u.id);
 const attack=m.submitOrder(ids,'attack',enemy);assert(attack.ok);assert.equal(attack.assigned,125);
 assert.deepEqual(new Set(attack.assignedIds),new Set(players.filter(u=>u.hp===81).map(u=>u.id)));
 assert.deepEqual(opponents,opponentsBefore,'Player input must not replace enemy orders');
 const move=m.submitOrder(ids,'move',{x:0,y:-500});assert(move.ok);assert.equal(move.assigned,250);
 results.push({case:'500 vehicles: 250 player and 250 enemy, attack admits 125; direct movement admits all 250 player cars'});
}
{
 const m=fixture(),cars=[car(m,100,'light',-48),car(m,100,'light',48)];
 m.commandPlanner=new CommandPlanner(m,{prefixThreshold:2});
 const original=m.orderSteps;let hold=true;
 m.orderSteps=function*(...args){while(hold)yield;return yield* original.apply(this,args);};
 assert(m.submitOrder(cars.map(u=>u.id),'attack-move',{x:0,y:600}).ok);
 for(let i=0;i<1000&&!cars.every(u=>u.routeContinuation?.phase==='ready-prefix');i++)m.commandPlanner.advance(2);
 assert(cars.every(u=>u.routeContinuation?.phase==='ready-prefix'));
 cars[0].hp=20;applyRouteContinuations(m);hold=false;
 assert(!cars[0].routeContinuation&&!cars[0].pendingOrder,'A newly wounded car cannot receive a previously checked prefix');
 assert.equal(cars[1].task.type,'attack-move');assert(!cars[1].retreatSuppressed);
 m.damage(cars[1],30,null);m.updateUnit(cars[1],.1);assert(cars[1].combatRetreat,'Early group motion retains auto-retreat');
 results.push({case:'group prefix rechecks live HP and keeps auto-retreat active'});
}
console.log(JSON.stringify({passed:true,results}));
