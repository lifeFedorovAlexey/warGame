import {RadioEngine} from './engine.js';
import {stableHash} from './conditions.js';
import {TacticalIntel} from './tactical-intel.js';
import {CrewStories} from './crew-stories.js';
import {CrewBanter,banterCrew} from './crew-banter.js';
import {loadRecordedSpeech} from './audio.js';
import {RetreatIncidents,mergeRetreatLibrary} from './retreat-incidents.js';

export const ENGINE_EVENTS={
 'factory-repair-start':'repair.start_factory','factory-repair-complete':'repair.complete',
 'construction-start':'construction.start','construction-complete':'construction.complete','construction-cancelled':'construction.cancelled',
 'construction-refused':'construction.refused','research-start':'research.start','research-complete':'research.complete',
 'unit-produced':'factory.vehicle_complete','trophy-food-received':'loot.food_found','generator-breakdown':'energy.generator_stop',
 'camp-cleared':'recon.camp_cleared','artifact-collected':'loot.artifact_found','victory':'mission.victory','defeat':'mission.defeat',
 'navigation-command-rejected':'command.rejected',
 'navigation-wait-cycle':'traffic.deadlock','navigation-stuck-turn-started':'traffic.reverse_started',
 'navigation-stuck-turn-finished':'traffic.reverse_complete','vehicle-steering-repaired':'repair.mobility_restored',
 'vehicle-modernized':'factory.modernization_complete','building-captured':'command.capture',
 'vehicle-steering-damage-roll':'damage.mobility_lost','navigation-route-shortened':'movement.route_changed',
};
const commands={move:'command.move',attack:'command.attack','attack-move':'command.attack_move',build:'command.build',stop:'command.stop'};
const summaryEvents=new Set(['repair.start_factory','repair.complete','repair.mobility_restored',
 'construction.start','construction.complete','construction.cancelled','construction.refused',
 'factory.vehicle_complete','factory.modernization_complete']);
const narrativeOwners={'traffic.queue_blocked':'a03','traffic.jam_resolved':'a04','loot.food_found':'u02','energy.generator_stop':'u04'};
const legacyEvents={'command.stop':['a14'],'damage.hit':['a09'],'damage.commander_down':['a11'],
 'repair.start_factory':['factory-repair-start','factory-repair-start-alt'],'repair.complete':['factory-repair-complete'],
 'research.start':['a07'],'research.complete':['a08'],'factory.vehicle_complete':['a12']};

// Observe only controller samples already being processed by the simulation.
// Connected wait edges define incidents. Physical proximity alone never merges them.
export class TrafficIncidents{
 constructor(saved={}){this.samples=new Map(saved.samples??[]);this.incidents=new Map(saved.incidents??[]);this.serial=saved.serial??0;}
 observe(unit,now,leader){
  const old=this.samples.get(unit.id),progress=old?Math.hypot(unit.x-old.x,unit.y-old.y)>.02:false;
  const blocked=unit.hp>0&&!!unit.path?.length&&!!leader&&!progress&&Math.abs(unit.driveSpeed??unit.speed??0)<.05;
  if(!blocked&&!old)return;
  this.samples.set(unit.id,{id:unit.id,x:unit.x,y:unit.y,leader,blocked,since:blocked&&old?.blocked?old.since:now,
   progressed:progress,active:unit.hp>0&&!!unit.path?.length,at:now});
 }
 update(now,emit,confirmSeconds=10){
  const stationary=new Map([...this.samples].filter(([,s])=>s.blocked&&now-s.since>=confirmSeconds)),adj=new Map();
  const link=(a,b)=>{if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b);};
  for(const [id,s] of stationary){link(id,s.leader);link(s.leader,id);}
  const visited=new Set(),groups=[];
  for(const first of [...adj.keys()].sort()){
   if(visited.has(first))continue;
   const walk=[first],ids=[];visited.add(first);
   for(let i=0;i<walk.length;i++){const id=walk[i];if(stationary.has(id))ids.push(id);for(const next of adj.get(id)??[])if(!visited.has(next)){visited.add(next);walk.push(next);}}
   if(ids.length)groups.push({ids:ids.sort(),roots:walk.sort()});
  }
  const open=new Set();
  for(const group of groups){
   let record=[...this.incidents.values()].find(r=>r.status==='open'&&r.roots.some(id=>group.roots.includes(id)));
   if(!record){record={id:'traffic-'+(++this.serial),ids:[],roots:group.roots,start:Math.min(...group.ids.map(id=>stationary.get(id).since)),status:'open',positions:{}};this.incidents.set(record.id,record);}
   open.add(record.id);
   if(record.ids.join('|')!==group.ids.join('|')){
    record.ids=group.ids;record.roots=group.roots;
    record.positions??={};for(const id of group.ids){const s=this.samples.get(id);record.positions[id]??={x:s.x,y:s.y};}
    emit('traffic.queue_blocked',{incidentId:record.id,actorIds:group.ids,affectedIds:group.ids,
     facts:{incidentStartedAt:record.start,resolution:'ongoing',trafficProgress:0}});
   }
  }
  for(const [id,record] of this.incidents){
   if(record.status!=='open'||open.has(id))continue;
   // A stopped/cancelled order or destroyed car is not proof that a passage reopened.
   const rows=record.ids.map(id=>this.samples.get(id));
   if(rows.every(s=>s&&record.positions?.[s.id]&&Math.hypot(s.x-record.positions[s.id].x,s.y-record.positions[s.id].y)>1)){
    record.status='resolved';emit('traffic.jam_resolved',{incidentId:id,actorIds:record.ids,affectedIds:record.ids,
     facts:{incidentStartedAt:record.start,resolution:'resolved',jamResolved:true}});
   }else if(rows.every(s=>!s?.active)){record.status='failed';}
  }
  for(const [id,s] of this.samples)if(now-s.at>30||!s.blocked&&!s.active&&!Array.from(this.incidents.values()).some(r=>r.status==='open'&&r.ids.includes(id)))this.samples.delete(id);
  while(this.incidents.size>256){const first=[...this.incidents].find(([,r])=>r.status!=='open');if(!first)break;this.incidents.delete(first[0]);}
 }
 save(){return {samples:[...this.samples],incidents:[...this.incidents],serial:this.serial};}
}

