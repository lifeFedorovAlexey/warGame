import {allocatePersonnelName} from './personnel-names.js';
import {rankById,promotePersonnel} from './personnel-ranks.js';
import {awardMissionPersonnel} from './personnel-awards.js';
import {allocateCallsign} from './personnel-callsigns.js';

export const personnelMissionId=mission=>mission.state.m03?'m03':mission.state.m02?'m02':'m01';
const emptyCounts=()=>({enemyUnitsDestroyed:0,enemyStructuresDestroyed:0,ownUnitsLost:0,personnelLost:0});
const copy=value=>structuredClone(value);
const mobile=(mission,entity)=>!!mission.config.units[entity?.kind];

export function ensurePersonnel(mission,{legacy=false}={}){
 const s=mission.state,c=s.campaign??={version:1,results:{}};
 c.results??={};
 if(!c.personnel)c.personnel={version:1,serial:0,names:{},soldiers:{},crews:{},graveOrder:[],missions:{},
  historyComplete:!legacy,trackingStartedAt:s.time,trackingStartedIn:personnelMissionId(mission)};
 return c.personnel;
}

export function beginPersonnelMission(mission,{legacy=false}={}){
 const p=ensurePersonnel(mission,{legacy}),id=personnelMissionId(mission),s=mission.state;
 return p.missions[id]??={id,startedAt:s.m03?.startedAt??s.m02?.startedAt??0,trackingStartedAt:legacy?s.time:(s.m03?.startedAt??s.m02?.startedAt??0),historyComplete:!legacy,
  baseline:{produced:s.statistics?.produced??0,buildingsCompleted:s.statistics?.buildingsCompleted??0},...emptyCounts(),casualtyIds:[]};
}

export function registerPersonnel(mission,unit,{legacy=false}={}){
 if(unit.owner!=='rai'||!mobile(mission,unit))return null;
 const p=ensurePersonnel(mission,{legacy});
 if(p.crews[unit.id])return p.crews[unit.id];
 const phase=beginPersonnelMission(mission,{legacy});
 const crew=p.crews[unit.id]={unitId:unit.id,designation:unit.id.toUpperCase(),kind:unit.kind,memberIds:[]};
 // Current game entities represent one named fighter; multi-person vehicles
 // can supply crewSize without changing the save or memorial format.
 const size=Math.max(1,Math.min(32,Math.trunc(mission.config.units[unit.kind].crewSize??1)));
 for(let i=0;i<size;i++){
  const id='soldier-'+(++p.serial),identity=allocatePersonnelName(p.names);
  p.soldiers[id]={id,...identity,callsign:allocateCallsign(p),rank:'private',unitId:unit.id,joinedMission:phase.id,joinedAt:mission.state.time,
   historyComplete:!legacy,kills:0,structuresDestroyed:0,missions:{},death:null};
  crew.memberIds.push(id);
 }
 return crew;
}

function credit(mission,source,target,phase){
 const p=ensurePersonnel(mission);
 // Fire can kill after the firer and its wreck have gone. The crew archive is
 // authoritative even when entity(sourceId) no longer returns a live unit.
 const id=source?.id??target.burning?.sourceId,crew=p.crews[id];
 if(source?.owner!=='rai'&&!crew)return;
 const unitTarget=mobile(mission,target),counter=unitTarget?'enemyUnitsDestroyed':'enemyStructuresDestroyed';
 phase[counter]++;
 for(const soldierId of crew?.memberIds??[]){
  const soldier=p.soldiers[soldierId],counts=soldier.missions[phase.id]??={kills:0,structuresDestroyed:0};
  const key=unitTarget?'kills':'structuresDestroyed';soldier[key]++;counts[key]++;
  const previousRank=soldier.rank;
  if(promotePersonnel(soldier))mission.emit?.('personnel-promoted',{soldierId,unitId:crew.unitId,previousRank,rank:soldier.rank});
 }
}

export function recordPersonnelDeath(mission,target,source,{legacy=false,cause}={}){
 if(target.hp>0)return;
 const phase=beginPersonnelMission(mission,{legacy});
 if(phase.report)return; // Completed results are an immutable mission boundary.
 const recorded=phase.recordedDeaths??={};if(recorded[target.id])return;recorded[target.id]=true;
 if(['scavs','unknown'].includes(target.owner)){
  if(!legacy)credit(mission,source,target,phase);
  return;
 }
 if(target.owner!=='rai'||!mobile(mission,target))return;
 const p=ensurePersonnel(mission),crew=registerPersonnel(mission,target,{legacy});
 phase.ownUnitsLost++;
 for(const id of crew.memberIds){
  const soldier=p.soldiers[id];if(soldier.death)continue;
  soldier.death={missionId:phase.id,at:target.destroyedAt??mission.state.time,rank:soldier.rank,
   designation:crew.designation,unitKind:target.kind,unitName:target.designName??mission.config.units[target.kind].name,
   position:{x:target.x,y:target.y},cause:cause??(source?.owner==='rai'?'friendly-fire':source?'combat':'unknown'),killerId:source?.id??target.burning?.sourceId??null};
  soldier.graveIndex=p.graveOrder.length;p.graveOrder.push(id);phase.casualtyIds.push(id);phase.personnelLost++;
 }
}

