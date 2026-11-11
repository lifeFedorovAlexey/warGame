import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {campBaseLayout} from '../campaign/scav-base-layout.js';
import {restoreM02Continuity} from '../campaign/mission02-continuity.js';
import layout from '../assets/campaign/alpha/mission02/layout.js';

const labels=Object.fromEntries(Object.values(JSON.parse(fs.readFileSync('references/terrain/alpha/original-cam1a/labels.json'))).map(row=>[row.label,row]));
const binary=fs.readFileSync('references/terrain/alpha/original-cam1b/cam1a-struct.bjo'),structures=new Map();
for(let i=0;i<binary.readUInt32LE(8);i++){const p=12+i*120;structures.set(binary.readUInt32LE(p+40),[binary.readUInt32LE(p+44)/128,binary.readUInt32LE(p+48)/128]);}
const m=makeMission(),f=m.field;
assert.deepEqual(m.state.camps[0].grid,labels.base1ArtifactPos.pos.map(n=>n/128));
for(let i=1;i<4;i++)assert.deepEqual(m.state.camps[i].grid,structures.get(labels['base'+(i+1)+'Factory'].id));
assert.deepEqual(m.state.bounds,[0,0,53,63]);
for(const c of m.state.camps){
 const yard=campBaseLayout(c).bounds;
 for(const site of layout.bases){const p=f.gridToWorld(site.grid);assert(!(p.x>=yard[0]&&p.x<=yard[2]&&p.y>=yard[1]&&p.y<=yard[3]),'m01 yard cannot occupy m02 site '+site.id);}
 assert(m.nav.findPath(f.gridToWorld(m.config.startGrid),c.gate)?.length,c.id+' reachable gate');
}
let segments=0,maxGrade=0;
for(const r of f.localRoads.filter(r=>r.m01LayoutVersion===3))for(let i=1;i<r.points.length;i++){
 const a=r.points[i-1],b=r.points[i],pose={...a,kind:'bukhanka',owner:'rai',heading:Math.atan2(b.x-a.x,b.y-a.y)};
 assert(m.vehicleMotionClear(pose,pose,{...pose,...b},.52,undefined,[]),r.id+' drivable at '+f.worldToGrid(b.x,b.y));
 for(const s of m.state.buildings)assert(Math.hypot(Math.max(0,Math.abs(s.x-b.x)-s.halfWidth),Math.max(0,Math.abs(s.y-b.y)-s.halfDepth))>=r.width/2,r.id+' pavement overlaps '+s.kind+' '+s.id);
 maxGrade=Math.max(maxGrade,Math.abs(f.heightAt(b.x,b.y)-f.heightAt(a.x,a.y))/Math.hypot(b.x-a.x,b.y-a.y));segments++;
}
assert(maxGrade<.25);
for(const r of f.roadNetwork.paths)for(const p of r.points)for(const b of m.state.buildings.filter(b=>b.campId)){
 const gap=Math.hypot(Math.max(0,Math.abs(b.x-p.x)-b.halfWidth),Math.max(0,Math.abs(b.y-p.y)-b.halfDepth));
 assert(gap>=(p.width??r.width)/2,r.id+' source paving overlaps '+b.campId+' '+b.kind);
}
console.log('PASS original cam1a base locations, northern bounds, distinct m02 sites, road edges and hull clearance', {segments,maxGrade});

