import {russianNumber,stableHash} from './conditions.js';
import {composition} from './tactical-intel.js';

// Keep confirmed wreck identities after their entities disappear from the map.
// Receipt counters advance only when their line actually gets the channel.
export class CombatReports{
 constructor(saved={}){this.records=new Map(saved.records??[]);this.serial=saved.serial??0;this.lastJoke=saved.lastJoke??-10000;}
 destroyed(target,source,operation,now,window,emit,{exploded=false}={}){
  if([...this.records.values()].some(r=>r.targets.some(t=>t.id===target.id)))return;
  let r=[...this.records.values()].findLast(r=>r.operation===operation&&now<r.until);
  if(!r){r={id:'kills-'+(++this.serial),operation,until:now+window,targets:[],reported:[]};this.records.set(r.id,r);}
  if(r.targets.some(t=>t.id===target.id))return;
  r.targets.push({id:target.id,kind:target.kind,sourceId:source.id});
  const own=r.targets.filter(t=>t.sourceId===source.id),unspoken=own.filter(t=>!r.reported.includes(t.id));
  emit('combat.kill_confirmed',{rootCauseId:'kill-reaction:'+target.id,
   incidentId:r.id+':'+source.id+':'+r.reported.length,actorIds:[source.id],affectedIds:[source.id],targetIds:unspoken.map(t=>t.id),
   facts:{engagementId:r.id,followup:own.some(t=>r.reported.includes(t.id)),killCountWord:russianNumber(unspoken.length),resolution:'resolved'},
   flags:{confirmed:true,hasCombat:true}});
  emit('combat.target_destroyed',{rootCauseId:'destroyed:'+target.id,incidentId:r.id,
   actorIds:[source.id],affectedIds:[source.id],targetIds:[target.id],
   facts:{engagementId:r.id,destroyedComposition:composition(r.targets),explosionConfirmed:exploded,resolution:'resolved'},
   flags:{confirmed:true,hasCombat:true}});
  while(this.records.size>128)this.records.delete(this.records.keys().next().value);
 }
 spoken(item,now){
  const r=this.records.get(item.context.facts.engagementId);if(!r)return;
  if(item.type==='combat.kill_confirmed')r.reported=[...new Set([...r.reported,...item.context.targetIds])];
  if(item.type==='combat.target_destroyed'&&r.targets.length>=3&&!r.jokeUntil&&stableHash(r.id+'|'+r.targets.map(t=>t.id).join('|'))%5===0)r.jokeUntil=now+45;
 }
 tick(now,engine,emit){
  if(now-this.lastJoke<180||now-(engine.state.lastCombat??-10000)<8||now-(engine.state.lastLoss??-10000)<60||
   engine.active&&engine.active.cursor<engine.active.lines.length||engine.state.batch.length||engine.state.queue.length||
   [...engine.pending.values()].some(b=>engine.index.get(b.type)?.some(r=>r.priority>=40)))return;
  const r=[...this.records.values()].find(r=>r.jokeUntil>=now&&!r.joked);if(!r)return;
  r.joked=true;this.lastJoke=now;
  const actors=[...new Set(r.targets.map(t=>t.sourceId))];
  emit('combat.kill_banter',{incidentId:r.id+':medal',actorIds:actors,affectedIds:actors,targetIds:r.targets.map(t=>t.id),facts:{engagementId:r.id},flags:{confirmed:true}});
 }
 save(){return {records:[...this.records],serial:this.serial,lastJoke:this.lastJoke};}
}
