import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createDamageState} from '../campaign/damage-state.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {updateSalvage} from '../campaign/vehicle-salvage.js';
import {pickupTarget} from '../campaign/pickup-orders.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){
 const m=new Mission(config,field);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.artifacts=[];
 m.state.salvage.items=[];m.state.salvage.enabled=true;m.state.salvage.wanted=['hood-guard'];m.state.salvage.recipes=['hood-guard'];
 m.state.pendingCinematics=[];m.state.bounds=[0,0,127,127];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;
}
const artifact=m=>{const a={id:'a-test',key:'mg-tower',x:0,y:140,collected:false};m.state.artifacts.push(a);return a;};
const module=m=>{const item={id:'scrap-test',stock:'guard-stock',sourceUnit:'donor',sourceKind:'bukhanka',sourcePart:7,x:0,y:140,heading:0,bornAt:-3,readyAt:-1,expiresAt:240};m.state.salvage.items.push(item);return item;};
const group=m=>[-70,0,70].map((x,i)=>m.addUnit('bukhanka','rai',{x,y:i===1?30:0}));
const installed=u=>{u.damage=createDamageState();u.damage.parts[22]={installed:true,detached:false,damage:0};};
const tests=[];function test(name,fn){fn();tests.push(name);}
test('Adjacent items respect the clicked point and an explicit item ID',()=>{
 const m=fixture(),a=artifact(m),item=module(m);item.x=5;
 assert.equal(pickupTarget(m,{x:item.x,y:item.y}).item.id,item.id);
 assert.equal(pickupTarget(m,a).item.id,a.id);
 assert.equal(pickupTarget(m,item).item.id,item.id);
});
test('One nearest artifact collector; repeat clicks retain the path; bystanders stay still',()=>{
 const m=fixture(),units=group(m),a=artifact(m),ids=units.map(u=>u.id),original=units.map(u=>({x:u.x,y:u.y}));
 const result=m.order(ids,'move',a);assert.equal(result.assigned,1);assert.deepEqual(result.assignedIds,[units[1].id]);assert.deepEqual(result.unassigned,[]);
 const path=units[1].path;for(let i=0;i<10;i++)assert.equal(m.order(ids,'move',a).assigned,1);
 assert.equal(units[1].path,path,'Repeated orders do not replace a checked route');
 let minimum=Infinity;
 for(let i=0;i<300&&Math.hypot(units[1].x-a.x,units[1].y-a.y)>=24;i++){
  m.advance(.1);for(const u of [units[0],units[2]])minimum=Math.min(minimum,vehicleClearance(u,units[1],config.worldScale,field));
 }
 assert(Math.hypot(units[1].x-a.x,units[1].y-a.y)<24,'The collector physically reaches the item');assert(minimum>=0);
 for(const i of [0,2]){assert.equal(units[i].task,null);assert.deepEqual({x:units[i].x,y:units[i].y},original[i]);}
 // Collection uses the production mission loop, not a simulated UI event.
 Mission.prototype.updateMission.call(m);assert(a.collected&&m.state.artifactKeys.includes(a.key));
 m.updateUnit(units[1],.1);assert(!units[1].task&&!units[1].path.length);
});
test('Nearest missing compatible module wins; a closer already-equipped unit does not travel',()=>{
 const m=fixture(),units=group(m),item=module(m);installed(units[1]);
 const result=m.order(units.map(u=>u.id),'move',item);assert.equal(result.assigned,1);assert.deepEqual(result.assignedIds,[units[0].id]);
 assert(!units[1].task&&!units[2].task);
 for(let i=0;i<600&&!units[0].damage?.parts?.[22]?.installed;i++)m.advance(.1);
 assert(units[0].damage?.parts?.[22]?.installed,'Drive onto the actual module and install it');
 assert.equal(m.state.salvage.items.length,0);assert(!units[0].task&&!units[0].path.length);
 assert.equal(units[1].hp,320,'The existing module is not duplicated');assert(!units[2].damage);
});
test('No compatible recipient or recipe causes no group move and preserves other orders',()=>{
 const m=fixture(),units=group(m),item=module(m);for(const u of units)installed(u);
 assert(m.order([units[0].id],'move',{x:-200,y:50}).ok);const before=structuredClone(units);
 assert.equal(m.order(units.map(u=>u.id),'move',item).ok,false);assert.deepEqual(units,before);
 delete units[0].damage;m.state.salvage.recipes=[];assert.equal(m.order(units.map(u=>u.id),'move',item).ok,false);
 m.state.salvage.recipes=['hood-guard'];m.state.salvage.enabled=false;assert.equal(m.order(units.map(u=>u.id),'move',item).ok,false);
});
test('One owner across selections, reservation survives save, Stop releases automatic pickup',()=>{
 const m=fixture(),units=group(m),item=module(m);
 m.order([units[0].id],'move',item);m.order([units[1].id,units[2].id],'move',item);
 assert(!units[0].task);assert.equal(units.filter(u=>u.task?.salvageId===item.id).length,1);
 const copy=fixture();copy.load(m.save());copy.state.bounds=m.state.bounds.slice();copy.rebuildNavigation();
 const owner=copy.entity(units[1].id),bystander=copy.entity(units[2].id),savedItem=copy.state.salvage.items[0];
 assert.equal(copy.order(units.map(u=>u.id),'move',savedItem).assignedIds[0],owner.id,'Keep the saved reservation on a repeat click');
 bystander.x=bystander.previousX=item.x;bystander.y=bystander.previousY=item.y;updateSalvage(copy);
 assert(!bystander.damage&&copy.state.salvage.items.length===1,'A passer-by cannot steal an explicitly reserved item');
 copy.stop([owner.id]);updateSalvage(copy);assert(bystander.damage?.parts?.[22]?.installed,'Stop releases the reservation');
});
test('Expired, collected or no-longer-needed items cancel only the pickup order',()=>{
 for(const reason of ['expired','gone','installed']){
  const m=fixture(),units=group(m),item=module(m);m.order(units.map(u=>u.id),'move',item);
  m.order([units[0].id],'move',{x:-200,y:50});const task=units[0].task;
  if(reason==='expired')item.expiresAt=0;if(reason==='gone')m.state.salvage.items=[];if(reason==='installed')installed(units[1]);
  m.updateUnit(units[1],.1);assert(!units[1].task&&!units[1].path.length&&!units[1].detour);assert.equal(units[0].task,task);
 }
});
test('A falling module is awaited in contact without repeated parking manoeuvres',()=>{
 const m=fixture(),item=module(m),u=m.addUnit('bukhanka','rai',{x:item.x,y:item.y});item.readyAt=2;
 assert(m.order([u.id],'move',item).ok);
 for(let i=0;i<15;i++)m.advance(.1);
 assert.equal(u.x,item.x);assert.equal(u.y,item.y);assert(!u.detour&&!u.path.length&&!u.damage);assert(u.task?.salvageId);
 for(let i=0;i<10;i++)m.advance(.1);assert(u.damage?.parts?.[22]?.installed&&!u.task);
});
test('Legacy duplicate routes to the item are stopped, not unrelated selected orders',()=>{
 const m=fixture(),units=group(m),a=artifact(m);
 for(const u of units){u.task={type:'move',x:a.x,y:a.y};u.path=[{x:a.x,y:a.y}];u.routeOrder={request:{x:a.x,y:a.y},destination:{x:a.x,y:a.y}};}
 assert.equal(m.order(units.map(u=>u.id),'move',a).assigned,1);
 assert.equal(units.filter(u=>u.task).length,1);assert.equal(units[1].task.artifactId,a.id);
});
test('If the closest vehicle is enclosed, the next reachable collector is used',()=>{
 const m=fixture(),a=artifact(m),near=m.addUnit('bukhanka','rai',{x:0,y:70}),far=m.addUnit('bukhanka','rai',{x:-100,y:0});
 for(const side of [-1,1]){
  m.addStructure('generator','rai',{x:side*25,y:70},{completed:true,progress:1,halfWidth:4,halfDepth:29});
  m.addStructure('generator','rai',{x:0,y:70+side*25},{completed:true,progress:1,halfWidth:29,halfDepth:4});
 }
 m.rebuildNavigation();const result=m.order([near.id,far.id],'move',a);
 assert.deepEqual(result.assignedIds,[far.id]);assert(!near.task&&far.task.artifactId===a.id);
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
