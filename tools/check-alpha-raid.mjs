import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
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
const approach=field.gridToWorld(config.raidApproachGrid);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const positions=mission=>mission.state.raidReserve.map(id=>{
  const {x,y}=mission.entity(id);
  return {id,x,y};
});

function base(mission){
  for(const [kind,x,y] of [['factory',-1464,312],['lab',-1576,248]]){
    mission.addStructure(kind,'rai',{x,y},{completed:true,progress:1});
  }
  const defenders=mission.state.units.filter(unit=>unit.owner==='rai'&&unit.kind==='bukhanka');
  defenders.forEach((unit,index)=>Object.assign(unit,{x:approach.x-50,y:approach.y-44+index*26,heading:-Math.PI/2}));
  mission.rebuildNavigation();
  mission.updateFog();
  mission.state.statistics.produced=1;
}

function meetRaid(mission){
  const ids=new Set(mission.state.raidReserve), initialCount=mission.state.units.length;
  let launch,warning,fire;
  while(mission.state.time<120&&fire===undefined){
    mission.advance(.1);
    for(const event of mission.drainEvents()){
      if(event.type==='raid-start'){
        assert.equal(launch,undefined);
        launch=event.time;
        assert.equal(mission.state.units.length,initialCount,'Releasing the raid creates no units');
      }
      if(event.type==='cinematic'&&event.chapter==='first-contact'){
        assert.equal(warning,undefined);
        warning=event.time;
      }
    }
    if(mission.drainEffects().some(effect=>effect.type==='shot'&&(ids.has(effect.from)||ids.has(effect.targetId))))fire=mission.state.time;
  }
  assert(Number.isFinite(launch)&&Number.isFinite(warning)&&Number.isFinite(fire),JSON.stringify({launch,warning,fire}));
  return {launch,warning,fire,notice:fire-warning};
}

const fresh=new Mission(config,field), reserve=positions(fresh);
assert.equal(reserve.length,4);
assert(reserve.every(unit=>!fresh.visibleAt(unit.x,unit.y)&&distance(unit,approach)<350));
base(fresh);
const freshTiming=meetRaid(fresh);
assert(freshTiming.notice>0&&freshTiming.notice<25,JSON.stringify(freshTiming));

const previous=new Mission({...config,raidStagingGrid:undefined},field);
base(previous);
const oldPositions=positions(previous), legacy=new Mission(config,field);
legacy.load(previous.save());
assert.deepEqual(positions(legacy),oldPositions,'Loading preserves the reserve’s original positions');
const legacyTiming=meetRaid(legacy);
assert(legacyTiming.warning-legacyTiming.launch>10,'A distant reserve moves before it is reported');
assert(legacyTiming.notice>0&&legacyTiming.notice<30,JSON.stringify(legacyTiming));

const scheduled=new Mission(config,field);
scheduled.load(previous.save());
scheduled.state.flags.contact=true;
scheduled.state.flags.raidAt=1;
scheduled.finishCinematic('first-contact');
scheduled.advance(.8);
assert(!scheduled.state.flags.raidStarted);
scheduled.advance(.4);
assert(scheduled.state.flags.raidStarted);
assert(!scheduled.drainEvents().some(event=>event.chapter==='first-contact'),'A warning already heard stays consumed');

console.log(JSON.stringify({freshTiming,legacyTiming,legacyWarningPreserved:true}));
