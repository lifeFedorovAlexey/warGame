import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {SharedRouteTree} from '../campaign/shared-route-tree.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const config=read('assets/campaign/alpha/mission01/gameplay.json');
const input=process.argv[2]??'campaign/reports/navigation-browser-connected-500-fixture.json',fixture=read(input);
const raw=createHeightfield(read('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,read('assets/maps/alpha/roads.json'));
const clear=SharedRouteTree.prototype.clearSegment,results=[];
// This isolates ONLY planning CPU on identical stationary live bodies. It is
// not a movement/FPS/first-response benchmark; the browser test measures those.
for(const cached of [false,true,true,false]){
 SharedRouteTree.prototype.clearSegment=cached?clear:function(a,b){return this.nav.lineClear(a,b);};
 try{
  const m=new Mission(config,field);m.load(fixture.initialSave);
  m.state.bounds=JSON.parse(fixture.initialSave).state.bounds.slice();m.rebuildNavigation();
  const response=m.submitOrder(fixture.ids,'move',fixture.goal);assert(response.ok);
  const began=performance.now();let frames=0;
  while(m.state.commandOrders.some(o=>o.status==='queued'||o.status==='planning')){
   m.commandPlanner.advance(2);frames++;assert(performance.now()-began<10000,'Bounded planning-only fixture did not finish');
  }
  const units=fixture.ids.map(id=>m.entity(id));assert(units.every(u=>u.routeOrder&&!u.pendingOrder));
  const geometry=JSON.stringify(units.map(u=>({id:u.id,request:u.routeOrder.request,destination:u.routeOrder.destination,path:u.path})));
  results.push({cached,wallMs:performance.now()-began,plannerCpuMs:m.commandPlanner.stats.cpuMs,frames,
   pathHash:createHash('sha256').update(geometry).digest('hex'),assigned:units.length,
   entries:[...m.commandPlanner.nav.sharedRouteTrees.values()].reduce((n,t)=>n+t.segmentClearance.size,0),
   hits:[...m.commandPlanner.nav.sharedRouteTrees.values()].reduce((n,t)=>n+t.clearanceCacheHits,0)});
 }finally{SharedRouteTree.prototype.clearSegment=clear;}
}
assert.equal(new Set(results.map(r=>r.pathHash)).size,1,'Caching must preserve EVERY exact route and destination');
const report={passed:true,scope:'Planning-only comparison on identical stationary bodies; no simulation, renderer or FPS claim.',input,results};
fs.writeFileSync('campaign/reports/shared-route-cache-comparison.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
