import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {formationRequest,expandCommandIds} from '../campaign/group-command.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';

const results=[];
function create(count=6){
 const mission=fixture(),units=Array.from({length:count},(_,i)=>mission.addUnit(i===0?'command':'bukhanka','rai',
  {x:(i%3-1)*40,y:-Math.floor(i/3)*36},{heading:0}));
 return {mission,units,ids:units.map(u=>u.id)};
}
for(const formation of ['column','line','dispersed','concentrate']){
 const {mission:m,units,ids}=create(),response=m.configureGroup(ids,{formation});assert(response.ok);
 const layout=formationRequest(m,units,{x:0,y:260}),slots=units.map(u=>layout.slots.get(u.id)),owners={...layout.group.slots};
 assert.equal(new Set(slots.map(p=>p.x+','+p.y)).size,units.length);
 for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)assert(vehicleClearance({...units[i],...slots[i]}, {...units[j],...slots[j]},m.config.worldScale,m.field)>0);
 formationRequest(m,units,{x:1,y:260});assert.deepEqual(layout.group.slots,owners,'Small repeat clicks cannot exchange slots');
 const order=m.submitOrder([response.leaderId],'move',{x:0,y:260});assert(order.ok&&order.assigned===units.length);
 let minGap=Infinity,arrived=false,lastTime=m.state.time;const unexplained=[],waiting={};
 for(let frame=0;frame<8000;frame++){
  m.advance(1/80,{budgetMs:6});m.effects=[];
  if(m.state.time!==lastTime){
   for(const unit of units)if((unit.navigation?.waitSeconds??0)>.50001){
    const reason=unit.navigation.reason;waiting[reason]=(waiting[reason]??0)+m.state.time-lastTime;
    if(reason==='unclassified-stop'&&!unexplained.includes(unit.id))unexplained.push(unit.id);
   }
   lastTime=m.state.time;
  }
  for(let i=0;i<units.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(units[i],units[j],m.config.worldScale,m.field));
  if(units.every(u=>!u.pendingOrder&&!u.task&&!u.path.length&&!u.detour&&!u.yieldReturn)){arrived=true;break;}
 }
 const errors=units.map(u=>u.routeOrder?Math.hypot(u.x-u.routeOrder.destination.x,u.y-u.routeOrder.destination.y):null);
 results.push({formation,arrived,seconds:m.state.time,minGap,errors,unexplained,waiting,damage:units.map(u=>u.maxHp-u.hp),states:units.map(u=>({id:u.id,navigation:u.navigation,task:u.task,return:u.yieldReturn}))});
 if(!arrived)fs.writeFileSync('tools/fixtures/group-'+formation+'-failed.json',m.save());
}
{
 const {mission:m,units,ids}=create();
 const leaderId=units[3].id;m.configureGroup(ids,{leaderId,formation:'column'});
 m.configureGroup(ids,{formation:'line'});
 assert.equal(m.state.commandGroups[0].leaderId,leaderId,'Changing formation preserves the explicit commander');
}
{
 const {mission:m,units,ids}=create();m.configureGroup(ids,{formation:'concentrate'});
 m.order([units[0].id],'move',{x:0,y:200});const goals=units.slice(1).map(u=>({...u.routeOrder.destination}));
 m.damage(units[0],100000);m.advance(.1);
 const group=m.state.commandGroups[0];assert.notEqual(group.leaderId,units[0].id);
 assert.deepEqual(units.slice(1).map(u=>u.routeOrder.destination),goals,'Leader loss preserves every accepted goal');
 assert.equal(expandCommandIds(m,[group.leaderId]).length,units.length-1);
 const restored=create().mission;restored.load(m.save());
 assert.deepEqual(restored.state.commandGroups,m.state.commandGroups);
 restored.stop([group.leaderId]);assert(restored.state.units.filter(u=>u.hp>0).every(u=>!u.task&&!u.pendingOrder));
 results.push({leaderDeath:true,save:true,groupStop:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});
const passed=results.every(r=>r.leaderDeath||r.arrived&&r.errors.every(e=>e!==null&&e<2)&&!r.unexplained.length&&r.minGap>=0&&r.damage.every(d=>d===0));
fs.writeFileSync('campaign/reports/group-command.json',JSON.stringify({passed,results},null,2));
console.log(JSON.stringify({passed,results:results.map(({states,...r})=>r)},null,2));
assert(passed,'Every formation must physically arrive without contacts; see group-command.json');