export function restorePersonnel(mission){
 const legacy=!mission.state.campaign?.personnel&&mission.state.time>0;
 ensurePersonnel(mission,{legacy});beginPersonnelMission(mission,{legacy});
 const p=ensurePersonnel(mission);for(const s of Object.values(p.soldiers)){s.callsign??=allocateCallsign(p);promotePersonnel(s);}
 for(const unit of mission.state.units){
  registerPersonnel(mission,unit,{legacy});
  if(unit.owner==='rai'&&unit.hp<=0)recordPersonnelDeath(mission,unit,null,{legacy,cause:'unknown'});
 }
 if(mission.state.status!=='running')finalizeMissionResults(mission);
}

export function setPersonnelRank(mission,id,rank){
 const soldier=ensurePersonnel(mission).soldiers[id];
 if(!soldier||soldier.death||!rankById(rank))return false;
 soldier.rank=rank;return true;
}

export function memorialMarker(rank,styles={}){return styles[rank]??'cross-default';}
export function campaignMemorial(mission,{ids,styles}={}){
 const p=ensurePersonnel(mission);
 return (ids??p.graveOrder).map(id=>{
  const soldier=p.soldiers[id];if(!soldier?.death)return null;
  return {...copy(soldier),rank:soldier.death.rank,marker:memorialMarker(soldier.death.rank,styles),
   kills:soldier.historyComplete?soldier.kills:null,knownKills:soldier.kills};
 }).filter(Boolean);
}

export function finalizeMissionResults(mission){
 const s=mission.state;if(!['victory','defeat'].includes(s.status))return null;
 const p=ensurePersonnel(mission),phase=beginPersonnelMission(mission);
 if(phase.report)return phase.report;
 for(const unit of s.units){registerPersonnel(mission,unit);if(unit.owner==='rai'&&unit.hp<=0)recordPersonnelDeath(mission,unit,null);}
 const awards=awardMissionPersonnel(p,phase,s.status);
 if(awards.length)mission.emit?.('personnel-awarded',{mission:phase.id,awards});
 phase.report={version:1,missionId:phase.id,outcome:s.status,startedAt:phase.startedAt,endedAt:s.time,
  durationSeconds:Math.max(0,s.time-phase.startedAt),historyComplete:phase.historyComplete,campaignHistoryComplete:p.historyComplete,
  trackingStartedAt:phase.trackingStartedAt,statistics:{...Object.fromEntries(Object.keys(emptyCounts()).map(key=>[key,phase[key]])),
   produced:Math.max(0,(s.statistics?.produced??0)-phase.baseline.produced),buildingsCompleted:Math.max(0,(s.statistics?.buildingsCompleted??0)-phase.baseline.buildingsCompleted)},
  casualtyIds:[...phase.casualtyIds],memorialIds:[...p.graveOrder],survivorIds:Object.values(p.soldiers).filter(v=>!v.death&&v.status!=='missing').map(v=>v.id),
  casualties:campaignMemorial(mission,{ids:phase.casualtyIds}),memorial:campaignMemorial(mission),
  survivors:Object.values(p.soldiers).filter(v=>!v.death&&v.status!=='missing').map(copy)};
 const existing=s.campaign.results[phase.id]??={};
 Object.assign(existing,{status:s.status,time:s.time,personnelReportVersion:1});
 mission.emit?.('mission-results-ready',{mission:phase.id,outcome:s.status});
 return phase.report;
}

export function missionResults(mission,id=personnelMissionId(mission)){
 if(id===personnelMissionId(mission))finalizeMissionResults(mission);
 const p=ensurePersonnel(mission),report=p.missions[id]?.report;if(!report)return null;
 return copy(report);
}

export function personnelLabel(mission,unit,base){
 const p=mission.state.campaign?.personnel,crew=p?.crews[unit?.id];if(!crew)return base;
 return [base,crew.designation,crew.memberIds.map(id=>'«'+p.soldiers[id].callsign+'»').join(', ')].filter(Boolean).join(' · ');
}
