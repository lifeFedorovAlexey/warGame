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
const a=m.addUnit('bukhanka','rai',{x:0,y:-55},{heading:0});
const r=m.addUnit('bukhanka','rai',{x:0,y:55},{heading:Math.PI});
a.task={type:'attack-move',x:0,y:450};a.path=[{x:0,y:450}];
r.task={type:'move',x:0,y:-450};r.path=[{x:0,y:-450}];r.combatRetreat={status:'moving',phase:'home'};
m.rebuildNavigation();m.unitIndex.rebuild(m.state.units);
const lane=u=>roadDrivingLane(m,u,u.path[0],config.worldScale);
const attack=lane(a),retreat=lane(r);
assert(attack&&retreat?.retreatShoulder,'Both streams need planned lanes');
assert(Math.abs(attack.x)<.001,'Attack follows the middle of the road');
assert(retreat.x < -15,'Retreat follows the right-hand shoulder');
// A retreat must already prefer the shoulder while no attacker is nearby.
a.hp=0;m.unitIndex.rebuild(m.state.units);
const alone=lane(r);
assert(alone?.retreatShoulder&&alone.x < -15,'Retreat chooses the shoulder without any oncoming traffic');
a.hp=a.maxHp;m.unitIndex.rebuild(m.state.units);
const later={...r,x:retreat.x,y:retreat.y};
assert(roadDrivingLane(m,later,later.path[0],config.worldScale)?.retreatShoulder,'Shoulder remains available after leaving the asphalt');
const unrelated={...a,task:{type:'move'},combatDeployment:null};
assert(!lane(unrelated)?.retreatShoulder,'Ordinary traffic does not use the retreat policy');
const offroad={...r,path:[{x:500,y:-450}]};
assert.equal(roadDrivingLane(m,offroad,offroad.path[0],config.worldScale),null,'An off-road destination must not pull a retreat back onto asphalt');
// The geometric line and swept-body checks must reject an occupied shoulder.
const wall=m.addStructure('bunker','neutral',{x:-21,y:15},{completed:true,progress:1,halfWidth:5,halfDepth:10});
m.rebuildNavigation();m.unitIndex.rebuild(m.state.units);
const alternative=lane(r);
assert(!alternative?.retreatShoulder||alternative.x>15,'An obstructed shoulder cannot be selected');
assert.equal(wall.hp>0,true);
r.combatRetreat.shoulderSide=-1;
wall.hp=0;m.rebuildNavigation();m.unitIndex.rebuild(m.state.units);
assert(lane(r)?.x>15,'After selecting the other shoulder, keep it rather than immediately crossing back');
console.log(JSON.stringify({passed:true,attack,retreat,alternative}));
