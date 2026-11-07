import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {updateCombatDeployment} from '../campaign/combat-deployment.js';

// State-machine regressions against the production deployment function.
// The path oracle deliberately isolates candidate selection from terrain,
// car steering and collision simulation. These are not gameplay benchmarks.
const spec={range:145,vision:400,damage:9};
function fixture(action,{targetX=0,anchorX=targetX,unitX=300,pathAllowed=()=>true}={}){
  const target={id:'review-target',kind:'review-target',owner:'scavs',x:targetX,y:0,hp:1000};
  const unit={id:'review-unit',kind:'bukhanka',owner:'rai',hp:320,maxHp:320,x:unitX,y:0,
    heading:Math.PI/2,path:[],task:{type:'combat-position',x:unitX,y:0},combatGroup:'review-group',
    combatDeployment:{targetId:target.id,group:'review-group',angle:0,index:null,slot:null,
      anchor:{x:anchorX,y:0},resume:action==='attack'?{type:action,targetId:target.id}:{type:action,x:600,y:0},
      status:'reserve',retryAt:0}};
  const selected=[],searches=[];
  const mission={
    nav:{topologyRevision:1},
    state:{units:[unit],buildings:[target],time:0},
    config:{worldScale:4.5,units:{bukhanka:spec,'review-target':{range:0,damage:0}}},
    unitSpec:()=>spec,entity:id=>id===target.id?target:null,
    visibleAt:()=>true,attack:()=>false,inBounds:()=>true,exploredAt:()=>true,
    lineOfSight:()=>true,vehicleMotionClear:()=>true,nearbyUnits:()=>[],
    enemyOf:(a,b)=>a.owner!==b.owner&&b.hp>0,
    *vehiclePathSteps(u,point){
      const index=u.combatDeployment.index;
      if(selected.at(-1)!==index)selected.push(index);
      searches.push({index,point:{...point}});
      return pathAllowed(point)?[{...point}]:null;
    },
    // Deliberately preserve the assigned route: the assertion concerns a real
    // route being committed, not declaring arrival or pretending to move.
    *moveSteps(){},
  };
  const advance=seconds=>{
    for(let time=0;time<=seconds;time++){
      mission.state.time=time;
      for(const unused of updateCombatDeployment(mission,unit,spec,.1)){}
    }
  };
  return {mission,unit,target,selected,searches,advance};
}

const failures=[],results=[];
function check(name,run){
  try{results.push({name,...run(),passed:true});}
  catch(error){failures.push({name,error:error.message});}
}
for(const action of ['attack','attack-move']){
  check(`${action}: reserve refreshes a moved visible target`,()=>{
    // Every point in the old fan lies outside the new firing range. The same
    // fixture with an up-to-date anchor has an immediately reachable position.
    const f=fixture(action,{targetX:300,anchorX:0,unitX:500});
    f.advance(20);
    const result={anchor:f.unit.combatDeployment.anchor,status:f.unit.combatDeployment.status,
      searches:f.searches.length,path:f.unit.path};
    console.log(JSON.stringify({case:'moved target',action,...result}));
    assert.deepEqual(result.anchor,{x:300,y:0},'Refresh the anchor before the reserve early return');
    assert(result.searches>0&&result.path.length>0,'Commit a reachable route around the observed target');
    assert.notEqual(result.status,'reserve','A reachable current frontage must leave reserve');
    assert.notEqual(result.status,'arrived','Planning a path cannot substitute for physically reaching it');
    return result;
  });
  check(`${action}: reserve tries a reachable candidate beyond two rejected slots`,()=>{
    // For the production fan, the candidates around indices 0 and 1 cannot
    // reach this region; the ring around index 2 contains a reachable point.
    // All poses themselves are valid: only their routes differ in feasibility.
    const reachable=point=>point.x<80&&point.y<-70;
    const f=fixture(action,{pathAllowed:reachable});
    f.advance(20);
    const result={selected:f.selected,searches:f.searches.length,status:f.unit.combatDeployment.status,path:f.unit.path};
    console.log(JSON.stringify({case:'rejected slots',action,...result}));
    assert(result.path.length>0&&reachable(result.path.at(-1)),
      'Two rejected slots must not starve the remaining reachable candidates');
    assert.notEqual(result.status,'reserve','Continue selection after route rejection');
    assert.notEqual(result.status,'arrived','Do not complete movement to escape the reserve');
    assert.equal(f.unit.x,300);assert.equal(f.unit.y,0,'The planner must not teleport the unit');
    return result;
  });
  check(`${action}: exhausted approaches wait for an actual change`,()=>{
    let reachable=false;
    const f=fixture(action,{pathAllowed:()=>reachable});f.advance(100);
    assert(!f.unit.path.length&&f.unit.combatDeployment.exhausted,'An impossible frontage must finish its finite candidate pass');
    const searches=f.searches.length;f.advance(100);
    assert.equal(f.searches.length,searches,'No unchanged full-search loop behind a waiting label');
    reachable=true;f.mission.nav.topologyRevision++;
    f.mission.state.time+=.1;
    for(const unused of updateCombatDeployment(f.mission,f.unit,spec,.1)){}
    assert(f.unit.path.length,'A changed obstacle releases the request on the next simulation step');
    return {searchesBeforeChange:searches,searchesAfterChange:f.searches.length};
  });
}
console.log(JSON.stringify({sourceSha256:createHash('sha256').update(fs.readFileSync('campaign/combat-deployment.js')).digest('hex'),results,failures}));
assert.equal(failures.length,0,failures.map(f=>`${f.name}: ${f.error}`).join('\n'));
