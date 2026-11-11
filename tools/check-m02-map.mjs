import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import layout from '../assets/campaign/alpha/mission02/layout.js';
import roads from '../assets/campaign/alpha/mission02/roads.js';
import {createFogMask} from '../campaign/fog-mask.js';
import {m02StructurePlan} from '../campaign/mission02-base-layout.js';
const m=prepareM02Diagnostic(makeMission()),f=m.field,original=JSON.parse(fs.readFileSync('references/terrain/alpha/original-cam1b/cam1b-struct.bjo.json','utf8'));
const authored=[...layout.bases.flatMap(b=>b.structures),...layout.entrance];
const relevant=original.filter(s=>/Factory|GunTower|Bunker|FlameTower|CannonTower|SensoTower|PowerGenerator|ResourceExtractor/.test(s.kind));
const gam=fs.readFileSync('references/terrain/alpha/original-cam1b/cam1b.gam');
assert.deepEqual(layout.bounds,[gam.readUInt32LE(16),gam.readUInt32LE(20),gam.readUInt32LE(24),gam.readUInt32LE(28)-1]);
assert.equal(authored.length,relevant.length);
for(const row of relevant){const item=authored.find(s=>s.sourceId===row.id);assert(item,'Missing original structure '+row.id);assert.deepEqual(item.grid,m02StructurePlan({...item,grid:row.grid},m.config).grid);}
assert.deepEqual(m.state.bounds,[0,0,53,127]);assert(m.inBounds(...Object.values(f.gridToWorld([30,120]))));assert(!m.inBounds(...Object.values(f.gridToWorld([80,100]))));
assert(!m.explored.some((v,i)=>v&&(i%128>53||Math.floor(i/128)>65)),'New mission does not reveal the south or east');
let samples=0,maxGrade=0;const blocked=[];
for(const road of roads.paths)for(let i=1;i<road.points.length;i++){
 const a=road.points[i-1],b=road.points[i];samples++;maxGrade=Math.max(maxGrade,Math.abs(f.heightAt(a.x,a.y)-f.heightAt(b.x,b.y))/Math.hypot(a.x-b.x,a.y-b.y));
 if(!m.nav.terrainAllowed.clearSegment(a,b,7))blocked.push({road:road.id,grid:f.worldToGrid(a.x,a.y)});
}
assert.deepEqual(blocked,[],'Every paved approach must also be open in the level collision map');assert(maxGrade<=.301);
const radar=m.state.buildings.find(b=>b.kind==='scav-sensor'),well=m.state.buildings.find(b=>b.m02Base==='energy_hub'&&b.kind==='derrick');
assert.deepEqual(f.worldToGrid(radar.x,radar.y),[30.5,88.5]);assert(Math.hypot(...f.worldToGrid(well.x,well.y).map((v,i)=>v-[28.3,110][i]))<1e-8);assert(well.campResource);assert(m.config.oilFields.some(p=>p[0]===28.3&&p[1]===110));
const inherited=makeMission();
for(const b of inherited.state.buildings)if(b.campId==='west-south'){
 if(b.kind==='derrick')b.owner='rai';else{b.hp=0;b.damage={wreck:true};}
}
inherited.state.status='victory';inherited.state.camps.forEach(c=>c.cleared=true);
const old=inherited.state.buildings.slice(),player=JSON.stringify(old.filter(b=>b.owner==='rai'));
assert(inherited.enterM02().ok);assert.equal(JSON.stringify(inherited.state.buildings.filter(b=>b.owner==='rai')),player);
for(const b of inherited.state.buildings.filter(b=>b.scenarioId))assert(!old.some(a=>(a.hp>0||a.damage?.wreck)&&Math.abs(a.x-b.x)<a.halfWidth+b.halfWidth&&Math.abs(a.y-b.y)<a.halfDepth+b.halfDepth),b.id+' overlaps inherited base');
for(const u of inherited.state.units.filter(u=>u.scenarioId))assert(inherited.vehicleMotionClear(u,u,u),u.scenarioId+' obstructed in continued game');
// Fog history can contain stale pixels; locked sectors must still render black.
globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})})})};
const mask=createFogMask({DataTexture:class{constructor(data){this.image={data};}}});m.explored.fill(255);mask.update(m);
for(let y=0;y<512;y++)for(let x=0;x<512;x++)if((x+.5)*127/512>53.5){const i=(y*512+x)*2;assert.equal(mask.texture.image.data[i],0);assert.equal(mask.texture.image.data[i+1],0);}
const report={passed:true,originalStructures:authored.length,defenses:relevant.filter(s=>/GunTower|Bunker|FlameTower|CannonTower/.test(s.kind)).length,roads:roads.paths.length,roadSegments:samples,maxGrade,bounds:m.state.bounds,radar:[30.5,88.5],oil:[28.3,110]};
fs.mkdirSync('docs/campaign/alpha/m02/map-v2',{recursive:true});fs.writeFileSync('docs/campaign/alpha/m02/map-v2/checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
