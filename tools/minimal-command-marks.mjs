// Test-only scalar timestamps. No method/prototype replacement, generator
// wrapper, per-frame timer, serialization, sampling profiler or polling loop.
export function installMinimalCommandMarks(m,{now=()=>performance.now(),host=globalThis}={}){
 const groups=[],pending=new WeakMap(),byRevision=new Map();let armed=null,clockReads=0;
 const time=()=>{clockReads++;return now();};
 const stamp=(row,name)=>{if(row&&row[name]===null)row[name]=time();};
 const get=(mission,unit,revision)=>mission===m?byRevision.get(revision)?.members.get(unit.id):null;
 const api={pending,controllerTime:time,
  arm(ids){
   if(armed)throw Error('Already armed');
   const rows=ids.map(id=>({id,revision:null,planAt:null,readyAt:null,publishAt:null,controllerAt:null,firstMotionAt:null,routeMotionAt:null,intentControllerAt:null,
    firstMotionMode:null,planAttempts:0,readyAttempts:0,routeDistance:0,intentDistance:0,intentThresholdAt:null,routeThresholdAt:null,boundaryWaits:0,
    publishedDuringTick:null,publishedSimTime:null,commandStartAfter:null,waitReason:null,status:'pending'}));
   const group={revision:null,receivedAt:null,queuedAt:null,plannerAt:null,returnedAt:null,starts:0,rows,members:new Map(rows.map(r=>[r.id,r]))};
   for(const row of rows){const unit=m.entity(row.id);if(unit)pending.set(unit,row);}
   groups.push(group);armed=group;group.receivedAt=time();
  },
  returned(result){if(!armed)return;armed.returnedAt=time();armed.result={...result};if(!result.ok)for(const row of armed.rows)row.status='rejected';armed=null;},
  queued(mission,record){if(mission!==m||!armed)return;const group=armed;group.revision=record.revision;group.queuedAt=time();
   group.cohorts=record.cohorts.map(ids=>ids.slice());group.atomic=!!record.atomic;group.preservesAccepted=!!record.preservesAccepted;
   for(const row of group.rows)row.revision=record.revision;byRevision.set(record.revision,group);
  },
  planner(mission,record){if(mission!==m)return;const group=byRevision.get(record.revision);if(!group)return;group.starts++;stamp(group,'plannerAt');},
  plan(mission,unit,revision){const row=get(mission,unit,revision);if(row){row.planAttempts++;stamp(row,'planAt');}},
  ready(mission,unit,revision){const row=get(mission,unit,revision);if(row){row.readyAttempts++;stamp(row,'readyAt');}},
  wait(mission,unit,revision){const row=get(mission,unit,revision);if(row){row.boundaryWaits++;if(row.waitReason===null){const tick=m.pendingTick;row.waitReason=tick?.goalRelease?'goalRelease':tick?.overlaps?'overlaps':tick?.iterator?'controller-or-economy':'passage';}}},
  publish(mission,unit){const row=get(mission,unit,unit.commandRevision);if(!row||row.publishAt!==null)return;
   row.publishAt=time();row.publishedDuringTick=!!m.pendingTick;row.publishedSimTime=m.state.time;row.commandStartAfter=unit.commandStartAfter??null;
  },
  intent(mission,unit,revision){stamp(get(mission,unit,revision),'intentControllerAt');},
  motion(mission,unit,revision,dx,dy,mode){const row=get(mission,unit,revision);if(!row||unit.hp<=0||!(Math.abs(dx)>1e-8||Math.abs(dy)>1e-8))return;
   if(row.firstMotionAt===null){row.firstMotionAt=time();row.firstMotionMode=mode;row.firstMotionSimTime=m.state.time;}
   if(mode==='route'){stamp(row,'routeMotionAt');if(row.routeThresholdAt===null){row.routeDistance+=Math.hypot(dx,dy);if(row.routeDistance>=.1){stamp(row,'routeThresholdAt');row.status='moved';pending.delete(unit);}}}
   else if(row.intentThresholdAt===null){row.intentDistance+=Math.hypot(dx,dy);if(row.intentDistance>=.1)stamp(row,'intentThresholdAt');}
  },
  report(){return {definitions:{noWrappers:true,timestampsOnly:true,firstMotion:'first nonzero displacement owned by this new revision, including pending steering intent; old accepted route excluded',routeThreshold:'historical metric: >=0.1 accumulated movement only after pendingOrder is removed',controller:'first resume of the accepted revision with no pendingOrder; commandStartAfter may still block it',queue:'received/queued/planner/planAt are distinct; planAt is per-unit queue exit',clockReads:'actual reads of observer clock, NOT production performance.now() calls',null:'not observed; never zero-filled'},clockReads,groups:groups.map(({members,...g})=>({...g,rows:g.rows.map(r=>({...r}))}))};},
  restore(){if(host.__minimalMarks===api)delete host.__minimalMarks;},
 };
 if(host.__minimalMarks)throw Error('Minimal marks already installed');host.__minimalMarks=api;return api;
}
