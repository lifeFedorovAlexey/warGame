import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TerrainNavigator} from '../campaign/navigation.js';
import {sharedRouteTree} from '../campaign/shared-route-tree.js';
import {gradeSpeed,surfaceTravelCost} from '../campaign/road-traffic.js';
const finish=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
const field=(slope=0)=>({extent:1024,half:512,cellMetres:32,heightAt:(x,y)=>slope*x,gradientAt:()=>({x:slope,y:0}),
 roadNetwork:{paths:[{id:'straight',from:'a',to:'b',width:40,points:[{x:-512,y:0},{x:512,y:0}]}]},roadBlendAt:(x,y)=>Math.max(0,Math.min(1,(20-Math.abs(y))/2.5))});
const results=[];
for(const slope of [.15,-.15]){
 const nav=new TerrainNavigator(field(slope),{bounds:[0,0,32,32]}),goal={x:256,y:0},from={x:-256,y:0,kind:'bukhanka',heading:-Math.PI/2};
 const tree=sharedRouteTree(nav,goal,true),path=finish(tree.route(from));assert(path?.length);assert.deepEqual(path.at(-1),goal);
 const [col,row]=nav.grid(from.x,from.y),expected=512*surfaceTravelCost(1,Math.abs(slope),true)/gradeSpeed(slope);
 assert(Math.abs(tree.cost[row*nav.size+col]-expected)<.01,'Reverse relaxation must charge the forward uphill/downhill grade');
 let previous=from;for(const point of path){assert(nav.lineClear(previous,point,false,true));previous=point;}
 results.push({case:'directional grade '+slope,cost:tree.cost[row*nav.size+col],expected,expanded:tree.expanded,bytes:tree.bytes});
}
{
 const nav=new TerrainNavigator(field(),{bounds:[0,0,32,32]}),goal={x:256,y:0},from={x:-256,y:0,kind:'bukhanka',heading:-Math.PI/2};
 const tree=sharedRouteTree(nav,goal,true);nav.workDeadline=performance.now()-1;
 const job=tree.route(from);assert.equal(job.next().done,false,'A shared search yields within its assigned budget');nav.workDeadline=Infinity;
 assert(finish(job));const expanded=tree.expanded;assert(finish(tree.route({x:-200,y:0,kind:'bukhanka',heading:-Math.PI/2})));
 assert.equal(tree.expanded,expanded,'A nearer member uses already settled distances');
 const far={id:'far',hp:1,x:-450,y:450,halfWidth:8,halfDepth:8};nav.rebuild([far]);
 assert.equal(sharedRouteTree(nav,goal,true),tree,'An unrelated footprint keeps the shared search tree');
 nav.rebuild([far,{id:'near',hp:1,x:0,y:0,halfWidth:20,halfDepth:20}]);
 const replaced=sharedRouteTree(nav,goal,true);assert.notEqual(replaced,tree,'A changed dependency region invalidates settled distances');
 const path=finish(replaced.route(from));assert(path?.length);let previous=from;for(const point of path){assert(nav.lineClear(previous,point,false,true));previous=point;}
 for(const x of [128,160,192])sharedRouteTree(nav,{x,y:100},false);
 assert.equal(nav.sharedRouteTrees.size,2,'The cache is bounded to two trees');
 results.push({case:'budget / reused work / regional invalidation / bounded memory',expanded,bytes:[...nav.sharedRouteTrees.values()].reduce((n,t)=>n+t.bytes,0)});
}
{
 const nav=new TerrainNavigator(field(),{bounds:[0,0,32,32]});nav.rebuild([
  {x:0,y:-100,halfWidth:120,halfDepth:12},{x:0,y:100,halfWidth:120,halfDepth:12},
  {x:-100,y:0,halfWidth:12,halfDepth:120},{x:100,y:0,halfWidth:12,halfDepth:120}].map((s,i)=>({...s,id:'wall'+i,hp:1})));
 const tree=sharedRouteTree(nav,{x:0,y:0},false);assert.equal(finish(tree.route({x:0,y:-300})),null);
 assert(tree.length===0&&nav.lastExhaustedReachability,'UNREACHABLE is a finite exhausted component proof');
 const expanded=tree.expanded;assert.equal(finish(tree.route({x:100,y:-300})),null);assert.equal(tree.expanded,expanded);
 results.push({case:'shared unreachable component',expanded});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/shared-route-tree.json',JSON.stringify({passed:true,results},null,2));
console.log(JSON.stringify({passed:true,results}));
