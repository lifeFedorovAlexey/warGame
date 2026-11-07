import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TerrainNavigator} from '../campaign/navigation.js';
import {sharedRouteTree} from '../campaign/shared-route-tree.js';
import {gradeSpeed,surfaceTravelCost} from '../campaign/road-traffic.js';
const finish=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
const field=(slope=0)=>({extent:1024,half:512,cellMetres:32,heightAt:(x,y)=>slope*x,gradientAt:()=>({x:slope,y:0}),
 roadNetwork:{paths:[{id:'straight',from:'a',to:'b',width:40,points:[{x:-512,y:0},{x:512,y:0}]}]},roadBlendAt:(x,y)=>Math.max(0,Math.min(1,(20-Math.abs(y))/2.5))});
const results=[];
{
 const nav=new TerrainNavigator(field(.15),{bounds:[0,0,32,32]}),tree=sharedRouteTree(nav,{x:400,y:0},true);
 const from={x:-128,y:0},to={x:0,y:0},path=finish(tree.between(from,to));
 assert(path?.length);assert.deepEqual(path.at(-1),to);assert(path.every(p=>p.x<=to.x),'Join at the first common ancestor, without a detour to x400');
 assert.equal(new Set(path.map(p=>p.x+','+p.y)).size,path.length,'No loop in a joined tree corridor');
 const other={x:128,y:0},up=finish(tree.between(to,other)),down=finish(tree.between(other,to));
 const cost=(start,path)=>{let value=0;for(const end of path){assert(nav.lineClear(start,end));value+=nav.travelCost(start,end,true);start=end;}return value;};
 const uphill=cost(to,up),downhill=cost(other,down);assert(uphill>downhill,'Reverse branch costs use the actual travel direction');
 assert(tree.travelCost(to,other)>tree.travelCost(other,to),'Exact-segment cost cache preserves direction');
 const hits=tree.costCacheHits;finish(tree.between(from,to));assert(tree.costCacheHits>hits,'Repeated branch smoothing reuses exact directed segment costs');
 assert(tree.segmentCosts.size<=8192);
 for(let x=-256;x<256;x+=8){const a={x,y:0},b={x:x+8,y:0};assert.equal(nav.lineClear(a,b),nav.lineClear(b,a),'Absolute-grade edge passability is symmetric');}
 const original=nav.lineClear;nav.lineClear=function(a,b,...args){return b.x<a.x?false:original.call(this,a,b,...args);};
 assert.equal(finish(tree.between(other,to)),null,'An invalid reverse-direction connector/edge cannot escape validation');
 results.push({case:'two-branch exact endpoints / first common ancestor / reverse directed validation',uphill,downhill});
}
for(const slope of [.15,-.15]){
 const nav=new TerrainNavigator(field(slope),{bounds:[0,0,32,32]}),goal={x:256,y:0},from={x:-256,y:0,kind:'bukhanka',heading:-Math.PI/2};
 const tree=sharedRouteTree(nav,goal,true),path=finish(tree.route(from));assert(path?.length);assert.deepEqual(path.at(-1),goal);
 const [col,row]=nav.grid(from.x,from.y),expected=512*surfaceTravelCost(1,Math.abs(slope),true)/gradeSpeed(slope);
 assert(Math.abs(tree.cost[row*nav.size+col]-expected)<.01,'Reverse relaxation must charge the forward uphill/downhill grade');
 let previous=from;for(const point of path){assert(nav.lineClear(previous,point,false,true));previous=point;}
 results.push({case:'directional grade '+slope,cost:tree.cost[row*nav.size+col],expected,expanded:tree.expanded,bytes:tree.bytes});
}
{
 const nav=new TerrainNavigator(field(),{bounds:[0,0,32,32]});
 nav.rebuild([{id:'wall',hp:1,x:0,y:0,halfWidth:20,halfDepth:110}]);
 const tree=sharedRouteTree(nav,{x:-350,y:260},false),from={x:-181,y:-73},to={x:177,y:-77};
 const path=finish(tree.between(from,to));assert(path?.length);assert.deepEqual(path.at(-1),to,'Continuous endpoints are not snapped to tree nodes');
 let previous=from;for(const point of path){assert(nav.lineClear(previous,point,false,true),'Both shared branches and exact connectors avoid the wall');previous=point;}
 assert.equal(new Set(path.map(p=>p.x+','+p.y)).size,path.length);
 results.push({case:'two-branch wall route / exact continuous connectors',waypoints:path.length});
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
