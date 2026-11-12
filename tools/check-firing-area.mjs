import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {progressMission} from './check-navigation-public-progress.mjs';
import {RoadTraffic} from '../campaign/road-traffic.js';
import {firingAreaSlotsSteps} from '../campaign/firing-area.js';
import {firingSlots,validPosition,firingPose} from '../campaign/firing-positions.js';
import {firingGroundAllowed} from '../campaign/firing-ground.js';
import {updateCombatDeployment} from '../campaign/combat-deployment.js';
const drain=it=>{let s;do{s=it.next();}while(!s.done);return s.value;},distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),results=[];
{
  const m=progressMission(),target=m.addStructure('generator','scavs',{x:0,y:190},{completed:true,progress:1,hp:100000});m.rebuildNavigation();
  const cars=Array.from({length:12},(_,i)=>m.addUnit(i%2?'raider':'bukhanka','rai',{x:(i%4-1.5)*32,y:-Math.floor(i/4)*32}));
  assert(m.order(cars.map(u=>u.id),'attack',target).ok);
  for(const u of cars)drain(updateCombatDeployment(m,u,m.unitSpec(u),.1));
  const slots=cars.map(u=>u.combatDeployment?.goal??u.combatDeployment?.slot).filter(Boolean);assert(slots.length>1);
  for(let i=0;i<slots.length;i++)for(let j=0;j<i;j++)assert(distance(slots[i],slots[j])>=m.config.worldScale*5.3,'Mixed profiles cannot reserve overlapping positions');
  results.push({case:'mixed vehicle profiles retain reservation spacing',assigned:slots.length});
}
{
  const m=progressMission(),u=m.addUnit('bukhanka','rai',{x:0,y:0});
  const target=m.addStructure('generator','scavs',{x:0,y:200},{completed:true,progress:1});
  const far=m.addStructure('factory','rai',{x:1000,y:1000},{completed:false,progress:.1});m.rebuildNavigation();
  const first=drain(firingAreaSlotsSteps(m,u,0,target,target));far.progress=.2;m.state.time+=.1;
  assert.equal(drain(firingAreaSlotsSteps(m,u,0,target,target)),first,'Distant construction cannot rebuild the group area');
  const near=m.addStructure('factory','rai',{x:60,y:160},{completed:false,progress:.1});m.rebuildNavigation();
  const second=drain(firingAreaSlotsSteps(m,u,0,target,target));near.progress=.5;m.state.time+=.1;
  assert.notEqual(drain(firingAreaSlotsSteps(m,u,0,target,target)),second,'An occluder growing inside the area is rechecked');
  results.push({case:'construction invalidates only affected firing areas'});
}
{
  const m=progressMission(),u=m.addUnit('bukhanka','rai',{x:0,y:0});
  m.field.heightAt=(x,y)=>y*.25;m.field.gradientAt=()=>({x:0,y:.25});
  assert(!firingGroundAllowed(m,u),'Bare hillside is not a firing platform');
  m.field.roadNetwork={paths:[{width:32,points:[{x:0,y:-100},{x:0,y:200}]}]};m.nav.roads=new RoadTraffic(m.field);
  assert(firingGroundAllowed(m,u),'A road climb is usable with the whole hull on pavement');
  assert(!firingGroundAllowed(m,u,{x:15,y:0}),'A centre on pavement cannot hide a hull on the hillside');
  m.field.gradientAt=()=>({x:0,y:.8});assert(!firingGroundAllowed(m,u),'Road data cannot legalize a cliff');
  results.push({case:'road climb, bare hillside, shoulder and cliff'});
}
{
  const m=prepareM02Diagnostic(makeMission());m.explored.fill(255);m.visible.fill(255);m.state.units=[];m.unitIndex.rebuild([]);
  const u=m.addUnit('bukhanka','rai',{x:0,y:0});
  for(const target of m.state.buildings.filter(b=>b.kind==='mg-tower'&&b.id.includes('sensor_outpost'))){
    const start=performance.now(),slots=drain(firingAreaSlotsSteps(m,u,0,target,target)),cpuMs=performance.now()-start;
    const valid=slots.filter(p=>validPosition(m,u,target,p,[])),road=valid.filter(p=>m.nav.roads.coverage(p.x,p.y)>.58);
    assert(road.length>1&&Math.max(...road.map(p=>p.x))-Math.min(...road.map(p=>p.x))>100,target.id+': positions extend along the road');
    let checked=0;
    for(let y=Math.ceil((target.y-140)/8)*8;y<=target.y+140;y+=8)for(let x=Math.ceil((target.x-140)/8)*8;x<=target.x+140;x+=8){
      const p={x,y},r=distance(p,target);if(r<145*.38||r>145*.97||!validPosition(m,u,target,p,[]))continue;
      checked++;assert(valid.some(q=>distance(p,q)<=m.config.worldScale*7+.001),'Valid terrain sample has a nearby available slot');
    }
    assert(checked>0);
    results.push({case:target.id,template:firingSlots(m.unitSpec(u),4.5,0,target).length,candidates:slots.length,valid:valid.length,road:road.length,checked,cpuMs});
  }
  const target=m.entity('m02.fort.sensor_outpost.watch.nw'),slots=drain(firingAreaSlotsSteps(m,u,0,target,target));
  let probes=0;const sweep=m.vehicleTerrainSweep.bind(m);m.vehicleTerrainSweep=(...args)=>{probes++;return sweep(...args);};
  const start=performance.now();
  for(let i=0;i<500;i++)assert.equal(drain(firingAreaSlotsSteps(m,{...u,id:'probe'+i,owner:i%2?'rai':'scavs',x:i,y:i},0,target,target)),slots);
  const view=Object.create(m);view.state={...m.state,units:[]};
  assert.equal(drain(firingAreaSlotsSteps(view,u,0,target,target)),slots,'Traffic projections share unchanged static geometry');
  assert.equal(probes,0,'500 allied/enemy requests reuse static geometry');
  results.push({case:'500 requests reuse one area across owners and positions',cpuMs:performance.now()-start,staticProbes:probes});
  for(const owner of ['rai','scavs']){
    u.kind=owner==='rai'?'bukhanka':'raider';u.owner=owner;u.x=-1280;u.y=-848;u.heading=-Math.PI/2;
    const path=m.attackPath(u,target),end=path?.at(-1);
    assert(end,owner+': single-unit attack finds a reachable approach on the real terrain');
    assert(distance(end,target)<=m.unitSpec(u).range&&firingGroundAllowed(m,u,firingPose(u,end,target))&&m.lineOfSight({...u,...end},target));
    results.push({case:owner+' attack uses the shared terrain search',end});
  }
  u.kind='bukhanka';u.owner='rai';
  m.nav.topologyRevision++;assert.notEqual(drain(firingAreaSlotsSteps(m,u,0,target,target)),slots);assert(probes>0);
  const before=drain(firingAreaSlotsSteps(m,u,0,target,target));target.x+=8;
  assert.notEqual(drain(firingAreaSlotsSteps(m,u,0,target,target)),before,'Moving the actual target invalidates its area');
  results.push({case:'terrain topology and target movement invalidate cached geometry'});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/firing-area.json',JSON.stringify({results},null,2));console.log(JSON.stringify({passed:results.length,results}));
