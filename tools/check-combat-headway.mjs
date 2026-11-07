import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

// Before the combatGroup-only margins were aligned with normal following:
// parallel packed 10: 61.7 s; single file 20: 95.0 s; opposing 10: 97.2 s.
// These were simulated arrival times, not FPS or CPU benchmark measurements.
// An in-memory candidate retaining retreat margins, hulls, braking and terrain
// checks gave 18.2 / 37.0 / 18.5 s, respectively, with no HP loss or overlap.
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
  gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){
  const m=new Mission(config,field);
  Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
  m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(1);
  return m;
}
function car(m,x,y,heading,goal){
  const unit=m.addUnit('bukhanka','rai',{x,y},{heading,combatGroup:'headway-review'});
  unit.path=[{...goal}];unit.task={type:'move',...goal};
  return {unit,goal:{...goal}};
}
function sample(m,cars,seconds=60){
  const units=cars.map(car=>car.unit),deadline=m.state.time+seconds;
  let minimum=Infinity,waitingSeconds=0,hardStops=0;
  while(m.state.time<deadline-1e-8&&units.some(unit=>unit.task||unit.path.length||unit.detour)){
    const speeds=units.map(unit=>unit.driveSpeed??0);
    m.advance(.1);m.effects=[];
    for(const [i,unit] of units.entries()){
      // Arrival itself is an intentional stop. Count only interrupted travel.
      if(unit.path.length){
        if((unit.driveSpeed??0)<.5)waitingSeconds+=.1;
        if(speeds[i]>5&&(unit.driveSpeed??0)===0)hardStops++;
      }
      for(let j=0;j<i;j++)minimum=Math.min(minimum,vehicleClearance(unit,units[j],config.worldScale,field));
    }
  }
  return {seconds:m.state.time,minimum,waitingSeconds,hardStops,
    units:cars.map(({unit,goal})=>({id:unit.id,hp:unit.hp,maxHp:unit.maxHp,x:unit.x,y:unit.y,goal,
      distance:goal?Math.hypot(unit.x-goal.x,unit.y-goal.y):null,
      complete:!unit.task&&!unit.path.length&&!unit.detour}))};
}
const results=[];
function verify(name,result){
  results.push({name,...result});
  console.log(JSON.stringify({name,seconds:result.seconds,minimum:result.minimum,
    waitingSeconds:result.waitingSeconds,hardStops:result.hardStops}));
  assert(result.units.every(unit=>unit.complete),`${name}: every order must finish within the existing 60 s window`);
  assert(result.units.every(unit=>unit.distance===null||unit.distance<3),`${name}: physically reach each original destination`);
  assert(result.units.every(unit=>unit.hp===unit.maxHp),`${name}: traffic must not damage friendly vehicles`);
  assert(result.minimum>=0,`${name}: keep the complete hull collision constraint`);
}
for(const scenario of ['parallel-packed-10','single-file-20','opposing-10']){
  const m=fixture(),cars=[];
  if(scenario==='parallel-packed-10')for(let i=0;i<5;i++)for(const x of [-5.6,5.6])
    cars.push(car(m,x,-i*30,0,{x,y:450-i*30}));
  if(scenario==='single-file-20')for(let i=0;i<20;i++)
    cars.push(car(m,0,-i*26,0,{x:0,y:750-i*26}));
  if(scenario==='opposing-10')for(let i=0;i<5;i++){
    cars.push(car(m,0,-80-i*30,0,{x:0,y:250+(4-i)*30}));
    cars.push(car(m,0,80+i*30,Math.PI,{x:0,y:-250-(4-i)*30}));
  }
  verify(scenario,sample(m,cars));
}
for(const separation of [32,50,70,100]){
  const m=fixture(),leader=car(m,0,0,0,{x:0,y:300}),follower=car(m,0,-separation,0,{x:0,y:260});
  for(let i=0;i<40;i++)m.advance(.1);
  m.stop([leader.unit.id]);leader.goal=null;
  verify(`Stop leader at separation ${separation}`,sample(m,[leader,follower]));
}
for(const degrees of [20,30,35,45,60,75,90,105,120,135,145,150,160]){
  const m=fixture(),angle=degrees*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle);
  const cars=[car(m,-80,0,-Math.PI/2,{x:120,y:0}),
    car(m,-80*dx,-80*dy,Math.atan2(-dx,dy),{x:120*dx,y:120*dy})];
  verify(`combat group crossing ${degrees} degrees`,sample(m,cars));
}
const sourceHashes=Object.fromEntries(['campaign/mission.js','campaign/vehicle-motion.js','campaign/vehicle-collision.js',
  'campaign/traffic-coordinator.js'].map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
fs.mkdirSync('campaign/reports',{recursive:true});
fs.writeFileSync('campaign/reports/combat-headway.json',JSON.stringify({passed:true,sourceHashes,results},null,2));
console.log(JSON.stringify({passed:true,cases:results.length,sourceHashes}));
