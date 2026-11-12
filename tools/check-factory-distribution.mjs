import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeField,makeMission} from './m02-fixture.mjs';
import {chooseProductionFactory} from '../campaign/factory-production.js';
import {oilReserved} from '../campaign/oil-economy.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json'),field=makeField();
function fixture(){
 const m=makeMission(field),p=field.gridToWorld(config.startGrid);
 const a=m.addStructure('factory','rai',{x:p.x+170,y:p.y+100},{completed:true,progress:1});
 const b=m.addStructure('factory','rai',{x:p.x-170,y:p.y+100},{completed:true,progress:1});
 m.state.energy=2400;return {m,a,b};
}
{
 const {m,a,b}=fixture();
 for(let i=0;i<6;i++)assert(m.produce(a.id,'bukhanka',{distributed:true}).ok);
 assert.deepEqual([a.queue.length,b.queue.length],[3,3]);assert.equal(oilReserved(m.state),780);
 assert.equal(m.state.energy,2400,'Assignment reserves oil exactly once');
 const saved=m.save();m.load(saved);
 assert.deepEqual([m.entity(a.id).queue.length,m.entity(b.id).queue.length],[3,3]);
 assert.equal(oilReserved(m.state),780);
 assert(m.cancelProduction(a.id,'bukhanka',{distributed:true}).ok);
 assert.deepEqual([m.entity(a.id).queue.length,m.entity(b.id).queue.length],[3,2],'Cancel newest waiting order across both factories');
 assert.equal(oilReserved(m.state),650);assert.equal(m.state.energy,2400);
}
{
 const {m,a,b}=fixture();
 m.produce(a.id,'builder');m.produce(b.id,'bukhanka');
 a.queue[0].funding.paid=a.queue[0].cost;a.queue[0].progress=.99;
 assert.equal(chooseProductionFactory(m,b.id),a,'Remaining work, not order count, decides assignment');
 const active=a.queue[0];m.produce(b.id,'bukhanka',{distributed:true});assert.equal(a.queue[0],active);
 assert.equal(a.queue.length,2);assert.equal(b.queue.length,1);
 b.exitBlocked=true;assert.equal(chooseProductionFactory(m,b.id),a);delete b.exitBlocked;a.queue.pop();
 b.queue[0].funding.paid=b.queue[0].cost;b.queue[0].progress=.9;
 const u=m.state.units.find(u=>u.owner==='rai');u.hp=u.maxHp/2;u.factoryVisit={factoryId:a.id,phase:'inside'};
 assert.equal(chooseProductionFactory(m,a.id),b,'Repair is read live before the next economy tick');
 a.workPriority='production';assert.equal(chooseProductionFactory(m,a.id),a);
}
{
 const {m,a,b}=fixture();
 m.produce(a.id,'bukhanka');a.queue[0].funding.paid=130;a.queue[0].progress=.4;m.state.energy-=130;
 m.produce(b.id,'bukhanka',{distributed:true});
 const before=m.state.energy;assert(m.cancelProduction(a.id,'bukhanka',{distributed:true}).ok);
 assert.equal(b.queue.length,0);assert.equal(a.queue[0].progress,.4);assert.equal(m.state.energy,before);
 assert.equal(m.cancelProduction(a.id,'bukhanka',{distributed:true}).refund,78);
 assert(!m.cancelProduction(a.id,'bukhanka',{distributed:true}).ok);
}
{
 const {m,a,b}=fixture();b.completed=false;
 const enemy=m.addStructure('factory','scavs',{x:0,y:0},{completed:true});
 const dead=m.addStructure('factory','rai',{x:200,y:200},{completed:true});dead.hp=0;
 dead.queue=Array.from({length:500},()=>({kind:'bukhanka',progress:0}));
 assert(m.produce(a.id,'bukhanka',{distributed:true}).ok);assert.equal(a.queue.length,1);
 assert.equal(b.queue.length+enemy.queue.length,0);assert(!m.produce(dead.id,'bukhanka').ok);
 b.completed=true;assert.equal(m.produce(a.id,'builder',{distributed:true}).factoryId,b.id);
 m.config={...config,unitLimit:m.state.units.filter(u=>u.owner==='rai'&&u.hp>0).length+2};
 assert(!m.produce(a.id,'bukhanka',{distributed:true}).ok,'Global unit limit includes both queues');
}
{
 const {m,a,b}=fixture();m.rebuildNavigation();
 assert(m.produce(a.id,'bukhanka',{distributed:true}).ok);assert(m.produce(a.id,'bukhanka',{distributed:true}).ok);
 m.updateEconomy(6);assert(a.queue[0].progress>0&&b.queue[0].progress>0,'Both factories actually work concurrently');
 m.updateEconomy(config.units.bukhanka.seconds);
 assert.deepEqual([a.producedCount,b.producedCount],[1,1],'Both factories release a real vehicle');
 assert.equal(m.state.statistics.produced,2);assert.equal(m.state.energy,2140);
}
console.log('PASS: balanced orders, remaining work, repair/blocked exit, explicit factory orders, cancellation/refunds, saves, invalid factories, shared unit cap, two simultaneous real vehicle releases');
