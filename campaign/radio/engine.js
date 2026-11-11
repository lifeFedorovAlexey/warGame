import {compileCondition,stableHash,validateLibrary} from './conditions.js';
import {radioClip} from './audio.js';
import {renderRadioLine,speechKey} from './wording.js';

const sorted=values=>[...new Set(values??[])].sort();
const limitMap=(map,cap)=>{while(map.size>cap)map.delete(map.keys().next().value);};
const signatures=lines=>lines.map(l=>l.repeatText??speechKey(l.bodyText??l.text));
const arrays=['actorIds','affectedIds','targetIds','objectIds','orderIds','incidentIds','destroyedIds','killedIds','woundedIds','evacuatedIds','producedIds','researchIds','objectiveIds'];
function createBucket(event,rule){
 return {key:'',type:event.type,squadId:event.squadId??'global',start:event.simTime,end:event.simTime+rule.windowSimSeconds,
  firstTick:event.tickId,lastTick:event.tickId,rawEventCount:0,countsByType:{},facts:{},resolution:'open',severity:0,
  concurrentByTick:{},maxConcurrentCount:0,
  ...Object.fromEntries(arrays.map(key=>[key,[]]))};
}
function ingest(bucket,event){
 bucket.rawEventCount++;bucket.lastTick=event.tickId;bucket.countsByType[event.type]=(bucket.countsByType[event.type]??0)+1;
 bucket.concurrentByTick??={};const concurrent=bucket.concurrentByTick[event.tickId]??[];
 bucket.concurrentByTick[event.tickId]=sorted([...concurrent,...event.affectedIds]);
 bucket.maxConcurrentCount=Math.max(bucket.maxConcurrentCount??0,bucket.concurrentByTick[event.tickId].length);
 for(const key of arrays){
  let values=event[key]??event.facts?.[key]??[];
  if(key==='orderIds')values=event.orderId?[event.orderId]:event.orderIds??[];
  if(key==='incidentIds')values=event.incidentId?[event.incidentId]:[];
  bucket[key]=sorted([...bucket[key],...values]);
 }
 // Absence of a personnel fact is not zero. One unknown crew makes the summary unknown.
 if('crewKnown' in event.facts)bucket.crewKnown=bucket.crewKnown===false?false:event.facts.crewKnown;
 const hitCount=(bucket.facts.hitCount??0)+(event.facts.hitCount??0);
 Object.assign(bucket.facts,event.facts);if(hitCount)bucket.facts.hitCount=hitCount;
 bucket.severity=Math.max(bucket.severity,Number(event.facts.severity)||0);
 bucket.resolution=event.facts.resolution??bucket.resolution;
 bucket.combatContext ||= !!event.flags?.hasCombat;
}
export function aggregateContext(bucket,now,frequency=0){
 return {eventTypes:Object.keys(bucket.countsByType),primaryEventType:bucket.type,scopeKey:bucket.key,
  squadId:bucket.squadId,incidentIds:bucket.incidentIds,orderIds:bucket.orderIds,actorIds:bucket.actorIds,affectedIds:bucket.affectedIds,targetIds:bucket.targetIds,
  windowStartTick:bucket.firstTick,windowEndTick:bucket.lastTick,rawEventCount:bucket.rawEventCount,
  uniqueActorCount:bucket.actorIds.length,affectedUnitCount:bucket.affectedIds.length,uniqueAffectedUnitCount:bucket.affectedIds.length,
  uniqueTargetCount:bucket.targetIds.length,uniqueObjectCount:bucket.objectIds.length,distinctOrderCount:bucket.orderIds.length,
  incidentCount:bucket.incidentIds.length,concurrentCount:bucket.maxConcurrentCount??0,rollingCount:bucket.affectedIds.length,
  destroyedVehicleCount:bucket.destroyedIds.length,killedCrewCount:bucket.crewKnown===true?bucket.killedIds.length:null,
  woundedCrewCount:bucket.facts.woundedKnown===true?bucket.woundedIds.length:null,evacuatedCount:bucket.facts.evacuatedKnown===true?bucket.evacuatedIds.length:null,
  producedUnitCount:bucket.producedIds.length,completedResearchCount:bucket.researchIds.length,uniqueObjectiveCount:bucket.objectiveIds.length,
  completedCount:bucket.resolution==='resolved'?1:0,failedCount:bucket.resolution==='failed'?1:0,
  countsByType:{...bucket.countsByType},facts:{...bucket.facts,...(bucket.crewKnown!==undefined?{crewKnown:bucket.crewKnown}:{})},severity:bucket.severity,
  firstOccurrence:frequency===0,historicalFrequency:frequency,durationSimSeconds:Math.max(0,now-(bucket.facts.incidentStartedAt??bucket.start)),
  coverageRatio:bucket.facts.totalActive>0?bucket.objectIds.length/bucket.facts.totalActive:null,
  successRate:['resolved','failed'].includes(bucket.resolution)?(bucket.resolution==='resolved'?1:0):null,
  resolution:bucket.resolution,combatContext:bucket.combatContext??false};
}

