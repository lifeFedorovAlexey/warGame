import {RadioEngine,aggregateContext} from './engine.js';
import {composition} from './tactical-intel.js';

// Explicit editor fixture, never attached to a Mission or its authoritative state.
export function simulateRadio(library,{type='command.move',count=20,hits=1,orders=1,killed=0,wounded=0,losses=0,seed='preview',squad='preview',simTime=0,combat=false,crewKnown=true,legacy=false,tone='any',explosionConfirmed=false,enemyPreset=null,lostVeteran=false,lostNewcomerRemembered=false}={}){
 if(tone!=='any'){
  library=structuredClone(library);
  for(const rule of library.rules)for(const tier of rule.tiers)tier.graphs=tier.graphs.filter(g=>tone==='dry'?g.humor:!g.humor);
 }
 const ids=Array.from({length:Math.max(1,count)},(_,i)=>'preview-unit-'+i);
 const speakers=Array.from({length:Math.max(3,count)},(_,i)=>({crewId:'preview-crew-'+i,unitId:ids[i]??'survivor-'+i,callSign:['Кедр','Буран','Волга'][i%3]+(i>=3?'-'+i:''),name:['Алексей','Сергей','Виктор'][i%3],role:'driver',voiceId:'voice-'+(1+i%2),alive:true,radioChannel:'rai'}));
 const preset=enemyPreset??(type==='recon.enemy_first_seen'?'mixed':'none');
 const kinds=preset==='towers'?['mg-tower','mg-tower']:preset==='mixed'?['raider','raider','raider','scav-firetruck']:[];
 const enemies=kinds.map((kind,i)=>({id:'seen-'+i,kind,weapon:kind==='scav-firetruck'?'flame':'mg'}));
 const enrich=c=>{c.knownEnemyCount=enemies.length;c.knownAttackerCount=enemies.length;c.towerSourceCount=enemies.filter(e=>e.kind==='mg-tower').length;c.machinegunSourceCount=enemies.filter(e=>e.weapon==='mg').length;c.flamethrowerSourceCount=enemies.filter(e=>e.weapon==='flame').length;
  const text=composition(enemies),report=text?text[0].toLocaleUpperCase('ru')+text.slice(1):'';
  Object.assign(c.facts,{enemyComposition:text,enemyReport:report,attackerComposition:text,attackerReport:report,fireCurrent:enemies.length>0,enemyHasFlamer:enemies.some(e=>e.weapon==='flame'),observedEnemies:enemies,observedAttackers:enemies,
   personalLossCount:losses,lostCallSign:'Грач',lostName:'Иван',lostVeteran,lostNewcomerRemembered,mentorId:speakers[0].crewId,newcomerId:speakers[1].crewId,
   panickedId:speakers[0].crewId,bumpedId:speakers[1].crewId,witnessId:speakers[1].crewId,urgency:.9,escaped:type==='traffic.panic_escaped',hadContact:true,
   confirmedDeath:crewKnown&&killed>0,casualtyCallSign:'Грач',casualtyGender:'m'});return c;};
 const engine=new RadioEngine(library,{missionId:seed,snapshot:c=>{enrich(c);return {speakers};},legacy:()=>legacy});
 const contexts=[],raw=Math.max(orders,type==='damage.hit'?hits:1);
 for(let i=0;i<raw;i++)engine.event({id:'fixture-'+i,tickId:Math.round(simTime*10),simTime,type,orderId:type.startsWith('command.')?'order-'+(i%orders):undefined,
  incidentId:type.startsWith('command.')?undefined:'incident-1',orderIds:type==='traffic.network_overload'?Array.from({length:orders},(_,i)=>'order-'+i):undefined,
  squadId:squad,actorIds:ids,affectedIds:ids,targetIds:ids,objectIds:ids,
  facts:{destroyedIds:ids.slice(0,losses),killedIds:Array.from({length:killed},(_,i)=>'dead-'+i),woundedIds:Array.from({length:wounded},(_,i)=>'wounded-'+i),
   crewKnown,woundedKnown:true,explosionConfirmed,resolution:type==='traffic.jam_resolved'?'resolved':'ongoing',incidentStartedAt:simTime-12,trafficProgress:0,hitCount:type==='damage.hit'?1:0},
  flags:{confirmed:true,hasCombat:combat}});
 const readyAt=Math.max(simTime+10,...[...engine.pending.values()].map(b=>b.end));
 for(const bucket of engine.pending.values())contexts.push(enrich(aggregateContext(bucket,readyAt)));
 engine.tick(Math.round(readyAt*10),readyAt);
 const candidates=structuredClone(engine.state.queue),lines=[];
 let time=readyAt;
 for(let i=0;i<100;i++){
  const line=engine.next(time);if(line){lines.push(line);engine.completeLine();}time+=3;
  if(!engine.active&&!engine.state.queue.length)break;
 }
 return {contexts,candidates,lines,diagnostics:engine.diagnostics()};
}
