import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {updateScavReinforcements} from '../campaign/scav-reinforcements.js';
import {vehicleClearance} from '../campaign/vehicle-motion.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json');
const original=createHeightfield(json('assets/maps/alpha/heightfield.json'));
shapeMesaRims(original);
const field=refineRoadHeightfield(original);
applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const mission=new Mission(config,field);
const reveal=point=>{
  const [col,row]=field.worldToGrid(point.x,point.y).map(Math.round);
  mission.explored[row*128+col]=255;
};
const members=(m,id)=>m.state.units.filter(unit=>unit.campId===id&&unit.reinforcement&&unit.hp>0);
const force=(m,camp)=>{
  m.state.time=camp.nextWaveAt+.01;
  updateScavReinforcements(m);
};

for(const camp of mission.state.camps){
  const guards=mission.state.units.filter(unit=>unit.campId===camp.id);
  assert.equal(guards.length,camp.units+camp.extraGuards.length,camp.id+' garrison');
  reveal(camp.gate);
}
updateScavReinforcements(mission);
assert.equal(mission.state.camps.at(-1).nextWaveAt,undefined,'Locked sector cannot call up reinforcements');
mission.state.flags.lastRevealed=true;
mission.state.bounds=config.finalMapBounds.slice();
mission.rebuildNavigation();
updateScavReinforcements(mission);

const waveCounts={};
for(const camp of [...mission.state.camps].sort((a,b)=>a.nextWaveAt-b.nextWaveAt)){
  const deadline=camp.nextWaveAt;
  mission.state.time=deadline-.01;
  updateScavReinforcements(mission);
  assert.equal(members(mission,camp.id).length,0,camp.id+' interval');
  force(mission,camp);
  const squad=members(mission,camp.id);
  assert.equal(squad.length,2,camp.id+' squad');
  assert(squad.every(unit=>unit.path.length&&!mission.visibleAt(unit.x,unit.y)));
  assert(vehicleClearance(squad[0],squad[1],config.worldScale,field)>0);
  waveCounts[camp.id]=squad.length;
}

const restored=new Mission(config,field);
restored.load(mission.save());
const camp=restored.state.camps[0],savedCamp=mission.state.camps[0];
assert.equal(camp.nextWaveAt,savedCamp.nextWaveAt);
assert.deepEqual(members(restored,camp.id).map(unit=>unit.id),members(mission,camp.id).map(unit=>unit.id));
force(restored,camp);
assert.equal(members(restored,camp.id).length,4);
force(restored,camp);
assert.equal(members(restored,camp.id).length,4,'Maximum two reserve pairs');
const pair=members(restored,camp.id).slice(0,2);
for(const unit of pair)unit.hp=0;
restored.visible.fill(255);
force(restored,camp);
assert.equal(members(restored,camp.id).length,2,'A watched exit never spawns a replacement');
restored.visible.fill(0);
force(restored,camp);
assert.equal(members(restored,camp.id).length,4,'A hidden exit can resume sorties');
const core=restored.state.buildings.find(item=>item.kind==='camp-core'&&item.campId===camp.id);
core.hp=0;
for(const unit of members(restored,camp.id).slice(0,2))unit.hp=0;
force(restored,camp);
assert.equal(members(restored,camp.id).length,2,'Destroying the core stops sorties while its guards still survive');
console.log(JSON.stringify({waveCounts,saveLoad:true,cap:4,visibleExitBlocked:true,destroyedCoreStops:true}));
