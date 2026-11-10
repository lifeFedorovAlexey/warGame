// Diagnostic only: timings include observer overhead; never a performance gate.
// Install after frame-latency-probe and before frame-contact-audit.
export function installCommandLatencyProbe(m,{CommandPlanner,now=()=>performance.now(),host=globalThis}={}){
 const restore=[],events=[],searches=[],planning=[],ticks=[],slow=[],advances=[];
 const pending=new Map();let current=null,frame=0,serial=0,context=null,searchSerial=0,overheadMs=0,eventCount=0;
 const key=(revision,id)=>`${revision}:${id}`;
 const rowFor=(u)=>pending.get(key(u.commandRevision,u.id));
 function event(type,revision,id,extra={}){const start=now();events.push({type,at:start,frame,tick:current?.id??null,simTime:m.state.time,revision,id,...extra});eventCount++;overheadMs+=now()-start;}
 function patch(object,name,wrap){const own=Object.hasOwn(object,name),original=object[name];if(typeof original!=='function')return;
  object[name]=wrap(original);restore.push(()=>{if(own)object[name]=original;else delete object[name];});}
 function phase(){const p=m.pendingTick;if(!p)return null;return p.goalRelease?'goalRelease':p.cursor<p.units.length?`unit:${p.units[p.cursor].id}`:!p.overlapsComplete?'overlaps':p.iterator?'economy':'finalize';}
 function account(name,start,end,extra={}){const ms=end-start;
  if(current){current.cpu[name]=(current.cpu[name]??0)+ms;if(ms>=1)current.slow.push({name,start,end,ms,...extra});}
  if(ms>=8)slow.push({name,start,end,ms,tick:current?.id??null,frame,...extra});
 }
 // Each iterator resume is timed separately. Gaps are never counted as CPU.
 function wrapGenerator(original,receiver,args,name,metadata={},record=null){
  const iterator=original.apply(receiver,args);let first=true,finished=false;
  const wrapped={
   next(value){const start=now(),previous=context;context={...previous,...metadata,name};
    if(first){first=false;if(record){record.start=start;record.parts=[];record.cpuMs=0;}}
    let step;try{step=iterator.next(value);return step;}finally{
     const end=now();account(name,start,end,metadata);
     if(record){record.cpuMs+=end-start;record.parts.push({start,end,frame,tick:current?.id??null});if(step?.done){record.end=end;record.wallMs=end-record.start;record.found=Array.isArray(step.value)?step.value.length>0:null;}}
     context=previous;finished=!!step?.done;
    }
   },
   return(value){if(finished)return {done:true,value};try{return iterator.return?.(value)??{done:true,value};}finally{finished=true;if(record&&!record.end)record.cancelledAt=now();}},
   throw(error){return iterator.throw?iterator.throw(error):(()=>{throw error;})();},
   [Symbol.iterator](){return this;},
  };return wrapped;
 }
 const oldHook=host.__latencyEvent;
 host.__latencyEvent=(type,mission,unit,revision,extra)=>{if(mission!==m||!pending.has(key(revision,unit?.id)))return;event(type,revision,unit.id,extra);
  if(type==='published'){const row=pending.get(key(revision,unit.id));row.published=true;row.publishedAt=now();event('publication-gate',revision,unit.id,{commandStartAfter:unit.commandStartAfter??null});}
 };
 restore.push(()=>{if(oldHook===undefined)delete host.__latencyEvent;else host.__latencyEvent=oldHook;});
 patch(m,'submitOrder',original=>function(ids,...args){const start=now(),result=original.call(this,ids,...args),end=now();
  if(result.ok)for(const id of ids){for(const row of pending.values())if(row.id===id&&!row.ended){row.ended=true;event('superseded',row.revision,id);}
   pending.set(key(result.revision,id),{id,revision:result.revision,distance:0});events.push({type:'received',at:start,frame,tick:current?.id??null,simTime:m.state.time,revision:result.revision,id});event('submitted',result.revision,id,{submissionMs:end-start});
  }return result;
 });
 patch(m,'advance',original=>function(...args){const start=now();frame++;try{return original.apply(this,args);}finally{advances.push({frame,start,end:now(),pendingTick:current?.id??null,phase:phase(),accumulator:m.accumulator});}});
 patch(m,'beginTick',original=>function(...args){const start=now();current={id:++serial,start,cpu:{},slow:[],parts:[],simStart:m.state.time};
  try{return original.apply(this,args);}finally{const end=now();current.parts.push({name:'beginTick',start,end,frame});current.simTime=m.state.time;
   for(const row of pending.values())if(!row.ended&&!row.tickEntered){row.tickEntered=true;event('tick-entered',row.revision,row.id);}
  }
 });
 patch(m,'continueTick',original=>function(...args){if(!current)return original.apply(this,args);const row=current,start=now(),before=phase();
  try{return original.apply(this,args);}finally{const end=now();row.parts.push({name:'continueTick',start,end,frame,before,after:phase()});if(!m.pendingTick){row.end=end;row.wallMs=end-row.start;row.workMs=row.parts.reduce((s,p)=>s+p.end-p.start,0);row.gapMs=row.wallMs-row.workMs;ticks.push(row);current=null;}}
 });
 patch(m,'updateUnitSteps',original=>function(unit,...args){const iterator=wrapGenerator(original,this,[unit,...args],'controller',{unit:unit.id,kind:unit.kind}),next=iterator.next;
  iterator.next=function(value){const tracked=rowFor(unit),owned=tracked&&!tracked.ended&&!unit.pendingOrder&&unit.hp>0;
   if(tracked&&!tracked.ended&&!tracked.seenController){tracked.seenController=true;event('controller-seen',tracked.revision,unit.id,{pendingOrder:!!unit.pendingOrder});}
   if(owned&&!tracked.eligible&&(unit.commandStartAfter===undefined||m.state.time>unit.commandStartAfter)){tracked.eligible=true;event('controller-eligible',tracked.revision,unit.id);}
   const x=unit.x,y=unit.y,result=next.call(iterator,value);
   if(owned&&unit.commandRevision===tracked.revision&&!unit.pendingOrder&&unit.hp>0){const d=Math.hypot(unit.x-x,unit.y-y);tracked.distance+=d;
    if(d>1e-8&&!tracked.firstMotion){tracked.firstMotion=true;event('first-displacement',tracked.revision,unit.id,{distance:d});}
    if(tracked.distance>=.1){tracked.ended=true;event('motion-0.1',tracked.revision,unit.id,{distance:tracked.distance});}
   }return result;
  };return iterator;
 });
 for(const name of ['vehiclePathSteps','updateEconomySteps'])patch(m,name,original=>function(...args){const job=this.commandJob;return wrapGenerator(original,this,args,name,{revision:job?.revision,unit:job?.currentUnit??context?.unit});});
 for(const name of ['walk','updateMission','updateFog','updateProjectiles'])patch(m,name,original=>function(...args){const start=now(),previous=context;context={...previous,name};try{return original.apply(this,args);}finally{account(name,start,now(),{unit:previous?.unit});context=previous;}});
 patch(Object.getPrototypeOf(m.nav),'findPathSteps',original=>function(...args){const parent=context,record={id:++searchSerial,parent:parent?.name,unit:parent?.unit,revision:parent?.revision,from:{x:args[0].x,y:args[0].y},to:{x:args[1].x,y:args[1].y}};searches.push(record);return wrapGenerator(original,this,args,'findPathSteps',parent,record);});
 if(CommandPlanner){
  patch(CommandPlanner.prototype,'start',original=>function(record){if(this.mission===m)for(const id of record.ids)if(pending.has(key(record.revision,id)))event('planner-start',record.revision,id);
   return original.call(this,record);
  });
  patch(CommandPlanner.prototype,'advance',original=>function(...args){if(this.mission!==m)return original.apply(this,args);const start=now(),previous=context;context={name:'command-planning'};try{return original.apply(this,args);}finally{planning.push({name:'command',start,end:now(),frame,revision:this.active?.record.revision??null,waitingTick:!!this.active?.runtime.waitingTick});context=previous;}});
 }
 for(const name of ['update','advancePlanning'])patch(m.trafficCoordinator,name,original=>function(...args){const start=now(),previous=context;context={name:`traffic.${name}`};try{return original.apply(this,args);}finally{const end=now();account(`traffic.${name}`,start,end);if(name==='advancePlanning')planning.push({name:'traffic',start,end,frame});context=previous;}});
 return {report(){return {definitions:{diagnosticOnly:true,geometryAndGameplayUnchanged:true,sourceHooks:['unit-plan-start','path-ready','assigned','published'],controllerEligible:'accepted revision, no pendingOrder, commandStartAfter expired; subsequent traffic holds may still stop motion',gapMs:'tick wall minus beginTick/continueTick work; includes render, planning, audit and rAF waits',cpu:'inclusive category durations; do not add nested categories',eventOverhead:'only event push bookkeeping timed; wrapper/clock/profiler overhead is NOT fully measured'},events,searches,planning,ticks,unfinishedTick:current,advances,slow,observer:{eventCount,eventBookkeepingMs:overheadMs}};},restore(){for(const fn of restore.reverse())fn();}};
}
