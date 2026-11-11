import {isCampPerimeter} from './camp-demolition.js';
import layout from '../assets/campaign/alpha/mission02/layout.js';
import {M02} from './mission02-config.js';
import {updateCampaignProductionSteps} from './scav-production.js';
import {captureCampResources} from './camp-resources.js';
import {installM02Fortifications} from './mission02-fortifications.js';
import {beginPersonnelMission,finalizeMissionResults} from './personnel.js';
import {clearedCampAtM02Site,inheritClearedM02Site} from './mission02-continuity.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const names={east_factory:'Восточная площадка',hill_factory:'Завод на плато',sensor_outpost:'Разведывательный форпост',energy_hub:'Южный энергоузел'};
const artifactIds={'flamer-upgrade':'flamer_upgrade','twin-machinegun':'twin_machinegun',sensor:'sensor','power-module':'power_module'};
const liveIndex=mission=>new Map([...mission.state.units,...mission.state.buildings].filter(e=>e.hp>0).map(e=>[e.id,e]));

// A player may build on a future site. Keep inherited structures and wrecks;
// a conquered m01 yard is handled separately before this placement runs.
function placement(mission,item,inherited){
 const origin=mission.field.gridToWorld(item.grid),hw=item.halfWidth,hd=item.halfDepth;
 const overlaps=(p,b,gap=0)=>Math.abs(p.x-b.x)<hw+b.halfWidth+gap&&Math.abs(p.y-b.y)<hd+b.halfDepth+gap;
 if(!inherited.some(b=>overlaps(origin,b,8)))return origin;
 const candidates=[];
 for(let dy=-256;dy<=256;dy+=16)for(let dx=-256;dx<=256;dx+=16)candidates.push({x:origin.x+dx,y:origin.y+dy,score:dx*dx+dy*dy});
 candidates.sort((a,b)=>a.score-b.score||a.x-b.x||a.y-b.y);
 for(const p of candidates){
  if(!mission.inBounds(p.x,p.y)||mission.state.buildings.some(b=>(b.hp>0||b.damage?.wreck)&&overlaps(p,b,16)))continue;
  if(![-1,0,1].every(dx=>[-1,0,1].every(dy=>{const g=mission.field.gradientAt(p.x+dx*hw,p.y+dy*hd);return Math.hypot(g.x,g.y)<.24;})))continue;
  const sign=item.rotation?1:-1,exit={x:p.x,y:p.y+sign*(hd+34)},pose={...exit,kind:'bukhanka',owner:'scavs',heading:item.rotation??0};
  if(!mission.vehicleMotionClear(pose,pose,pose)||!mission.nav.findPath(mission.field.gridToWorld(mission.config.startGrid),exit)?.length)continue;
  return p;
 }
 throw new Error('Нет свободной площадки для '+item.id);
}
function freeUnitPoint(mission,origin,kind,occupied=[]){
 const candidates=[origin];
 for(let radius=32;radius<=256;radius+=32)for(let side=0;side<16;side++){const a=side*Math.PI/8;candidates.push({x:origin.x+Math.cos(a)*radius,y:origin.y+Math.sin(a)*radius});}
 for(const p of candidates){const pose={...p,kind,owner:'scavs',heading:0};
  if(mission.inBounds(p.x,p.y)&&!occupied.some(u=>Math.hypot(u.x-p.x,u.y-p.y)<28)&&mission.vehicleMotionClear(pose,pose,pose))return p;
 }
 throw new Error('Нет свободного места для гарнизона');
}

