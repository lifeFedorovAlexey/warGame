import {M03} from './mission03-config.js';
import {ensureTransport,requestTransport,departTransport,unloadTransport} from './korovnik-transport.js';
import {beginPersonnelMission,finalizeMissionResults} from './personnel.js';
import {m03Source,m03Point} from './mission03-terrain.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function enterM03(mission){
 mission.finishPendingStep();const s=mission.state;
 if(s.m03)return {ok:true,alreadyInitialized:true};
 if(!s.m02||s.status!=='victory')return mission.fail('Сначала завершите вторую миссию');
 s.m03={version:1,location:'home',phase:'preparation',startedAt:s.time,nextCheckAt:s.time,remaining:mission.config.m03.seconds,events:{briefing:true},launchedIds:[],artifact:{...M03.artifact,state:'sealed',carrierId:null},losses:[],leftBehind:[],evacuated:[]};
 s.mission='m03';s.status='running';s.campaign.current='m03';s.pendingCinematics=[];
 if(s.radioStory){s.radioStory.active=null;s.radioStory.includeOpening=false;}
 if(s.openingScene)s.openingScene.handedOver=true;
 beginPersonnelMission(mission);mission.emit('mission-start',{mission:'m03'});return {ok:true};
}
export function m03DepartureAllowed(m){
 const e=m.state.m03;if(!e)return {ok:true};const t=ensureTransport(m);
 if(m.state.status!=='running')return m.fail('Операция завершена');
 if(e.location==='home')return e.phase==='preparation'&&t.manifest.length?{ok:true}:m.fail('Погрузите экспедиционную группу');
 if(e.phase==='insertion'||e.phase==='leaving-drop')return {ok:true};
 if(e.artifact.state!=='carried'||!t.manifest.some(c=>c.unit.id===e.artifact.carrierId&&c.unit.hp>0))return m.fail('На борту должна находиться машина с технологией');
 return {ok:true};
}
export function m03RequestAllowed(m){
 const e=m.state.m03;if(!e)return {ok:true};
 if(m.state.status!=='running')return m.fail('Операция завершена');
 if(e.location==='home')return e.phase==='preparation'?{ok:true}:m.fail('Экспедиция уже завершена');
 if(e.artifact.state!=='carried')return m.fail('Сначала найдите технологию');
 if(!m.state.units.some(u=>u.owner==='rai'&&u.hp>0&&distance(u,m.transportSite())<M03.evacuationRadius))return m.fail('Подойдите к зоне эвакуации');
 e.events.evacuation=true;return {ok:true};
}
export function initializeM03Expedition(m){
 const e=m.state.m03;if(e.location!=='expedition'||e.initialized)return;
 e.initialized=true;e.phase='insertion';e.nextCheckAt=m.state.time;
 const kinds={BarbarianBuggy:'scav-zaporozhets',BabaJeep:'raider',BarbarianTrike:'scav-trike',BaBaPeople:'scav-rifleman'};
 e.patrol=[];
 for(const row of m03Source.units){
  const p=m03Point(row.grid),kind=kinds[row.kind];
  const u=m.addUnit(m.config.units[kind]?kind:'raider','scavs',p,{scenarioId:'m03.original.'+row.id,guard:{...p}});if([5,31,32,34].includes(row.id))e.patrol.push(u.id);
 }
 for(const [sourceId,kind,id] of [[114,'m03-flame-tower','m03-flame-tower'],[73,'mg-tower','m03-lookout']]){
  const row=m03Source.structures.find(v=>v.id===sourceId);m.addStructure(kind,'scavs',m03Point(row.grid),{id,sourceId,halfWidth:11,halfDepth:11});
 }
 const warehouse=m03Source.structures.find(v=>v.id===146);
 m.addStructure('camp-core','scavs',m03Point(warehouse.grid),{id:'m03-warehouse',sourceId:146,halfWidth:22,halfDepth:18,hp:1000});
 m.state.artifacts=[{...M03.artifact,collected:false,mission:'m03'}];e.artifact.state='available';
 const t=ensureTransport(m);t.site=m.transportSite();t.phase='approaching';t.elapsed=0;t.door=0;t.airborne=false;
 m.rebuildNavigation();m.updateFog();
}
function failExpedition(m,reason){const e=m.state.m03;e.phase='failed';e.failure=reason;
 e.leftBehind=m.state.units.filter(u=>u.owner==='rai'&&u.hp>0).map(u=>u.id);e.losses=e.launchedIds.filter(id=>!e.leftBehind.includes(id)&&!m.state.transport.manifest.some(c=>c.unit.id===id&&c.unit.hp>0));
 m.state.status='defeat';m.emit('defeat',{reason});finalizeMissionResults(m);}
