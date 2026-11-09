import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {Mission} from '../campaign/mission.js';
import {baseApproachRoads} from '../campaign/base-roads.js';
import {factoryAccessVersion} from '../campaign/factory-access.js';

const read=p=>JSON.parse(fs.readFileSync(p)),config=read('assets/campaign/alpha/mission01/gameplay.json');
const source=createHeightfield(read('assets/maps/alpha/heightfield.json'));shapeMesaRims(source);
const field=refineRoadHeightfield(source);applyRoadGrades(field,read('assets/maps/alpha/roads.json'));field.localRoads=baseApproachRoads(field,config);
const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],energy:2400,storyConstruction:{enabled:false}});
m.constructionUnlocked=()=>true;m.explored.fill(255);m.visible.fill(255);
const add=(kind,p,extra={})=>m.addStructure(kind,'rai',p,{completed:true,progress:1,...extra});
add('generator',{x:-1728,y:272},{rotation:Math.PI});add('lab',{x:-1440,y:432});
for(const grid of config.oilFields.slice(0,2))add('derrick',field.gridToWorld(grid));m.rebuildNavigation();
const placements=[],factories=[];
for(const [x,y] of [[-1648,464],[-1600,224],[-1304,256]]){
 const start=performance.now(),p=m.placement('factory',x,y,0,{snap:false});
 assert(p.ok,JSON.stringify({x,y,reason:p.reason}));assert.equal(p.accessRoads.length,2);
 placements.push({x,y,ms:performance.now()-start});
 const b=add('factory',p,{accessRoads:p.accessRoads,accessRoadVersion:factoryAccessVersion});factories.push(b);m.rebuildNavigation();
}
const exit=factories[2].accessRoads.find(r=>r.direction==='exit');
assert.equal(exit.points.length,2,'Stop the rear road at its first street crossing');
assert(exit.points.at(-1).y<370,'Never connect to the hidden former street behind the visible one');
for(const x of [-1663,-1600,-1537])for(const y of [170,224,278]){
 assert(Math.abs(field.heightAt(x,y)-.6)<.001,'Prepared foundation stays level');
 assert(m.nav.terrainAllowed(x,y),'Prepared pad is navigable');
}
const relocation=config.oilFieldRelocations[0],from=field.gridToWorld(relocation.from),to=field.gridToWorld(relocation.to);
const well=m.state.buildings.find(b=>b.kind==='derrick'&&Math.hypot(b.x-to.x,b.y-to.y)<1);Object.assign(well,from);
// Recreate a saved bad road; migration must replace asphalt without moving cars.
for(const f of factories){delete f.accessRoadVersion;f.accessRoads=[{kind:'factory-access',direction:'exit',width:27,points:[{x:f.x,y:f.y+36},{x:f.x,y:f.y+130}]}];}
const unit=m.addUnit('bukhanka','rai',{x:-1600,y:320});unit.task={type:'move',x:-1450,y:300};unit.path=[{x:-1450,y:300}];
const before={x:unit.x,y:unit.y,task:structuredClone(unit.task)};m.load(m.save());
assert.deepEqual({x:m.entity(unit.id).x,y:m.entity(unit.id).y,task:m.entity(unit.id).task},before);
assert.equal(m.entity(well.id).x,to.x);assert.equal(m.entity(well.id).y,to.y);
for(const f of factories){const saved=m.entity(f.id);assert.equal(saved.accessRoadVersion,factoryAccessVersion);assert.equal(saved.accessRoads.length,2);assert(!saved.accessRoadFailure);}
console.log(JSON.stringify({pass:true,placements,checks:'three real plots, first visible street crossing, flat navigable pad, well relocation, saved road migration, unchanged vehicle pose and order'}));