export class RadioEngine{
 constructor(library,{missionId='mission',snapshot=()=>({speakers:[]}),legacy=()=>false,saved}={}){
  this.library=validateLibrary(library);this.settings=library.settings;this.missionId=missionId;this.snapshot=snapshot;this.legacy=legacy;
  this.index=new Map();this.conditions=new Map();this.phraseGuards=new Map();this.graphGuards=new WeakMap();
  for(const rule of library.rules){const list=this.index.get(rule.eventType)??[];list.push(rule);this.index.set(rule.eventType,list);this.conditions.set(rule.id,compileCondition(rule.preconditions));}
  for(const [id,p] of Object.entries(library.phrases))this.phraseGuards.set(id,compileCondition(p.requires));
  for(const r of library.rules)for(const t of r.tiers)for(const g of t.graphs)this.graphGuards.set(g,compileCondition(g.requires));
  this.state=saved?.version===1?saved:{version:1,serial:0,pending:[],seen:[],roots:[],produced:[],queue:[],journal:[],recent:[],cooldowns:[],frequencies:{},lastChannel:-10000,stats:{ingested:0,filtered:0,candidates:0,published:0,reasons:{}}};
  // Saves contain fully rendered exchanges. A rewritten bank must not restore
  // old lines or stitch a new opening to an obsolete reply with the same ID.
  const librarySignature=stableHash(JSON.stringify(library));
  if(saved&&this.state.librarySignature!==librarySignature){this.state.queue=[];this.state.batch=[];}
  this.state.librarySignature=librarySignature;
  this.pending=new Map(this.state.pending.map(b=>[b.key,b]));this.seen=new Map(this.state.seen);this.roots=new Map(this.state.roots);
  this.state.batch??=[];this.state.lastDecisionAt??=-10000;
  this.phraseUses=new Map(this.state.phraseUses??[]);
  this.produced=new Map(this.state.produced);this.cooldowns=new Map(this.state.cooldowns);this.active=null;
  this.incomingOrders=new Map(this.state.incomingOrders??[]);
  this.scopes=new Map(this.state.scopes??[]);
 }
 get enabled(){return this.settings.enabled!==false;}
 reject(reason){this.state.stats.filtered++;this.state.stats.reasons[reason]=(this.state.stats.reasons[reason]??0)+1;return false;}
 event(event){
  if(!this.enabled)return false;
  if(!event||!event.id||!Number.isInteger(event.tickId)||!Number.isFinite(event.simTime)||!event.facts||!Array.isArray(event.actorIds)||!Array.isArray(event.affectedIds))return this.reject('invalid-event');
  if(event.facts.destroyedIds?.length||event.facts.killedIds?.length||event.facts.woundedIds?.length)this.state.lastLoss=event.simTime;
  const id=event.tickId+':'+event.id,root=event.rootCauseId?event.type+':'+event.rootCauseId:null;
  if(this.seen.has(id)||root&&this.roots.has(root))return this.reject('duplicate');
  this.seen.set(id,event.simTime);if(root)this.roots.set(root,event.simTime);limitMap(this.seen,4096);limitMap(this.roots,4096);
  const rules=this.index.get(event.type)?.filter(r=>r.enabled&&r.support==='wired');if(!rules?.length)return this.reject('no-game-source');
  if(event.flags?.confirmed===false)return this.reject('unconfirmed');
  if(event.type.startsWith('command.')&&event.facts.accepted){
   const stale=q=>q.type.startsWith('command.')&&!q.context.orderIds.includes(event.orderId)&&q.context.affectedIds.some(id=>event.affectedIds.includes(id));
   this.state.queue=this.state.queue.filter(q=>!stale(q));this.state.batch=this.state.batch.filter(q=>!stale(q));
  }
  const rule=rules[0],scope=rule.scope==='squad'?'squad-window:'+Math.floor(event.simTime/Math.max(.1,rule.windowSimSeconds)):
   rule.scope==='global'?'global-window:'+Math.floor(event.simTime/Math.max(.1,rule.windowSimSeconds)):
   rule.scope==='incident'?event.incidentId??event.orderId??event.rootCauseId??event.id:event.orderId??event.incidentId??event.rootCauseId??event.id;
  if(event.type.startsWith('command.')&&event.orderId&&!this.incomingOrders.has(event.orderId)){
   this.incomingOrders.set(event.orderId,event.simTime);for(const [id,at] of this.incomingOrders)if(event.simTime-at>3)this.incomingOrders.delete(id);
   limitMap(this.incomingOrders,256);
   const overload=this.index.get('traffic.network_overload')?.find(r=>r.enabled&&r.support==='wired');
   if(overload&&this.incomingOrders.size>=Math.min(...overload.tiers.map(t=>t.min)))this.event({id:'overload:'+event.id,tickId:event.tickId,simTime:event.simTime,
    type:'traffic.network_overload',incidentId:'network:'+Math.floor(event.simTime/3),orderIds:[...this.incomingOrders.keys()],actorIds:event.actorIds,affectedIds:event.affectedIds,facts:{confirmed:true}});
  }
  const key=[event.type,event.squadId??'global',scope].join(':');
  if(!this.pending.has(key)&&this.pending.size>=this.settings.maxPending)return this.reject('pending-cap');
  const bucket=this.pending.get(key)??createBucket(event,rule);bucket.key=key;
  if(!this.scopes.has(key)){
   this.scopes.set(key,this.state.frequencies[event.type]??0);this.state.frequencies[event.type]=(this.state.frequencies[event.type]??0)+1;limitMap(this.scopes,4096);
  }
  bucket.historicalFrequency=this.scopes.get(key);ingest(bucket,event);this.pending.set(key,bucket);this.state.stats.ingested++;
  // Urgent transitions bypass the ordinary window, but are still deduplicated and bounded.
  if(event.flags?.urgent&&!bucket.urgentReported){bucket.urgentReported=true;this.resolve(bucket,event.simTime);}
  return true;
 }
 tick(tickId,simTime){
  if(!this.enabled)return;
  for(const bucket of [...this.pending.values()].filter(b=>b.end<=simTime).sort((a,b)=>a.end-b.end||a.key.localeCompare(b.key))){this.resolve(bucket,bucket.end);this.pending.delete(bucket.key);}
  this.state.queue=this.state.queue.filter(q=>q.expiresAtSimTime>=simTime);
 }
 resolve(bucket,now){
  const context=aggregateContext(bucket,now,bucket.historicalFrequency??0);
  const rules=this.index.get(bucket.type).filter(r=>r.enabled&&r.support==='wired'&&this.conditions.get(r.id)(context))
   .sort((a,b)=>(b.specificity??0)-(a.specificity??0)||b.priority-a.priority||a.id.localeCompare(b.id));
  for(const rule of rules){
   if(!rule.legacyOverride&&this.legacy(rule,context)){this.reject('legacy-owner');continue;}
   const snap=this.snapshot(context),speakers=(snap.speakers??[]).filter(s=>s.alive&&s.combatReady!==false&&s.radioChannel==='rai');
   const tier=[...rule.tiers].sort((a,b)=>b.min-a.min).find(t=>context[rule.countMetric]>=t.min);if(!tier)continue;
   const key=[bucket.key,tier.id,context.resolution].join('|');if(this.produced.has(key))return this.reject('incident-tier-already-produced');
   if(!speakers.length)return this.reject('no-live-speaker');
   if(snap.relevant===false)return this.reject('stale-state');
   if(bucket.type.startsWith('idle.')&&snap.combat&&this.settings.quietInCombat)return this.reject('combat-suppresses-banter');
   const episode=this.choose(rule,tier,context,speakers,now);if(!episode)return this.reject('truth-or-repeat-guard');
   const item={id:key,ruleId:rule.id,type:bucket.type,scopeKey:bucket.key,tier:tier.id,context,lines:episode.lines,graphId:episode.id,personal:episode.personal,remembrance:episode.remembrance,bawdy:episode.bawdy,humor:episode.humor,combatHumor:episode.combatHumor,
    priority:rule.priority,interruptible:rule.interruptible,expiresAtSimTime:now+rule.expiresAfter,createdAt:now,
    cooldown:rule.cooldown,cursor:0,duration:episode.lines.reduce((n,l)=>n+Math.max(2.2,l.text.length*.06)+(l.pauseAfter??.12),0)};
   this.produced.set(key,now);limitMap(this.produced,this.settings.maxHistory);
   this.state.stats.candidates++;
   // A resolved incident supersedes its pending reports, never its historical losses.
   if(context.resolution==='resolved')this.state.queue=this.state.queue.filter(q=>!context.incidentIds.some(id=>q.context.incidentIds.includes(id)));
   this.state.queue=this.state.queue.filter(q=>q.scopeKey!==bucket.key);
   this.state.queue.push(item);this.state.queue.sort((a,b)=>b.priority-a.priority||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
   const routineSlots=Math.max(0,(this.settings.maxRoutineQueue??2)-this.state.batch.filter(q=>q.priority<40).length);
   const routine=new Set(this.state.queue.filter(q=>q.priority<40).sort((a,b)=>b.createdAt-a.createdAt).slice(0,routineSlots));
   this.state.queue=this.state.queue.filter(q=>q.priority>=40||routine.has(q));
   let duration=this.state.batch.reduce((n,q)=>n+q.duration,0);this.state.queue=this.state.queue.filter((q,i)=>{duration+=q.duration;return i<this.settings.maxQueue-this.state.batch.length&&(i===0&&this.state.batch.length===0||duration<=this.settings.maxQueuedDuration);});
   return item;
  }
  return this.reject('no-matching-rule');
 }
 repeatBlocked(lines,context,now,{pending=true}={}){
  const current=signatures(lines);
  const same=other=>{
   const prior=other.signatures??(other.lines?signatures(other.lines):[]);
   return current.some(s=>prior.includes(s));
  };
  const banter=context.primaryEventType.startsWith('idle.')||lines.some(l=>l.kind==='dry_joke');
  const urgent=this.index.get(context.primaryEventType)?.some(r=>r.enabled&&r.priority>=80);
  const period=banter?(this.settings.banterRepeatSeconds??600):urgent?(this.settings.urgentRepeatSeconds??90):(this.settings.phraseRepeatSeconds??300);
  if(this.state.recent.some(r=>now-(r.at??this.state.lastChannel)<period&&same(r)))return true;
  if(pending&&[this.active,...this.state.batch,...this.state.queue].some(q=>q&&q.cursor<q.lines.length&&q.scopeKey!==context.scopeKey&&q.expiresAtSimTime>=now&&same(q)))return true;
  return false;
 }
 speakerOrder(context){
  const lastLead=new Map(),lastSpeech=new Map(),contexts=new Set(),pendingLead=new Map(),pendingSpeech=new Map();
  for(const [index,entry] of this.state.journal.entries()){
   lastSpeech.set(entry.crewId,index);
   if(entry.opening??!contexts.has(entry.contextId))lastLead.set(entry.crewId,index);
   contexts.add(entry.contextId);
  }
  for(const queued of [this.active,...this.state.batch,...this.state.queue]){
   if(!queued||queued.scopeKey===context.scopeKey)continue;
   for(let i=queued.cursor;i<queued.lines.length;i++){
    const id=queued.lines[i].crewId;pendingSpeech.set(id,(pendingSpeech.get(id)??0)+1);
    if(i===0)pendingLead.set(id,(pendingLead.get(id)??0)+1);
   }
  }
  // One context can rank the same crew across many dialogue variants. Keep
  // its deterministic tie-break value local to this decision, not each compare.
  const ties=new Map(),prefix=[this.missionId,context.scopeKey,context.windowStartTick].join('|')+'|';
  const tie=id=>{if(!ties.has(id))ties.set(id,stableHash(prefix+(id??'')));return ties.get(id);};
  return (a,b,opening)=>{
   if(opening){const reserved=(pendingLead.get(a.crewId)??0)-(pendingLead.get(b.crewId)??0);if(reserved)return reserved;
    const last=(lastLead.get(a.crewId)??-1)-(lastLead.get(b.crewId)??-1);if(last)return last;}
   return (pendingSpeech.get(a.crewId)??0)-(pendingSpeech.get(b.crewId)??0)||
    (lastSpeech.get(a.crewId)??-1)-(lastSpeech.get(b.crewId)??-1)||tie(a.crewId)-tie(b.crewId)||String(a.crewId).localeCompare(String(b.crewId));
  };
 }
 choose(rule,tier,context,speakers,now=context.windowEndTick){
  const eligible=[],speakerOrder=this.speakerOrder(context);
  for(const graph of tier.graphs){
   if(graph.bawdy&&!this.bawdyReady(now))continue;
   if(graph.personal&&(now-((graph.remembrance?this.state.lastRemembranceAt:this.state.lastPersonalAt)??-Infinity)<180||stableHash(context.scopeKey+'|personal')/4294967296>(graph.chance??1)))continue;
   if(rule.priority<80&&graph.nodes.length>(this.settings.maxRoutineTurns??2))continue;
   if(!this.graphGuards.get(graph)(context))continue;
   const humor=graph.humor||graph.nodes.some(n=>this.library.phrases[n.phraseId]?.kind==='dry_joke');
   if(humor&&((context.combatContext&&!graph.combatHumor)||now-(this.state.lastLoss??-Infinity)<45||context.destroyedVehicleCount>0||context.killedCrewCount>0||context.woundedCrewCount>0||this.settings.humorLevel<=0))continue;
   const lines=[],slots=new Map();let prior=null,valid=true;
   for(const node of graph.nodes){
    const p=this.library.phrases[node.phraseId];if(!p||p.archived||!this.phraseGuards.get(p.id)(context)){valid=false;break;}
    if((p.kind==='question'||p.kind==='answer')&&context.facts[p.fact]==null){valid=false;break;}
    let options=speakers.filter(s=>rule.roles.includes(s.role)&&(!node.affectedSpeaker||context.affectedIds.includes(s.unitId))&&(!node.differentSpeaker||s.crewId!==prior?.crewId)&&(!p.voiceId||s.voiceId===p.voiceId)&&(!p.speakerGender||s.gender===p.speakerGender)&&(!node.speakerFact||s.crewId===context.facts[node.speakerFact])&&(!graph.speakersFromMemory||context.memorySpeakerIds?.includes(s.crewId)));
    if(node.speakerSlot!=null){
     const assigned=slots.get(node.speakerSlot);
     options=options.filter(s=>assigned?s.crewId===assigned:![...slots.values()].includes(s.crewId));
    }
    const participants=options.filter(s=>context.affectedIds.includes(s.unitId));
    if(participants.length)options=participants;
    // Generic vehicle reports may be voiced by any participating operator.
    // Specialised builder/scout/etc. lines still prefer their actual role.
    const preferred=options.filter(s=>p.role==='driver'?s.role!=='commander':s.role===p.role);
    if(preferred.length)options=preferred;
    // Keep each crew's voice, but use a distinct timbre for an unbound reply
    // when another eligible participant is available.
    if(prior?.voiceId){const distinct=options.filter(s=>s.voiceId&&s.voiceId!==prior.voiceId);if(distinct.length)options=distinct;}
    options.sort((a,b)=>speakerOrder(a,b,lines.length===0));
    const speaker=options[0];if(!speaker){valid=false;break;}
    if(node.speakerSlot!=null)slots.set(node.speakerSlot,speaker.crewId);
    const nextFact=graph.nodes[1]?.speakerFact;
    const addressee=prior??(nextFact?speakers.find(s=>s.crewId===context.facts[nextFact]&&s.crewId!==speaker.crewId):options.find(s=>s.crewId!==speaker.crewId));
    const replySlot=graph.nodes[1]?.speakerSlot;
    if(lines.length===0&&addressee&&replySlot!=null&&replySlot!==node.speakerSlot&&/\{addressee(?:CallSign|Name)\}/.test(p.text))slots.set(replySlot,addressee.crewId);
    const rendered=renderRadioLine(p,context,this.library.dictionaries,speaker,addressee,{opening:lines.length===0,seed:graph.id});
    if(!rendered){valid=false;break;}
    lines.push({...p,...rendered,speakerSlot:node.speakerSlot,speakerFact:node.speakerFact,speaker:speaker.speaker??speaker.role,speakerRole:speaker.role,station:speaker.callSign,crewId:speaker.crewId,unitId:speaker.unitId,
     portrait:p.portrait??speaker.portrait,clip:radioClip(p,rendered.text,this.settings,speaker.voiceId,speaker.role)});prior=speaker;
   }
   if(valid&&!this.repeatBlocked(lines,context,now))
    eligible.push({...graph,humor,lines});
  }
  const specificity=Math.max(...eligible.map(g=>g.specificity??0));let pool=eligible.filter(g=>(g.specificity??0)===specificity);
  // Prefer a complete recorded exchange within each tone. Facts, live speakers
  // and repeat guards have already been checked; keep the original humor ratio.
  const recorded=g=>g.lines.every(line=>line.clip&&['elevenlabs-synthesis','user-recording','editor-upload'].includes(line.clip.origin));
  const recordedTone=new Map([false,true].map(h=>[h,pool.some(g=>g.humor===h&&recorded(g))]));
  pool=pool.filter(g=>!recordedTone.get(g.humor)||recorded(g));
  // Draw from the least-used complete exchanges in each tone. Changing the
  // callsign or the graph ID must not give a familiar reply a fresh turn.
  const uses=g=>Math.max(...signatures(g.lines).map(s=>this.phraseUses.get(s)??0));
  const least=new Map([false,true].map(h=>[h,Math.min(...pool.filter(g=>g.humor===h).map(uses))]));
  pool=pool.filter(g=>uses(g)===least.get(g.humor)).sort((a,b)=>a.id.localeCompare(b.id));
  const humorous=pool.filter(g=>g.humor).reduce((n,g)=>n+g.weight,0),plain=pool.filter(g=>!g.humor).reduce((n,g)=>n+g.weight,0);
  const weight=g=>g.weight/(g.humor?humorous:plain)*(humorous&&plain?(g.humor?this.settings.humorLevel:1-this.settings.humorLevel):1);
  const total=pool.reduce((n,g)=>n+weight(g),0);let pick=stableHash([this.missionId,context.windowStartTick,context.scopeKey,tier.id].join('|'))/4294967296*total;
  for(const graph of pool){pick-=weight(graph);if(pick<0)return graph;}return pool.at(-1);
 }
 selectBatch(simTime){
  if(simTime-this.state.lastDecisionAt<(this.settings.dispatchSeconds??2))return;
  this.state.lastDecisionAt=simTime;
  this.state.stats.decisions=(this.state.stats.decisions??0)+1;
  if(this.state.batch.length&&this.state.queue.some(q=>q.priority>this.state.batch[0].priority)){
   this.state.queue.push(...this.state.batch);this.state.batch=[];
  }
  const fresh=q=>q.expiresAtSimTime>=simTime&&!this.repeatBlocked(q.lines,q.context,simTime,{pending:false})&&this.snapshot(q.context).relevant!==false;
  this.state.queue=this.state.queue.filter(fresh).sort((a,b)=>b.priority-a.priority||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
  this.state.batch=this.state.batch.filter(fresh);
  if(this.state.batch.length||simTime-this.state.lastChannel<this.settings.channelCooldown)return;
  const eligible=q=>q.priority>=80||['squad:'+q.context.squadId,'unit:'+q.lines[0].crewId,'scope:'+q.scopeKey,'event:'+q.type+':'+q.context.squadId].every(k=>simTime>=(this.cooldowns.get(k)??-Infinity));
  const index=this.state.queue.findIndex(eligible);if(index<0)return;
  const first=this.state.queue.splice(index,1)[0];this.state.batch=[first];
  const related=q=>q.context.affectedIds.some(id=>first.context.affectedIds.includes(id))||first.context.squadId!=='global'&&q.context.squadId===first.context.squadId;
  const companion=this.state.queue.findIndex(q=>eligible(q)&&related(q)&&q.priority>=first.priority-10&&Math.abs(q.createdAt-first.createdAt)<=5&&q.lines.length+first.lines.length<=3&&q.duration+first.duration<=(this.settings.maxPacketSeconds??12));
  if(companion>=0)this.state.batch.push(this.state.queue.splice(companion,1)[0]);
  this.state.stats.packets=(this.state.stats.packets??0)+1;
  this.state.lastPacket={at:simTime,priority:first.priority,events:this.state.batch.map(q=>q.type)};
 }
 bawdyReady(now){return this.settings.humorLevel>0&&now-(this.state.lastBawdyAt??-Infinity)>=(this.settings.bawdyInterval??150)&&now-(this.state.lastLoss??-Infinity)>=60&&now-(this.state.lastCombat??-Infinity)>=20&&now-(this.state.lastRemembranceAt??-Infinity)>=180;}
 next(simTime,{storyLock=false,audioBusy=false}={}){
  if(!this.enabled||storyLock||audioBusy)return null;
  if(this.active?.expiresAtSimTime<simTime&&simTime-this.state.lastChannel>(this.settings.maxPacketSeconds??12))this.active=null;
  this.selectBatch(simTime);
  if(this.state.queue.some(q=>q.priority>Math.max(this.active?.priority??-1,this.state.batch[0]?.priority??-1)))return null;
  if(this.active){
   if(this.active.cursor>=this.active.lines.length)this.active=null;
   else if(this.active.interruptible&&[...this.state.batch,...this.state.queue].some(q=>q.priority>this.active.priority))this.active=null;
  }
  if(!this.active){
   this.state.batch=this.state.batch.filter(q=>!this.repeatBlocked(q.lines,q.context,simTime,{pending:false}));
   if(!this.state.batch.length)return null;
   this.active=this.state.batch.shift();
  }
  const q=this.active,line=q.lines[q.cursor],snapshot=this.snapshot(q.context);
  // Recheck after story/queue waits: a joke prepared in quiet must not follow a fresh loss.
  if(q.humor&&(simTime-(this.state.lastLoss??-Infinity)<45||snapshot.combat&&!q.combatHumor)||q.bawdy&&
   (simTime-(this.state.lastLoss??-Infinity)<60||simTime-(this.state.lastCombat??-Infinity)<20||simTime-(this.state.lastRemembranceAt??-Infinity)<180||q.cursor===0&&!this.bawdyReady(simTime))){
   this.active=null;this.reject('mood-changed-before-speech');return null;
  }
  if(q.personal&&q.cursor===0&&simTime-((q.remembrance?this.state.lastRemembranceAt:this.state.lastPersonalAt)??-Infinity)<180){this.active=null;this.reject('personal-cooldown');return null;}
  const currentGraph=this.library.rules.find(r=>r.id===q.ruleId)?.tiers.flatMap(t=>t.graphs).find(g=>g.id===q.graphId);
  if(currentGraph&&!this.graphGuards.get(currentGraph)(q.context)){this.active=null;this.reject('facts-changed-before-speech');return null;}
  if(q.type.startsWith('idle.')&&snapshot.combat&&this.settings.quietInCombat){this.active=null;this.reject('combat-suppresses-banter');return null;}
  let live=snapshot.speakers?.find(s=>s.crewId===line.crewId&&s.alive&&s.radioChannel==='rai');
  if(!live){
   // A reply addressed to a particular operator cannot silently switch to a
   // replacement operator midway through an authored conversation.
   if(line.speakerFact||line.speakerSlot!=null&&(q.cursor>0||q.personal||q.bawdy)){this.active=null;this.reject('conversation-participant-unavailable');return null;}
   const order=this.speakerOrder(q.context);
   live=snapshot.speakers?.filter(s=>s.alive&&s.radioChannel==='rai'&&s.role===(line.speakerRole??line.role)&&(!line.voiceId||line.voiceId===s.voiceId)).sort((a,b)=>order(a,b,q.cursor===0))[0];
   if(live)Object.assign(line,{crewId:live.crewId,unitId:live.unitId,station:live.callSign,speaker:live.speaker??live.role,portrait:live.portrait});
  }
  if(!live||snapshot.relevant===false){this.active=null;this.reject('speaker-dead-or-state-stale');return null;}
  // Re-resolve after loading an older save or replacing a speaker who died.
  const phrase=this.library.phrases[line.id];
  const addressee=line.addresseeId?snapshot.speakers?.find(s=>s.crewId===line.addresseeId&&s.alive&&s.radioChannel==='rai'):null;
  if(phrase){
   const rendered=renderRadioLine(phrase,q.context,this.library.dictionaries,live,addressee,{opening:q.cursor===0,seed:q.graphId});
   if(!rendered){this.active=null;this.reject('addressee-unavailable');return null;}
   Object.assign(line,rendered);
  }
  line.clip=phrase?radioClip(phrase,line.text,this.settings,live.voiceId,live.role):null;
  if(q.cursor===0){this.state.recent.push({at:simTime,graphId:q.graphId,type:q.type,tier:q.tier,squadId:q.context.squadId,
   phrases:q.lines.map(l=>l.id).join('|'),signatures:signatures(q.lines)});this.state.recent=this.state.recent.slice(-256);}
  if(q.personal&&q.cursor===0)this.state.lastPersonalAt=simTime;
  if(q.remembrance&&q.cursor===0)this.state.lastRemembranceAt=simTime;
  if(q.bawdy&&q.cursor===0)this.state.lastBawdyAt=simTime;
  if(q.ruleId==='idle.driver_pair'&&line.crewId===q.context.facts.newcomerId){
   this.state.introducedCrews=sorted([...(this.state.introducedCrews??[]),line.crewId]).slice(-512);
  }
  const spoken=signatures([line])[0];this.phraseUses.set(spoken,(this.phraseUses.get(spoken)??0)+1);limitMap(this.phraseUses,4096);
  this.state.stats.published++;this.state.lastChannel=simTime;
  for(const [key,delay] of [['squad:'+q.context.squadId,this.settings.squadCooldown],['unit:'+line.crewId,this.settings.unitCooldown],['scope:'+q.scopeKey,q.cooldown],['event:'+q.type+':'+q.context.squadId,q.cooldown]])this.cooldowns.set(key,simTime+delay);
  limitMap(this.cooldowns,2048);
  this.state.journal.push({at:simTime,contextId:q.id,ruleId:q.ruleId,tier:q.tier,graphId:q.graphId,phraseId:line.id,crewId:line.crewId,opening:q.cursor===0,text:line.text,newcomerId:q.context.facts.newcomerId});
  this.state.journal=this.state.journal.slice(-this.settings.maxHistory);
  return {...line,dynamic:true,dialogue:true,chapter:'dynamic:'+q.id,token:q.id+':'+q.cursor,priority:q.priority,volume:this.settings.volume};
 }
 completeLine(){if(this.active)this.active.cursor++;}
 save(){
  Object.assign(this.state,{pending:[...this.pending.values()],seen:[...this.seen],roots:[...this.roots],produced:[...this.produced],cooldowns:[...this.cooldowns],incomingOrders:[...this.incomingOrders],scopes:[...this.scopes],phraseUses:[...this.phraseUses]});
  // Current audio cannot be restored halfway through a word. Do not replay its report after loading.
  return this.state;
 }
 diagnostics(){return {...this.state.stats,pending:this.pending.size,queued:this.state.queue.length+this.state.batch.length,queuedDuration:[...this.state.queue,...this.state.batch].reduce((n,q)=>n+q.duration,0),active:this.active?.id??null,lastPacket:this.state.lastPacket??null};}
}