export function updateM03(m){
 const s=m.state,e=s.m03;if(!e||s.status!=='running'||s.time<e.nextCheckAt)return;
 const elapsed=Math.max(0,s.time-(e.lastCheckAt??s.time));e.lastCheckAt=s.time;e.nextCheckAt=s.time+M03.checkInterval;
 const t=ensureTransport(m),aboard=t.manifest.filter(c=>c.unit.hp>0),allies=s.units.filter(u=>u.owner==='rai'&&u.hp>0);
 if(e.location==='home'){
  if(e.phase==='preparation'){
   if(t.phase==='ready')e.events.transportReady=true;
   if(t.manifest.length)e.events.loading=true;
   if(t.phase==='closing')e.events.departure=true;
   if(t.phase==='departed'&&t.manifest.length){e.launchedIds=t.manifest.map(c=>c.unit.id);beginPersonnelMission(m).participantIds=e.launchedIds.flatMap(id=>s.campaign.personnel.crews[id]?.memberIds??[]);e.travelTo='expedition';}
  }else if(e.phase==='returning'){
   if(t.phase==='ready'&&t.manifest.length&&!t.unloading)unloadTransport(m);
   if(t.phase==='ready'&&!t.manifest.length&&!t.unloading){e.phase='delivery';e.events.returned=true;}
  }else if(e.phase==='delivery'&&s.buildings.some(b=>b.owner==='rai'&&b.kind==='lab'&&b.hp>0&&b.completed)){
   if(!s.artifactKeys.includes(M03.artifact.key))s.artifactKeys.push(M03.artifact.key);
   e.artifact.state='delivered';e.phase='complete';e.completedAt=s.time;
   s.status='victory';finalizeMissionResults(m);s.status='running';m.emit('m03-completed',{evacuated:e.evacuated,leftBehind:e.leftBehind,losses:e.losses});
  }
  if(s.research['heavy-machinegun'])e.events.researchComplete=true;
  return;
 }
 if(e.phase==='insertion'){
  if(['opening','ready'].includes(t.phase))e.events.landing=true;
  if(t.phase==='ready'&&t.manifest.length&&!t.unloading)unloadTransport(m);
  if(t.phase==='ready'&&!t.manifest.length&&!t.unloading){e.phase='leaving-drop';e.timerStartedAt=s.time;e.events.landed=true;departTransport(m);}
 }
 if(e.phase==='leaving-drop'&&t.phase==='departed')e.phase='exploring';
 if(e.timerStartedAt!==undefined&&!e.travelTo){
  e.remaining=Math.max(0,e.remaining-elapsed);if(e.remaining<=300)e.events.fiveMinutes=true;if(e.remaining<=60)e.events.oneMinute=true;
  if(e.remaining<=0){failExpedition(m,'Время операции истекло');return;}
 }
 if(!allies.length&&!aboard.length){failExpedition(m,'Экспедиционная группа уничтожена');return;}
 e.losses=e.launchedIds.filter(id=>!allies.some(u=>u.id===id)&&!aboard.some(c=>c.unit.id===id));
 if((e.patrol??[]).some(id=>{const u=m.entity(id);return u?.hp>0&&m.visibleAt(u.x,u.y);}))e.events.contact=true;
 if(m.visibleAt(M03.artifact.x,M03.artifact.y))e.events.warehouse=true;
 // A dropped crate remains recoverable even after its carrier's wreck despawns.
 const a=e.artifact,fieldArtifact=s.artifacts.find(v=>v.id===a.id);
 if(a.state==='carried'){
  const carrier=m.entity(a.carrierId)??aboard.find(c=>c.unit.id===a.carrierId)?.unit;
  if(carrier?.hp>0){a.lastPosition={x:carrier.x,y:carrier.y};}
  else{a.state='available';a.carrierId=null;if(fieldArtifact)Object.assign(fieldArtifact,a.lastPosition??M03.artifact,{collected:false});}
 }
 if(a.state==='available'&&fieldArtifact){
  const carrier=allies.find(u=>distance(u,fieldArtifact)<24);
  if(carrier){a.state='carried';a.carrierId=carrier.id;a.lastPosition={x:carrier.x,y:carrier.y};fieldArtifact.collected=true;e.events.technology=true;e.phase='evacuating';m.emit('artifact-collected',{key:a.key,carrierId:carrier.id});}
 }
 if(e.events.technology&&allies.some(u=>distance(u,M03.inspection)<M03.inspection.radius))e.events.strangeFind=true;
 if(e.phase==='evacuating'&&t.phase==='departed'&&aboard.some(c=>c.unit.id===a.carrierId)){
  e.evacuated=aboard.map(c=>c.unit.id);e.leftBehind=allies.map(u=>u.id);e.losses=e.launchedIds.filter(id=>!e.evacuated.includes(id)&&!e.leftBehind.includes(id));e.travelTo='home';
 }
 // A real patrol exists from insertion; its orders use the normal navigator.
 if(s.time>=(e.nextPatrolAt??0)){
  e.nextPatrolAt=s.time+8;const points=[[17,41],[18,35],[20,33]].map(m03Point);
  for(const id of e.patrol??[]){const u=m.entity(id);if(!u||u.hp<=0||u.aimTarget||u.path.length)continue;u.m03Waypoint=((u.m03Waypoint??0)+1)%points.length;const p=points[u.m03Waypoint],path=m.nav.findPath(u,p);if(path?.length){u.guard={...p};u.path=path;u.task={type:'move',...p};}}
 }
}
export function m03Objectives(m){const e=m.state.m03;
 const text=e.location==='home'?(e.phase==='preparation'?'Подготовить отряд и вылететь на «Коровнике»':e.phase==='returning'?'Дождаться высадки на основной базе':e.phase==='delivery'?'Передать технологию в действующий НИИ':'Исследовать тяжёлый пулемёт в НИИ'):(e.phase==='insertion'?'Высадить экспедиционную группу':e.artifact.state==='carried'?'Вернуться к месту посадки и эвакуировать находку':e.events.warehouse?'Забрать технологию из склада':'Найти довоенный объект');
 return [{id:'m03-objective',name:text,done:!!m.state.research['heavy-machinegun'],progress:e.location==='expedition'&&e.timerStartedAt!==undefined?`${Math.floor(e.remaining/60)}:${String(Math.floor(e.remaining%60)).padStart(2,'0')}`:''}];
}
// Cross-map saves are complete, self-contained checkpoints. The old base is
// frozen while away; no renderer or transient browser state is authoritative.
export function prepareM03Travel(m){
 m.finishPendingStep();const e=m.state.m03;if(!e?.travelTo)throw new Error('Перелёт ещё не завершён');
 const current=JSON.parse(m.save());
 if(e.travelTo==='expedition'){
  const base=structuredClone(current);delete base.state.m03.travelTo;
  const s=current.state,manifest=s.transport.manifest;delete s.m02;
  Object.assign(s,{units:[],buildings:[],camps:[],artifacts:[],projectiles:[],bounds:M03.bounds.slice(),pendingCinematics:[],raidReserve:[],commandOrders:[],commandGroups:[],parkingGoalReleases:[],salvage:{...s.salvage,items:[]},flags:{raidWon:true}});
  delete s.storyConstruction;delete s.openingScene;delete s.traffic;delete s.factoryTraffic;
  Object.assign(s.m03,{location:'expedition',phase:'insertion',baseSnapshot:base,initialized:false,lastCheckAt:s.time,nextCheckAt:s.time});delete s.m03.travelTo;
  s.transport={...s.transport,phase:'absent',elapsed:0,manifest,queue:[],unloading:false};current.explored=Array(16384).fill(0);current.accumulator=0;
  return current;
 }
 const base=structuredClone(e.baseSnapshot);if(!base)throw new Error('Не найдено сохранение основной базы');
 const s=base.state;s.time=current.state.time;s.campaign=structuredClone(current.state.campaign);s.radioStory=structuredClone(current.state.radioStory);
 s.m03={...structuredClone(e),location:'home',phase:'returning',nextCheckAt:s.time,lastCheckAt:s.time};delete s.m03.baseSnapshot;delete s.m03.travelTo;
 s.transport={...structuredClone(current.state.transport),site:base.state.transport.site,phase:'approaching',elapsed:0,door:0,airborne:false,queue:[],unloading:false};
 for(const id of e.leftBehind)for(const sid of s.campaign.personnel.crews[id]?.memberIds??[]){const soldier=s.campaign.personnel.soldiers[sid];if(soldier&&!soldier.death)soldier.status='missing';}
 base.serial=current.serial;base.randomState=current.randomState;base.accumulator=0;return base;
}
