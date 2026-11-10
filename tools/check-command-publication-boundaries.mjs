// Focused frozen-baseline invariants, not the known-red whole safety suite.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/reports/frame-budget/path-search/variants/baseline/runtime/campaign/mission.js';
import {commandBoundary,activateCommand} from '../campaign/reports/frame-budget/path-search/variants/baseline/runtime/campaign/command-planner.js';
const config=JSON.parse(fs.readFileSync('campaign/reports/frame-budget/path-search/variants/baseline/runtime/assets/campaign/alpha/mission01/gameplay.json'));
function fixture(){const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(1);return m;}
const pose=u=>({x:u.x,y:u.y,heading:u.heading,hp:u.hp}),results=[];
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),start=pose(u);m.submitOrder([u.id],'move',{x:120,y:400});m.tick(.1);
 assert(u.pendingOrder&&Math.hypot(u.x-start.x,u.y-start.y)>.05);assert(!u.routeOrder,'No full route needed for actual new-command movement');results.push({case:'pending intent moves before any planner slice',distance:Math.hypot(u.x-start.x,u.y-start.y)});
}
{
 const m=fixture(),units=Array.from({length:20},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%10-4.5)*32,y:-Math.floor(i/10)*32},{heading:0})),u=units.at(-1),start=pose(u);
 m.submitOrder([u.id],'move',{x:400,y:500});m.beginTick(.1,true);m.continueTick(performance.now()-1);assert(m.pendingTick&&!m.pendingTick.iterator);
 for(let i=0;i<100&&u.pendingOrder;i++)m.commandPlanner.advance(2);
 assert(!u.pendingOrder);assert.equal(u.commandStartAfter,m.state.time);assert.deepEqual(pose(u),start);const tickTime=m.state.time;
 m.finishPendingStep();assert.deepEqual(pose(u),start,'Same-tick new route does not consume old traffic decisions');m.tick(.1);assert.equal(u.commandStartAfter,undefined);assert(Math.hypot(u.x-start.x,u.y-start.y)>.01);
 results.push({case:'publish between controllers, begin movement after fresh traffic snapshot',tickTime,nextTick:m.state.time});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0});m.submitOrder([u.id],'move',{x:400,y:500});
 // A suspended owner is a fixture input; planner/physics remain production.
 m.pendingTick={iterator:{},units:[u],cursor:0};
 for(let i=0;i<8;i++)m.commandPlanner.advance(2);assert(u.pendingOrder&&!u.routeOrder);assert.equal(m.commandPlanner.active.runtime.waitingTick,true);
 m.pendingTick=null;for(let i=0;i<100&&u.pendingOrder;i++)m.commandPlanner.advance(2);assert(!u.pendingOrder);results.push({case:'suspended controller prevents live route replacement',passed:true});
}
{
 const m=fixture(),units=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',{x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI}));m.submitOrder(units.map(u=>u.id),'move',{x:0,y:500});
 const record=m.state.commandOrders[0];assert.equal(record.atomic,true);assert.deepEqual(record.cohorts.map(g=>g.length),[6]);assert(units.every(u=>u.pendingOrder.holdForRoute));
 const poses=units.map(pose);m.tick(.1);assert.deepEqual(units.map(pose),poses);let partial=false,complete=false;
 for(let i=0;i<1000&&!complete;i++){m.commandPlanner.advance(2);const pending=units.filter(u=>u.pendingOrder).length;partial||=pending>0&&pending<6;complete=pending===0;}
 assert(complete&&!partial);assert.deepEqual(units.map(pose),poses);results.push({case:'coupled reverse cohort publishes all six at one boundary',atomic:true,partialPublication:false});
}
{
 const m={pendingTick:null,state:{time:1}},u={};assert(commandBoundary(m));activateCommand(m,u);assert.equal(u.commandStartAfter,undefined);
 for(const field of ['iterator','goalRelease','overlaps']){m.pendingTick={[field]:{}};assert(!commandBoundary(m));}
 m.pendingTick={};assert(commandBoundary(m));assert(!commandBoundary(m,true));activateCommand(m,u);assert.equal(u.commandStartAfter,1);results.push({case:'controller, goal release, overlaps and passage barriers',passed:true});
}
const result={passed:true,scope:'Frozen baseline semantics only. This does not prove that every possible same-tick redesign would collide; it proves current ownership/snapshot contracts and existing atomic publication.',results};
const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
