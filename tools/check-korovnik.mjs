import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {cargoGate,transportPose} from '../campaign/korovnik-transport.js';
import {transportPoint} from '../campaign/transport-site.js';
import {rectanglesOverlap,buildingHalfSize,buildingExit} from '../campaign/building-placement.js';

const m=makeMission(),pad=m.transportSite();m.explored.fill(1);
// Isolate transport conservation from raids during the several-minute round trip.
for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;
m.state.units=m.state.units.filter(u=>u.owner==='rai');m.state.camps.forEach(c=>c.cleared=true);m.state.flags.raidWon=true;
for(const key of Object.keys(m.config.research))m.state.research[key]=true;
for(const site of m.config.baseSites){
 const spec=m.config.buildings[site.kind],rotation=(site.rotationDegrees??0)*Math.PI/180;
 const [halfWidth,halfDepth]=buildingHalfSize(spec,m.config.worldScale,rotation),plot={...m.field.gridToWorld(site.grid),rotation,halfWidth,halfDepth};
 assert(!rectanglesOverlap(pad,plot),'Preserve '+site.kind+' plot');
 assert(m.placement(site.kind,plot.x,plot.y,rotation,{snap:false,checkMoney:false}).ok,'Preserve complete placement and access for '+site.kind);
 for(const anchor of ['entryAnchor','exitAnchor'])if(spec[anchor])assert(!rectanglesOverlap(pad,buildingExit(plot,{exitAnchor:spec[anchor]},m.config.worldScale)),'Preserve factory access');
}
for(const grid of m.config.oilFields){const p=m.field.gridToWorld(grid);assert(!rectanglesOverlap(pad,{...p,halfWidth:22.5,halfDepth:22.5}),'Preserve oil wells');}
for(let x=-130;x<=130;x+=16)for(let y=-64;y<=64;y+=16)assert(m.nav.allowed(...m.nav.grid(pad.x+x,pad.y+y)),'No invisible cliff walls across apron');
for(const kind of ['generator','factory','lab','mg-tower'])for(const rotation of [0,Math.PI/2]){
 const result=m.placement(kind,pad.x,pad.y,rotation,{snap:false,checkMoney:false});assert.equal(result.ok,false);assert.match(result.reason,/МУ-26/);
}
const edge=m.placement('generator',pad.x+pad.halfWidth+20,pad.y,0,{snap:false,checkMoney:false});assert.match(edge.reason,/МУ-26/,'Partial overlap is protected');
assert(m.nav.findPath(m.state.units[0],cargoGate(pad))?.length,'Apron entrance remains reachable');
const blocker=m.addUnit('bukhanka','rai',pad);assert.equal(m.requestTransport().ok,false);m.state.units.splice(m.state.units.indexOf(blocker),1);
assert(m.requestTransport().ok);m.advance(15);assert.equal(m.state.transport.phase,'landing');assert(transportPose(m.state.transport).z>0);
const landing=m.save();m.advance(15);assert.equal(m.state.transport.phase,'ready');assert.equal(m.state.transport.door,1);
m.load(landing);m.advance(15);assert.equal(m.state.transport.phase,'ready');
const ids=[];
for(let i=0;i<11;i++){
 const p={x:pad.x-100+i%3*36,y:260+Math.floor(i/3)*36};
 ids.push(m.addUnit(i===9?'builder':'bukhanka','rai',p,{heading:pad.heading,paint:i%2?'earth':'olive'}).id);
}
const batch=m.loadTransport(ids);assert.equal(batch.accepted,10);assert.equal(batch.rejected.length,1);assert.equal(m.state.transport.queue.length,10);
assert.equal(m.departTransport().ok,false);
let savedBoarding=false;
for(let second=0;second<360;second++){
 m.advance(1);
 if(!savedBoarding&&m.state.transport.manifest.some(c=>c.phase==='boarding')){const save=m.save();m.load(save);savedBoarding=true;}
 if(m.state.transport.manifest.length===10&&m.state.transport.manifest.every(c=>c.phase==='aboard'))break;
 if(second%30===0)console.log('loading',second,m.state.transport.manifest.length,m.state.transport.queue.length,m.state.transport.blocked??'',m.entity(m.state.transport.queue[0]?.id)?.navigation?.reason);
}
assert.equal(m.state.transport.manifest.length,10,JSON.stringify(m.state.transport));
assert.equal(m.state.transport.queue.length,0);assert.equal(m.state.units.filter(u=>ids.slice(0,10).includes(u.id)).length,0);
assert.equal(new Set(m.state.transport.manifest.map(c=>c.slot)).size,10);assert(savedBoarding);
m.state.units=m.state.units.filter(u=>u.kind!=='builder');m.updateMission();assert.equal(m.state.status,'running','A builder on board is not a lost builder');
assert.equal(m.loadTransport([ids[10]]).ok,false);
assert(m.departTransport().ok);m.advance(24);assert.equal(m.state.transport.phase,'departed');assert.equal(m.state.transport.door,0);
const departed=m.save();m.load(departed);assert.equal(m.state.transport.manifest.length,10);
assert(m.requestTransport().ok);m.advance(29);assert(m.unloadTransport().ok);
for(let second=0;second<250&&m.state.transport.manifest.length;second++)m.advance(1);
assert.equal(m.state.transport.manifest.length,0);assert.equal(m.state.units.filter(u=>ids.slice(0,10).includes(u.id)).length,10);
assert(m.state.units.filter(u=>ids.slice(0,10).includes(u.id)).every(u=>u.hp>0));
console.log('PASS: pad reservation, real approach, boarding 10, capacity, save/load in flight and on ramp, departure, return, unloading.');
