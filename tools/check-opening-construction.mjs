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
const opening=startOpeningConstruction(mission),sign=mission.entity(opening.signId);
assert.equal(startOpeningConstruction(mission),opening,'Starting twice cannot duplicate the scene');
assert.equal(sign.progress,0);assert.equal(sign.completed,false);
assert.equal(mission.entity(opening.builderId).task.targetId,sign.id);
assert.equal(mission.state.energy,energy,'The opening does not spend the base budget');
assert(!openingCanHandOver(mission,{openingFinished:true},true));
let wasWorking=false,saved=false;
for(let i=0;i<900&&!sign.completed;i++){
 mission.advance(.1);
 wasWorking ||= !!mission.entity(opening.builderId).builderWorking;
 if(sign.progress>0&&!saved){
  const restored=new Mission(config,field);restored.load(mission.save());restoreOpeningConstruction(restored);
  assert.equal(restored.entity(opening.signId).progress,sign.progress);
  assert.equal(restored.state.openingScene.handedOver,false);saved=true;
 }
}
assert(sign.completed,JSON.stringify({time:mission.state.time,sign,builder:mission.entity(opening.builderId)}));
assert(saved);assert(wasWorking);
assert(!openingCanHandOver(mission,{openingFinished:false},true),'The dialogue must also finish');
assert(openingCanHandOver(mission,{openingFinished:true},true));
assert(openingCanHandOver(mission,{openingFinished:false},false),'Radio disabled still requires construction');
assert.equal(mission.state.buildings.filter(b=>b.kind==='base-sign').length,1);
const position=field.gridToWorld(config.openingSignGrid);assert.equal(sign.x,position.x);assert.equal(sign.y,position.y);
opening.handedOver=true;sign.y-=300;restoreOpeningConstruction(mission);
assert.equal(sign.y,position.y);assert(opening.handedOver);assert(sign.completed);
const legacy=new Mission(config,field);
legacy.state.radioStory={includeOpening:true,scenes:{p03:{status:'done'}}};
restoreOpeningConstruction(legacy);
assert(legacy.state.openingScene,'An older save within the opening must not wait for a missing wall');
console.log('PASS: real builder, upper cliff placement, completed in '+mission.state.time.toFixed(1)+' seconds, save/restore and dialogue handoff');
