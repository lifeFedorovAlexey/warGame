import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';

// Stress data only: real river, buildings, level walls, bodies and public
// movement commands. Disable combat/production to measure traffic in isolation.
export function bridgeTrafficFixture(population,bridgeIndex=1,{opponent=false}={}){
 const m=prepareM02Diagnostic(makeMission()),bridge=m.field.river.bridges[bridgeIndex];
 m.state.units=[];m.unitIndex.rebuild([]);m.updateMission=()=>{};
 for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;
 for(const base of Object.values(m.state.m02.bases))if(base.production)base.production.stopped=true;
 m.state.m02.observer.outcome='escaped';
 const a=bridge.points[0],b=bridge.points.at(-1),length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
 const offset=(p,along,side)=>({x:p.x+ux*along-uy*side,y:p.y+uy*along+ux*side});
 const groups=[[],[]],targets=[offset(b,180,0),offset(a,-180,0)];
 for(let direction=0;direction<2;direction++){
  const kind=opponent&&direction?'raider':'bukhanka',owner=opponent&&direction?'scavs':'rai';
  const needed=Math.floor((population+1-direction)/2),origin=direction?b:a,sign=direction?1:-1;
  for(let row=0;row<60&&groups[direction].length<needed;row++)for(let col=0;col<41&&groups[direction].length<needed;col++){
   const side=col===0?0:(col%2?1:-1)*Math.ceil(col/2)*22;
   const pose={...offset(origin,sign*(32+row*25),side),heading:Math.atan2(-ux,uy)+(direction?Math.PI:0),kind,owner};
   if(!m.inBounds(pose.x,pose.y)||!m.nav.terrainAllowed(pose.x,pose.y)||!m.vehicleMotionClear(pose,pose,pose))continue;
   groups[direction].push(m.addUnit(kind,owner,pose,{heading:pose.heading}));
  }
  assert.equal(groups[direction].length,needed,'Enough physically clear starting positions on each bank');
 }
 m.unitIndex.rebuild(m.state.units);m.explored.fill(255);m.visible.fill(255);
 if(opponent){
  const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
  for(const kind of ['bukhanka','raider'])Object.assign(m.config.units[kind],config.units[kind]);
  for(const unit of groups[1]){
   unit.hp=unit.maxHp=m.config.units.raider.hp;
   unit.raid=true;const goal=targets[1];unit.task={type:'move',...goal};
   unit.path=m.nav.findPath(unit,goal)??[];unit.routeOrder={destination:{...goal}};
  }
  m.unitIndex.rebuild(m.state.units);
 }
 assert(m.state.units.every(u=>m.vehicleMotionClear(u,u,u)),'Every actual starting hull, heading and kind must be clear');
 return {mission:m,groups,targets,bridge,centre:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},
  order(){return groups.filter((_,i)=>!opponent||i===0).map((units,i)=>m.submitOrder(units.map(u=>u.id),opponent?'attack-move':'move',targets[i]));}};
}
