// Test-only. Install before contact audit so its copy/geometry is excluded.
// Historical commandToMotionMs is PUBLISHED-ROUTE latency: it excludes new
// pending steering intent too. It must not be called input-to-first-motion.
// tools/minimal-command-marks.mjs observes both ownership modes without wrappers.
export function installFrameLatencyProbe(m,world,{now=()=>performance.now()}={}){
 const original={beginTick:m.beginTick,continueTick:m.continueTick,submitOrder:m.submitOrder,updateUnitSteps:m.updateUnitSteps,walk:m.walk,walkRepathSteps:m.walkRepathSteps};
 const ticks=[],commands=[],pending=new Map(),fogUpdates=[];
 const fog=world?.statistics.fog;let fogPixels=fog?.pixels??0,fogHistory=fog?.historyUpdates??0,fogCount=fog?.updates??0,current=null,serial=0;
 function endStatus(row,status,at=now()){row.status=status;row.observedMs=at-row.issuedAt;pending.delete(row.unit);}
 function recordMotion(row,unit,x,y,owned){
  if(!owned||row.status!=='pending'||unit.commandRevision!==row.revision||unit.pendingOrder||unit.hp<=0)return;
  row.distanceAfterAcceptance+=Math.hypot(unit.x-x,unit.y-y);
  if(row.distanceAfterAcceptance>=.1){const at=now();row.commandToMotionMs=at-row.issuedAt;row.motionAt=at;row.motionSimTime=m.state.time;endStatus(row,'moved',at);}
 }
 m.beginTick=function(...args){
  const started=now(),row={tick:++serial,start:started,simStart:m.state.time,workMs:0,slices:0,walkQueries:0};current=row;
  try{return original.beginTick.apply(this,args);}finally{row.workMs+=now()-started;row.simTime=m.state.time;}
 };
 m.continueTick=function(...args){
  if(!this.pendingTick||!current)return original.continueTick.apply(this,args);
  const row=current,started=now();
  try{return original.continueTick.apply(this,args);}finally{
   const ended=now();row.workMs+=ended-started;row.slices++;
   if(!this.pendingTick){row.end=ended;row.completionWallMs=ended-row.start;ticks.push(row);current=null;}
  }
 };
 m.walk=function(unit,...args){const before=unit.lastWalkRepath,result=original.walk.call(this,unit,...args);if(current&&unit.lastWalkRepath!==before)current.walkQueries++;return result;};
 if(original.walkRepathSteps)m.walkRepathSteps=function(...args){if(current)current.walkQueries++;return original.walkRepathSteps.apply(this,args);};
 m.submitOrder=function(ids,...args){
  const issuedAt=now(),before=ids.map(id=>this.entity(id)).filter(Boolean).map(unit=>({unit,stationary:Math.abs(unit.driveSpeed??0)<.1,x:unit.x,y:unit.y}));
  const result=original.submitOrder.call(this,ids,...args),returnedAt=now();
  if(result.ok)for(const entry of before){
   const old=pending.get(entry.unit);if(old)endStatus(old,'superseded',returnedAt);
   const row={...entry,id:entry.unit.id,issuedAt,issuedSimTime:m.state.time,submissionMs:returnedAt-issuedAt,revision:result.revision,status:'pending',distanceAfterAcceptance:0};commands.push(row);pending.set(entry.unit,row);
  }return result;
 };
 m.updateUnitSteps=function(unit,...args){
  const iterator=original.updateUnitSteps.call(this,unit,...args),row=pending.get(unit);if(!row)return iterator;
  return (function*(){try{while(true){
   const owned=unit.commandRevision===row.revision&&!unit.pendingOrder&&unit.hp>0;
   if(owned&&row.controllerReadyMs===undefined)row.controllerReadyMs=now()-row.issuedAt;
   const x=unit.x,y=unit.y,step=iterator.next();recordMotion(row,unit,x,y,owned);
   if(step.done)return step.value;yield step.value;
  }}finally{iterator.return?.();}})();
 };
 function sample(){for(const [unit,row] of pending)if(unit.hp<=0||m.entity(unit.id)!==unit)endStatus(row,'dead-or-removed');}
 function rendered(){
  if(fog&&fog.updates!==fogCount){fogUpdates.push({at:now(),simTime:m.state.time,updates:fog.updates-fogCount,pixels:fog.pixels-fogPixels,historyUpdates:fog.historyUpdates-fogHistory,sources:m.visionSources.length});fogCount=fog.updates;fogPixels=fog.pixels;fogHistory=fog.historyUpdates;}
 }
 function report(){const ended=now();return {
  definitions:{tickCompletionWallMs:'beginTick entry to final continueTick return, including inter-frame waits',tickWorkMs:'beginTick plus continueTick CPU durations, excluding contact audit wrapper',commandToMotionMs:'Historical published-route-only metric: submitOrder entry to >=0.1 movement after pendingOrder removal. EXCLUDES new pending-intent movement; NOT input-to-first-motion.',controllerReadyMs:'First controller execution observed with accepted revision; not exact publication time',censored:'Unfinished commands/tick retained; never counted as zero'},ticks,
  unfinishedTick:current&&{...current,observedWallMs:ended-current.start},commands:commands.map(({unit,...row})=>({...row,...(row.status==='pending'?{observedMs:ended-row.issuedAt,pendingOrder:unit.pendingOrder?.status??null,proposedOrder:unit.proposedOrder?.status??null}:{})})),fogUpdates};}
 return {sample,rendered,report,restore(){for(const [key,value] of Object.entries(original))if(value)m[key]=value;}};
}
