import {perf} from './performance.js';
import {createStabilityGraph} from './stability-graph.js';
import {setButtonIcon, speedIcon} from '../assets/ui/icons.js';
import {createCampaignWorld} from './world.js';
import {Mission} from './mission.js';
import {canDemolish,demolitionWorkers,requestDemolition,cancelDemolition} from './building-demolition.js';
import {productionFactories} from './factory-production.js';
import {createFactoryRows,updateFactoryRows} from './factory-queues.js';
import {FieldRadio, missionSignal} from './field-radio.js';
import {MissionRadio,loadRadioLibrary} from './radio/adapter.js';
import {raidApproachSignal, visibleRaidContact, warehouseAdvanceHint, waterTowerSignal} from './threat-guidance.js';
import {restoreRadioStory} from './radio-save.js';
import {FieldSound} from './field-sound.js';
import {StoryDirector, loadMissionStory} from './story-director.js';
import {startOpeningConstruction,restoreOpeningConstruction,openingCanHandOver} from './opening-construction.js';
import {OpeningTelevision} from './opening-television.js';
import {OpeningCamera} from './opening-camera.js';
import {mainMenu} from './main-menu.js';
import {ENTRY_STAGES} from './loading-progress.js';
import {storyObjectives} from './story-objectives.js';
import {storyMilestoneNotice} from './story-milestones.js';
import {createMinimap,installMinimapInput} from './minimap.js';
import {VehicleDesigner} from './designer.js';
import {CombatMenu} from './combat-menu.js';
import {armySelectionIds} from './army-selection.js';
import {pickupTarget} from './pickup-orders.js';
import {expandCommandIds} from './group-command.js';
import {isAutomaticRepair} from './combat-retreat-state.js';
import {latestVehicleProject} from './vehicle-designs.js';
import {oilPowerStatus,oilReserved,oilFundingRemaining,oilOrderProgress} from './oil-economy.js';
import {installNavigationTelemetry} from './navigation-telemetry.js';
import {personnelLabel,missionResults,campaignMemorial,setPersonnelRank} from './personnel.js';
import {renderPersonnelSelection} from './personnel-presentation.js';
import {PersonnelNotices} from './personnel-notices.js';
import {MissionResultsView,resultsPresentationReady} from './mission-results.js';
import {MissionEnding} from './mission-ending.js';

const $ = id => document.getElementById(id);
const stabilityGraph=createStabilityGraph();
const saveKey = 'warGame.alpha.mission01.v1';
const autoSaveKey='warGame.alpha.autosave.v1',checkpointKey='warGame.alpha.before-m02.v1';
const diagnosticM02=new URLSearchParams(location.search).get('mission')==='m02';
const latestSaveKey='warGame.alpha.latest-save.v1';
function resumeData(){const latest=localStorage.getItem(latestSaveKey);return latest&&localStorage.getItem(latest)||localStorage.getItem(saveKey)||localStorage.getItem(autoSaveKey);}
const dataUrl = '../assets/campaign/alpha/mission01/gameplay.json';
const selected = new Set();
const miniBackground = new Image();
let world, mission, config, radio, sound, designer, combatMenu, openingTelevision;
let minimapView;
let resultsView,ending;
const personnelNotices=new PersonnelNotices($('personnel-notice'),()=>sound?.signal('complete'));
let active = false, paused = false, speed = 1, resultShown = false, resultPrepared=false;
let openingPlaying = false;
let openingCamera=null;
let pausedBeforeDesigner = false;
let buildOpen = false, buildKind = null, rotation = 0, orderMode = null;
let snapBuildings = true, freePlacement = false;
let pointer = null, drag = null, site = null, placing = null;
let last = performance.now(), lastUi = 0, toastUntil = 0,milestoneToastUntil=0,uiPending=false;
let actionKey = '', rosterKey = '', paletteKey = '', taskKey = '', queueKey = '';
let blockedOrders = new Set(), blockedUntil = 0;
let lastCommandRevision=null,lastCommandFeedback='';
let navigationDebug, navigationDebugLoading;
let navigationTelemetry;
async function toggleNavigationDebug(force){
 navigationDebug??=await (navigationDebugLoading??=import('./navigation-debug.js').then(({installNavigationDebug})=>installNavigationDebug(world,mission,()=>selected)));
 navigationDebug.setEnabled(force??!navigationDebug.enabled);
 if(window.campaign)window.campaign.navigationDebug=navigationDebug;
}

const vehicles = () => mission.state.units.filter(unit => unit.owner === 'rai' && unit.hp > 0);
const builders = () => vehicles().filter(unit => config.units[unit.kind].role === 'builder');
const repairing = unit => isAutomaticRepair(unit,unit&&config.units[unit.kind]&&mission.unitSpec(unit));
const selectable = entity => !!entity&&entity.hp>0;
const selection = () => [...selected].map(id => mission.entity(id)).filter(selectable);
function pruneSelection(){for(const id of selected)if(!selectable(mission.entity(id)))selected.delete(id);}
const commandSelection = () => expandCommandIds(mission,[...selected],{action:'attack'}).map(id=>mission.entity(id)).filter(Boolean);
const unitType = unit => [unit.kind,...(unit.components??config.units[unit.kind].components??[]),unit.engineUpgradeLevel??0].join('/');
function firstPowerSites(){
  const owned=mission.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0);
  return {plant:owned.find(b=>b.kind==='generator'),well:owned.find(b=>b.kind==='derrick')};
}
function knownArtifact(mission){
  return mission.state.artifacts.find(item=>!item.collected&&mission.exploredAt(item.x,item.y));
}
function nextObjectiveHint(state,{plant,well},tasks,artifact,contact,southernApproach,warehouseHint){
  if(state.status!=='running')return '';
  if(state.m02)return 'Разведайте юг, подавите четыре опорных пункта и соберите образцы.';
  if(state.flags.contact&&!state.flags.raidWon)return contact ? 'Отразите рейд на базу.' : 'Прикройте въезд к базе.';
  if(artifact)return 'Подберите артефакт.';
  if(!state.powered||!(state.oilLinked>0)){
    if(!plant&&!well)return 'Постройте АЭС и вышку.';
    if(!well)return 'Поставьте вышку на нефти.';
    if(!plant)return 'Постройте АЭС.';
    if(!plant.completed&&!well.completed)return 'Достройте АЭС и вышку.';
    return plant.completed ? 'Достройте вышку.' : 'Достройте АЭС.';
  }
  const owned=state.buildings.filter(b=>b.owner==='rai'&&b.hp>0);
  const ready=kind=>owned.some(b=>b.kind===kind&&b.completed);
  const facilities=[['factory','завод'],['lab','НИИ']];
  const missing=facilities.filter(([kind])=>!owned.some(b=>b.kind===kind));
  if(missing.length)return 'Постройте '+missing.map(([,name])=>name).join(' и ')+'.';
  if(ready('factory')&&!state.statistics.produced)return 'Выпустите машину на заводе.';
  const unfinished=facilities.filter(([kind])=>!ready(kind));
  if(unfinished.length)return 'Достройте '+unfinished.map(([,name])=>name).join(' и ')+'.';
  if(state.flags.raidWon&&state.camps[0]&&!state.camps[0].cleared)return 'Разведайте дорогу за въездом на северо-восток.';
  if(!ready('bunker')&&!ready('mg-tower'))return owned.some(b=>b.kind==='bunker'||b.kind==='mg-tower') ? 'Достройте укрепление.' : 'Постройте ДОТ.';
  if(!tasks.find(task=>task.id==='research').done){
    const hasSample=state.artifactKeys.some(key=>!state.research[key]&&!owned.some(b=>b.research?.key===key));
    if(hasSample)return 'Изучите артефакты в НИИ.';
    if(warehouseHint)return warehouseHint;
    if(!state.flags.lastRevealed&&!owned.some(b=>b.research))return 'Ищите артефакты в лагерях.';
  }
  const headquarters=state.camps[3];
  if(state.flags.lastRevealed&&!headquarters.cleared){
    if(southernApproach?.kind!=='intel')return 'Разведайте южное шоссе до западного изгиба.';
    if(state.buildings.some(b=>b.campId===headquarters.id&&b.kind==='mg-tower'&&b.hp>0))
      return 'Соберите группу перед изгибом. Атакуйте башни с запада.';
    return 'Зачистите штаб Петровича.';
  }
  return state.camps.some(camp=>!camp.cleared) ? 'Зачистите лагеря Отбросов.' : 'Завершите исследования в НИИ.';
}
function tacticalFocus(contact,{well,threat=staticThreat(contact),artifact=knownArtifact(mission),southernApproach=missionSignal('last-camp',mission)}=firstPowerSites()){
  if(mission.state.status!=='running')return null;
  if(contact)return {x:contact.x,y:contact.y,kind:'threat',label:'К контакту',distance:420};
  if(threat)return threat;
  if(artifact)return {x:artifact.x,y:artifact.y,kind:'artifact',label:'К артефакту',distance:300};
  if(radio.current?.kind!=='recon'){
    const departure=missionSignal('raid-won',mission);
    if(departure)return departure;
  }
  if(southernApproach)return southernApproach;
  if(!well&&radio.current?.kind!=='guidance')return missionSignal('intro',mission);
  return null;
}
function staticThreat(contact){
  return mission.state.status==='running'&&!contact ? raidApproachSignal(mission)??waterTowerSignal(mission) : null;
}
const isMobile = entity => entity?.owner === 'rai' && !!config.units[entity.kind];
const hpColor = fraction => fraction > .58 ? '#9cdd69' : fraction > .28 ? '#f1cc58' : '#ed6a4d';
const sampleNames = {'flamethrower':'Устройство №001','mg-ammo-1':'Образец со склада','mg-tower':'Узел башни','flamer-upgrade':'Усиление огнемёта','twin-machinegun':'Спаренный пулемёт',sensor:'Сенсор','power-module':'Энергомодуль'};
const sampleIcons = {'flamethrower':'technology','mg-ammo-1':'ammunition','mg-tower':'turret-ring','flamer-upgrade':'damage-upgrade','twin-machinegun':'twin-gun',sensor:'sensor','power-module':'power-upgrade'};
const projectLabel = vehicle => latestVehicleProject(mission.state.designs,vehicle,config)?.name
  ?? (vehicle.projectId===vehicle.kind?null:vehicle.designName) ?? config.units[vehicle.kind]?.name;

