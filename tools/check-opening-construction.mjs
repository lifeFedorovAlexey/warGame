import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {startOpeningConstruction,restoreOpeningConstruction,openingCanHandOver} from '../campaign/opening-construction.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json');
const base=createHeightfield(json('assets/maps/alpha/heightfield.json'));
shapeMesaRims(base);const field=refineRoadHeightfield(base);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const mission=new Mission(config,field),energy=mission.state.energy;
const initial=mission.state.units.filter(u=>u.owner==='rai');
assert.equal(new Set(initial.map(u=>u.y)).size,1,'All initial vehicles stand in one row');
assert(initial.slice(1).every((u,i)=>u.x-initial[i].x===config.initialRow.spacing));
const opening=startOpeningConstruction(mission),sign=mission.entity(opening.signId);
assert.equal(startOpeningConstruction(mission),opening,'Starting twice cannot duplicate the scene');
assert.equal(sign.progress,0);assert.equal(sign.completed,false);
assert.equal(opening.salvageDemo.vehicleId,initial[0].id,'The first car demonstrates salvage');
assert.equal(mission.entity(opening.builderId).task,null,'The builder waits for the bumper demonstration');
assert.equal(mission.state.energy,energy,'The opening does not spend the base budget');
assert(!openingCanHandOver(mission,{openingFinished:true},true));
let wasWorking=false,saved=false,fallSave=null;
for(let i=0;i<900&&!sign.completed;i++){
 mission.advance(.1);
 wasWorking ||= !!mission.entity(opening.builderId).builderWorking;
 if(!fallSave&&mission.state.streetFurniture?.[opening.salvageDemo.lampId]&&!initial[0].damage?.parts?.[26]?.installed)fallSave=mission.save();
 if(sign.progress>0&&!saved){
  const restored=new Mission(config,field);restored.load(mission.save());restoreOpeningConstruction(restored);
  assert.equal(restored.entity(opening.signId).progress,sign.progress);
  assert.equal(restored.state.openingScene.handedOver,false);saved=true;
 }
}
assert(sign.completed,JSON.stringify({time:mission.state.time,sign,builder:mission.entity(opening.builderId)}));
assert.deepEqual(Object.keys(mission.state.streetFurniture),[opening.salvageDemo.lampId],'Only the demonstrated pole is broken');
assert.equal(opening.salvageDemo.status,'done');assert(initial[0].damage.parts[26].installed);assert.equal(initial[0].maxHp,400);
assert(Math.hypot(initial[0].x-opening.salvageDemo.park.x,initial[0].y-opening.salvageDemo.park.y)<4,'The first car clears the road after pickup');
assert(fallSave,'A real falling pole exists before it is collected');
const duringFall=new Mission(config,field);duringFall.load(fallSave);restoreOpeningConstruction(duringFall);
for(let i=0;i<900&&!duringFall.entity(opening.signId).completed;i++)duringFall.advance(.1);
assert(duringFall.entity(opening.signId).completed);assert(duringFall.entity(initial[0].id).damage.parts[26].installed);
assert.equal(duringFall.state.salvage.serial,1,'Reloading the fall must not create another pole');
assert(saved);assert(wasWorking);
assert(!openingCanHandOver(mission,{openingFinished:false},true),'The dialogue must also finish');
assert(openingCanHandOver(mission,{openingFinished:true},true));
assert(openingCanHandOver(mission,{openingFinished:false},false),'Radio disabled still requires construction');
assert.equal(mission.state.buildings.filter(b=>b.kind==='base-sign').length,1);
const position=field.gridToWorld(config.openingSignGrid);assert.equal(sign.x,position.x);assert.equal(sign.y,position.y);
// An old save at the SAME site must not retain its obsolete floating elevation.
const seatedHeight=sign.groundHeight;
sign.groundHeight+=12;
const elevated=new Mission(config,field);elevated.load(mission.save());restoreOpeningConstruction(elevated);
const seated=elevated.entity(sign.id);
assert.equal(seated.groundHeight,seatedHeight,'Re-seat stale height without requiring an XY change');
assert.equal(seated.completed,sign.completed);assert.equal(seated.progress,sign.progress);
const [width,depth]=config.buildings['base-sign'].realSizeMetres,scale=config.worldScale,c=Math.cos(seated.rotation),s=Math.sin(seated.rotation);
for(let i=0;i<=32;i++)for(const y of [-depth/2,depth/2]){
 const x=-width/2+width*i/32,terrain=field.heightAt(seated.x+(x*c-y*s)*scale,seated.y+(x*s+y*c)*scale);
 assert(seated.groundHeight-.60*scale<terrain,'Footing must enter the soil along its entire length');
 assert(seated.groundHeight+.35*scale>terrain,'Level top must remain above the hillside');
}
opening.handedOver=true;sign.y-=300;restoreOpeningConstruction(mission);
assert.equal(sign.y,position.y);assert(opening.handedOver);assert(sign.completed);
const legacy=new Mission(config,field);
legacy.state.radioStory={includeOpening:true,scenes:{p03:{status:'done'}}};
restoreOpeningConstruction(legacy);
assert(legacy.state.openingScene,'An older save within the opening must not wait for a missing wall');
assert(!legacy.state.openingScene.salvageDemo,'Older openings do not gain a new scripted drive');
console.log('PASS: real builder, upper cliff placement, completed in '+mission.state.time.toFixed(1)+' seconds, save/restore and dialogue handoff');
