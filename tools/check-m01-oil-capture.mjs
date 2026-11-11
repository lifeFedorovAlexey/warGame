import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
import {selectM01Layout} from '../campaign/mission01-layout.js';
import {installCampResources} from '../campaign/camp-resources.js';
import {oilPowerStatus} from '../campaign/oil-economy.js';

const results=[];
for(const original of [false,true]){
 const m=makeMission(),s=m.state;
 if(!original){
  selectM01Layout(m.config,false);s.m01LayoutVersion=0;
  s.units=s.units.filter(u=>u.owner==='rai');s.buildings=[];
  s.camps=m.config.camps.map(c=>({...structuredClone(c),...m.field.gridToWorld(c.grid),baseVersion:2,cleared:false}));
  for(const c of s.camps){m.addStructure('camp-core','scavs',c,{campId:c.id});m.addUnit('raider','scavs',c,{campId:c.id});}
  installCampResources(m);
 }
 const expected=original?2:3,wells=s.buildings.filter(b=>b.campResource),ids=wells.map(b=>b.id);
 assert.equal(wells.length,expected);
 const distribution=s.camps.map(c=>({camp:c.name,wells:wells.filter(b=>b.campId===c.id).length}));
 // Build the player's two home wells and one four-connection station.
 m.addStructure('generator','rai',m.field.gridToWorld(m.config.startGrid),{completed:true,progress:1});
 for(const point of m.config.oilFields.slice(0,2))m.addStructure('derrick','rai',m.field.gridToWorld(point),{completed:true,progress:1});
 for(const c of s.camps){
  const defenders=[...s.units,...s.buildings].filter(e=>e.campId===c.id&&!e.campResource&&e.owner==='scavs'&&e.hp>0),last=defenders.find(e=>m.config.units[e.kind])??defenders.find(e=>e.kind==='camp-core');
  const well=wells.find(b=>b.campId===c.id);if(well)well.hp=321;
  for(const e of defenders)if(e!==last)e.hp=0;
  m.updateMission();assert(!c.cleared);if(well)assert.equal(well.owner,'scavs');
  last.hp=0;m.updateMission();assert(c.cleared);if(well){assert.equal(well.owner,'rai');assert.equal(well.hp,321);}
 }
 const events=m.drainEvents().filter(e=>e.type==='building-captured');assert.equal(events.length,expected);
 assert.equal(s.buildings.filter(b=>b.campResource&&b.owner==='scavs'&&b.hp>0).length,0);
 m.linkOilWells(s.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed),0);
 const power=oilPowerStatus(s,m.config);assert.equal(power.wells,expected+2);assert.equal(power.connected,4);
 for(let i=0;i<2;i++){m.load(m.save());assert(ids.every(id=>m.entity(id)?.owner==='rai'&&m.entity(id)?.hp===321));assert(!m.drainEvents().some(e=>e.type==='building-captured'));}
 results.push({layout:original?'original-cam1a':'legacy',camps:distribution,captured:expected,ownWells:power.wells,workingWells:power.connected,passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/m01-oil-capture.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
console.log('PASS every camp, last defender, all oil transfers, partial HP, two home wells, power capacity and repeated save/load');