export function enterM02(mission){
 mission.finishPendingStep();
 const s=mission.state;
 if(s.m02?.initialized)return {ok:true,alreadyInitialized:true};
 if(s.status!=='victory'||s.mission!==mission.config.id)return mission.fail('Сначала завершите первую миссию');
 const checkpoint=mission.save();
 try{
 const campaign=s.campaign??={version:1,results:{}};
 campaign.results??={};campaign.version??=1;
 Object.assign(campaign.results.m01??={},{status:'victory',time:s.time,statistics:{...s.statistics},camps:s.camps.filter(c=>c.cleared).map(c=>c.id)});
 const m=s.m02={version:M02.version,initialized:false,startedAt:s.time,nextCheckAt:s.time,bases:{},objectives:{},entranceIds:[],groups:[],observer:{state:'watching',seen:false,outcome:null},energyFound:false};
 s.bounds=layout.bounds.slice();s.status='running';s.mission='m02';campaign.current='m02';
 beginPersonnelMission(mission);
 if(s.storyConstruction)s.storyConstruction.enabled=false;
 if(s.radioStory){s.radioStory.includeOpening=false;s.radioStory.active=null;for(const [id,r] of Object.entries(s.radioStory.scenes??{}))if(!id.startsWith('m02-')&&!['done','skipped'].includes(r.status))r.status='cancelled';}
 s.pendingCinematics=[];
 // Only invalid individual targets are retired; groups, valid orders and queues survive.
 const live=liveIndex(mission);
 const inherited=s.buildings.filter(b=>b.hp>0||b.damage?.wreck);
 mission.rebuildNavigation();
 for(const unit of s.units){
  unit.trafficOnScreen=true;
  if(unit.task?.targetId&&!live.has(unit.task.targetId)){unit.task=null;unit.path=[];delete unit.routeOrder;delete unit.combatDeployment;}
 }
 for(const authored of layout.bases){
  const id=authored.id,key=M02.technologies[id],factory=M02.factories[id];
  const base=m.bases[id]={id:'m02.base.'+id,name:names[id],discovered:false,state:'defended',structureIds:[],garrisonIds:[],destroyedIds:[],messages:[],rally:authored.rallyGrids.map(mission.field.gridToWorld),gate:mission.field.gridToWorld(authored.gateGrid)};
  const previous=clearedCampAtM02Site(mission,authored);
  if(previous){inheritClearedM02Site(mission,base,authored,previous);continue;}
  for(const item of authored.structures){
   const point=placement(mission,item,inherited),original=mission.field.gridToWorld(item.grid),dx=point.x-original.x,dy=point.y-original.y;
   const building=mission.addStructure(item.kind,'scavs',point,{id:item.id,m02Base:id,scenarioId:item.id,sourceId:item.sourceId,
    halfWidth:item.halfWidth,halfDepth:item.halfDepth,rotation:item.rotation??0,...(item.resource?{campId:base.id,campResource:true,scavVariant:'scav-oil'}:{})});
   building.groundHeight=Math.max(...[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=>mission.field.heightAt(point.x+dx*building.halfWidth,point.y+dy*building.halfDepth))));
   if(!item.resource)base.structureIds.push(building.id);
   if(item.kind==='scav-factory'){base.factoryId=building.id;base.production={active:factory.activation==='immediate',nextAt:s.time+factory.seconds,waiting:[],count:0,waves:0,retryAt:0,alarmed:false};}
   if(item.kind===(id==='energy_hub'?'generator':id==='sensor_outpost'?'scav-sensor':'scav-factory')){
    const pickup=mission.field.gridToWorld(item.pickupGrid);pickup.x+=dx;pickup.y+=dy;
    base.artifact={id:'m02.artifact.'+artifactIds[key],key,carrierId:building.id,carrierPosition:{...point},point:pickup,state:s.research[key]?'collected':'sealed'};
    if(s.research[key]&&!s.artifactKeys.includes(key))s.artifactKeys.push(key);
   }
   if(dx||dy){building.originalGrid=item.grid.slice();mission.rebuildNavigation();}
  }
  mission.rebuildNavigation();
  base.rally=base.rally.map(p=>freeUnitPoint(mission,p,'bukhanka'));
  for(const [i,kind] of M02.guards[id].entries()){
   const point=freeUnitPoint(mission,mission.field.gridToWorld(authored.guardGrids[i]),kind,s.units.filter(u=>u.hp>0));
   const u=mission.addUnit(kind,'scavs',point,{scenarioId:`m02.${id}.guard${i}`,m02Base:id,guard:{...point}});base.garrisonIds.push(u.id);
  }
 }
 for(const item of layout.entrance){const b=mission.addStructure(item.kind,'scavs',mission.field.gridToWorld(item.grid),{id:item.id,scenarioId:item.id,sourceId:item.sourceId});m.entranceIds.push(b.id);}
 for(const [i,grid] of layout.entranceGuards.entries()){
  const point=mission.field.gridToWorld(grid);const u=mission.addUnit('scav-zaporozhets','scavs',point,{scenarioId:'m02.entrance.guard'+i,guard:{...point}});m.entranceIds.push(u.id);
 }
 const observer=mission.addUnit('sensor','unknown',mission.field.gridToWorld(layout.observer.grid),{scenarioId:'m02.observer',paint:'sand'});
 m.observer.unitId=observer.id;m.observer.exit=mission.field.gridToWorld(layout.observer.exitGrid);
 installM02Fortifications(mission);
 mission.rebuildNavigation();
 m.continuityVersion=1;m.initialized=true;mission.updateFog();mission.emit('mission-start',{mission:'m02'});
 return {ok:true};
 }catch(error){mission.load(checkpoint);return mission.fail('Не удалось подготовить южный сектор: '+error.message);}
}

