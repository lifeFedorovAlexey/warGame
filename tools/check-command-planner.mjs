import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';

const results=[];
function cars(m,count){return Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',
 {x:(i%10-4.5)*32,y:-Math.floor(i/10)*32},{heading:0}));}
function settle(m,max=2000){
 for(let frame=0;frame<max;frame++){
  m.advance(1/80,{budgetMs:6});
  if(!m.state.commandOrders.some(r=>['queued','planning'].includes(r.status)))return frame+1;
 }
 throw Error('Command did not finish within '+max+' frames');
}
{
 const m=fixture(),cohort=Array.from({length:6},(_,i)=>m.addUnit('bukhanka','rai',
  {x:i<3?-6:6,y:(i%3-1)*26},{heading:Math.PI}));
 const other=Array.from({length:44},(_,i)=>m.addUnit('bukhanka','rai',{x:400+(i%8)*40,y:-500-Math.floor(i/8)*40},{heading:0}));
 m.submitOrder([...cohort,...other].map(u=>u.id),'move',{x:0,y:500});m.advance(1/80,{budgetMs:0});
 assert.deepEqual(m.state.commandOrders[0].cohorts.map(ids=>ids.length),[6],'A small start component is preserved inside a large command');
 m.damage(cohort[0],20,null);const hp=cohort[0].hp;let departure=false;
 for(let i=0;i<160;i++){
  m.advance(1/80,{budgetMs:6});
  const pending=cohort.filter(u=>u.pendingOrder).length;assert(pending===0||pending===6,'A local component is committed atomically');
  if(cohort.every(u=>u.detour?.departure))departure=true;
 }
 assert(departure,'The actual coupled departure controller sees all six ready vehicles');
 assert.equal(cohort[0].hp,hp,'Committing navigation must not restore old health');
 results.push({case:'atomic six-car component within a 50-car order',passed:true});
}
{
 const m=fixture(),units=cars(m,50),ids=units.map(u=>u.id);let searches=0;
 const compute=m.nav.computePathSteps;m.nav.computePathSteps=function*(...args){searches++;return yield* compute.apply(this,args);};
 const start=performance.now(),response=m.submitOrder(ids,'move',{x:0,y:500}),submitMs=performance.now()-start;
 assert(response.ok&&response.pending===50);assert.equal(searches,0,'submitOrder must not search synchronously');
 let firstMotion=null,pendingAtFirst=null;
 for(let frame=0;frame<160;frame++){
  m.advance(1/80,{budgetMs:6});
  if(firstMotion===null&&units.some((u,i)=>Math.hypot(u.x-(i%10-4.5)*32,u.y+Math.floor(i/10)*32)>.5)){
   firstMotion=(frame+1)/80;pendingAtFirst=units.filter(u=>u.pendingOrder).length;
  }
 }
 assert(firstMotion!==null&&firstMotion<=.5,'A free leading car starts promptly');
 assert(units.every(u=>!u.pendingOrder));
 const before=searches,repeated=m.submitOrder(ids,'move',{x:1,y:500});
 assert(repeated.reused);m.advance(1/80,{budgetMs:6});assert.equal(searches,before);
 results.push({case:'50 incremental starts',submitMs,firstMotion,pendingAtFirst,planner:m.commandPlanner.stats});
}
{
 const m=fixture(),units=cars(m,20),ids=units.map(u=>u.id);
 const first=m.submitOrder(ids,'move',{x:0,y:500});m.stop(ids);
 const second=m.submitOrder(ids,'move',{x:0,y:500});assert.notEqual(second.revision,first.revision);
 m.advance(1/80,{budgetMs:0});const latest=m.submitOrder(ids,'move',{x:300,y:400});settle(m);
 assert(units.every(u=>!u.pendingOrder&&u.commandRevision===latest.revision));
 assert(units.every(u=>u.routeOrder.request.x===300&&u.routeOrder.request.y===400),'An obsolete result cannot overwrite the latest click');
 results.push({case:'Stop/same click and superseding revisions',passed:true});
}
{
 const m=fixture(),units=cars(m,50),ids=units.map(u=>u.id);m.submitOrder(ids,'move',{x:0,y:500});m.advance(1/80,{budgetMs:0});
 assert(units.some(u=>u.pendingOrder));
 const loaded=fixture();loaded.load(m.save());loaded.state.bounds=m.state.bounds.slice();loaded.rebuildNavigation();settle(loaded);
 assert(ids.every(id=>!loaded.entity(id).pendingOrder&&loaded.entity(id).routeOrder.request.y===500));
 results.push({case:'saved pending intents reconstruct searches',passed:true});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:0,y:0});
 const building=m.addStructure('factory','rai',{x:0,y:300},{completed:true,progress:1});m.rebuildNavigation();
 m.submitOrder([u.id],'move',{x:0,y:300});settle(m);
 assert.equal(u.pendingOrder?.status,'blocked');
 let searches=0;const compute=m.commandPlanner.nav.computePathSteps;
 m.commandPlanner.nav.computePathSteps=function*(...args){searches++;return yield* compute.apply(this,args);};
 assert(m.submitOrder([u.id],'move',{x:0,y:300}).reused);
 const distant=m.addUnit('raider','scavs',{x:1000,y:1000});distant.x+=1;
 const bystander=m.addUnit('bukhanka','rai',{x:120,y:300});
 const retryAt=m.state.commandOrders.at(-1).retryAt;
 for(let i=0;i<160;i++){bystander.heading+=.001;m.advance(1/80,{budgetMs:6});}
 assert.equal(searches,0,'A repeated failure and an unrelated distant car do not restart A*');
 assert.equal(m.state.commandOrders.at(-1).retryAt,retryAt,'A known static blocker does not retry because another nearby car rotates');
 building.hp=0;m.rebuildNavigation();m.advance(1/80,{budgetMs:6});settle(m);
 assert(!u.pendingOrder&&u.path.length,'Removing the obstruction automatically retries the unchanged intent');
 results.push({case:'negative result/local invalidation/retry',passed:true});
}
{
 const m=fixture();m.addStructure('factory','rai',{x:0,y:200},{completed:true,progress:1});m.rebuildNavigation();
 const from={x:0,y:0,kind:'bukhanka',heading:0},to={x:0,y:400};
 const expected=m.nav.computePath(from,to),context=m.nav.createSearchContext();
 m.nav.workDeadline=0;const movement=m.nav.computePathSteps(from,to);assert.equal(movement.next().done,false);
 context.workDeadline=Infinity;assert(context.findPath({x:-150,y:0,kind:'bukhanka',heading:0},to)?.length);
 m.nav.workDeadline=Infinity;let result;do{result=movement.next();}while(!result.done);
 assert.deepEqual(result.value,expected,'Command search must not corrupt a suspended movement search');
 results.push({case:'private A* scratch isolation',passed:true});
}
{
 const m=fixture(),u=m.addUnit('bukhanka','rai',{x:50,y:0});
 m.addStructure('factory','rai',{x:0,y:200},{completed:true,progress:1});m.state.bounds=[64,0,127,127];m.rebuildNavigation();
 m.submitOrder([u.id],'move',{x:50,y:500});m.advance(1/80,{budgetMs:0});
 assert(m.commandPlanner.active,'The command search must actually be suspended');
 const revision=m.nav.topologyRevision;m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 assert(m.nav.topologyRevision>revision,'Changing map bounds invalidates the suspended topology');
 settle(m);assert.deepEqual(m.commandPlanner.nav.bounds,m.state.bounds);assert(!u.pendingOrder);
 results.push({case:'map expansion refreshes suspended private search',passed:true});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/command-planner.json',JSON.stringify({passed:true,results},null,2));
console.log(JSON.stringify({passed:true,results},null,2));
