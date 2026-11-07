import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Mission} from '../campaign/mission.js';
import {sharedRouteTree} from '../campaign/shared-route-tree.js';
import {driveStep} from '../campaign/vehicle-motion.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),consume=job=>{let step;do{step=job.next();}while(!step.done);return step.value;};
const input=process.argv.slice(2).find(arg=>!arg.startsWith('--'))??'campaign/reports/navigation-browser-connected-500-fixture.json',fixture=read(input),config=read('assets/campaign/alpha/mission01/gameplay.json');
const maximumSegment=Number(process.argv.find(arg=>arg.startsWith('--max-segment='))?.split('=')[1]??Infinity);
const groupProfile=process.argv.includes('--group-profile');
const raw=createHeightfield(read('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,read('assets/maps/alpha/roads.json'));
const mission=new Mission(config,field);mission.load(fixture.initialSave);mission.state.bounds=JSON.parse(fixture.initialSave).state.bounds.slice();mission.rebuildNavigation();
const nav=mission.nav.createSearchContext(),units=fixture.ids.map(id=>mission.entity(id)),goal=fixture.goal;
const centre={x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length};
const length=Math.hypot(goal.x-centre.x,goal.y-centre.y),forward={x:(goal.x-centre.x)/length,y:(goal.y-centre.y)/length},right={x:forward.y,y:-forward.x};
const columns=Math.ceil(Math.sqrt(units.length));units.sort((a,b)=>(b.x-a.x)*forward.x+(b.y-a.y)*forward.y);
for(let i=0;i<units.length;i+=columns){const row=units.slice(i,i+columns).sort((a,b)=>(a.x-b.x)*right.x+(a.y-b.y)*right.y);units.splice(i,row.length,...row);}
const anchor=nav.nearest(goal.x,goal.y,3);if(!anchor)throw Error('No static anchor');
const commonPaved=nav.roads.nearPavement(centre)&&nav.roads.nearPavement(anchor);
mission.unitIndex.rebuild(mission.state.units);mission.unitIndexActive=true;
const positionHash=()=>createHash('sha256').update(JSON.stringify(mission.state.units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,path:u.path,task:u.task,hp:u.hp})))).digest('hex');
const initialHash=positionHash(),result=[],totals={branchMs:0,firstSegmentMs:0,hullPreviewMs:0};
function firstSegment(tree,from,branch){
 const path=branch.map(id=>tree.position(id)),roads=!!nav.roads.buckets.size;let next=0,cost=roads?tree.travelCost(from,path[0]):0;
 while(next+1<path.length&&tree.clearSegment(from,path[next+1])){
  if(Math.hypot(path[next+1].x-from.x,path[next+1].y-from.y)>maximumSegment)break;
  const travel=roads?tree.travelCost(from,path[next+1]):0;
  if(roads&&travel>cost+tree.travelCost(path[next],path[next+1])+.04*nav.cell)break;
  next++;cost=travel;
 }
 return path[next];
}
const began=performance.now();
for(const unit of units){
 let started=performance.now();const paved=groupProfile?commonPaved:nav.roads.nearPavement(unit)&&nav.roads.nearPavement(anchor),tree=sharedRouteTree(nav,anchor,paved);
 const branch=consume(tree.branch(unit)),branchMs=performance.now()-started;totals.branchMs+=branchMs;
 if(!branch){result.push({id:unit.id,branchMs,unreachable:true});continue;}
 started=performance.now();const prefix=firstSegment(tree,unit,branch),firstSegmentMs=performance.now()-started;totals.firstSegmentMs+=firstSegmentMs;
 started=performance.now();const blockers=new Set(),distance=Math.hypot(prefix.x-unit.x,prefix.y-unit.y);
 const grade=(field.heightAt(prefix.x,prefix.y)-field.heightAt(unit.x,unit.y))/Math.max(1,distance);
 const pose=driveStep(unit,prefix,.1,{speed:mission.unitSpec(unit).speed*nav.roads.factor(unit.x,unit.y),grade,scale:config.worldScale,tolerance:2,
  allowed:(from,to)=>mission.vehicleMotionClear(unit,from,to,.52,blockers)});
 const hullPreviewMs=performance.now()-started;totals.hullPreviewMs+=hullPreviewMs;
 result.push({id:unit.id,branchMs,firstSegmentMs,hullPreviewMs,readyCpuMs:performance.now()-began,prefix,distance,
  firstStepHullSafe:!!pose&&Math.hypot(pose.x-unit.x,pose.y-unit.y)>.01,blockerIds:[...blockers].map(u=>u.id)});
}
const elapsedMs=performance.now()-began;mission.unitIndexActive=false;if(positionHash()!==initialHash)throw Error('A preview mutated live poses/tasks/paths');
const report={scope:'Read-only lower-bound experiment: real shared static tree + first weighted-smoothed segment + one exact swept hull preview. NO orders installed, NO coordinator admission, NO arrival slots, NO FPS/first-response claim.',
 input,groupProfile,commonPaved:groupProfile?commonPaved:null,maximumSegment:Number.isFinite(maximumSegment)?maximumSegment:null,
 count:units.length,elapsedMs,totals,unreachable:result.filter(r=>r.unreachable).length,firstStepHullSafe:result.filter(r=>r.firstStepHullSafe).length,
 firstPrefixCpuMs:result[0].readyCpuMs,lastPrefixCpuMs:result.at(-1).readyCpuMs,
 theoreticalFramesAt2msBudget:Math.ceil(elapsedMs/2),theoreticalWallAt80Fps:Math.ceil(elapsedMs/2)/80,
 trees:[...nav.sharedRouteTrees.values()].map(t=>({queries:t.queries,expanded:t.expanded,clearCacheHits:t.clearanceCacheHits,costCacheHits:t.costCacheHits})),units:result};
fs.writeFileSync('campaign/reports/shared-prefix-estimate-'+(groupProfile?'group':'individual')+'-'+maximumSegment+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,units:undefined}));
