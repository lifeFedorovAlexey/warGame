import {vehicleContact} from '../campaign/vehicle-impact.js';
import {bodyEnvelope,bodyContact} from '../campaign/vehicle-overlap.js';
import {vehicleObstacle,trafficCollisionRequired} from '../campaign/vehicle-collision.js';
import {isInfantry} from '../campaign/scav-unit-profiles.js';

// Test instrumentation only. Copy completed tick poses while the tick still
// exists; perform geometry OUTSIDE Mission.advance's CPU deadline. Never infer
// contacts from calls to vehicleCollision, nor sample just once per second.
export function installTickContactAudit(mission){
 const original=mission.continueTick,queue=[],pool=[],rows=[],events=[],times=[];
 const activeEpisodes=new Set();
 let captures=0,pairChecks=0,geometryChecks=0,ellipsePenetrations=0,bodyPenetrations=0,requiredBodyPenetrations=0,episodes=0,minGap=Infinity,minBodyGap=Infinity,minRequiredGap=Infinity;
 let start=mission.state.time-(mission.pendingTick?.dt??0),lastTime=start,captureMs=0;
 function capture(){
  const began=performance.now(),entry=pool.pop()??{units:[]};entry.time=mission.state.time;entry.tick=++captures;entry.length=0;
  for(const u of mission.state.units){
   if(!vehicleObstacle(u))continue;
   const copy=entry.units[entry.length]??={factoryVisit:{}};entry.units[entry.length++]=copy;
   copy.id=u.id;copy.kind=u.kind;copy.owner=u.owner;copy.hp=u.hp;copy.x=u.x;copy.y=u.y;copy.heading=u.heading;copy.trafficOnScreen=u.trafficOnScreen;
   copy.factoryVisit.phase=u.factoryVisit?.phase;
  }
  queue.push(entry);lastTime=entry.time;captureMs+=performance.now()-began;
 }
 mission.continueTick=function(...args){const pending=this.pendingTick,result=original.apply(this,args);if(pending&&!this.pendingTick)capture();return result;};
 function flush(){
  if(!queue.length)return;const began=performance.now();
  while(queue.length){
   const entry=queue.shift(),current=new Set();let gap=Infinity,bodyGap=Infinity,requiredGap=Infinity,contacts=0,required=0;
   const units=entry.units,shapes=[];for(let i=0;i<entry.length;i++)shapes.push(bodyEnvelope(units[i],mission.config.worldScale,mission.field));
   for(let i=0;i<entry.length;i++)for(let j=0;j<i;j++){
    pairChecks++;const a=units[i],b=units[j],aa=shapes[i],bb=shapes[j];
    // OBB gap is the maximum of axis projections, not Euclidean distance.
    // One of either body's orthogonal axes has projection >= distance/sqrt(2).
    // Subtracting circumscribed radii therefore bounds BOTH reported gaps.
    const bound=Math.hypot(aa.x-bb.x,aa.y-bb.y)/Math.SQRT2-Math.hypot(aa.width,aa.depth)-Math.hypot(bb.width,bb.depth);
    if(bound>Math.max(0,gap,bodyGap,requiredGap))continue;
    geometryChecks++;const hit=vehicleContact(a,b,mission.config.worldScale,mission.field),body=bodyContact(aa,bb);
    const bodyRequired=!(isInfantry(a)&&isInfantry(b))&&!['entering','leaving'].includes(a.factoryVisit.phase)&&!['entering','leaving'].includes(b.factoryVisit.phase)&&trafficCollisionRequired(a,b);
    gap=Math.min(gap,hit.gap);bodyGap=Math.min(bodyGap,body.gap);if(bodyRequired)requiredGap=Math.min(requiredGap,body.gap);
    if(hit.gap<-.001)ellipsePenetrations++;
    if(body.gap<-.001){
     bodyPenetrations++;contacts++;if(bodyRequired){requiredBodyPenetrations++;required++;}
     const key=[a.id,b.id].sort().join('|');current.add(key);if(!activeEpisodes.has(key))episodes++;
     if(events.length<10000)events.push({tick:entry.tick,time:entry.time,ids:[a.id,b.id],gap:hit.gap,bodyGap:body.gap,required:bodyRequired,
      a:{x:a.x,y:a.y,heading:a.heading,owner:a.owner,visible:a.trafficOnScreen,infantry:isInfantry(a)},b:{x:b.x,y:b.y,heading:b.heading,owner:b.owner,visible:b.trafficOnScreen,infantry:isInfantry(b)}});
    }
   }
   activeEpisodes.clear();for(const key of current)activeEpisodes.add(key);
   minGap=Math.min(minGap,gap);minBodyGap=Math.min(minBodyGap,bodyGap);minRequiredGap=Math.min(minRequiredGap,requiredGap);
   rows.push({tick:entry.tick,time:entry.time,units:entry.length,gap,bodyGap,requiredGap,contacts,required});pool.push(entry);
  }
  times.push(performance.now()-began);
 }
 function reset(){flush();rows.length=events.length=times.length=0;activeEpisodes.clear();captures=pairChecks=geometryChecks=ellipsePenetrations=bodyPenetrations=requiredBodyPenetrations=episodes=0;minGap=minBodyGap=minRequiredGap=Infinity;start=lastTime=mission.state.time-(mission.pendingTick?.dt??0);captureMs=0;}
 const report=()=>{flush();return {completedTicks:captures,expectedTicks:Math.round((lastTime-start)/mission.config.simulationStep),start,end:lastTime,pairChecks,geometryChecks,ellipsePenetrations,bodyPenetrations,requiredBodyPenetrations,episodes,minGap,minBodyGap,minRequiredGap,captureMs,auditMs:times,rows,events,definition:'Signed vehicleContact ellipse gap and full bodyContact OBB gap at EVERY completed tick. <-0.001 is penetration. Required classification preserves existing offscreen/door rules; all penetrations are also reported.'};};
 return {flush,reset,report,restore(){mission.continueTick=original;}};
}
