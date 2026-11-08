import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {availableOil,oilReserved,repairWithOil,oilOrderProgress} from '../campaign/oil-economy.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json'),field=createHeightfield(json('assets/maps/alpha/heightfield.json'));
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-7,message??`${a} != ${b}`);
function fixture(wells=0){
 const m=new Mission(config,field),p=field.gridToWorld(config.startGrid);
 const factory=m.addStructure('factory','rai',{x:p.x+170,y:p.y+100},{completed:true});
 if(wells){m.addStructure('generator','rai',p,{completed:true});for(const grid of config.oilFields.slice(0,wells))m.addStructure('derrick','rai',field.gridToWorld(grid),{completed:true});}
 m.state.energy=1000;return {m,factory,p};
}
{
 const m=new Mission(config,field),site=config.baseSites.find(s=>s.kind==='generator'),at=field.gridToWorld(site.grid);
 m.explored.fill(255);const builder=m.state.units.find(u=>u.kind==='builder'),before=m.state.energy;
 const result=m.build([builder.id],'generator',at.x,at.y);assert(result.ok,result.reason);
 const building=m.entity(result.id);assert.equal(m.state.energy,before);assert.equal(building.funding.paid,0);
 m.updateEconomy(1);assert.equal(building.funding.paid,25);assert.equal(building.progress,0);assert.equal(m.state.energy,before-25);
 assert(m.cancelBuilding(building.id).ok);assert.equal(m.state.energy,before);
}
{
 const {m,factory}=fixture();m.rebuildNavigation();assert(m.produce(factory.id,'bukhanka').ok);
 m.updateEconomy(config.units.bukhanka.cost/config.oilTransferPerSecond+config.units.bukhanka.seconds);
 assert.equal(factory.queue.length,0);assert.equal(m.state.statistics.produced,1);assert.equal(m.state.energy,870);
 m.updateEconomy(1);assert.equal(m.state.energy,870);assert.equal(m.state.statistics.produced,1);
}
{
 const {m,factory}=fixture(2);
 assert(m.produce(factory.id,'bukhanka').ok);const job=factory.queue[0];
 assert.equal(m.state.energy,1000,'Ordering reserves oil without withdrawing it');
 assert.equal(oilReserved(m.state),130);assert.equal(availableOil(m.state),870);
 m.updateEconomy(1);assert.equal(job.funding.paid,25);assert.equal(job.progress,0);
 assert.equal(m.state.energy,985);assert.equal(m.state.oilIncomeRate,10);assert.equal(m.state.oilExpenseRate,25);assert.equal(m.state.energyRate,-15);
 const progress=oilOrderProgress(job,config.units.bukhanka.seconds,config);assert(progress.progress>0&&progress.remaining>config.units.bukhanka.seconds);
 const copy=new Mission(config,field);copy.load(m.save());const copied=copy.entity(factory.id).queue[0];
 assert.equal(copied.funding.paid,25);assert.equal(oilReserved(copy.state),105);
 copy.updateEconomy(4.2);assert.equal(copied.funding.paid,130);close(copied.progress,0,'No construction time is borrowed from funding');
 copy.updateEconomy(1);close(copied.progress,1/config.units.bukhanka.seconds);assert.equal(copy.state.energyRate,10);
 close(copy.state.energy,1000+10*6.2-130,'Oil is charged exactly once across save/load');
}
{
 const {m,factory,p}=fixture(2);
 assert(m.produce(factory.id,'bukhanka').ok);assert(m.produce(factory.id,'builder').ok);
 const other=m.addStructure('factory','rai',{x:p.x-180,y:p.y+100},{completed:true});assert(m.produce(other.id,'bukhanka').ok);
 const building=m.addStructure('bunker','rai',{x:p.x,y:p.y-180},{cost:85,funding:{paid:0}});
 const lab=m.addStructure('lab','rai',{x:p.x,y:p.y+180},{completed:true}),key=Object.keys(config.research)[0];
 m.state.artifactKeys.push(key);assert(m.research(lab.id,key).ok);
 m.updateEconomy(1);assert.equal(m.state.oilExpenseRate,100);assert.equal(m.state.energyRate,-90);assert.equal(m.state.energy,910);
 assert.equal(factory.queue[1].funding.paid,0,'Queued jobs wait for the active machine');
 assert.equal(building.progress,0);assert.equal(lab.research.progress,0);
 const builder=m.state.units.find(u=>u.kind==='builder');builder.task={type:'build',targetId:building.id};builder.builderWorking=true;m.projectorAim=()=>({});
 m.finalizeBuilderContacts(1);assert.equal(building.progress,0,'A builder cannot work before payment');
 m.updateEconomy((config.research[key].cost-25)/25);
 assert.equal(lab.research.funding.paid,config.research[key].cost);close(lab.research.progress,0);
 m.updateEconomy(1);assert(lab.research.progress>0,'Research starts after its transfer');
 builder.builderWorking=true;m.finalizeBuilderContacts(1);assert(building.progress>0);
}
{
 const {m,factory}=fixture();m.state.energy=130;
 assert(m.produce(factory.id,'bukhanka').ok);assert(!m.produce(factory.id,'bukhanka').ok,'Reservations prevent double spending');
 const damaged={hp:10,maxHp:100};assert(!repairWithOil(m,damaged,1),'Repairs do not consume oil reserved by accepted orders');
 assert.equal(m.cancelProduction(factory.id,'bukhanka').refund,0);assert.equal(m.state.energy,130);
 assert(m.produce(factory.id,'bukhanka').ok);m.updateEconomy(2);assert.equal(m.state.energy,80);
 assert.equal(m.cancelProduction(factory.id,'bukhanka').refund,50);assert.equal(m.state.energy,130);
 assert(!m.cancelProduction(factory.id,'bukhanka').ok);assert.equal(m.state.energy,130);
 assert(m.produce(factory.id,'bukhanka').ok);m.updateEconomy(5.2);m.updateEconomy(config.units.bukhanka.seconds*.4);
 close(m.cancelProduction(factory.id,'bukhanka').refund,78);close(m.state.energy,78);
}
{
 const {m,factory,p}=fixture();assert(m.produce(factory.id,'bukhanka').ok);
 const building=m.addStructure('bunker','rai',p,{cost:85,funding:{paid:0}});
 m.state.energy=1;m.updateEconomy(1);assert.equal(m.state.energy,0);assert.equal(m.state.energyRate,-1);
 assert.equal(factory.queue[0].funding.paid,.5);assert.equal(building.funding.paid,.5);
 m.updateEconomy(1);assert.equal(m.state.energyRate,0);assert.equal(factory.queue[0].progress,0);
 m.state.energy=100;m.updateEconomy(1);const paid=building.funding.paid,before=m.state.energy;
 assert(m.cancelBuilding(building.id).ok);close(m.state.energy,before+paid);assert(!m.cancelBuilding(building.id).ok);
 factory.hp=0;assert.equal(oilReserved(m.state),0,'Destroyed orders no longer reserve or receive oil');
}
{
 const {m,factory}=fixture(1),target={hp:99,maxHp:100};
 repairWithOil(m,target,1);assert.equal(target.hp,100);m.updateEconomy(1);
 close(m.state.oilExpenseRate,1.5/40);close(m.state.energyRate,5-1.5/40);close(m.state.energy,1005-1.5/40);
 // Older saves already paid for their queue; absent funding is intentional.
 factory.queue.push({kind:'bukhanka',cost:130,progress:.1});m.load(m.save());const before=m.state.energy;
 m.updateEconomy(1);close(m.state.energy,before+5);assert(m.entity(factory.id).queue[0].progress>.1);
}
console.log('PASS: delayed transfers, net income/expense, concurrent build/production/research, FIFO funding, repair flow, reservations, no overdraft, cancellation, saves and prepaid legacy orders');
