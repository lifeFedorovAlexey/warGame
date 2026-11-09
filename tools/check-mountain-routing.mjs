import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {TerrainNavigator} from '../campaign/navigation.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

// Independent oracle for the agreed map policy: preserve the original
// build-alpha-map.py source-cell limit (.30), with the authored road ribbon
// as an exception. Do not derive this oracle from runtime navigation masks.
// These are real map routes, not claimed coordinates from the user's image.
const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json');
const heights=json('assets/maps/alpha/heightfield.json'),roads=json('assets/maps/alpha/roads.json');
const sourceHashes=Object.fromEntries(['campaign/navigation.js','campaign/terrain-passability.js','campaign/vehicle-motion.js',
  'campaign/mission.js','assets/maps/alpha/heightfield.json','assets/maps/alpha/roads.json']
  .map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
const raw=createHeightfield(heights);shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,roads);
const mission=new Mission(config,field);
mission.state.units=[];mission.state.bounds=config.finalMapBounds.slice();
mission.state.pendingCinematics=[];mission.updateMission=()=>{};
mission.visible.fill(1);mission.explored.fill(1);mission.rebuildNavigation();

const segments=roads.paths.flatMap(path=>path.points.slice(1).map((b,index)=>{
  const a=path.points[index],dx=b.x-a.x,dy=b.y-a.y;
  return {a,b,dx,dy,length2:dx*dx+dy*dy,widthA:a.width??path.width,widthB:b.width??path.width};
}));
function roadRibbon(point){
  return segments.some(({a,dx,dy,length2,widthA,widthB})=>{
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(length2||1)));
    const half=(widthA+(widthB-widthA)*t)/2;
    return (point.x-a.x-dx*t)**2+(point.y-a.y-dy*t)**2<=half*half;
  });
}
function sourceCell(point){
  const [gx,gy]=field.worldToGrid(point.x,point.y),last=heights.size-2;
  const x=Math.max(0,Math.min(last,Math.floor(gx))),y=Math.max(0,Math.min(last,Math.floor(gy)));
  const height=(col,row)=>heights.samples[row*heights.size+col]*heights.heightUnitMetres;
  const a=height(x,y),b=height(x+1,y),c=height(x,y+1),d=height(x+1,y+1);
  return {grid:[x,y],corners:[a,b,c,d],grade:Math.max(Math.hypot(b-a,c-a),Math.hypot(d-c,d-b))/heights.cellMetres};
}
const terrainAllowed=point=>sourceCell(point).grade<=.30||roadRibbon(point);
function auditPath(from,path){
  let previous=from,length=0,forbiddenMetres=0,maxHeight=-Infinity;
  const violations=new Map();
  for(const [segment,point] of path.entries()){
    const distance=Math.hypot(point.x-previous.x,point.y-previous.y),steps=Math.max(1,Math.ceil(distance));
    length+=distance;
    // One-metre samples expose the regression inside 32 m source cells. This
    // is a counterexample check, not a proof of continuous hull clearance.
    for(let step=1;step<=steps;step++){
      const t=step/steps,p={x:previous.x+(point.x-previous.x)*t,y:previous.y+(point.y-previous.y)*t};
      const height=field.heightAt(p.x,p.y);maxHeight=Math.max(maxHeight,height);
      if(terrainAllowed(p))continue;
      forbiddenMetres+=distance/steps;
      const cell=sourceCell(p),key=cell.grid.join(',');
      if(!violations.has(key)){
        const gradient=field.gradientAt(p.x,p.y);
        violations.set(key,{segment,...p,height,source:cell,finalGradient:Math.hypot(gradient.x,gradient.y)});
      }
    }
    previous=point;
  }
  return {length,maxHeight,forbiddenMetres,violations:[...violations.values()]};
}

const results=[],failures=[];
function check(name,run){
  try{run();results.push({name,passed:true});}
  catch(error){failures.push({name,error:error.message});}
}
const destinations=[
  // Keep the original counterexample even if the campaign guidance is moved.
  {name:'original cliff regression goal',point:field.gridToWorld([14.28125,62.84375])},
  {name:'current west-south approach',point:field.gridToWorld(config.camps.find(camp=>camp.id==='west-south').approachGrid)},
];
for(const {name:destinationName,point:destination} of destinations)
for(const campId of ['nw-east','nw-west'])check(`${campId} to ${destinationName}`,()=>{
  const camp=config.camps.find(item=>item.id===campId);
  const unit={...field.gridToWorld(camp.gateGrid),kind:'bukhanka',owner:'rai',heading:0,path:[]};
  const path=mission.vehiclePath(unit,destination,{fallback:false,maxGoalDistance:4});
  assert(path?.length,'Keep a reachable route through the authored road passes');
  const report={case:campId,destinationName,from:{x:unit.x,y:unit.y},destination,path,...auditPath(unit,path)};
  console.log(JSON.stringify(report));
  assert.equal(report.violations.length,0,'A route must not climb original cliff cells outside authored roads');
  assert(Math.hypot(path.at(-1).x-destination.x,path.at(-1).y-destination.y)<=4,
    'Do not accept a distant fallback to make the route pass');
});

// The old route connected these cells while climbing from ~20 m to the
// ~50 m plateau. They come from source-grid coordinates, not a new spatial ban.
const cliffFrom=field.gridToWorld([35.5,67.5]),cliffTo=field.gridToWorld([34.5,68.5]);
const cliffMiddle={x:(cliffFrom.x+cliffTo.x)/2,y:(cliffFrom.y+cliffTo.y)/2};
assert(!terrainAllowed(cliffFrom)&&!terrainAllowed(cliffMiddle),
  'The old connector starts inside and crosses the original off-road cliff before reaching the flatter top');
for(const [name,args] of [
  ['grid edge',[true]],
  ['ordinary smoothing',[false,true]],
  ['physical movement',[false,true,.52,true]],
  ['rough recovery',[false,true,.60,true]],
])check(`forbidden start cannot continue up the ridge: ${name}`,()=>{
  const allowed=mission.nav.lineClear(cliffFrom,cliffTo,...args);
  console.log(JSON.stringify({case:name,cliffFrom,cliffTo,allowed}));
  assert.equal(allowed,false,'An escape/recovery flag must not erase the terrain prohibition');
});

check('flat test fields without source samples remain usable',()=>{
  const flat={extent:256,half:128,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0})};
  const nav=new TerrainNavigator(flat),from={x:-64,y:64},to={x:64,y:-64};
  assert(nav.findPath(from,to)?.length);
  assert(nav.lineClear(from,to,false,true,.52,true));
  assert(nav.lineClear(from,to,false,true,.60,true));
});
console.log(JSON.stringify({sourceHashes,results,failures}));
assert.equal(failures.length,0,failures.map(failure=>`${failure.name}: ${failure.error}`).join('\n'));
