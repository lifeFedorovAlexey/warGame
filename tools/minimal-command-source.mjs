// Fail closed if the frozen source changes. No live game files are edited.
export function injectMinimalCommandMarks(file,source){
 const edits={
  'campaign/command-planner.js':[
   [' else delete unit.commandStartAfter;',' else delete unit.commandStartAfter;\n globalThis.__minimalMarks?.publish(mission,unit);'],
   ['  records.push(record);','  records.push(record);globalThis.__minimalMarks?.queued(m,record);'],
   [' start(record){',' start(record){\n  globalThis.__minimalMarks?.planner(this.mission,record);'],
  ],
  'campaign/mission.js':[
   ['   if(this.commandJob)this.commandJob.currentUnit=unit.id;','   if(this.commandJob){this.commandJob.currentUnit=unit.id;globalThis.__minimalMarks?.plan(this.commandJob.mission,unit,this.commandJob.revision);}'],
   ['   if(!path){failUnit(unit);continue;}','   if(path)globalThis.__minimalMarks?.ready(this.commandJob?.mission,unit,this.commandJob?.revision);\n   if(!path){failUnit(unit);continue;}'],
   ['{this.commandJob.waitingTick=true;yield;}','{globalThis.__minimalMarks?.wait(this.commandJob.mission,unit,this.commandJob.revision);this.commandJob.waitingTick=true;yield;}'],
   ['    if(!pending.iterator.next().done){if(performance.now()>=deadline)return false;continue;}',
    `    const __marks=globalThis.__minimalMarks,__row=__marks?.pending.get(unit);
    const __owned=__row&&unit.commandRevision===__row.revision&&!unit.pendingOrder&&unit.hp>0;
    if(__owned&&__row.controllerAt===null)__row.controllerAt=__marks.controllerTime();
    const __x=__owned?unit.x:0,__y=__owned?unit.y:0;
    const __step=pending.iterator.next();
    if(__owned&&unit.commandRevision===__row.revision&&!unit.pendingOrder)__marks.motion(this,unit,__row.revision,unit.x-__x,unit.y-__y,'route');
    if(!__step.done){if(performance.now()>=deadline)return false;continue;}`],
  ],
  'campaign/command-motion.js':[
   [" if(intent?.revision!==pending.revision)return false;"," if(intent?.revision!==pending.revision)return false;\n globalThis.__minimalMarks?.intent(mission,unit,pending.revision);"],
   ['  Object.assign(unit,pose);',"  const __dx=pose.x-unit.x,__dy=pose.y-unit.y;Object.assign(unit,pose);\n  globalThis.__minimalMarks?.motion(mission,unit,pending.revision,__dx,__dy,'intent');"],
  ],
 };
 for(const [from,to] of edits[file]??[]){if(source.split(from).length!==2)throw Error(`Minimal marker anchor must occur once: ${file}: ${from}`);source=source.replace(from,to);}
 return source;
}
