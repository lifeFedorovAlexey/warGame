import assert from 'node:assert/strict';
import fs from 'node:fs';
import {progressMission} from './check-navigation-public-progress.mjs';
import {selectedOrderRoutes} from '../campaign/order-route-state.js';

const report=[],m=progressMission(),u=m.addUnit('bukhanka','rai',{x:0,y:0}),v=m.addUnit('bukhanka','rai',{x:50,y:0});
const selected=new Set([u.id]),read=()=>selectedOrderRoutes(m,selected);
const command=(ids,action,target,append=false)=>{const result=m.submitOrder(ids,action,target,{append});assert(result.ok);return result;};
const finishPlanning=()=>{for(let i=0;i<3000&&(u.pendingOrder||u.proposedOrder||v.pendingOrder||v.proposedOrder);i++)m.advance(0,{budgetMs:5});};
command([u.id],'move',{x:0,y:100});command([u.id],'move',{x:100,y:100},true);command([u.id],'attack-move',{x:100,y:250},true);
assert.deepEqual(read()[0].points.map(p=>[p.action,p.state]),[['move','planning'],['move','queued'],['attack-move','queued']]);
finishPlanning();assert.equal(read()[0].points[0].state,'active');
report.push('Current and queued destinations preserve order after calculation');
assert.equal(read()[0].placements.length,1);assert.deepEqual([read()[0].placements[0].x,read()[0].placements[0].y],[u.routeOrder.destination.x,u.routeOrder.destination.y]);
const before=JSON.stringify(m.state);for(let i=0;i<30;i++)read();assert.equal(JSON.stringify(m.state),before);report.push('Rendering data does not mutate authoritative state');
selected.clear();assert.equal(read().length,0);selected.add(v.id);assert.equal(read().length,0);selected.clear();selected.add(u.id);assert.equal(read()[0].points.length,3);report.push('Selection hides unrelated orders and restores the chosen route');
command([u.id],'move',{x:-100,y:50});assert.equal(read()[0].points.length,1);assert.equal(read()[0].points[0].x,-100);m.stop([u.id]);assert.equal(read().length,0);report.push('Replacement and Stop leave no stale markers');
command([u.id,v.id],'move',{x:0,y:250});command([u.id,v.id],'move',{x:200,y:250},true);selected.add(v.id);
assert.equal(read().length,1);assert.deepEqual(new Set(read()[0].units),new Set([u.id,v.id]));
assert(m.configureGroup([u.id,v.id],{leaderId:u.id}).ok);selected.delete(v.id);assert.equal(read()[0].units.length,2);report.push('Shared group orders form one route, including leader-only selection');
finishPlanning();
assert.equal(read()[0].placements.length,2);
for(const p of read()[0].placements){const goal=m.entity(p.unit).routeOrder.destination;assert.deepEqual([p.x,p.y],[goal.x,goal.y]);}
assert(Math.hypot(read()[0].placements[0].x-read()[0].placements[1].x,read()[0].placements[0].y-read()[0].placements[1].y)>10);
report.push('Every member has its own accepted arrival slot, including leader-only selection');
m.stop([u.id,v.id]);m.state.commandGroups=[];delete u.commandGroupId;delete v.commandGroupId;
const enemy=m.addUnit('raider','scavs',{x:0,y:150});m.visibleAt=()=>true;command([u.id],'attack',enemy);
assert.equal(read()[0].points[0].action,'attack');const known={x:enemy.x,y:enemy.y};enemy.x=400;m.visibleAt=()=>false;
assert.equal(read()[0].points[0].x,known.x,'Hidden live target coordinates must not leak');m.visibleAt=()=>true;assert.equal(read()[0].points[0].x,400);
finishPlanning();u.task={type:'attack',targetId:enemy.id};delete u.pendingOrder;delete u.proposedOrder;
assert.equal(read()[0].points[0].targetId,enemy.id);assert(read()[0].points[0].radius>0);
u.combatDeployment={resume:{...u.task},targetId:enemy.id,goal:{x:20,y:30}};u.task={type:'combat-position',x:20,y:30};
assert.equal(read()[0].points[0].targetId,enemy.id);assert.deepEqual([read()[0].placements[0].x,read()[0].placements[0].y],[20,30]);
report.push('Entity targets without copied coordinates and combat deployment retain their target and firing position');
enemy.hp=0;assert.equal(read().length,0);report.push('Attack follows visible targets, preserves last known point in fog and clears destroyed targets');
m.stop([u.id]);command([u.id],'move',{x:0,y:120});u.pendingOrder.status='blocked';u.pendingOrder.reason='route-unreachable';
assert.equal(read()[0].points[0].state,'blocked');m.stop([u.id]);report.push('Blocked orders are not displayed as confirmed destinations');
command([u.id],'move',{x:0,y:160});finishPlanning();const goal=structuredClone(u.routeOrder);u.task=null;u.path=[];assert(u.routeOrder&&goal);assert.equal(read().length,0);report.push('Completed movement hides its stale routeOrder record');
command([u.id],'move',{x:0,y:200});command([u.id],'move',{x:80,y:260},true);
finishPlanning();
const save=m.save(),loaded=progressMission();loaded.config.initialMapBounds=[0,0,127,127];loaded.load(save);
assert.equal(selectedOrderRoutes(loaded,selected)[0].points.length,2);report.push('Save/load reconstructs markers from orders');
assert.deepEqual(selectedOrderRoutes(loaded,selected)[0].placements,read()[0].placements);
u.routeContinuation={request:{x:0,y:200},frontier:{x:0,y:60},phase:'following'};
assert.equal(read()[0].placements.length,0,'A temporary route frontier must not be drawn as an arrival slot');
u.routeContinuation.destination={x:5,y:200};assert.equal(read()[0].placements[0].x,5);delete u.routeContinuation;
report.push('Streaming routes expose accepted final slots, never temporary frontiers');
u.factoryVisit={phase:'inside'};assert.equal(read().length,0);delete u.factoryVisit;u.hp=0;assert.equal(read().length,0);report.push('Garage interiors and destroyed vehicles have no order markers');
{
 const drive=progressMission(),cars=[-35,0,35].map(x=>drive.addUnit('bukhanka','rai',{x,y:0})),chosen=new Set(cars.map(u=>u.id));
 assert(drive.submitOrder([...chosen],'attack-move',{x:0,y:150}).ok);
 for(let i=0;i<3000&&cars.some(u=>u.pendingOrder||u.proposedOrder);i++)drive.advance(0,{budgetMs:5});
 const slots=selectedOrderRoutes(drive,chosen).flatMap(r=>r.placements);assert.equal(slots.length,3);
 const saved=drive.save(),loadedDrive=progressMission();loadedDrive.config.initialMapBounds=[0,0,127,127];loadedDrive.load(saved);
 assert.deepEqual(selectedOrderRoutes(loadedDrive,chosen).flatMap(r=>r.placements),slots);
 for(let i=0;i<1000&&cars.some(u=>u.task||u.path.length||u.pendingOrder);i++)drive.advance(.1,{budgetMs:6});
 for(const slot of slots){const car=drive.entity(slot.unit);assert(Math.hypot(car.x-slot.x,car.y-slot.y)<2.01);assert(!car.task);}
 assert.equal(selectedOrderRoutes(drive,chosen).length,0);
 report.push('Three vehicles physically arrive at their displayed attack-move slots; save/load retains the slots');
}
{
 const large=progressMission(),ids=[];for(let i=0;i<500;i++)ids.push(large.addUnit('bukhanka','rai',{x:(i%20)*50,y:Math.floor(i/20)*50}).id);
 assert(large.submitOrder(ids,'move',{x:0,y:1800},{append:true}).ok);
 const start=performance.now(),routes=selectedOrderRoutes(large,new Set(ids)),milliseconds=performance.now()-start;
 assert.equal(routes.length,1);assert.equal(routes[0].units.length,500);assert.equal(routes[0].points.length,1);report.push({case:'500 units share one waypoint',milliseconds});
}
fs.mkdirSync('campaign/previews/playtest-WG-014-015/after',{recursive:true});fs.writeFileSync('campaign/previews/playtest-WG-014-015/after/state.json',JSON.stringify({passed:true,cases:report},null,2));console.log(JSON.stringify({passed:true,cases:report}));
