import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
import {createM03Field,m03Roads} from '../campaign/mission03-terrain.js';
import {prepareM03Travel} from '../campaign/mission03.js';
import {cargoUsed} from '../campaign/korovnik-transport.js';
import {M03} from '../campaign/mission03-config.js';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';

fs.mkdirSync('campaign/previews/m03',{recursive:true});
const m=prepareM02Diagnostic(makeMission());m.state.status='victory';m.load(m.save());assert(m.enterM03().ok);
for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;
const pad=m.transportSite(),existing=new Set(m.state.units.filter(u=>u.owner==='rai').map(u=>u.id));
const obstructing=m.state.units.filter(u=>u.owner==='rai'&&Math.abs(u.x-pad.x)<pad.halfWidth+12&&Math.abs(u.y-pad.y)<pad.halfDepth+12);if(obstructing.length){assert(m.submitOrder(obstructing.map(u=>u.id),'move',{x:pad.x-220,y:pad.y+230}).ok);m.advance(40);}assert(m.requestTransport().ok);m.advance(29);const ids=[];
// The second spawn clears the relocated oil well next to the landing apron.
for(let i=0;i<20;i++)ids.push(m.addUnit(i===9?'builder':'bukhanka','rai',{x:pad.x-100+i%4*36,y:i===1?281:260+Math.floor(i/4)*36},{heading:pad.heading}).id);
const veteran=m.entity(ids[0]);veteran.hp=veteran.maxHp*.73;veteran.paint='sand';veteran.designName='М03 — ветеран';
const veteranCrew=m.state.campaign.personnel.crews[veteran.id].memberIds[0];m.state.campaign.personnel.soldiers[veteranCrew].kills=7;
const preserved={hp:veteran.hp,maxHp:veteran.maxHp,paint:veteran.paint,designName:veteran.designName,components:structuredClone(veteran.components)};
const queued=m.loadTransport(ids);assert.equal(queued.accepted,10);assert.equal(queued.rejected.length,10);assert.equal(cargoUsed(m.state.transport),10);assert.equal(m.departTransport().ok,false);
for(let i=0;i<360&&m.state.transport.manifest.filter(c=>c.phase==='aboard').length<10;i++)m.advance(1);
assert.equal(m.state.transport.manifest.filter(c=>c.phase==='aboard').length,10,'All ten board through real routes');
const crew=structuredClone(m.state.campaign.personnel.crews);
assert(m.departTransport().ok);m.advance(24);assert.equal(m.state.m03.travelTo,'expedition');const buildings=JSON.parse(JSON.stringify(m.state.buildings));
const travel=prepareM03Travel(m),field=createM03Field(),exp=makeMission(field);exp.load(structuredClone(travel));
assert.equal(exp.state.m03.remaining,900);assert.equal(exp.state.transport.manifest.length,10);
assert.equal(new Set([...exp.state.units,...exp.state.transport.manifest.map(c=>c.unit)].map(u=>u.id)).size,exp.state.units.length+10);
for(const spec of [...Object.values(exp.config.units),...Object.values(exp.config.buildings)])spec.damage=0;
for(let i=0;i<220&&!exp.state.m03.timerStartedAt;i++)exp.advance(1);
assert(exp.state.m03.timerStartedAt,'Insertion completes');assert.equal(exp.state.transport.manifest.length,0);assert.equal(exp.state.units.filter(u=>u.owner==='rai').length,10);
const checkpoint=exp.save();exp.load(checkpoint);assert(exp.state.m03.remaining<=900&&exp.state.m03.remaining>890);
exp.advance(25);
const assembly=new Map(exp.state.units.filter(u=>u.owner==='rai').map(u=>[u.id,{x:u.x,y:u.y}]));
for(const road of m03Roads){for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i];assert(exp.nav.findPath(a,b)?.length,road.id+' segment '+i);assert(Math.abs(a.z-b.z)/Math.hypot(a.x-b.x,a.y-b.y)<.35,'Road grade');}}
assert.equal(exp.state.artifactKeys.includes('heavy-machinegun'),false);
// The state-machine test moves the collector to the warehouse; separate drive
// tests exercise both complete routes without teleporting.
const collector=exp.state.units.find(u=>u.owner==='rai');Object.assign(collector,{x:M03.artifact.x,y:M03.artifact.y,path:[],task:null});exp.advance(.5);
assert.equal(exp.state.m03.artifact.carrierId,collector.id);assert.equal(exp.state.artifactKeys.includes('heavy-machinegun'),false);
const held=exp.save();exp.load(held);assert.equal(exp.state.m03.artifact.carrierId,collector.id);
exp.advance(25);const ep=exp.transportSite();
for(const [i,u] of exp.state.units.filter(u=>u.owner==='rai').entries())Object.assign(u,{...assembly.get(u.id),path:[],task:null,heading:ep.heading});
assert(exp.requestTransport().ok);exp.advance(29);assert(exp.loadTransport(ids.slice(0,10)).ok);
for(let i=0;i<360&&exp.state.transport.manifest.filter(c=>c.phase==='aboard').length<10;i++)exp.advance(1);
assert.equal(exp.state.transport.manifest.filter(c=>c.phase==='aboard').length,10,JSON.stringify({queue:exp.state.transport.queue,blocked:exp.state.transport.blocked,units:exp.state.units.filter(u=>u.owner==='rai').map(u=>({id:u.id,x:u.x,y:u.y,task:u.task}))}));
fs.writeFileSync('campaign/previews/m03/evacuation.json',exp.save());assert(exp.departTransport().ok);exp.advance(24);assert.equal(exp.state.m03.travelTo,'home');
const back=prepareM03Travel(exp),home=makeMission();home.load(structuredClone(back));for(const spec of [...Object.values(home.config.units),...Object.values(home.config.buildings)])spec.damage=0;
assert.deepEqual(home.state.buildings,buildings,'Original buildings are preserved exactly');
for(let i=0;i<220&&home.state.transport.manifest.length;i++)home.advance(1);
assert.equal(home.state.transport.manifest.length,0);assert.equal(home.state.units.filter(u=>ids.includes(u.id)).length,20,'Ten flown and ten rejected machines all survive');
for(const id of ids)assert.deepEqual(home.state.campaign.personnel.crews[id],crew[id]);
for(const [key,value] of Object.entries(preserved))assert.deepEqual(home.entity(veteran.id)[key],value,'Returned vehicle preserves '+key);
assert.equal(home.state.campaign.personnel.soldiers[veteranCrew].kills,7,'Existing combat experience survives both flights');
assert.equal(new Set(home.state.units.map(u=>u.id)).size,home.state.units.length);
assert.equal(home.state.units.filter(u=>existing.has(u.id)).length,m.state.units.filter(u=>existing.has(u.id)).length);
const report={transport:20,accepted:10,returned:10,remaining:exp.state.m03.remaining,errors:[]};
fs.mkdirSync('campaign/previews/m03',{recursive:true});fs.writeFileSync('campaign/previews/m03/check.json',JSON.stringify(report,null,2));fs.writeFileSync('campaign/previews/m03/travel.json',JSON.stringify(travel));fs.writeFileSync('campaign/previews/m03/return.json',JSON.stringify(back));assert(home.state.artifactKeys.includes('heavy-machinegun'));assert(home.research(home.state.buildings.find(b=>b.kind==='lab'&&b.owner==='rai').id,'heavy-machinegun').ok);home.advance(65);assert(home.state.research['heavy-machinegun'],JSON.stringify({status:home.state.status,powered:home.state.powered,energy:home.state.energy,lab:home.state.buildings.find(b=>b.kind==='lab'&&b.owner==='rai').research}));console.log('PASS',JSON.stringify(report));