export function m02Objectives(mission){
 const m=mission.state.m02,bases=Object.values(m.bases),collected=bases.filter(b=>b.artifact.state==='collected');
 return [
  {id:'m02.locate_energy_source',name:'Обнаружить энергетический объект',done:m.energyFound},
  {id:'m02.suppress_outposts',name:'Подавить опорные пункты',done:bases.every(b=>b.state==='neutralized'),progress:bases.filter(b=>b.state==='neutralized').length+'/4'},
  {id:'m02.recover_technologies',name:'Собрать технологические образцы',done:collected.length===4,progress:collected.length+'/4',samples:bases.map(b=>({key:b.artifact.key,name:mission.config.research[b.artifact.key].name,collected:b.artifact.state==='collected'}))},
  ...(m.observer.seen?[{id:'m02.intercept_observer',name:m.observer.outcome==='intercepted'?'Наблюдатель перехвачен':m.observer.outcome==='escaped'?'Наблюдатель ушёл':'Перехватить неизвестного наблюдателя',optional:true,done:!!m.observer.outcome,progress:''}]:[]),
 ];
}

export function updateM02(mission){
 const s=mission.state,m=s.m02;
 if(!m?.initialized||s.status!=='running'||s.time+1e-7<m.nextCheckAt)return;
 m.nextCheckAt=s.time+M02.checkInterval;
 const live=liveIndex(mission),allies=s.units.filter(u=>u.owner==='rai'&&u.hp>0);
 const visible=e=>e&&mission.visibleAt(e.x,e.y);
 const entrance=mission.field.gridToWorld(m.version===1?[38,84]:layout.entranceGrid);
 if(allies.some(u=>distance(u,entrance)<300)||m.entranceIds.some(id=>visible(live.get(id))))m.entranceSeen=true;
 for(const [id,base] of Object.entries(m.bases)){
  // Auxiliary stores/barracks count too, including in older saves.
  // Capturable resources transfer when the base is neutralized.
  const ids=new Set(base.structureIds),structures=s.buildings.filter(b=>b.hp>0&&b.owner==='scavs'&&!isCampPerimeter(b)&&!b.campResource
   &&(ids.has(b.id)||b.m02Base===id||b.campId===base.id)),guards=base.garrisonIds.map(id=>live.get(id)).filter(Boolean);
  base.destroyedIds=[...base.structureIds,...base.garrisonIds].filter(id=>!live.has(id));
  if(structures.some(visible)||guards.some(visible))base.discovered=true;
  const near=allies.some(u=>distance(u,base.gate)<(M02.factories[id]?.radius??350));
  if(base.state!=='neutralized'){
   // Membership, not a one-metre zone crossing, determines the finite home garrison.
   // Produced raiders never join this list, so there is no map-wide raider hunt.
   if(!structures.length&&!guards.length){base.state='neutralized';base.neutralizedAt=s.time;captureCampResources(mission,base);mission.emit('m02-outpost-neutralized',{base:id});}
   else base.state=near||base.destroyedIds.length?'contested':'defended';
  }
  const p=base.production,cfg=M02.factories[id];
  if(p){
   p.alarmed ||= near||base.destroyedIds.length>0;
   if(!p.active&&(near||cfg.activation==='south'&&(allies.some(u=>mission.field.worldToGrid(u.x,u.y)[1]>108)||s.time-m.startedAt>=cfg.delay))){p.active=true;p.activatedAt=s.time;p.nextAt=s.time+cfg.seconds;}
   if(!live.has(base.factoryId)||base.state==='neutralized'){p.stopped=true;p.waiting=[];}
   if(p.count&&visible(live.get(base.factoryId)))base.productionObserved=true;
  }
  const artifact=base.artifact;
  if(artifact.state==='sealed'&&!live.has(artifact.carrierId)){
   artifact.state='available';
   if(!s.artifacts.some(a=>a.id===artifact.id))s.artifacts.push({id:artifact.id,key:artifact.key,...artifact.point,collected:false,mission:'m02'});
   mission.emit('m02-artifact-released',{id:artifact.id,key:artifact.key});
  }
  if(artifact.state==='available'){
   const pickup=s.artifacts.find(a=>a.id===artifact.id);
   if(pickup?.collected||allies.some(u=>distance(u,artifact.point)<24)){
    artifact.state='collected';if(pickup)pickup.collected=true;
    if(!s.artifactKeys.includes(artifact.key))s.artifactKeys.push(artifact.key);
    mission.emit('artifact-collected',{key:artifact.key});
   }
  }
 }
 const source=m.bases.energy_hub.artifact.carrierPosition;
 if(visible(source))m.energyFound=true;
 const o=m.observer,u=live.get(o.unitId);
 // Death wins over crossing the exit in the same completed tick.
 if(!o.outcome){
  if(!u){o.state='destroyed';o.outcome='intercepted';o.resolvedAt=s.time;}
  else if(o.state==='fleeing'&&distance(u,o.exit)<24){o.state='escaped';o.outcome='escaped';o.resolvedAt=s.time;s.units=s.units.filter(e=>e.id!==u.id);mission.unitIndex.rebuild(s.units);}
  else if(!o.seen&&(visible(u)||allies.some(a=>distance(a,u)<200))){o.seen=true;o.state='fleeing';o.needsRoute=true;}
 }
 if(o.outcome){(s.campaign.results.m02??={}).observer=o.outcome;}
 m.objectives=Object.fromEntries(m02Objectives(mission).map(o=>[o.id,{done:o.done,progress:o.progress}]));
 const canRecover=allies.some(u=>mission.unitSpec(u).role==='builder')||s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind==='factory');
 if(!canRecover){s.status='defeat';m.result='defeat';finalizeMissionResults(mission);mission.emit('defeat',{reason:'Утрачены строители и производство'});return;}
 if(m02Objectives(mission).filter(o=>!o.optional).every(o=>o.done)){
  s.status='victory';m.result='victory';m.completedAt=s.time;
  Object.assign(s.campaign.results.m02??={},{status:'victory',time:s.time,observer:o.outcome,artifacts:Object.values(m.bases).map(b=>b.artifact.key)});
  for(const b of Object.values(m.bases))if(b.production)b.production.stopped=true;
  mission.emit('victory',{mission:'m02'});
  finalizeMissionResults(mission);
 }
}

export function* updateM02Steps(mission){
 if(!mission.state.m02||mission.state.status!=='running')return;
 const o=mission.state.m02.observer;
 if(o.needsRoute&&mission.state.time>=(o.retryAt??0)){
  const unit=mission.entity(o.unitId);
  if(unit){const path=yield* mission.vehiclePathSteps(unit,o.exit,{fallback:false,maxGoalDistance:12});
   if(path?.length){unit.path=path;unit.task={type:'move',...path.at(-1)};o.needsRoute=false;}else o.retryAt=mission.state.time+2;}
 }
 yield* updateCampaignProductionSteps(mission);
}

export function m02Signal(mission){
 const m=mission.state.m02;
 if(!m)return null;
 const artifact=Object.values(m.bases).find(b=>b.artifact.state==='available'&&mission.exploredAt(b.artifact.point.x,b.artifact.point.y))?.artifact;
 const point=artifact?.point??mission.field.gridToWorld([79,116]);
 return {...point,kind:artifact?'artifact':'anomaly',label:artifact?'К технологическому образцу':'Примерный район энергетического сигнала',distance:650};
}
