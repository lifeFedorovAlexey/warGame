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
const members=(m,id)=>m.state.units.filter(unit=>unit.campId===id&&unit.reinforcement&&unit.hp>0);
const force=(m,camp)=>{
  m.state.time=camp.nextWaveAt+.01;
  updateScavReinforcements(m);
};

for(const camp of mission.state.camps){
  const guards=mission.state.units.filter(unit=>unit.campId===camp.id);
  assert.equal(guards.length,camp.units+camp.extraGuards.length,camp.id+' garrison');
  assert(!mission.exploredAt(camp.x,camp.y)&&!mission.exploredAt(camp.gate.x,camp.gate.y),camp.id+' starts unexplored');
}
updateScavReinforcements(mission);
assert(mission.state.camps.every(camp=>camp.nextWaveAt===undefined),'The opening raid comes first');
mission.state.flags.raidWon=true;
updateScavReinforcements(mission);
const locked=mission.state.camps.at(-1);
assert.equal(locked.nextWaveAt,undefined,'Locked sector cannot call up reinforcements');
for(const camp of mission.state.camps.slice(0,-1)){
  assert.equal(camp.nextWaveAt,mission.state.time+camp.wave.seconds,camp.id+' starts its timer before exploration');
}
mission.state.time+=10;
mission.state.flags.lastRevealed=true;
mission.state.bounds=config.finalMapBounds.slice();
mission.rebuildNavigation();
updateScavReinforcements(mission);
assert.equal(locked.nextWaveAt,mission.state.time+locked.wave.seconds,'New sector gets its own first interval');
const beforeWaves=mission.save();

const waveCounts={};
const deadlines=[...new Set(mission.state.camps.map(camp=>camp.nextWaveAt))].sort((a,b)=>a-b);
for(const deadline of deadlines){
  const due=mission.state.camps.filter(camp=>camp.nextWaveAt===deadline);
  mission.state.time=deadline-.01;
  updateScavReinforcements(mission);
  for(const camp of due)assert.equal(members(mission,camp.id).length,0,camp.id+' interval');
  force(mission,due[0]);
  for(const camp of due){
    const squad=members(mission,camp.id);
    assert.equal(squad.length,2,camp.id+' squad');
    assert(squad.every(unit=>unit.path.length&&!mission.visibleAt(unit.x,unit.y)));
    assert(vehicleClearance(squad[0],squad[1],config.worldScale,field)>0);
    waveCounts[camp.id]=squad.length;
  }
}

const restored=new Mission(config,field);
restored.load(beforeWaves);
const blockedCamp=restored.state.camps[0];
const blockedRally=members(mission,blockedCamp.id)[0].task;
restored.addUnit('scav-bus','scavs',blockedRally);
force(restored,blockedCamp);
const rerouted=members(restored,blockedCamp.id);
assert.equal(rerouted.length,2,'A bus at the first rally point does not block the sortie');
assert(rerouted.every(unit=>unit.task.x!==blockedRally.x||unit.task.y!==blockedRally.y),'The squad avoids the occupied rally point');

restored.load(mission.save());
const camp=restored.state.camps[0],savedCamp=mission.state.camps[0];
assert.equal(camp.nextWaveAt,savedCamp.nextWaveAt);
assert.deepEqual(members(restored,camp.id).map(unit=>unit.id),members(mission,camp.id).map(unit=>unit.id));
force(restored,camp);
assert.equal(members(restored,camp.id).length,2,'An unscouted camp keeps one pair in the field');
const [gateCol,gateRow]=field.worldToGrid(camp.gate.x,camp.gate.y).map(Math.round);
restored.explored[gateRow*128+gateCol]=255;
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
console.log(JSON.stringify({waveCounts,beforeExploration:true,saveLoad:true,cap:4,visibleExitBlocked:true,destroyedCoreStops:true}));