export class MissionRadio{
 constructor(mission,library,{legacyBarks=[]}={}){this.mission=mission;this.library=library;this.legacyBarks=legacyBarks;this.bind();}
 bind(){
  const m=this.mission;if(this.bound===m.state)return;
  this.bound=m.state;const saved=m.state.dynamicRadio;
  this.engine=new RadioEngine(this.library,{missionId:m.state.m02?'alpha-m02':m.config.id,saved:saved?.engine,
   snapshot:c=>this.snapshot(c),legacy:(r,c)=>this.legacy(r,c)});
  this.traffic=new TrafficIncidents(saved?.traffic);this.previous=new Map(saved?.previous??[]);this.orders=new Map(saved?.orders??[]);this.assignments=new Map(saved?.assignments??[]);
  this.crews=new Map(saved?.crews??[]);this.memories=new Map(saved?.memories??[]);
  this.retreatOrders=new Map(saved?.retreatOrders??[]);
  this.intel=new TacticalIntel(saved?.intel);this.crewStories=new CrewStories(saved?.crewStories);
  this.banter=new CrewBanter(saved?.banter);
  this.retreatIncidents=new RetreatIncidents(saved?.retreatIncidents);
  this.eventWindows=new Map(saved?.eventWindows??[]);
  this.unitIds=new Set(m.state.units.filter(u=>u.owner==='rai').map(u=>u.id));
  if(this.warmingUp)this.clearStartupQueue();
 }
 safe(fn){try{this.bind();if(this.engine.enabled)return fn();}catch(error){this.error=error.message;this.library.settings.enabled=false;console.error('Динамический эфир отключён:',error);}}
 get time(){return this.mission.state.time;}
 get warmingUp(){return this.time-(this.mission.state.m02?.startedAt??0)<15;}
 clearStartupQueue(){
  this.engine.pending.clear();this.engine.state.queue.length=0;this.engine.state.batch.length=0;this.engine.active=null;
  this.eventWindows.clear();
 }
 windowScope(type,operation='global'){
  const key=type+':'+operation,window=this.eventWindows.get(key);
  if(window&&this.time<window.until)return window.id;
  const seconds=this.engine.index.get(type)?.find(rule=>rule.enabled)?.windowSimSeconds??6;
  const next={id:key+':'+(++this.engine.state.serial),until:this.time+seconds};this.eventWindows.set(key,next);
  while(this.eventWindows.size>256)this.eventWindows.delete(this.eventWindows.keys().next().value);
  return next.id;
 }
 retreatOrder(ids,forced){return this.safe(()=>{
  const orderId='retreat-'+(++this.engine.state.serial);
  for(const id of ids)this.retreatOrders.set(id,{orderId,forced,reported:false});
  while(this.retreatOrders.size>512)this.retreatOrders.delete(this.retreatOrders.keys().next().value);
 });}
 destroyedTarget(target,source,{exploded=false}={}){return this.safe(()=>{
  if(!['scavs','unknown'].includes(target.owner)||source?.owner!=='rai'||target.hp>0||!this.mission.visibleAt(target.x,target.y))return;
  const operation=this.assignments.get(source.id)?.orderId??'unit:'+source.id;
  this.event('combat.target_destroyed',{rootCauseId:'destroyed:'+target.id,incidentId:this.windowScope('combat.target_destroyed',operation),
   actorIds:[source.id],affectedIds:[source.id],targetIds:[target.id],
   facts:{explosionConfirmed:exploded,resolution:'resolved'},flags:{confirmed:true,hasCombat:true}});
 });}
 event(type,data={}){
  // Let the opening story establish the channel. Do not save up early chatter.
  if(this.warmingUp)return false;
  const state=this.engine.state,step=this.mission.config.simulationStep??.1;
  const e={id:'radio-'+(++state.serial),tickId:Math.round(this.time/step),simTime:this.time,type,actorIds:[],affectedIds:[],facts:{},...data};
  return this.engine.event(e);
 }
 order(action,ids,orderId){return this.safe(()=>{
  const type=commands[action];if(!type)return;
  ids=[...new Set(ids)].filter(id=>this.mission.entity(id)?.hp>0);if(!ids.length)return;
  orderId=orderId??'direct-'+(++this.engine.state.serial);
  const previous=this.orders.get(orderId)??[],fresh=ids.filter(id=>!previous.includes(id));if(!fresh.length)return;
  this.orders.set(orderId,[...new Set([...previous,...fresh])]);while(this.orders.size>256)this.orders.delete(this.orders.keys().next().value);
  const units=fresh.map(id=>this.mission.entity(id)),squads=new Set(units.map(u=>u.commandGroupId??'global'));
  for(const unit of units)this.assignments.set(unit.id,{orderId,action,started:false,idleSince:null,idleReported:false});
  this.event(type,{orderId,squadId:squads.size===1?[...squads][0]:'order:'+orderId,actorIds:fresh,affectedIds:fresh,
   facts:{accepted:true},flags:{confirmed:true}});
 });}
 note(event){if(this.library.settings.enabled===false)return;return this.safe(()=>{
  const m=this.mission,type=ENGINE_EVENTS[event.type];
  if(event.type==='retreat-contact'){this.retreatIncidents.contact(m,event,(type,data)=>this.event(type,data));return;}
  if(event.type==='under-attack'){
   this.engine.state.lastCombat=this.time;
   if(event.building)this.event('combat.base_attack',{rootCauseId:event.id,incidentId:this.windowScope('combat.base_attack'),
    actorIds:[],affectedIds:[],targetIds:[event.target],objectIds:[event.target],facts:{enemyFire:true},flags:{confirmed:true,hasCombat:true}});
  }
  if(event.type==='vehicle-steering-damage-roll'&&!event.failed)return;
  if(event.type==='unit-produced')this.unitIds.add(event.unit);
  if(event.type==='destroyed'){
   const unit=m.state.units.find(u=>u.id===event.target);if(event.owner!=='rai'||!m.config.units[event.kind])return;
   const crew=m.state.campaign?.personnel?.crews[event.target],soldiers=m.state.campaign?.personnel?.soldiers??{};
   const killedIds=(crew?.memberIds??[]).filter(id=>!!soldiers[id]?.death);
   this.crewStories.lost(m,killedIds);
   if(this.retreatIncidents.destroyed(m,unit,killedIds,(type,data)=>this.event(type,data)))return;
   const lossType=event.kind==='command'?'damage.commander_down':'damage.vehicle_destroyed';
   this.event(lossType,{
    incidentId:this.windowScope(lossType),affectedIds:[event.target],targetIds:[event.target],
    facts:{destroyedIds:[event.target],crewKnown:!!crew,killedIds,owner:'rai',severity:1},
    flags:{confirmed:true,hasCombat:true,urgent:true}});
   return;
  }
  if(!type)return;
  const unitIds=event.units?.map(u=>typeof u==='string'?u:u.id)??(event.unit?[event.unit]:[]),objects=event.building?[event.building]:event.factory?[event.factory]:event.key?[event.key]:event.camp?[event.camp]:[event.id];
  this.event(type,{rootCauseId:event.id,incidentId:summaryEvents.has(type)?this.windowScope(type):event.camp??event.building??event.factory??event.key??event.id,
   actorIds:unitIds,affectedIds:unitIds,objectIds:objects,
   facts:{resolution:/complete|cleared|victory/.test(event.type)?'resolved':/cancelled|refused|defeat|rejected/.test(event.type)?'failed':'open',
    ...(event.key?{researchKey:event.key}:{}),...(event.first?{firstProduced:true}:{}),
    ...(event.type==='unit-produced'?{producedIds:unitIds}:{}),...(event.type==='research-complete'?{researchIds:[event.key]}:{}),
    ...(event.camp?{objectiveIds:[event.camp]}:{})}});
 });}
 hit(target,source,contact){if(this.library.settings.enabled===false)return;return this.safe(()=>{
  this.intel.hit(this.mission,target,source,contact);
  if(source&&source.owner!==target.owner&&source.owner==='rai'&&contact?.type!=='collision')this.engine.state.lastCombat=this.time;
  if(target.owner!=='rai'||!this.mission.config.units[target.kind])return;
  this.engine.state.lastCombat=this.time;
  const operation=target.commandGroupId??this.assignments.get(target.id)?.orderId??target.id;
  this.event('damage.hit',{incidentId:this.windowScope('damage.hit',operation),actorIds:source?[source.id]:[],affectedIds:[target.id],targetIds:[target.id],
   facts:{hitCount:1,severity:1-target.hp/target.maxHp,enemyFire:!!source&&source.owner!==target.owner&&contact?.type!=='collision'},flags:{confirmed:true,hasCombat:true}});
 });}
 unit(unit){if(this.library.settings.enabled===false)return;return this.safe(()=>{
  if(unit.owner!=='rai')return;
  if(unit.hp<=0){this.unitIds.delete(unit.id);this.assignments.delete(unit.id);this.previous.delete(unit.id);return;}
  this.unitIds.add(unit.id);
  this.retreatIncidents.observe(this.mission,unit,(type,data)=>this.event(type,data));
  const retreat=this.retreatOrders.get(unit.id);
  if(retreat&&!retreat.reported&&unit.combatRetreat?.status==='moving'){
   retreat.reported=true;this.event(retreat.forced?'command.retreat':'command.auto_retreat',{
    orderId:retreat.orderId,actorIds:[unit.id],affectedIds:[unit.id],facts:{accepted:true,retreating:true},flags:{confirmed:true,hasCombat:true}});
  }
  if(!unit.combatRetreat)this.retreatOrders.delete(unit.id);
  const prev=this.previous.get(unit.id),now={state:unit.navigation?.state,revision:unit.commandRevision,task:unit.task?.type};
  const assignment=this.assignments.get(unit.id);
  if(assignment){
   if(now.state==='MOVING'&&!assignment.started){assignment.started=true;this.event('movement.column_depart',{orderId:assignment.orderId,actorIds:[unit.id],affectedIds:[unit.id],facts:{resolution:'ongoing'}});}
   const idle=unit.hp>0&&!unit.task&&!unit.path?.length&&!unit.pendingOrder&&!unit.factoryVisit;
   if(idle){assignment.idleSince??=this.time;if(!assignment.idleReported&&this.time-assignment.idleSince>=45){assignment.idleReported=true;this.event('idle.group_no_order',{orderId:assignment.orderId,actorIds:[unit.id],affectedIds:[unit.id],facts:{incidentStartedAt:assignment.idleSince},flags:{hasCombat:false}});}}
   else assignment.idleSince=null;
  }
  if(now.state==='ARRIVED'&&prev?.state!=='ARRIVED'&&prev?.task==='move')this.event('movement.arrived',{
   orderId:'arrival:'+(unit.commandRevision??unit.id),actorIds:[unit.id],affectedIds:[unit.id],facts:{resolution:'resolved'}});
  this.previous.set(unit.id,now);
  const leader=unit.navigation?.blockerId??this.mission.trafficCoordinator.decisions?.get(unit.id)?.yieldTo;
  this.traffic.observe(unit,this.time,leader);
 });}
 tick(){if(this.library.settings.enabled===false)return;return this.safe(()=>{
  if(this.warmingUp){this.clearStartupQueue();return;}
  this.intel.scan(this.mission,(group,rows)=>this.event('recon.enemy_first_seen',{incidentId:this.windowScope('recon.enemy_first_seen',group),targetIds:rows.map(r=>r.id),facts:{confirmed:true},flags:{confirmed:true}}));
  this.crewStories.tick(this.mission,this.engine,(type,data)=>this.event(type,data));
  this.banter.tick(this.mission,this.engine,(type,data)=>this.event(type,data));
  this.traffic.update(this.time,(type,data)=>{if(type==='traffic.jam_resolved')this.rememberTraffic(data);this.event(type,data);},this.library.settings.trafficConfirmSeconds??10);
  this.engine.tick(Math.round(this.time/(this.mission.config.simulationStep??.1)),this.time);
 });}
 rememberTraffic(data){
  const p=this.mission.state.campaign?.personnel;if(!p)return;
  const crewIds=data.affectedIds.flatMap(id=>p.crews[id]?.memberIds??[]).filter(id=>!p.soldiers[id]?.death).sort();
  if(crewIds.length<2||this.memories.has(data.incidentId))return;
  this.memories.set(data.incidentId,{id:data.incidentId,type:'traffic.jam_resolved',crewIds,at:this.time});
  while(this.memories.size>256)this.memories.delete(this.memories.keys().next().value);
 }
 legacy(rule,context){
  if(rule.legacyOverride)return false;
  if(rule.eventType==='damage.hit'&&context.rawEventCount>=20)return false;
  const scene=narrativeOwners[rule.eventType];
  if(scene&&!['done','skipped','cancelled'].includes(this.mission.state.radioStory?.scenes[scene]?.status))return true;
  if(rule.eventType==='movement.column_depart'&&!['done','skipped','cancelled'].includes(this.mission.state.radioStory?.scenes.a01?.status))return true;
  if(rule.eventType==='factory.vehicle_complete'&&context.facts?.firstProduced)return true;
  if(['loot.artifact_found','recon.camp_cleared','mission.victory'].includes(rule.eventType))return true;
  if(rule.eventType==='research.complete'&&['flamethrower','mg-ammo-1','mg-tower'].includes(context.facts?.researchKey))return true;
  // Preserve real user barks; temporary synthesis stays archived. Unit-radio
  // files were already inactive in StoryDirector mode, so they own no event.
  return context.affectedUnitCount<=1&&(legacyEvents[rule.eventType]??[]).some(event=>
   this.legacyBarks.some(cue=>cue.event===event&&cue.clip?.file&&cue.clip.origin!=='temporary-synthesis'));
 }
 owns(type,count=1){
  this.bind();const rules=this.engine.index.get(type)??[];
  return this.engine.enabled&&rules.some(r=>r.enabled&&r.support==='wired'&&!this.legacy(r,{affectedUnitCount:count}));
 }
 snapshot(context){
  const m=this.mission,p=m.state.campaign?.personnel,ids=[...new Set([...(context.affectedIds??[]),...this.unitIds])];
  const speakers=[];
  for(const id of ids){
   const unit=m.entity(id);if(!unit||unit.hp<=0||unit.owner!=='rai')continue;
   if(context.primaryEventType==='idle.quiet'){if(!banterCrew(m,unit)||!context.affectedIds.includes(id))continue;}
   else if(context.primaryEventType.startsWith('idle.')&&context.primaryEventType!=='idle.crew_history'&&(unit.task||unit.path?.length||unit.pendingOrder||unit.factoryVisit||unit.combatRetreat))continue;
   const crew=p?.crews[id],soldier=crew?.memberIds.map(id=>p.soldiers[id]).find(s=>s&&!s.death);if(!soldier)continue;
   const role=unit.kind==='command'?'commander':m.unitSpec(unit).role==='builder'?'builder':'driver';
   const gender=soldier.gender??'m';
   const prior=this.crews.get(soldier.id);
   const profiles=this.library.characters.filter(c=>c.enabled&&(c.gender??'m')===gender&&(gender==='f'||c.role===role));
   const voice=this.library.characters.find(c=>c.enabled&&c.voiceId===prior?.voiceId&&(c.gender??'m')===gender)??profiles[stableHash(soldier.id)%Math.max(1,profiles.length)];
   this.crews.set(soldier.id,{crewId:soldier.id,unitId:id,callSignId:soldier.callsign,name:soldier.name,role,voiceId:voice?.voiceId??null,
    portraitId:voice?.portrait??null,persona:voice?.name??role,alive:true,combatReady:true,group:unit.commandGroupId??null,rank:soldier.rank,
    radioChannel:'rai',lastSpoken:prior?.lastSpoken??null,memories:[...this.memories.values()].filter(v=>v.crewIds.includes(soldier.id)).map(v=>v.id).slice(-16)});
   speakers.push({crewId:soldier.id,unitId:id,callSign:soldier.callsign??crew.designation,name:soldier.name,givenName:soldier.givenName,gender,rank:soldier.rank,role,alive:true,combatReady:true,radioChannel:'rai',
    speaker:gender==='f'?'crew-female':role==='commander'?'commander':role==='builder'?'builder':'scout',portrait:voice?.portrait,voiceId:voice?.voiceId});
  }
  for(const [id,crew] of this.crews)if(p?.soldiers[id]?.death)crew.alive=false;
  if(context.primaryEventType.startsWith('idle.')){
   const present=new Set(speakers.map(s=>s.crewId)),shared=[...this.memories.values()].findLast(memory=>memory.crewIds.filter(id=>present.has(id)).length>=2);
   context.facts.sharedTraffic=!!shared;
   if(shared){context.facts.sharedTrafficIncident=shared.id;context.memorySpeakerIds=shared.crewIds.filter(id=>present.has(id));}
  }
  let relevant=true;
  const tactical=this.intel.enrich(m,context);
  if(context.primaryEventType==='recon.enemy_first_seen')relevant=tactical.contactsRelevant;
  if(context.primaryEventType==='damage.hit')relevant=context.affectedIds.some(id=>m.entity(id)?.hp>0);
  if(['command.retreat','command.auto_retreat'].includes(context.primaryEventType))relevant=context.affectedIds.every(id=>m.entity(id)?.hp>0&&m.entity(id)?.combatRetreat?.status==='moving'&&context.orderIds.includes(this.retreatOrders.get(id)?.orderId));
  else if(context.primaryEventType.startsWith('command.')&&context.orderIds?.length)relevant=context.affectedIds.every(id=>{
   const unit=m.entity(id);return unit?.hp>0&&context.orderIds.includes(this.assignments.get(id)?.orderId);
  });
  if(context.primaryEventType==='traffic.queue_blocked')relevant=context.incidentIds.some(id=>this.traffic.incidents.get(id)?.status==='open');
  if(['traffic.retreat_contact','traffic.panic_blocked','traffic.panic_escaped'].includes(context.primaryEventType)){
   const unit=m.entity(context.actorIds[0]);relevant=unit?.hp>0;
   if(context.primaryEventType==='traffic.panic_blocked')relevant=relevant&&!!unit.combatRetreat&&(unit.navigation?.waitSeconds??0)>=1;
   if(context.primaryEventType==='traffic.retreat_contact')relevant=relevant&&!!unit.combatRetreat&&unit.combatRetreat.status!=='arrived'&&unit.factoryVisit?.phase!=='inside';
  }
  return {speakers,relevant,combat:this.time-(this.engine.state.lastCombat??-100)<8};
 }
 next(options){this.bind();if(this.warmingUp){this.clearStartupQueue();return null;}const line=this.engine.next(this.time,options);if(line&&this.crews.has(line.crewId))this.crews.get(line.crewId).lastSpoken=this.time;return line;}
 save(){this.bind();this.mission.state.dynamicRadio={version:1,engine:this.engine.save(),traffic:this.traffic.save(),previous:[...this.previous],orders:[...this.orders],assignments:[...this.assignments],retreatOrders:[...this.retreatOrders],eventWindows:[...this.eventWindows],crews:[...this.crews],memories:[...this.memories],intel:this.intel.save(),crewStories:this.crewStories.save(),banter:this.banter.save(),retreatIncidents:this.retreatIncidents.save()};}
}

export async function loadRadioLibrary(){
 await loadRecordedSpeech();
 const response=await fetch('/api/radio/published').catch(()=>null);
 const seed=await fetch(new URL('../../assets/radio/situations_catalog.json',import.meta.url));
 if(!seed.ok){if(response?.ok)return (await response.json()).document;throw Error('Библиотека радио недоступна');}
 const defaults=await seed.json();return response?.ok?mergeRetreatLibrary((await response.json()).document,defaults):defaults;
}