function toast(message, milliseconds = 2600) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastUntil = performance.now() + milliseconds;
}
function report(result) {
  if (!result?.ok) toast(result?.reason ?? 'Приказ не выполнен');
  if(!result?.ok&&result?.reason==='Недостаточно нефти')sound.bark('a06');
  return result?.ok;
}
function commandFeedback(){
 if(lastCommandRevision===null)return;
 const record=mission.state.commandOrders?.find(r=>r.revision===lastCommandRevision);
 if(!record||record.status!=='complete')return;
 const blocked=record.ids.filter(id=>{const u=mission.entity(id);return u?.hp>0&&u.pendingOrder?.revision===record.revision&&u.pendingOrder.status==='blocked';});
 const key=record.revision+':'+blocked.join(',')+':'+record.assigned.length;
 if(key===lastCommandFeedback)return;lastCommandFeedback=key;
 blockedOrders=new Set(blocked);blockedUntil=performance.now()+7500;
 const feedback=$('order-feedback');
 feedback.querySelector('span').textContent=blocked.length?`${record.assigned.length} из ${record.ids.length} · нет проезда: ${blocked.length}`:'';
 feedback.hidden=!blocked.length;$('select-blocked').hidden=!blocked.length;
}
function cancelMode({keepAttack=false}={}) {
  cancelMapGesture();
  combatMenu?.close();
  buildKind = null;
  buildOpen = false;
  orderMode = keepAttack && orderMode === 'attack' ? 'attack' : null;
  site = placing = null;
  world.setGhost(null);
  updateUi();
}
function cancelMapGesture() {
  const pointerId=drag?.pointerId;
  drag=null;
  $('drag-box').hidden=true;
  const canvas=world?.renderer.domElement;
  if(pointerId!==undefined&&canvas?.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
}
function toggleDesigner() {
  if (designer.visible) return designer.close();
  document.querySelector('.settings').open = false;
  cancelMode();
  world.keys.clear();
  designer.open();
}
function liveMobile(entity) {
  return isMobile(entity) && entity.hp > 0;
}
function select(ids, append = false, speak = true) {
  if (!append) selected.clear();
  pruneSelection();
  for (const id of ids) if (selectable(mission.entity(id))) selected.add(id);
  navigationTelemetry?.record('selection',{requested:ids,selected:[...selected],append});
  cancelMode({keepAttack:true});
  if (speak && active && ids.some(id => liveMobile(mission.entity(id)))) {
    sound.acknowledge('select', selection().filter(liveMobile).map(unit => unit.id));
  }
}
function focusUnit(unit) {
  select([unit.id]);
  world.centre(unit, 320);
}
function selectArmy(){
  if(!active||designer.visible)return;
  const ids=armySelectionIds(mission);
  if(!ids.length)return;
  select(ids);
}
function availableBuilding(kind) {
  return mission.state.buildings.filter(b=>b.owner==='rai'&&b.kind===kind&&b.hp>0)
    .sort((a,b)=>Number(b.completed)-Number(a.completed))[0];
}
function openBuilding(kind, focus = false) {
  const building=availableBuilding(kind);
  if(building){select([building.id]);if(focus)world.centre(building,360);}
  else if(!focus)beginPlacement(kind);
}
function chooseBuilder(kind) {
  const current = selection().filter(entity => isMobile(entity) && entity.kind === 'builder');
  const live = builders();
  const pending = mission.state.buildings.filter(b=>b.hp>0&&(b.clearing||b.awaitingWorkers));
  const idle = unit => (!unit.task || unit.task.type === 'move') && !pending.some(b=>b.builderIds?.includes(unit.id));
  const selectedIdle=current.filter(idle), free=live.filter(idle);
  if(kind&&selectedIdle.length)return selectedIdle;
  if(kind&&free.length)return free;
  return current.length?current:live;
}
function toggleBuild() {
  if(mission.state.status!=='running')return;
  combatMenu?.close();
  if (buildOpen || buildKind) return cancelMode();
  if (!builders().length) return toast('Нет строителей. Закажите машину на заводе.');
  orderMode = null;
  buildOpen = true;
  updateUi();
}
function beginPlacement(kind) {
  if(mission.state.status!=='running')return;
  const available = chooseBuilder(kind);
  if (!available.length) return;
  select(available.map(unit => unit.id), false, false);
  orderMode = null;
  buildKind = kind;
  rotation = 0;
  $('toast').hidden = true;
  updatePlacement();
  updateUi();
}
function beginOrder(mode) {
  if(mission.state.status!=='running')return;
  if (!(mode==='attack'?commandSelection():selection()).some(unit=>liveMobile(unit)&&(mode!=='attack'||config.units[unit.kind].damage>0))) {
    const unit = vehicles().find(unit => config.units[unit.kind].damage > 0) ?? (mode!=='attack'&&vehicles()[0]);
    if (!unit) return;
    select([unit.id], false, false);
  }
  cancelMode();
  orderMode = mode;
  updateUi();
}
function toggleAttackOrder(){if(orderMode==='attack')cancelMode();else beginOrder('attack');}
function toggleDemolitionOrder(){if(orderMode==='demolish')return cancelMode();cancelMode();orderMode='demolish';updateUi();}
async function saveGame(notify = true) {
  try {
    const key=notify?saveKey:autoSaveKey;
    localStorage.setItem(key, await mission.saveAsync());
    localStorage.setItem(latestSaveKey,key);
    if (notify) toast('Операция сохранена');
    return true;
  } catch {
    if (notify) toast('Сохранение недоступно');
    return false;
  }
}
let loadingGame=false;
async function start(restore = false) {
  if(loadingGame)return;
  loadingGame=true;
  sound.unlock();
  personnelNotices.reset();
  try {
  if(!restore&&diagnosticM02&&!mission.state.m02){const {prepareM02Diagnostic}=await import('./mission02-diagnostic.js');prepareM02Diagnostic(mission);}
  const continuing=restore||!!mission.state.m02;
  if (restore) {
    try {
      const data = restore==='map-backup'?localStorage.getItem('warGame.alpha.before-map-v2.v1'):restore==='checkpoint'?localStorage.getItem(checkpointKey):restore==='manual'?localStorage.getItem(saveKey):resumeData();
      if (!data) return toast('Сохранения ещё нет');
      if(restore==='checkpoint')localStorage.setItem('warGame.alpha.before-map-v2.v1',await mission.saveAsync());
      mission.load(data);
      if(radio.director)restoreRadioStory(mission.state);
    } catch (error) {
      const message='Сохранение не открывается. '+error.message;
      return $('welcome').hidden?toast(message):mainMenu.error(message);
    }
  }
  $('welcome').hidden=false;
  mainMenu.loading.begin(ENTRY_STAGES);
  await mainMenu.loading.stage('graphics');
  await world.prepareRendering?.(mission);
  await mainMenu.loading.stage('entry');
  if(!continuing)mission.state.storyConstruction={enabled:true,unlocked:['generator'],research:false,requiredBunkers:2};
  designer.close(false);
  paused = false;
  resultShown = false;
  resultPrepared=false;
  ending.reset();
  radio.reset();
  if(!continuing)radio.director.beginStory(mission);
  if(!continuing)startOpeningConstruction(mission);
  else restoreOpeningConstruction(mission);
  openingPlaying=!!mission.state.openingScene&&!mission.state.openingScene.handedOver;
  active=!openingPlaying;
  world.controls.enabled=!openingPlaying;
  world.keys.clear();
  $('mission-hud').classList.toggle('opening-playing',openingPlaying);
  world.storySignals.show(null);
  minimapView.reset(restore);
  blockedOrders.clear();
  $('order-feedback').hidden=true;
  resultsView?.hide();
  $('results-open').hidden=mission.state.status==='running';
  $('mission-hud').hidden = false;
  document.querySelector('.settings').open = false;
  const worker = builders()[0];
  const startPoint=world.field.gridToWorld(config.startGrid),signPoint=world.field.gridToWorld(config.openingSignGrid);
  // Establish the initial view once, with both the base and hillside construction visible.
  const centre = restore&&!openingPlaying ? vehicles()[0] : {x:startPoint.x+(signPoint.x-startPoint.x)*.25,y:startPoint.y+(signPoint.y-startPoint.y)*.25};
  if (centre) world.centre(centre, 360);
  openingCamera?.dispose();
  openingCamera=openingPlaying?new OpeningCamera(world,mission):null;
  select(worker&&!openingPlaying ? [worker.id] : [], false, false);
  if(active){flushUi();uiPending=false;}
  await mainMenu.loading.finish();
  // A completed intro bypasses beforeReveal. Replace the warm-up or previous
  // save's frame while the loading cover still hides the game.
  world.update(mission,selected,0,false,active);
  if(active)minimapView.render(performance.now());
  mainMenu.loading.hide();
  $('welcome').hidden = true;
  if(!openingTelevision.start(mission,radio.director))radio.consume(mission, performance.now());
  if (restore) toast('Операция загружена');
  } catch(error) {mainMenu.error('Ошибка подготовки игры. '+error.message);}
  finally {loadingGame=false;last=performance.now();}
}
function ordersAt(point, target, mode, append=false) {
  if(mission.state.status!=='running')return;
  const chosen = selection();
  const factory = chosen.length === 1 && chosen[0]?.owner === 'rai' && chosen[0]?.kind === 'factory' && chosen[0]?.completed ? chosen[0] : null;
  if (factory && point && !mode) {
    if (report(mission.setRally(factory.id, point))) {
      world.commandMarker(point);
      toast('Точка сбора завода установлена');
    }
    return;
  }
  if (!chosen.some(isMobile)) return toast('Выберите машину на карте или в списке');
  let action = 'move';
  let destination = point;
  if(mode==='demolish'){
    if(!canDemolish(mission,target))return toast('Выберите своё готовое здание');
    action='demolish';destination=target;
  } else if ((mode === 'attack'||!mode) && ['scavs','unknown'].includes(target?.owner)) {
    action = 'attack';
    destination = target;
  } else if (mode === 'attack') {
    action='attack-move';
  } else if (!mode && target?.owner === 'rai' && config.buildings[target.kind] && chosen.some(entity => entity.kind === 'builder')) {
    if (target.completed === false) action = 'build';
    else if (target.hp < target.maxHp) action = 'repair';
    if (action !== 'move') destination = target;
  }
  if (!destination) return toast('Укажите точку на карте');
  if (action === 'move'||action === 'attack-move') {
    const pickup=pickupTarget(mission,destination);
    if(pickup){destination=pickup.item;action='move';}
  }
  const result = mission.submitOrder([...selected], action, destination, {append});
  if (!report(result)) return;
  if(result.queued)toast('Приказ добавлен в очередь');
  lastCommandRevision=result.revision??null;lastCommandFeedback='';
  const combatOrder=action==='attack'||action==='attack-move';
  const eligible = (combatOrder?commandSelection():chosen).filter(entity => liveMobile(entity) && (!combatOrder || config.units[entity.kind].damage) && (!['build', 'repair', 'demolish'].includes(action) || entity.kind === 'builder'));
  blockedOrders=new Set(result.unassigned);
  blockedUntil=performance.now()+7500;
  const feedback=$('order-feedback');
  const text=blockedOrders.size?result.assigned+' из '+eligible.length+' · без маршрута '+blockedOrders.size:action==='repair'?'Строитель принял приказ на ремонт':'';
  feedback.querySelector('span').textContent=text;
  feedback.hidden=!text;
  $('select-blocked').hidden=!blockedOrders.size;
  sound.acknowledge(combatOrder?'attack':action==='demolish'?'move':action,result.assignedIds??eligible.filter(unit=>!blockedOrders.has(unit.id)).map(unit=>unit.id));
  orderMode = mode === 'attack' ? 'attack' : null;
  combatMenu?.close();
  updateUi();
}
function hitEntity(x, y) {
  const direct=world.pickEntity(mission,x,y);
  if(direct)return direct;
  let nearest = null, best = 24;
  for (const entity of [...mission.state.units, ...mission.state.buildings]) {
    if(config.buildings[entity.kind]?.storyOnly)continue;
    if (entity.hp <= 0 || entity.owner !== 'rai' && !mission.visibleAt(entity.x, entity.y)) continue;
    const p = world.screen(entity);
    const distance = Math.hypot(p.x - x, p.y - y);
    if (p.visible && distance < best) {
      best = distance;
      nearest = entity;
    }
  }
  if (nearest) return nearest;
  const point = world.ground(x, y);
  return point && mission.state.buildings.find(b => !config.buildings[b.kind]?.storyOnly && b.hp > 0 && (b.owner === 'rai' || mission.visibleAt(b.x, b.y)) && Math.abs(point.x - b.x) < b.halfWidth && Math.abs(point.y - b.y) < b.halfDepth);
}
function oilAt(x,y) {
  if(!mission.constructionUnlocked('derrick'))return null;
  let best = null, radius = 17;
  for (const grid of config.oilFields) {
    const point = world.field.gridToWorld(grid);
    if (!mission.exploredAt(point.x,point.y)) continue;
    if (mission.state.buildings.some(b => b.hp > 0 && b.kind === 'derrick' && Math.hypot(b.x-point.x,b.y-point.y) < 4)) continue;
    const p = world.screen(point,2), d = Math.hypot(x-p.x,y-p.y);
    if (p.visible && d < radius) { best = point; radius = d; }
  }
  return best;
}
function orderDerrick(point) {
  const assigned = chooseBuilder('derrick');
  if (!assigned.length) return toast('Нужен строитель');
  const result = mission.build(assigned.map(unit => unit.id),'derrick',point.x,point.y);
  if (!report(result)) return;
  select([result.id]);
  world.commandMarker(point);
  sound.acknowledge('build', assigned.map(unit => unit.id));
  toast(result.clearing ? 'Техника освобождает нефтяную точку' : result.waiting ? 'Вышка в очереди строителей' : 'Строитель выезжает к нефтяной точке');
}
function updatePlacement() {
  if (!buildKind) return;
  const point = site ?? (pointer && world.ground(pointer.x, pointer.y));
  const snap=snapBuildings&&!freePlacement;
  const check = point && mission.placement(buildKind, point.x, point.y, rotation,{snap:snap&&!site});
  placing = check ? {...check,snap} : null;
  world.setGhost(buildKind, placing, mission);
  $('placement-snap').setAttribute('aria-pressed',String(snap));
  $('placement-snap').classList.toggle('active',snap);
  const label = $('placement-status');
  label.textContent = check&&!check.ok ? check.reason : '';
  label.hidden=!label.textContent;
  label.classList.toggle('invalid', !!check && !check.ok);
}
function rotatePlacement(direction=1){
  if(!buildKind)return;
  if(placing)site={x:placing.x,y:placing.y};
  rotation=(rotation+direction*Math.PI/2+Math.PI*2)%(Math.PI*2);
  updatePlacement();
}
function suggestSite() {
  if (!buildKind) return;
  const prepared=config.baseSites?.find(site=>site.kind===buildKind);
  if(prepared&&rotation===0){
    const angle=(prepared.rotationDegrees??0)*Math.PI/180;
    const point=world.field.gridToWorld(prepared.grid),place=mission.placement(buildKind,point.x,point.y,angle);
    if(place.ok&&!place.blockers.length){rotation=angle;site=place;world.centre(site,320);updatePlacement();return;}
  }
  const origin = selection().find(isMobile) ?? world.controls.target;
  const keepRoadClear=['factory','lab'].includes(buildKind);
  const found = [];
  const add = point => {
    const place = mission.placement(buildKind, point.x, point.y, rotation);
    if (!place.ok) return;
    let asphalt=0;
    if(keepRoadClear){
      for(const u of [-.9,-.45,0,.45,.9])for(const v of [-.9,-.45,0,.45,.9]){
        asphalt+=world.field.roadBlendAt(place.x+u*place.halfWidth,place.y+v*place.halfDepth);
      }
    }
    found.push({...place,asphalt:asphalt/25});
  };
  if (config.buildings[buildKind].requiresOil) {
    for (const grid of config.oilFields) add(world.field.gridToWorld(grid));
  } else {
    const step = config.buildingGridMetres;
    const x = Math.round(origin.x / step) * step, y = Math.round(origin.y / step) * step;
    for (let radius = 2; radius <= 25 && !found.some(place=>!place.blockers.length&&place.asphalt<.02); radius++) {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) add({x: x + dx * step, y: y + dy * step});
      }
    }
  }
  const score=place=>Math.hypot(place.x-origin.x,place.y-origin.y)+place.asphalt*200;
  found.sort((a,b) => a.blockers.length-b.blockers.length || score(a)-score(b));
  if (!found.length) return toast('Рядом нет свободной разведанной площадки');
  site = found[0];
  world.centre(site, 320);
  updatePlacement();
}
function installInput() {
  const canvas = world.renderer.domElement;
  const settings = document.querySelector('.settings');
  const sections = [...settings.querySelectorAll('.operation-sections button')];
  function showOperationSection(activeSection) {
    for (const section of sections) {
      const visible = section === activeSection;
      section.setAttribute('aria-pressed', String(visible));
      $(section.getAttribute('aria-controls')).hidden = !visible;
    }
  }
  for (const section of sections) {
    section.addEventListener('click', () => showOperationSection(section));
  }
  settings.addEventListener('toggle', () => {
    if (!settings.open) showOperationSection(sections[0]);
  });
  let lastSelectionClick=null;
  document.addEventListener('pointerdown', event => {
    if (settings.open && !settings.contains(event.target) && !$('radio').contains(event.target)) settings.open = false;
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  let lastPlacementWheel=-Infinity;
  canvas.addEventListener('wheel',event=>{
    if(!buildKind||!event.shiftKey)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(performance.now()-lastPlacementWheel<120)return;
    lastPlacementWheel=performance.now();rotatePlacement(event.deltaY>0?1:-1);
  },{capture:true,passive:false});
  canvas.addEventListener('pointerdown', event => {
    if (!active || mission.state.status !== 'running') return;
    if(document.elementFromPoint(event.clientX,event.clientY)!==canvas)return;
    if (event.button === 2) {
      cancelMapGesture();
      lastSelectionClick=null;
      event.preventDefault();
      if (buildKind) return cancelMode();
      ordersAt(world.ground(event.clientX, event.clientY), hitEntity(event.clientX, event.clientY), orderMode, event.shiftKey);
    }
    if (event.button === 0) {
      if(['attack','demolish'].includes(orderMode)){event.preventDefault();cancelMapGesture();lastSelectionClick=null;cancelMode();return;}
      canvas.setPointerCapture(event.pointerId);
      drag = {x: event.clientX, y: event.clientY, append: event.shiftKey, pointerId:event.pointerId};
    }
  });
  canvas.addEventListener('pointermove', event => {
    pointer = {x: event.clientX, y: event.clientY};
    freePlacement=event.altKey;
    site = null;
    const oil = !buildKind && !orderMode && oilAt(pointer.x,pointer.y);
    const rank=world.healthBars.rankAt(pointer.x,pointer.y);
    canvas.title = oil ? 'Построить вышку' : rank ? rank.name+' · Нажмите на машину: личное дело' : '';
    if (buildKind) {
      updatePlacement();
      return;
    }
    canvas.style.cursor = orderMode ? 'crosshair' : oil ? 'pointer' : '';
    if (!drag || orderMode === 'move') return;
    const box = $('drag-box');
    box.hidden = Math.hypot(pointer.x - drag.x, pointer.y - drag.y) < 6;
    box.style.left = Math.min(pointer.x, drag.x) + 'px';
    box.style.top = Math.min(pointer.y, drag.y) + 'px';
    box.style.width = Math.abs(pointer.x - drag.x) + 'px';
    box.style.height = Math.abs(pointer.y - drag.y) + 'px';
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || event.button !== 0 || event.pointerId!==drag.pointerId) return;
    const origin = drag;
    const previousClick=lastSelectionClick;
    lastSelectionClick=null;
    drag = null;
    $('drag-box').hidden = true;
    const x = event.clientX, y = event.clientY;
    // Pointer capture targets the canvas even when the pointer is over a HUD
    // control. Such a release must never command the ground behind that control
    // or clear the current selection. Empty HUD gaps still hit the map.
    if (!active || mission.state.status!=='running' || document.elementFromPoint(x,y)!==canvas) return;
    if (buildKind) {
      if(!pointer||pointer.x!==x||pointer.y!==y)site=null;
      pointer = {x,y};
      updatePlacement();
      if (!placing?.ok) return;
      const result = mission.build([...selected], buildKind, placing.x, placing.y, placing.rotation,{snap:false});
      if (report(result)) {
        world.commandMarker(placing);
        sound.acknowledge('build', selection().filter(unit => liveMobile(unit) && unit.kind === 'builder').map(unit => unit.id));
        if (result.clearing) toast('Техника освобождает площадку');
        else if(result.waiting)toast('Здание в очереди строителей');
        if (!event.shiftKey) cancelMode();
        else updatePlacement();
      }
      return;
    }
    const selecting=Math.hypot(x - origin.x, y - origin.y)>6;
    if(['attack','demolish'].includes(orderMode))return cancelMode();
    if(orderMode)return ordersAt(world.ground(x,y),hitEntity(x,y),orderMode,event.shiftKey);
    if (selecting) {
      const ids = vehicles().filter(unit => {
        const p = world.screen(unit);
        return p.visible && p.x >= Math.min(x,origin.x) && p.x <= Math.max(x,origin.x)
          && p.y >= Math.min(y,origin.y) && p.y <= Math.max(y,origin.y);
      }).map(unit => unit.id);
      select(ids, origin.append);
    } else {
      const oil = !orderMode && !event.shiftKey && oilAt(x,y);
      if (oil) return orderDerrick(oil);
      const target = hitEntity(x,y);
      select(target ? [target.id] : [], origin.append);
      if(target)lastSelectionClick={id:target.id,repeated:previousClick?.id===target.id};
    }
  });
  canvas.addEventListener('dblclick', event => {
    if(!active||designer.visible||mission.state.status!=='running'||buildKind||orderMode==='move'||!lastSelectionClick?.repeated)return;
    const target=hitEntity(event.clientX,event.clientY);
    if(!liveMobile(target)||target.owner!=='rai'||target.id!==lastSelectionClick.id)return;
    const type=unitType(target),rect=canvas.getBoundingClientRect();
    const ids=vehicles().filter(unit=>{
      if(unitType(unit)!==type)return false;
      const p=world.screen(unit);
      return p.visible&&p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom;
    }).map(unit=>unit.id);
    select(ids,event.shiftKey);
    event.preventDefault();
  });
  canvas.addEventListener('pointercancel', () => { cancelMapGesture(); lastSelectionClick=null; });
  canvas.addEventListener('lostpointercapture', event => {
    if(drag?.pointerId===event.pointerId){cancelMapGesture();lastSelectionClick=null;}
  });
  document.addEventListener('keydown', event => {
    if(!$('result').hidden){if(event.code==='Escape'){event.preventDefault();resultsView.hide();}return;}
    if (!active || designer.visible || event.target.isContentEditable || event.target.matches('input, select, textarea')) return;
    if(mission.state.status!=='running'){
      if(event.code==='Escape'){event.preventDefault();radio.dismiss();}
      else if(event.code==='F7'&&!event.repeat){event.preventDefault();stabilityGraph.toggle();}
      else if(!ending.presenting&&['KeyW','KeyA','KeyS','KeyD'].includes(event.code)){event.preventDefault();world.keys.add(event.code);}
      return;
    }
    const {code} = event;
    if(event.ctrlKey&&code==='KeyG'&&!event.repeat){
      event.preventDefault();
      const result=mission.configureGroup(selection().filter(liveMobile).map(u=>u.id));
      if(report(result))toast('Подразделение · '+result.members.length);
      return;
    }
    if(event.altKey&&/^Digit[1-4]$/.test(code)&&!event.repeat){
      event.preventDefault();
      const modes=['column','line','dispersed','concentrate'],labels=['Колонна','Линия','Рассредоточиться','Сосредоточиться'];
      const index=Number(code.at(-1))-1,chosen=selection().filter(liveMobile);
      const group=chosen.length===1&&mission.state.commandGroups?.find(g=>g.leaderId===chosen[0].id);
      const ids=group?.members??chosen.map(u=>u.id),result=mission.configureGroup(ids,{formation:modes[index]});
      if(report(result)){
        toast(labels[index]);
        const members=result.members.map(id=>mission.entity(id)),request=members[0]?.routeOrder;
        if(request&&members.every(u=>u.routeOrder?.request.x===request.request.x&&u.routeOrder?.request.y===request.request.y&&u.task?.type===(request.type??'move')))
          mission.submitOrder(result.members,request.type??'move',request.request,{preserveQueue:true});
      }
      return;
    }
    if(buildKind&&!event.ctrlKey&&!event.metaKey){
      if(['AltLeft','AltRight'].includes(code)){event.preventDefault();freePlacement=true;updatePlacement();return;}
      if(['KeyQ','KeyE','KeyR'].includes(code)){event.preventDefault();if(!event.repeat)rotatePlacement(code==='KeyQ'||code==='KeyR'&&event.shiftKey?-1:1);return;}
    }
    if(event.altKey&&code==='KeyR'&&!event.repeat){
      event.preventDefault();const result=mission.retreat(selection().filter(liveMobile).map(u=>u.id));
      if(report(result))toast('Отходим к базе');
      return;
    }
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(code==='F7'){event.preventDefault();if(!event.repeat)stabilityGraph.toggle();return;}
    if(code==='F2'){event.preventDefault();if(!event.repeat)selectArmy();return;}
    if(code==='KeyG'&&!event.repeat){
      const first=selection().find(liveMobile),group=first&&mission.state.commandGroups?.find(g=>g.id===first.commandGroupId);
      if(group){event.preventDefault();select(group.members);}
      return;
    }
    if (code === 'Escape') {
      if (settings.open) {
        settings.open = false;
        settings.querySelector('summary').focus();
      }
      else if (buildKind || buildOpen || orderMode) cancelMode();
      else radio.dismiss();
    } else if (code === 'Space' && !event.target.closest('button, summary')) {
      event.preventDefault();
      $('pause').click();
    } else if (code === 'F8' && !event.repeat) {event.preventDefault();void toggleNavigationDebug();}
    else if (code === 'KeyB' && !event.repeat) toggleBuild();
    else if (code === 'KeyM' && !event.repeat) beginOrder('move');
    else if (code === 'KeyF' && !event.repeat) toggleAttackOrder();
    else if (code === 'Home') $('home').click();
    else if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) {
      event.preventDefault();
      world.keys.add(code);
    }
  });
  document.addEventListener('keyup', event => {world.keys.delete(event.code);if(['AltLeft','AltRight'].includes(event.code)){freePlacement=false;updatePlacement();}});
  window.addEventListener('blur', () => { world.keys.clear(); freePlacement=false;updatePlacement();cancelMapGesture(); lastSelectionClick=null; });
  installMinimapInput($('minimap'),{mission,enabled:()=>active&&!designer.visible&&mission.state.status==='running',mode:()=>orderMode,building:()=>buildKind,
    order:ordersAt,centre:point=>world.centre(point),cancel:cancelMode});
}
function button(label, detail, callback, disabled, icon = 'tools') {
  const item = document.createElement('button');
  setButtonIcon(item, icon, label, detail);
  item.disabled = !!disabled;
  item.onclick = callback;
  return item;
}
function updatePalette() {
  $('build-palette').hidden = !buildOpen;
  $('build-toggle').setAttribute('aria-expanded', String(buildOpen));
  $('build-toggle').disabled = !builders().length;
  $('build-toggle').classList.toggle('active', buildOpen || !!buildKind);
  for(const [kind,id,label] of [['lab','lab-toggle','НИИ · Исследования'],['factory','production-toggle','Производство · Завод']]){
    const building=availableBuilding(kind),control=$(id),spec=config.buildings[kind];
    control.hidden=!building&&!mission.constructionUnlocked(kind);
    control.disabled=!building&&(!builders().length||!mission.canSpend(spec.cost)||!mission.constructionUnlocked(kind));
    control.title=building?label+' · Двойной клик — к зданию':'Построить '+spec.name+' · '+spec.cost+' нефти';
    control.classList.toggle('active',!!building&&selected.has(building.id));
  }
  if (!buildOpen) return;
  const s = mission.state, entries = Object.entries(config.buildings).filter(([kind,spec])=>!spec.storyOnly&&mission.constructionUnlocked(kind)&&(!spec.requires||s.research[spec.requires]));
  const available = ([kind,spec]) => (!spec.requires || s.research[spec.requires]) && mission.canSpend(spec.cost);
  const key = entries.map(entry => entry[0]+Number(available(entry))).join(',') + Object.keys(s.research).join(',');
  if (key === paletteKey) return;
  paletteKey = key;
  $('build-cards').style.setProperty('--build-columns',entries.length);
  $('build-cards').replaceChildren(...entries.map(([kind,spec]) => {
    const b = button(spec.name, spec.cost + ' нефти · ' + spec.seconds + ' с', () => beginPlacement(kind), !available([kind,spec]), kind);
    if (spec.oilSlots) b.title += ' · До ' + spec.oilSlots + ' вышек';
    return b;
  }));
}
let rosterColumns=6;
const rosterObserver=new ResizeObserver(()=>{
  const roster=$('roster'),style=getComputedStyle(roster),tileWidth=roster.firstElementChild?.offsetWidth||parseFloat(style.gridTemplateColumns)||40;
  const gap=parseFloat(style.columnGap)||0;
  rosterColumns=Math.max(1,Math.min(6,Math.floor((roster.clientWidth+gap)/(tileWidth+gap))));
});
rosterObserver.observe($('roster'));
function updateRoster() {
  const units=vehicles(),roster=$('roster');
  const army=armySelectionIds(mission),armyButton=$('select-army');
  armyButton.disabled=!army.length;
  armyButton.setAttribute('aria-pressed',String(army.length>0&&selected.size===army.length&&army.every(id=>selected.has(id))));
  const columns=rosterColumns;
  const groups=new Map(),types=new Map();
  for(const unit of units){
    const recovering=repairing(unit),blocked=!recovering&&blockedOrders.has(unit.id);
    const design=unitType(unit);
    if(!types.has(design))types.set(design,types.size);
    const key=[recovering,blocked,design,selected.has(unit.id)].join(':');
    if(!groups.has(key)){
      const label=projectLabel(unit);
      groups.set(key,{label:recovering?label+' · Авторемонт':label,kind:unit.kind,design,recovering,units:[]});
    }
    groups.get(key).units.push(unit);
  }
  const tiles=[...groups.values()].sort((a,b)=>Number(a.recovering)-Number(b.recovering)||types.get(a.design)-types.get(b.design));
  const visibleColumns=Math.min(tiles.length,columns);
  roster.style.setProperty('--roster-cols',Math.max(1,visibleColumns));
  const tileKey=tile=>(tile.recovering?'repair:':'')+tile.design+':'+tile.units.map(unit=>unit.id).join('/');
  const key=tiles.map(tileKey).join(',');
  if(key!==rosterKey){
    rosterKey=key;
    const previous=new Map([...roster.children].map(b=>[b.dataset.rosterKey,b]));
    roster.replaceChildren(...tiles.map(tile=>{
      const existing=previous.get(tileKey(tile));
      if(existing)return existing;
      const b=document.createElement('button');
      b.dataset.rosterKey=tileKey(tile);
      b.dataset.units=tile.units.map(unit=>unit.id).join('/');
      setButtonIcon(b,tile.kind,tile.label);
      b.append(document.createElement('i'));
      const ids=tile.units.map(unit=>unit.id);
      b.setAttribute('aria-label',ids.length>1?tile.label+' · '+ids.length+' машин':tile.label);
      if(ids.length>1){
        const amount=document.createElement('span');
        amount.className='stack-count';amount.textContent='×'+ids.length;b.append(amount);
      }
      b.onclick=event=>select(ids,event.shiftKey);
      b.ondblclick=()=>{
        const live=ids.map(id=>mission.entity(id)).filter(Boolean);
        if(live.length===1)focusUnit(live[0]);
        else if(live.length){
          select(ids);
          world.centre({x:live.reduce((sum,unit)=>sum+unit.x,0)/live.length,y:live.reduce((sum,unit)=>sum+unit.y,0)/live.length},360);
        }
      };
      return b;
    }));
  }
  for(let i=0;i<tiles.length;i++){
    const {units,label,recovering}=tiles[i],b=roster.children[i];
    const active=units.every(unit=>selected.has(unit.id));
    b.classList.toggle('repairing',recovering);
    b.removeAttribute('aria-disabled');
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',String(active));
    const displayLabel=units.length===1?personnelLabel(mission,units[0],label):label;
    b.setAttribute('aria-label',units.length>1?label+' · '+units.length+' машин':displayLabel);
    const lowest=units.reduce((min,unit)=>unit.hp/unit.maxHp<min.hp/min.maxHp?unit:min);
    b.style.setProperty('--hp',100*lowest.hp/lowest.maxHp+'%');
    b.style.setProperty('--hp-color',hpColor(lowest.hp/lowest.maxHp));
    const blocked=recovering?0:units.filter(unit=>blockedOrders.has(unit.id)).length;
    b.classList.toggle('order-blocked',blocked>0);
    b.title=displayLabel+(units.length>1?' ×'+units.length+' · минимум ':' · ')+Math.ceil(lowest.hp)+'/'+lowest.maxHp+' HP'+(recovering?' · Возвращаются в строй после полного ремонта':'')+(blocked?' · Без маршрута'+(blocked>1?' ×'+blocked:''):'');
  }
}
function updateContext(first) {
  const s = mission.state;
  const demolishers=demolitionWorkers(mission,first?.id),canSelectDemolition=selection().some(u=>liveMobile(u)&&config.units[u.kind].role==='builder');
  const thresholds = [...Object.values(config.units), ...Object.values(config.research)].map(spec => Number(mission.canSpend(spec.cost))).join('');
  const factory = first?.owner === 'rai' && first.completed && first.kind === 'factory';
  const factories = factory ? productionFactories(mission) : [];
  const projects = factory ? mission.factoryProjects() : [];
  const designs = factory ? s.designs.map(project => project.id + ':' + project.name).join(',') : '';
  const activeResearch = s.buildings.filter(b=>b.hp>0&&b.research).map(b=>b.research.key);
  const key = [first?.powerModule,!!first?.moduleConstruction,factories.map(f=>f.id).join(), first?.id, first?.completed, first?.clearing, first?.research?.key, activeResearch.join(), s.artifactKeys.join(), Object.keys(s.research).join(), thresholds, designs, builders().length,mission.researchUnlocked(),first?.workPriority,canSelectDemolition,orderMode,demolishers.length,!!first?.demolitionProgress].join('|');
  if (key !== actionKey) {
    actionKey = key;
    const items = [];
    const add = (label, detail, action, disabled, icon) => {
      const item = button(label, detail, () => {report(action()); updateUi();}, disabled, icon);
      items.push(item);
      return item;
    };
    if (first?.owner === 'rai' && first.completed && first.kind === 'lab'&&mission.researchUnlocked()) {
      for (const [id,spec] of Object.entries(config.research)) {
        const done = s.research[id], known = s.artifactKeys.includes(id);
        if(done||!known||first.research||activeResearch.includes(id)||!mission.canSpend(spec.cost))continue;
        const label=sampleNames[id]??'Неизвестный образец';
        add(label, spec.cost + ' нефти · ' + spec.seconds + ' с', () => mission.research(first.id,id), false, sampleIcons[id] ?? 'research').dataset.research = id;
      }
    }
    if(first?.owner==='rai'&&first.kind==='generator'&&first.completed&&s.research['power-module']&&!first.powerModule){
      const control=add(first.moduleConstruction?'Продолжить установку энергомодуля':'Установить энергомодуль',config.powerModule.cost+' нефти · отдача вышек +25%',()=>mission.installPowerModule(first.id,chooseBuilder('generator').map(u=>u.id)),!builders().length,'power-upgrade');
      control.dataset.powerModule='';
      if(first.moduleConstruction){const progress=document.createElement('progress');progress.max=1;progress.className='production-progress';progress.dataset.powerProgress='';control.append(progress);}
    }
    if (first?.owner === 'rai' && first.completed === false) {
      add('Достроить', 'Отправить строителей', () => {
        const ids = chooseBuilder(first.kind).map(unit => unit.id);
        const result = mission.order(ids, 'build', first);
        if (result.ok) sound.acknowledge('build', ids);
        return result;
      }, first.clearing||!builders().length, 'build');
      add('Отменить', 'Вернуть остаток нефти', () => mission.cancelBuilding(first.id), false, 'close');
    }
    if(canSelectDemolition&&!canDemolish(mission,first)){
      const control=add('Снести здание','ПКМ по своему готовому зданию · ЛКМ — отменить выбор',()=>{toggleDemolitionOrder();return {ok:true};},false,'close');
      control.dataset.demolish='target';control.classList.toggle('active',orderMode==='demolish');control.setAttribute('aria-pressed',String(orderMode==='demolish'));
    }
    if(canDemolish(mission,first)){
      const running=demolishers.length>0;
      const control=add(running?'Отменить снос':'Снести здание',running?'Остановить строителей':'Отправить ближайшего строителя',()=>{
        const result=running?cancelDemolition(mission,first.id):requestDemolition(mission,first.id);if(result.ok)sound.signal('order');return result;
      },!running&&!builders().length,'close');
      control.dataset.demolish=running?'cancel':'building';
      if(running||first.demolitionProgress){const progress=document.createElement('progress');progress.className='production-progress';progress.dataset.demolitionProgress='';progress.max=1;progress.setAttribute('aria-label','Снос здания');control.append(progress);}
    }
    if(factory)items.unshift(createFactoryRows(mission,factories,projects,{
      act:action=>{const result=action();report(result);if(result.ok)sound.signal('order');updateUi();},
      focus:id=>{const f=mission.entity(id);if(f){select([id],false,false);world.centre(f,360);}},
    }));
    $('actions').replaceChildren(...items);
    $('actions').classList.toggle('factory-actions', !!factory);
    $('actions').hidden = !items.length;
  }
  const demolitionProgress=$('actions').querySelector('[data-demolition-progress]');
  if(demolitionProgress){demolitionProgress.value=first?.demolitionProgress??0;demolitionProgress.setAttribute('aria-valuetext',Math.round(demolitionProgress.value*100)+'%');}
  const queue=$('queue');
  if(factory){
    queue.hidden=true;queue.replaceChildren();queueKey='';
    updateFactoryRows($('actions'),mission,projects,paused);
    return;
  }
  const moduleProgress=$('actions').querySelector('[data-power-progress]');if(moduleProgress&&first?.moduleConstruction)moduleProgress.value=oilOrderProgress(first.moduleConstruction,config.powerModule.seconds,config).progress;
  const job=first?.research;
  queue.hidden = !job;
  if (job) {
    const label=sampleNames[job.key]??'Образец';
    const flow=oilOrderProgress(job,config.research[job.key].seconds,config);
    const nextKey=[first.id,job.key,flow.funding>0].join('|');
    if(nextKey!==queueKey){
      queueKey=nextKey;
      const running=document.createElement('div'),progress=document.createElement('progress');
      running.textContent=(flow.funding?'Перечисление нефти · ':'Анализ · ')+label;
      progress.max=1;running.append(progress);
      queue.replaceChildren(running);
    }
    queue.querySelector('progress').value=flow.progress;
  }
}
let radioBottom=42;
function positionFieldTasks(){
  $('field-tasks').style.top=($('radio').hidden?54:radioBottom+12)+'px';
}
function updateUi(){uiPending=true;}
function flushUi() {
  if (!active) return;
  if(performance.now()>=blockedUntil){blockedOrders.clear();$('order-feedback').hidden=true;}
  const s = mission.state;
  const oldMap=s.m02?.version===1,checkpointButton=$('m02-checkpoint');
  checkpointButton.hidden=oldMap?!localStorage.getItem(checkpointKey):!localStorage.getItem('warGame.alpha.before-map-v2.v1');
  const checkpointTitle=oldMap?'Вернуться к началу второй миссии на исправленной карте. Текущая партия останется в резервной копии.':'Восстановить партию, сохранённую перед переходом на исправленную карту';
  checkpointButton.title=checkpointTitle;checkpointButton.setAttribute('aria-label',checkpointTitle);
  const journal=$('journal-entries'),entries=s.radioStory?.journal??[];
  const journalKey=JSON.stringify(entries);
  if(journal.dataset.contents!==journalKey){
    journal.dataset.contents=journalKey;
    journal.replaceChildren(...entries.map(item=>{
      const entry=document.createElement('p'),title=document.createElement('strong');
      title.textContent=item.title+' · ';entry.append(title,document.createTextNode(item.text));return entry;
    }));
    if(!entries.length)journal.textContent='Записей пока нет.';
  }
  pruneSelection();
  const group = selection(), first = group[0], mobile = group.filter(isMobile);
  $('energy').textContent = Math.floor(s.energy);
  const oilRate=Math.round(s.energyRate*10)/10,income=$('income');
  income.textContent=oilRate?(oilRate>0?'+':'−')+Math.abs(oilRate).toLocaleString('ru-RU'):'';
  income.hidden=oilRate===0;
  income.classList.toggle('deficit',oilRate<0);
  income.title='Баланс нефти в секунду';
  $('oil-resource').title='Нефть: '+Math.floor(s.energy)+' / '+config.energyCapacity+' · Добыча: '+(s.oilIncomeRate??s.energyRate).toFixed(1)+'/с · Расход: '+(s.oilExpenseRate??0).toFixed(1)+'/с · В заказах: '+Math.ceil(oilReserved(s));
  $('oil-resource').setAttribute('aria-label',$('oil-resource').title);
  const population=vehicles().length;
  $('population').textContent = population + ' / ' + (config.unitLimit??48);
  $('energy-meter').max=config.energyCapacity;
  $('energy-meter').value=s.energy;
  $('fleet-meter').value=population;
  const supply=oilPowerStatus(s,config),power=$('power-resource');
  $('power').textContent=supply.wells+'/'+supply.capacity;
  power.classList.toggle('overloaded',supply.unpowered>0);
  power.title='АЭС: '+supply.stations+' · Вышки: '+supply.connected+' работают из '+supply.wells+' · 1 АЭС — '+supply.perStation+' вышки'+(supply.unpowered?' · Без питания: '+supply.unpowered:'');
  power.setAttribute('aria-label',power.title);
  setButtonIcon($('pause'), paused ? 'play' : 'pause', paused ? 'Продолжить' : 'Пауза', 'Пробел');
  setButtonIcon($('tempo'), speedIcon(speed), 'Скорость ×' + speed);
  const tasks = mission.objectives();
  const assigned=storyObjectives(mission,{radioEnabled:radio.enabled});
  if(active)minimapView.observe(assigned,performance.now());
  $('objective-count').textContent = assigned.length || '';
  const nextTasks = JSON.stringify(assigned);
  if (nextTasks !== taskKey) {
    taskKey = nextTasks;
    const rows=assigned.map(task => {
      const row = document.createElement('li'), name = document.createElement('span'), amount = document.createElement('small');
      row.classList.toggle('done', Boolean(task.done));
      name.textContent = task.name;
      amount.textContent = task.progress ?? '';
      row.append(name,amount);
      if(task.samples){const samples=document.createElement('span');samples.className='m02-samples';samples.textContent=task.samples.map(a=>(a.collected?'✓ ':'○ ')+a.name).join(' · ');row.append(samples);}
      return row;
    });
    $('objectives').replaceChildren(...rows);
    $('field-objectives').replaceChildren(...rows.map(row=>row.cloneNode(true)));
    $('field-tasks').hidden=!assigned.length;
  }
  positionFieldTasks();
  const contact=visibleRaidContact(mission),threat=staticThreat(contact);
  const sites=firstPowerSites(),artifact=knownArtifact(mission),southernApproach=missionSignal('last-camp',mission);
  const marker=tacticalFocus(contact,{...sites,threat,artifact,southernApproach});
  const objectiveHint = $('objective-hint'), hint = s.storyConstruction?.enabled?(assigned[0]?.name??''):assigned.length?nextObjectiveHint(s,sites,tasks,artifact,contact,southernApproach,warehouseAdvanceHint(mission)):'';
  if(objectiveHint.textContent!==hint)objectiveHint.textContent=hint;
  objectiveHint.hidden=!hint;
  const signal=world.storySignals.current;
  if(signal?.kind==='guidance'&&sites.well?.x===signal.x&&sites.well.y===signal.y)presentSignal(null);
  const focus=$('objective-focus');
  focus.hidden=!marker;
  if(marker){
    const focusIcons={threat:'attack',guidance:'derrick',artifact:'research',recon:'radar'};
    const focusDetails={guidance:'ЛКМ по нефтяной точке — поставить вышку',artifact:'ПКМ по ящику — подобрать'};
    setButtonIcon(focus,focusIcons[marker.kind]??'focus',marker.label,focusDetails[marker.kind]);
    focus.classList.toggle('threat',marker.kind==='threat');
  }
  const entityName = first && ((first.owner==='unknown'?'Неизвестные · сенсор':null)??projectLabel(first)
    ?? config.buildings[first.kind]?.name ?? config.camps.find(camp=>camp.id===first.campId)?.name ?? 'Лагерь');
  $('selection').parentElement.hidden=!first;
  renderPersonnelSelection($('selection'),mission,group.length===1?first:null,group.length>1?'Группа · '+group.length:personnelLabel(mission,first,entityName)??'');
  const hp = group.reduce((sum,entity)=>sum+entity.hp,0), maxHp = group.reduce((sum,entity)=>sum+entity.maxHp,0);
  const wellStatus=group.length===1&&first?.owner==='rai'&&first.kind==='derrick'&&first.completed
    ? ' · '+(first.powered?'Качает':s.powered?'Лимит АЭС':'Нет питания'):'';
  const buildingStatus=first?.completed===false?(oilFundingRemaining(first)>0?' · Нефть '+Math.floor(first.funding.paid)+'/'+first.cost:' · '+Math.floor(first.progress*100)+'%'):' HP';
  $('details').textContent = first?.clearing ? 'Освобождение площадки' : first?.awaitingWorkers ? 'В очереди строителей' : first ? Math.ceil(hp) + '/' + maxHp + buildingStatus+wellStatus+(first.powerModule?' · Энергомодуль +25%':'')+(first.kind==='flamer'&&s.research['flamer-upgrade']?' · Урон +20%':'') : '';
  $('attack-order').classList.toggle('active', orderMode === 'attack');
  $('attack-order').setAttribute('aria-pressed',String(orderMode==='attack'));
  $('attack-order').disabled = orderMode!=='attack'&&!commandSelection().some(unit => liveMobile(unit)&&config.units[unit.kind].damage > 0);
  $('placement').hidden = !buildKind;
  if (buildKind) $('placement-name').textContent = config.buildings[buildKind].name;
  updateRoster();
  updatePalette();
  updateContext(first);
  designer.refresh();
  combatMenu?.refresh();
}
function events() {
  const batch=mission.drainEvents(),ordinaryNotice=text=>{if(performance.now()>milestoneToastUntil)toast(text);};
  personnelNotices.consume(batch,mission,performance.now());
  for (const event of batch) {
    if(active)minimapView.alerts.event(event,performance.now());
    radio?.director?.note(event,mission);
    if(event.type==='construction-complete'&&config.buildings[event.kind]?.storyOnly)continue;
    sound?.storyEvent?.(event);
    if (event.type === 'construction-complete') {
      ordinaryNotice('Построено · ' + config.buildings[event.kind].name);
      sound.signal('complete');
      saveGame(false);
    }
    if (event.type === 'navigation-command-rejected') toast('Новый маршрут недоступен · прежний приказ сохранён');
    if (event.type === 'unit-produced') ordinaryNotice((event.name ?? config.units[event.kind].name) + ' · готово к выезду');
    if (event.type === 'field-modification') toast('Установлено · '+event.name+' · +'+event.massKg+' кг');
    if (event.type === 'construction-refused') toast(event.reason);
    if (mission.state.m02&&event.type === 'artifact-collected') toast('Артефакт доставлен в НИИ');
    if (mission.state.m02&&event.type === 'camp-cleared') toast('Лагерь зачищен');
  }
  const notice=storyMilestoneNotice(batch,mission);
  if(notice){toast(notice,6000);milestoneToastUntil=performance.now()+6000;}
}
function presentSignal(signal,chapter) {
  if(active)minimapView.alerts.signal(signal,chapter,performance.now());
  world.storySignals.show(signal?.kind==='recon'||signal?.kind==='artifact'?null:signal);
  if(signal?.kind==='anomaly')sound.anomaly?.();
}
function focusSignal(signal) {
  if(ending?.presenting){ending.focus(signal);return;}
  world.focusStorySignal(signal,mission.state.camps[3]);
  if (buildKind) {
    site = pointer = null;
    updatePlacement();
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  navigationTelemetry?.frame(now);
  const dt = Math.min(.65, (now - last) / 1000);
  last = now;
  if (loadingGame || !world || !mission || !$('welcome').hidden) return;
  if(window.campaign?.renderSuspended)return;
  if(!$('result').hidden){personnelNotices.reset();sound.update();return;}
  personnelNotices.update(now,{hidden:!!designer?.visible||!!openingTelevision?.active});
  if(openingTelevision?.active){
    openingTelevision.update(dt);
    return;
  }
  if (designer?.visible) {
    sound.update();
    return;
  }
  perf?.begin(now);
  const frameWorkStarted=performance.now();
  let stabilityTicks=0,stabilitySimulationMs=0;
  // Preserve the original input order: advance camera controls in world.update
  // AFTER simulation. This read reuses the previous render's visibility cache.
  world.updateTrafficVisibility(mission);
  if (active || openingPlaying) {
    if (!paused) {const measuring=stabilityGraph.enabled,start=measuring?performance.now():0;const completed=mission.advance(dt * speed,{budgetMs:mission.config.simulationCpuBudgetMs,rate:speed});if(measuring){stabilityTicks=Number.isFinite(completed)?completed:0;stabilitySimulationMs=performance.now()-start;}}
    events();
    radio.consume(mission, now);
    if(openingPlaying&&openingCamera.update(dt,openingCanHandOver(mission,radio.director,radio.enabled))){
      mission.state.openingScene.handedOver=true;
      openingPlaying=false;active=true;world.controls.enabled=true;
      openingCamera=null;
      $('mission-hud').classList.remove('opening-playing');
      select(builders().slice(0,1).map(u=>u.id),false,false);
      toast('Управление передано вам',3800);
      saveGame(false);
    }
  }
  if(active&&mission.state.status!=='running'&&!resultPrepared){
    resultPrepared=true;paused=false;cancelMode();combatMenu?.close();world.keys.clear();
    ending.begin(mission);saveGame(false);
  }
  ending.update(dt,radio.current);
  pruneSelection();
  const renderStarted=performance.now();
  world.update(mission, selected, dt, (active||openingPlaying) && !paused && mission.state.status==='running',active);
  const debugStarted=performance.now();
  navigationTelemetry?.rendered(world.vehicles.transforms);
  navigationDebug?.update();
  const uiStarted=performance.now();
  if (active) {
    minimapView.render(now);
    if (now - lastUi > 220) {
      lastUi = now;
      if (buildKind) updatePlacement();
      updateUi();
      commandFeedback();
    }
    if(uiPending){uiPending=false;flushUi();}
    if (mission.state.status !== 'running' && !resultShown) {
      $('results-open').hidden=false;
      if(ending.ready&&resultsPresentationReady(mission,radio)){resultShown=true;ending.finish();saveGame(false);resultsView.show(mission);}
    }
  }
  if (now >= toastUntil) $('toast').hidden = true;
  const frameFinished=performance.now();
  if(stabilityGraph.enabled)stabilityGraph.sample(now,{mission,running:(active||openingPlaying)&&!paused&&mission.state.status==='running',speed,ticks:stabilityTicks,step:mission.config.simulationStep,finishedAt:frameFinished,simulationMs:stabilitySimulationMs,worldMs:debugStarted-renderStarted,otherMs:Math.max(0,frameFinished-frameWorkStarted-stabilitySimulationMs-(debugStarted-renderStarted))});
  perf?.end(world);
  navigationTelemetry?.frameWork({simulationAndEvents:renderStarted-frameWorkStarted,render:debugStarted-renderStarted,
   diagnostics:uiStarted-debugStarted,ui:frameFinished-uiStarted,total:frameFinished-frameWorkStarted});
}
requestAnimationFrame(frame);
try {
  mainMenu.loading.begin();
  await mainMenu.loading.stage('resources');
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Конфигурация миссии ' + response.status);
  config = await response.json();
  const story = await loadMissionStory();
  sound = new FieldSound($('sound-toggle'), $('story-voice-toggle'));
  openingTelevision = new OpeningTelevision(sound,{
    beforeReveal:()=>world.update(mission,selected,0,false,active),
  });
  world = await createCampaignWorld($('world'), config, sound, mainMenu.loading);
  ending=new MissionEnding(world,$('mission-ending'));
  await mainMenu.loading.stage('simulation');
  mission = new Mission(config, world.field);
  minimapView=createMinimap($('minimap'),{world,mission,selected,background:miniBackground,notify:toast});
  navigationTelemetry=installNavigationTelemetry(mission,()=>({active,paused,speed,openingPlaying,
   camera:{x:Math.round(world.controls.target.x),y:Math.round(world.controls.target.y),distance:Math.round(world.camera.position.distanceTo(world.controls.target))},
   designerVisible:!!designer?.visible,renderSuspended:!!window.campaign?.renderSuspended,selected:[...selected],renderer:{programs:world.renderer.info.programs.length,...world.shaderPreparation}}));
  if(perf){
    perf.wrap(mission,'advance','simulation');perf.wrap(mission,'updateFog','visibility');
    perf.wrap(world,'update','world');perf.wrap(world.renderer,'render','render');
    const instrumentPlanning=()=>{
      perf.wrap(mission.trafficCoordinator,'advancePlanning','traffic planning');
      perf.wrap(mission.trafficCoordinator.planner,'snapshot','snapshot');
    };
    instrumentPlanning();
    const load=mission.load;mission.load=function(...args){const result=load.apply(this,args);instrumentPlanning();return result;};
    if(navigationTelemetry)perf.wrap(navigationTelemetry,'rendered','telemetry');
    perf.wrap(minimapView,'render','minimap');
    const originalUi=flushUi;flushUi=(...args)=>perf.measure('ui',()=>originalUi(...args));
  }
  world.damage.bindMission(mission);
  await mainMenu.loading.stage('graphics');
  await world.prepareRendering?.(mission);
  await mainMenu.loading.stage('audio');
  await mainMenu.prepareMedia();
  await mainMenu.loading.stage('interface');
  designer = new VehicleDesigner($('designer'), $('design-toggle'), mission, {
    makeModel: (components, paint) => world.vehicles.makeDesignModel(components, paint),
    onActiveChange(open) {
      if (open) {
        pausedBeforeDesigner = paused;
        paused = true;
        radio?.suspendDialogue();
        sound.stopStory();
        sound.update({engine:0,rolling:0,slip:0,welding:0});
      } else paused = pausedBeforeDesigner;
      updateUi();
    },
    onSave(project) {
      saveGame(false);
      updateUi();
      toast('Проект «' + project.name + '» доступен на заводе');
    },
  });
  radio = new FieldRadio($('radio'), $('radio-toggle'), {
    director:new StoryDirector(story),
    onSignal(signal,chapter,keepCaptionUntil,urgent,cue) {
      if(chapter&&!cue&&signal?.kind!=='anomaly')sound.signal('radio');
      sound.playStory(chapter,keepCaptionUntil,urgent,cue);
      presentSignal(signal,chapter);
    },
    onFocus:focusSignal,
  });
  sound.configureStoryVoices(story,mission,()=>!!radio.entry);
  try {
    const library=await loadRadioLibrary();
    mission.radioObserver=new MissionRadio(mission,library,{legacyBarks:story.barks});
    radio.dynamic=mission.radioObserver;
    radio.audioBusy=()=>!!(sound.voiceSource||sound.pendingVoice||sound.storyPlayback||sound.pendingStory);
  } catch(error) { console.warn('Динамический эфир недоступен:',error.message); }
  const cacheRadioPosition=()=>{radioBottom=Math.max($('radio').getBoundingClientRect().bottom,radio.portrait.hidden?0:radio.portrait.getBoundingClientRect().bottom);positionFieldTasks();uiPending=true;};
  new ResizeObserver(cacheRadioPosition).observe($('radio'));
  new ResizeObserver(cacheRadioPosition).observe(radio.portrait);
  window.addEventListener('resize',cacheRadioPosition,{passive:true});
  window.campaign = {
    ready: true, mission, world, select, radio,
    getResults:id=>missionResults(mission,id),getMemorial:()=>campaignMemorial(mission),
    showResults:()=>resultsView.show(mission),setPersonnelRank:(id,rank)=>setPersonnelRank(mission,id,rank),
    get drivingAudio() { return {running:sound.ready(), recordings:!!sound.recordings}; },
    get memorialAudio() {return {active:!!sound.memorialMix,enabled:sound.enabled,playing:!!sound.memorialMusic&&!sound.memorialMusic.paused,time:sound.memorialMusic?.currentTime??0,src:sound.memorialMusic?.src??''};},
    get storyAudio() { return {playing:!!sound.storyPlayback, enabled:sound.storyEnabled, chapter:sound.storyPlayback?.chapter, cueId:sound.storyPlayback?.cueId, urgent:!!sound.storyPlayback?.urgent}; },
    get unitVoice() {return {playing:!!sound.voiceSource,cueId:sound.voiceCueId};},
    get selected() { return [...selected]; },
    get state() { return {active, openingPlaying, openingCamera:openingCamera?.phase??null, dreamPlaying:openingTelevision.active, paused, speed, buildKind, orderMode}; },
    advance(seconds) { if(openingTelevision.active)return mission.state;mission.advance(seconds); events(); radio.consume(mission, performance.now()); updateUi(); return mission.state; },
  };
  if(new URLSearchParams(location.search).has('damage')){
    const [{installDamageDebug},T]=await Promise.all([import('./damage-debug.js'),import('three')]);
    window.campaign.damageDebug=installDamageDebug(T,world,mission,window.campaign);
  }
  if(new URLSearchParams(location.search).has('navigation'))await toggleNavigationDebug(true);
  miniBackground.src = '../assets/maps/alpha/macro-albedo.jpg';
  installInput();
  let hasSave=false;
  try { hasSave=!!resumeData(); } catch {}
  await mainMenu.loading.finish();
  mainMenu.ready(hasSave);
  $('begin').onclick = () => start();
  $('resume-save').onclick = () => start(true);
  $('load').onclick = () => start('manual');
  $('m02-checkpoint').onclick = () => start(mission.state.m02?.version===1?'checkpoint':'map-backup');
  $('save').onclick = () => saveGame();
  $('main-menu-return').onclick = async () => {if(await saveGame())location.reload();};
  $('pause').onclick = () => { paused = !paused; world.keys.clear(); updateUi(); };
  $('tempo').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; updateUi(); };
  $('design-toggle').onclick = toggleDesigner;
  $('build-toggle').onclick = toggleBuild;
  $('lab-toggle').onclick = () => openBuilding('lab');
  $('lab-toggle').ondblclick = () => openBuilding('lab', true);
  $('production-toggle').onclick = () => openBuilding('factory');
  $('select-army').onclick = selectArmy;
  $('production-toggle').ondblclick = () => openBuilding('factory', true);
  $('close-build').onclick = $('cancel-order').onclick = cancelMode;
  $('suggest-site').onclick = suggestSite;
  $('rotate-building').onclick=()=>rotatePlacement();
  $('rotate-building').oncontextmenu=event=>{event.preventDefault();rotatePlacement(-1);};
  $('placement-snap').onclick=()=>{snapBuildings=!snapBuildings;updatePlacement();};
  $('attack-order').onclick=toggleAttackOrder;
  combatMenu=new CombatMenu({button:$('combat-modes'),mission,onOpen:()=>cancelMode(),onChange:result=>{if(report(result))sound.signal('order');updateUi();}});
  $('home').onclick = () => {
    document.querySelector('.settings').open = false;
    world.centre(world.field.gridToWorld(config.startGrid), 360);
  };
  $('objective-focus').onclick = () => {
    const signal=tacticalFocus(visibleRaidContact(mission));
    if(!signal)return;
    document.querySelector('.settings').open = false;
    presentSignal(signal);
    focusSignal(signal);
  };
  $('select-blocked').onclick = () => {
    const live=[...blockedOrders].map(id=>mission.entity(id)).filter(Boolean);
    if(live.length===1)focusUnit(live[0]);
    else if(live.length)select(live.map(unit=>unit.id));
  };
  let enteringM02=false;
  resultsView=new MissionResultsView($('result'),{onVisibility:visible=>{
    sound.setMemorialMix(visible);
    world.controls.enabled=!visible&&!openingPlaying&&!ending.presenting;world.keys.clear();$('mission-hud').inert=visible;
    if(visible){cancelMode();document.querySelector('.settings').open=false;}
  }});
  $('results-open').onclick=()=>{ending.finish();resultShown=true;resultsView.show(mission);};
  $('result-continue').onclick=async()=>{
    if(enteringM02||mission.state.m02||mission.state.status!=='victory')return;
    enteringM02=true;$('result-continue').disabled=true;
    try{
      try{localStorage.setItem(checkpointKey,await mission.saveAsync());}catch{return toast('Не удалось создать контрольное сохранение');}
      const result=mission.enterM02();if(!result.ok)return report(result);
      resultShown=false;resultPrepared=false;ending.reset();resultsView.hide();$('results-open').hidden=true;radio.reset();taskKey='';actionKey='';world.storySignals.show(null);
      await saveGame(false);updateUi();
    }finally{enteringM02=false;$('result-continue').disabled=false;}
  };
  $('result-close').onclick = () => resultsView.hide();
  $('result-menu').onclick = () => {resultsView.hide();$('main-menu-return').click();};
} catch (error) {
  console.error(error);
  mainMenu.error('Ошибка запуска. ' + error.message);
}
