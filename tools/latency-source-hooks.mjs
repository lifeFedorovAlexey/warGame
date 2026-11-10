// Test-server transformation only. Production files are never written.
export function injectLatencyHooks(file,source){
 const edits={
  'campaign/command-planner.js':[
   [' else delete unit.commandStartAfter;',' else delete unit.commandStartAfter;\n globalThis.__latencyEvent?.("published",mission,unit,unit.commandRevision);'],
  ],
  'campaign/mission.js':[
   ['   if(this.commandJob)this.commandJob.currentUnit=unit.id;','   if(this.commandJob){this.commandJob.currentUnit=unit.id;globalThis.__latencyEvent?.("unit-plan-start",this.commandJob.mission,unit,this.commandJob.revision);}'],
   ['   if(!path){failUnit(unit);continue;}','   globalThis.__latencyEvent?.("path-ready",this.commandJob?.mission,unit,this.commandJob?.revision,{found:!!path});\n   if(!path){failUnit(unit);continue;}'],
   ['   if(this.commandJob){delete unit.pendingOrder;','   globalThis.__latencyEvent?.("assigned",this.commandJob?.mission,unit,this.commandJob?.revision);\n   if(this.commandJob){delete unit.pendingOrder;'],
  ],
 };
 for(const [from,to] of edits[file]??[]){
  if(source.split(from).length!==2)throw new Error(`Latency hook anchor must occur once: ${file}: ${from}`);
  source=source.replace(from,to);
 }
 return source;
}
