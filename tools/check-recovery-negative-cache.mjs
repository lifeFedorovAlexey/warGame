import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const m=new Mission(config,field);
Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
m.updateMission=()=>{};m.rebuildNavigation();
const unit=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0,path:[{x:0,y:200}],task:{type:'move',x:0,y:200},
 routeOrder:{revision:1,request:{x:0,y:200},destination:{x:0,y:200}}});
const obstacles=[[-12,0],[12,0],[0,24],[0,-24]].map(([x,y])=>m.addUnit('bukhanka','scav',{x,y},{heading:0}));
let searches=0;const plan=m.planManeuverSteps.bind(m),path=m.vehiclePathSteps.bind(m);
m.planManeuverSteps=function*(...args){searches++;return yield* plan(...args);};
m.vehiclePathSteps=function*(...args){searches++;return yield* path(...args);};
for(let step=0;step<160;step++){m.state.time+=.1;m.move(unit,.1);}
const before=searches,stopped={x:unit.x,y:unit.y};
for(let step=0;step<50;step++){m.state.time+=.1;m.move(unit,.1);}
assert.equal(searches,before,'Five unchanged seconds cannot repeat an exhausted local search');
assert.deepEqual({x:unit.x,y:unit.y},stopped);
const blockedSave=m.save();
obstacles.find(other=>other.y>0).y=200;
m.state.time+=.1;m.move(unit,.1);
assert(Math.hypot(unit.x-stopped.x,unit.y-stopped.y)>.01,'A released real sweep moves on the next step');
const loaded=new Mission(config,field);loaded.load(blockedSave);loaded.updateMission=()=>{};
loaded.state.bounds=[0,0,127,127];loaded.rebuildNavigation();
loaded.entity(obstacles.find(other=>other.y>0).id).hp=0;
const resumed=loaded.entity(unit.id),previous={x:resumed.x,y:resumed.y};
loaded.state.time+=.1;loaded.move(resumed,.1);
assert(Math.hypot(resumed.x-previous.x,resumed.y-previous.y)>.01,'Save/load cannot retain an obsolete negative result');
console.log(JSON.stringify({searchesBefore:before,searchesDuringFiveSeconds:searches-before,releaseSeconds:.1,saveLoad:'moving'}));
