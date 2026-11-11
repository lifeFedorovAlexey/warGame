import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {roadDrivingLane} from '../campaign/road-merge.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32],
 roadNetwork:{paths:[{id:'road',width:30,points:[{x:0,y:-1900},{x:0,y:1900}]}]},
 roadBlendAt:x=>Math.max(0,Math.min(1,(15-Math.abs(x))/2.5))};
const m=new Mission(config,field);
Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127],pendingCinematics:[]});
m.updateMission=()=>{};
m.addStructure('factory','rai',{x:0,y:-600},{completed:true,progress:1});
const u=m.addUnit('bukhanka','rai',{x:0,y:120},{heading:0});u.trafficOnScreen=true;
m.rebuildNavigation();m.explored.fill(1);m.visible.fill(1);
assert(m.retreat([u.id]).ok);
let shoulderAt=null,offroadAt=null,minY=u.y,maxOffset=0,samples=0,onRoad=0,lastSample=-1;const start=performance.now();
while(m.state.time<35&&performance.now()-start<30000){
 m.advance(1/30,{budgetMs:6});
 const lane=u.path?.length&&roadDrivingLane(m,u,u.path[0],config.worldScale);
 if(lane?.retreatShoulder)shoulderAt??=m.state.time;
 if(Math.abs(u.x)>15)offroadAt??=m.state.time;
 maxOffset=Math.max(maxOffset,Math.abs(u.x));minY=Math.min(minY,u.y);
 if(m.state.time>=5&&u.y>-400&&Math.floor(m.state.time*2)>lastSample){
  lastSample=Math.floor(m.state.time*2);samples++;if(Math.abs(u.x)<15)onRoad++;
 }
}
assert(shoulderAt!==null&&shoulderAt<8,'The retreat should choose the shoulder without an oncoming vehicle');
assert(offroadAt!==null&&offroadAt<20,'The actual car must leave the road proactively');
assert(minY<0,'The car must travel toward the factory, not merely select a side target');
assert(samples>5&&onRoad<=1,'The retreat should remain off the road on a clear straight route: '+JSON.stringify({samples,onRoad}));
const side=u.combatRetreat?.shoulderSide;assert(side===1||side===-1,'The selected shoulder must be recorded');
const restored=new Mission(config,field);restored.load(m.save());
const restoredUnit=restored.entity(u.id);
assert.equal(restoredUnit.combatRetreat?.shoulderSide,side,'Restoring a save must preserve the selected shoulder');
console.log(JSON.stringify({passed:true,shoulderAt,offroadAt,maxOffset,minY,samples,onRoad,side,time:m.state.time}));
