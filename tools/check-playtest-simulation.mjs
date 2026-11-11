import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {isCampPerimeter,hasPendingCampDemolition} from '../campaign/camp-demolition.js';
import {resultsPresentationReady} from '../campaign/mission-results.js';
import {availableOil} from '../campaign/oil-economy.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const baseline=process.argv.includes('--baseline'),results=[];
export function perimeterFixture(){
 const m=new Mission(structuredClone(config),field);m.state.bounds=[0,0,127,127];m.state.pendingCinematics=[];
 m.state.units=m.state.units.filter(u=>u.owner==='rai');
 for(const [i,kind] of ['generator','derrick','factory','lab','bunker','bunker'].entries())m.addStructure(kind,'rai',{x:100+i*160,y:100},{completed:true,progress:1});
 m.state.statistics.produced=1;m.state.flags.raidWon=true;m.state.flags.lastRevealed=true;
 for(const key of Object.keys(m.config.research))m.state.research[key]=true;
 const camp=m.state.camps[3],last=m.state.buildings.find(b=>b.campId===camp.id&&b.kind==='camp-core');
 for(const b of m.state.buildings)if(b.owner==='scavs'&&!isCampPerimeter(b)&&b!==last)m.damage(b,b.hp);
 m.rebuildNavigation();m.updateMission();m.drainEffects();m.drainEvents();
 return {m,last,camp};
}
export function blueprintFixture(){
 const m=new Mission(structuredClone(config),field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127],pendingCinematics:[],energy:1000});
 const builder=m.addUnit('builder','rai',{x:0,y:-200});m.rebuildNavigation();m.visible.fill(255);m.explored.fill(255);
 const before=m.state.energy,result=m.build([builder.id],'bunker',0,0,0,{snap:false});assert(result.ok,result.reason);
 return {m,builder,building:m.entity(result.id),before};
}
{
 const {m,last,camp}=perimeterFixture();m.damage(last,last.hp);m.updateMission();
 const walls=()=>m.state.buildings.filter(b=>b.campId===camp.id&&isCampPerimeter(b));
 const initial={status:m.state.status,livingWalls:walls().filter(b=>b.hp>0).length,time:m.state.time};
 if(!baseline)assert(!resultsPresentationReady(m,{enabled:false}),'Results wait for the collapse even without radio');
 const frozen=JSON.stringify({units:m.state.units,energy:m.state.energy,report:m.state.campaign.results});
 const ids=walls().map(b=>b.id);
 if(!baseline){m.advance(.4);m.load(m.save());}
 m.advance(10);
 const result={id:'WG-001',initial,status:m.state.status,livingWalls:walls().filter(b=>b.hp>0).length,remainingWalls:walls().length,time:m.state.time};
 if(!baseline){
  assert.equal(result.status,'victory');assert.equal(result.livingWalls,0);assert.equal(result.remainingWalls,0);
  assert(!m.nav.solids.some(b=>ids.includes(b.id)),'Removed walls do not block navigation');
  assert(!hasPendingCampDemolition(m));assert(resultsPresentationReady(m,{enabled:false}));
  assert.equal(JSON.stringify({units:m.state.units,energy:m.state.energy,report:m.state.campaign.results}),frozen,'Aftermath does not move units, spend oil or rewrite results');
 }
 results.push(result);
}
{
 const {m,building,before}=blueprintFixture();m.updateEconomy(2);
 const initial={hp:building.hp,maxHp:building.maxHp,progress:building.progress,paid:building.funding.paid,energy:m.state.energy};
 m.damage(building,1,{id:'test-enemy',kind:'raider',owner:'scavs',x:0,y:80});
 const result={id:'WG-004',initial,hp:building.hp,energy:m.state.energy,available:availableOil(m.state),before};
 if(!baseline){assert.equal(result.hp,0);assert.equal(result.energy,before);assert.equal(result.available,before);}
 results.push(result);
}
if(!baseline){
 // Old victory saves may contain intact walls without scheduled deadlines.
 const legacyVictory=perimeterFixture();legacyVictory.m.damage(legacyVictory.last,legacyVictory.last.hp);legacyVictory.m.updateMission();
 for(const b of legacyVictory.m.state.buildings)if(isCampPerimeter(b))delete b.campDemolitionAt;
 legacyVictory.m.load(legacyVictory.m.save());legacyVictory.m.advance(10);
 assert(!hasPendingCampDemolition(legacyVictory.m));assert(!legacyVictory.m.nav.solids.some(isCampPerimeter));
 for(const seconds of [0,2,4])for(const action of ['cancel','hit']){
  const {m,building,before}=blueprintFixture();m.updateEconomy(seconds);m.load(m.save());
  const loaded=m.entity(building.id);assert.equal(loaded.hp,1);
  if(action==='cancel'){assert(m.cancelBuilding(loaded.id).ok);assert(!m.cancelBuilding(loaded.id).ok);}
  else{m.damage(loaded,.1,{kind:'raider',owner:'scavs',x:0,y:80});m.damage(loaded,1,{kind:'raider',owner:'scavs',x:0,y:80});assert.equal(loaded.hp,0);assert(!loaded.damage?.wreck);}
  assert.equal(m.state.energy,before);assert.equal(availableOil(m.state),before);m.rebuildNavigation();assert(!m.nav.solids.some(b=>b.id===loaded.id));
 }
 const {m,builder,building}=blueprintFixture();
 builder.task={type:'build',targetId:building.id};builder.builderWorking=true;m.projectorAim=()=>({});
 m.finalizeBuilderContacts(1);assert.equal(building.progress,0);assert.equal(building.hp,1,'Unfunded work gives no health');
 m.updateEconomy(4);builder.builderWorking=true;m.finalizeBuilderContacts(m.buildingSpec(building).seconds/2);
 assert.equal(building.progress,.5);assert.equal(building.hp,400.5);
 const energy=m.state.energy;m.damage(building,10,{kind:'raider',owner:'scavs',x:0,y:80});const damage=400.5-building.hp;
 assert(building.hp>0);assert.equal(m.state.energy,energy,'No automatic refund after work starts');
 m.load(m.save());const loaded=m.entity(building.id),worker=m.entity(builder.id);
 worker.builderWorking=true;m.finalizeBuilderContacts(m.buildingSpec(loaded).seconds/2);
 assert(loaded.completed);assert(Math.abs(loaded.hp-(loaded.maxHp-damage))<1e-7,'Further construction preserves battle damage');
 const legacy=blueprintFixture();legacy.building.hp=legacy.building.maxHp;legacy.m.load(legacy.m.save());assert.equal(legacy.m.entity(legacy.building.id).hp,1,'Old full-health plans are migrated');
 results.push({id:'WG-004',checks:'unpaid/part-paid/fully-paid cancellation and fractional hit, no repeated refund or wreck, funding gate, work health growth, damage preserved, save/load and legacy plan'});
}
console.log(JSON.stringify({baseline,passed:true,results},null,2));