export function legacyVictory(){
 const m=makeMission(),s=m.state,old=m.config.m01LegacyLayout;
 s.units=s.units.filter(u=>u.owner==='rai');s.buildings=[];
 s.camps=old.camps.map(c=>{const camp={...structuredClone(c),...m.field.gridToWorld(c.grid),baseVersion:2,cleared:true,artifactSpawned:true,oilVersion:1};camp.gate=campBaseLayout(camp).gate;return camp;});
 const last=s.camps[3],wreck=m.addStructure('camp-core','scavs',last,{campId:last.id});m.damage(wreck,1e6,null);
 const derrick=m.addStructure('derrick','rai',m.field.gridToWorld(old.oilFields[4]),{completed:true,progress:1,campId:last.id,campResource:true,hp:211});
 s.energy=731;s.research={'mg-tower':true};s.artifactKeys=['mg-tower'];s.flags.lastRevealed=true;s.status='victory';s.bounds=old.finalMapBounds.slice();delete s.m01LayoutVersion;
 Object.assign(s.units[0],{x:last.gate.x,y:last.gate.y+60,hp:153});s.commandGroups=[{id:'keep',unitIds:[s.units[0].id],formation:'line'}];
 m.load(m.save());return {m,derrickId:derrick.id,wreckId:wreck.id};
}
const player=m=>JSON.stringify({units:m.state.units.filter(u=>u.owner==='rai').map(({trafficOnScreen,...u})=>u),buildings:m.state.buildings.filter(b=>b.owner==='rai'),energy:m.state.energy,research:m.state.research,groups:m.state.commandGroups,statistics:m.state.statistics});
const old=legacyVictory(),before=player(old.m);
assert(!old.m.field.navigation.version.includes('m01-original'),'Old saves retain their original level openings');
assert(old.m.enterM02().ok);assert.equal(player(old.m),before);
assert.equal(old.m.state.m02.bases.hill_factory.inheritedFrom,'west-south');
assert.equal(old.m.state.m02.bases.hill_factory.state,'neutralized');
assert(!old.m.state.units.concat(old.m.state.buildings).some(e=>e.owner==='scavs'&&e.hp>0&&e.m02Base==='hill_factory'));
assert(old.m.state.artifacts.some(a=>a.key==='twin-machinegun'&&!a.collected));
assert(old.m.entity(old.derrickId));assert(old.m.state.buildings.some(b=>b.id===old.wreckId&&b.hp<=0));
assert.equal(Object.values(old.m.state.m02.bases).filter(b=>b.state==='defended').length,3);
console.log('PASS legacy victory preserves conquered plateau, army, captured well, wreck, resources, orders and collectible technology');

const broken=legacyVictory().m;
broken.state.camps[3].cleared=false;assert(broken.enterM02().ok);broken.state.camps[3].cleared=true;delete broken.state.m02.continuityVersion;
const produced=broken.addUnit('raider','scavs',broken.state.m02.bases.hill_factory.gate,{m02Base:'hill_factory',m02Produced:true});
const checkpoint=broken.save(),army=player(broken);broken.load(checkpoint);
assert.equal(player(broken),army);assert(!broken.entity(produced.id));
assert.equal(broken.state.m02.bases.hill_factory.state,'neutralized');
assert(!broken.state.units.concat(broken.state.buildings).some(e=>e.owner==='scavs'&&e.hp>0&&e.m02Base==='hill_factory'));
assert.equal(restoreM02Continuity(broken),false);
const repaired=broken.save();broken.load(repaired);assert.equal(player(broken),army);assert.equal(broken.state.artifacts.filter(a=>a.key==='twin-machinegun').length,1);
console.log('PASS already-started m02 save repair is idempotent and grants no extra kills or recreated army');
old.m.load(m.save());
assert(old.m.field.navigation.version.includes('m01-original'));
assert.deepEqual(old.m.state.camps.map(c=>c.grid),m.state.camps.map(c=>c.grid));
assert.deepEqual(old.m.state.bounds,[0,0,53,63]);
assert(!old.m.state.m02);
console.log('PASS switching from a legacy southern save back to new m01 restores northern roads, openings and bounds');

// The fourth factory used to be held behind m01's southern boundary.
// Relocation must not make it send extra waves from the beginning of a game.
const production=makeMission(),chief=production.state.camps[3];
production.state.flags.raidWon=true;
production.state.units=production.state.units.filter(u=>u.owner==='rai');
for(const b of production.state.buildings)if(b.campId!==chief.id)delete b.scavProduction;
production.advance(40);
const producers=production.state.buildings.filter(b=>b.campId===chief.id&&b.scavProduction);
assert(producers.every(b=>b.scavProduction.count===0&&b.scavProduction.nextAt===null));
production.state.camps.slice(0,3).forEach(c=>c.cleared=true);
production.advance(40);
assert(chief.productionActivated);
assert(producers.every(b=>b.scavProduction.count>0),'Chief factory and barracks have working exits');
console.log('PASS chief production waits for the third base, then uses physical factory and barracks exits');
