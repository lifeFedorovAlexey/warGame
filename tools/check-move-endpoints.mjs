import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){
 const m=new Mission(config,field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(255);return m;
}
const results=[];
for(const kind of ['bukhanka','builder'])for(const action of kind==='builder'?['move']:['move','attack-move']){
 const m=fixture(),unit=m.addUnit(kind,'rai',{x:0,y:0},{heading:0}),goal={x:0,y:120};
 assert(m.order([unit.id],action,goal).ok);
 const accepted={...unit.routeOrder.destination};
 // Reproduce the old recovery contract: its available route ends near the
 // destination, while the accepted order still names the real destination.
 unit.path=[{x:accepted.x,y:accepted.y-15}];
 for(let tick=0;tick<300&&unit.task;tick++){
  m.advance(.1);m.effects=[];
  if(!unit.task)assert(Math.hypot(unit.x-accepted.x,unit.y-accepted.y)<2,'A truncated path is not arrival');
 }
 assert(!unit.task,'The final connector must actually be driven');
 assert.deepEqual(unit.routeOrder.destination,accepted,'Recovery preserves the accepted endpoint');
 assert.equal(unit.hp,unit.maxHp);
 results.push({kind,action,arrivedAt:m.state.time,error:Math.hypot(unit.x-accepted.x,unit.y-accepted.y)});
}
{
 const m=fixture(),unit=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),goal={x:0,y:120};
 assert(m.order([unit.id],'move',goal).ok);
 unit.path=[{x:0,y:105}];
 for(let tick=0;tick<10;tick++)m.advance(.1);
 const copy=fixture();copy.load(m.save());copy.state.bounds=[0,0,127,127];copy.rebuildNavigation();
 const saved=copy.entity(unit.id);
 for(let tick=0;tick<300&&saved.task;tick++)copy.advance(.1);
 assert(!saved.task&&Math.hypot(saved.x-goal.x,saved.y-goal.y)<2,'Save/load keeps the uncompleted final connector');
 assert(copy.order([saved.id],'move',{x:100,y:120}).ok);copy.stop([saved.id]);
 const stopped={x:saved.x,y:saved.y};for(let tick=0;tick<20;tick++)copy.advance(.1);
 assert.deepEqual({x:saved.x,y:saved.y},stopped,'Stop does not resume a stored destination');
 results.push({saveLoad:true,stop:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});
fs.writeFileSync('campaign/reports/move-endpoints.json',JSON.stringify({passed:true,results},null,2));
console.log(JSON.stringify({passed:true,results}));
