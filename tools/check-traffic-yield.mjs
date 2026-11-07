import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-motion.js';

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={
 extent:4096,half:2048,cellMetres:32,
 heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),
 worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32],
};

function fixture(){
 const mission=new Mission(config,field);
 Object.assign(mission.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
 mission.updateMission=()=>{};
 mission.rebuildNavigation();
 return mission;
}

function measure(cars){
 const mission=fixture();
 const units=cars.map(({start,heading,goal})=>mission.addUnit('bukhanka','rai',start,{
  heading,previousHeading:heading,path:goal?[goal]:[],task:goal?{type:'move',...goal}:null,
 }));
 const first=[null,null];
 let clearance=Infinity;
 for(let step=1;step<=300;step++){
  mission.advance(.1);
  clearance=Math.min(clearance,vehicleClearance(...units,config.worldScale,field));
  for(const [index,unit] of units.entries()){
   const start=cars[index].start;
   if(Math.hypot(unit.x-start.x,unit.y-start.y)>.1)first[index]??=step/10;
  }
  if(units.every(unit=>!unit.task&&!unit.detour))break;
 }
 assert(clearance>=0,'Both hulls stay clear throughout the manoeuvre');
 for(const [index,unit] of units.entries()){
  assert.equal(unit.hp,unit.maxHp,'An allied yield must not cause collision damage');
  const goal=cars[index].goal;
  if(goal)assert(!unit.task&&Math.hypot(unit.x-goal.x,unit.y-goal.y)<3,'Resume the original order after passing');
 }
 return {first,clearance,seconds:+mission.state.time.toFixed(1)};
}

const headOn=measure([
 {start:{x:-11,y:0},heading:-Math.PI/2,goal:{x:90,y:0}},
 {start:{x:11,y:0},heading:Math.PI/2,goal:{x:-90,y:0}},
]);
assert(headOn.first[1]!==null&&headOn.first[1]<=.6,'One van should start yielding promptly');
assert(headOn.seconds<=16,'Both vans should pass and finish without repeated parking');
const parked=measure([
 {start:{x:0,y:-23},heading:0,goal:{x:0,y:130}},
 {start:{x:0,y:0},heading:0},
]);
assert(parked.first[1]!==null&&parked.first[1]<=.6,'A van stopped by braking should get the same response as a blocked sweep');
assert(parked.seconds<=12,'The waiting van should continue as soon as the lane is clear');
console.log(JSON.stringify({headOn,parked}));
