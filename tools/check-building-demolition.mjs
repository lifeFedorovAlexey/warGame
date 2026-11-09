import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {canDemolish,requestDemolition,cancelDemolition,advanceDemolition} from '../campaign/building-demolition.js';
import {oilRefund,oilReserved} from '../campaign/oil-economy.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json')),field=createHeightfield(JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json')));
function fixture(){
 const m=new Mission(config,field);m.state.storyConstruction={enabled:false};m.updateMission=()=>{};m.state.energy=600;m.explored.fill(255);m.state.units=[];m.state.buildings=[];
 const p={x:-1424,y:240},place=m.placement('generator',p.x,p.y);
 assert(place.ok,place.reason);const b=m.addStructure('generator','rai',place,{...place,groundHeight:place.height,completed:true,progress:1});
 const u=m.addUnit('builder','rai',{x:b.x,y:b.y-110});u.heading=0;m.rebuildNavigation();return {m,b,u};
}
function advance(m,seconds){for(let t=0;t<seconds-.001;t+=.1){m.advance(.1);m.finishPendingStep();}}
{
 const {m,b,u}=fixture(),soldier=m.addUnit('bukhanka','rai',{x:b.x+120,y:b.y});
 assert(!m.order([soldier.id],'demolish',b).ok);assert(!m.order([u.id],'demolish',soldier).ok);
 b.owner='scavs';assert(!requestDemolition(m,b.id).ok);b.owner='rai';
 b.completed=false;assert(!requestDemolition(m,b.id).ok);b.completed=true;
 const sign=m.addStructure('base-sign','rai',{x:b.x+200,y:b.y},{completed:true});assert(!canDemolish(m,sign));assert(!m.order([u.id],'demolish',sign).ok);
 assert.equal(b.hp,b.maxHp);assert(!b.demolitionProgress);
}
{
 const {m,b,u}=fixture(),order=m.submitOrder([u.id],'demolish',b);assert(order.ok,JSON.stringify(order));assert.equal(u.task.type,'demolish');
 advance(m,2);assert(b.hp>0,'No instant deletion when giving the order');
 advance(m,2);assert(b.demolitionProgress>0&&b.demolitionProgress<1,'Projector contact advances timed demolition');assert(u.y>b.y-100);
 const saved=m.save(),copy=new Mission(config,field);copy.load(saved);copy.updateMission=()=>{};
 assert.equal(copy.entity(b.id).demolitionProgress,b.demolitionProgress);assert.equal(copy.entity(u.id).task.type,'demolish');
 assert(cancelDemolition(m,b.id).ok);assert(!u.task);assert(!b.demolitionProgress);advance(m,15);assert.equal(b.hp,b.maxHp,'Cancel stops the work');
 advance(copy,20);assert(!copy.entity(b.id),'Saved demolition finishes');assert(!copy.state.buildings.some(item=>item.id===b.id),'Wreck expires');
 assert(copy.placement('generator',b.x,b.y).ok,'Site becomes buildable again');assert(!copy.entity(u.id).task);
}
{
 const {m,b,u}=fixture();const further=m.addUnit('builder','rai',{x:u.x+90,y:u.y-90});m.rebuildNavigation();
 assert(requestDemolition(m,b.id).ok);assert.equal(u.task?.type,'demolish');assert(!further.task,'Building button assigns one nearest builder');
 advance(m,30);assert(b.demolished&&b.hp===0);assert.equal(m.events.filter(e=>e.type==='building-demolished').length,1);
 const oil=m.state.energy;assert(!requestDemolition(m,b.id).ok);assert.equal(m.state.energy,oil);
}
{
 const {m,b,u}=fixture();b.queue=[{kind:'builder',cost:160,funding:{paid:80},progress:.25}];b.research={key:'mg-ammo-1',cost:100,funding:{paid:40},progress:.5};
 const refund=b.queue.reduce((s,j)=>s+oilRefund(j),0)+oilRefund(b.research),before=m.state.energy;
 b.demolitionProgress=.999;assert.equal(advanceDemolition(m,u,b,.1),false);assert.equal(m.state.energy,before+refund);assert.equal(oilReserved(m.state),0);assert.equal(b.queue.length,0);assert.equal(b.research,null);
 assert.equal(advanceDemolition(m,u,b,1),false);assert.equal(m.state.energy,before+refund,'Queued jobs refund once only');
}
console.log('PASS: builder-only demolition, friendly completed targets, real approach/contact, timed work, cancellation, save/load, nearest builder, site reuse and single queue refunds');
