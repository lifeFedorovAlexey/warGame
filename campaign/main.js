import {setButtonIcon, speedIcon} from '../assets/ui/icons.js';
import {createCampaignWorld} from './world.js';
import {Mission} from './mission.js';
import {FieldRadio, missionSignal} from './field-radio.js';
import {raidApproachSignal, visibleRaidContact, warehouseAdvanceHint, waterTowerSignal} from './threat-guidance.js';
import {restoreRadioStory} from './radio-save.js';
import {FieldSound} from './field-sound.js';
import {StoryDirector, loadMissionStory} from './story-director.js';
import {storyObjectives} from './story-objectives.js';
import {buildLayerHeight} from './builder-optics.js';
import {VehicleDesigner} from './designer.js';
import {SCAV_PROFILES} from './scav-unit-profiles.js';
import {CombatMenu} from './combat-menu.js';
import {pickupTarget} from './pickup-orders.js';

const $ = id => document.getElementById(id);
const saveKey = 'warGame.alpha.mission01.v1';
const dataUrl = '../assets/campaign/alpha/mission01/gameplay.json';
const selected = new Set();
const miniBackground = new Image();
let world, mission, config, radio, sound, designer, combatMenu;
let active = false, paused = false, speed = 1, resultShown = false;
let prologuePlaying = false;
let pausedBeforeDesigner = false;
let buildOpen = false, buildKind = null, rotation = 0, orderMode = null;
let pointer = null, drag = null, site = null, placing = null;
let last = performance.now(), lastUi = 0, lastMini = 0, toastUntil = 0;
let actionKey = '', rosterKey = '', paletteKey = '', taskKey = '', queueKey = '';
let blockedOrders = new Set(), blockedUntil = 0;
let lastCommandRevision=null,lastCommandFeedback='';
let navigationDebug, navigationDebugLoading;
async function toggleNavigationDebug(force){
 navigationDebug??=await (navigationDebugLoading??=import('./navigation-debug.js').then(({installNavigationDebug})=>installNavigationDebug(world,mission,()=>selected)));
 navigationDebug.setEnabled(force??!navigationDebug.enabled);
 if(window.campaign)window.campaign.navigationDebug=navigationDebug;
}

const vehicles = () => mission.state.units.filter(unit => unit.owner === 'rai' && unit.hp > 0);
const builders = () => vehicles().filter(unit => config.units[unit.kind].role === 'builder');
const selection = () => [...selected].map(id => mission.entity(id)).filter(Boolean);
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
  if(state.flags.contact&&!state.flags.raidWon)return contact ? 'Отразите рейд на базу.' : 'Прикройте въезд к базе.';
  if(artifact)return 'Подберите артефакт.';
  if(!state.powered){
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
const sampleNames = {'flamethrower':'Устройство №001','mg-ammo-1':'Образец со склада','mg-tower':'Узел башни'};
const sampleIcons = {'flamethrower':'technology','mg-ammo-1':'ammunition','mg-tower':'turret-ring'};
const projectLabel = (kind, id, name) => (id && id === kind ? config.units[kind]?.name : name) ?? config.units[kind]?.name;

function toast(message, milliseconds = 2600) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastUntil = performance.now() + milliseconds;
}
function report(result) {
  if (!result?.ok) toast(result?.reason ?? 'Приказ не выполнен');
  if(!result?.ok&&result?.reason==='Недостаточно энергии')sound.bark(10);
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
  combatMenu?.close();
  buildKind = null;
  buildOpen = false;
  orderMode = keepAttack && orderMode === 'attack' ? 'attack' : null;
  site = placing = null;
  world.setGhost(null);
  updateUi();
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
  for (const id of ids) if (mission.entity(id)) selected.add(id);
  cancelMode({keepAttack:true});
  if (speak && active && ids.some(id => liveMobile(mission.entity(id)))) {
    sound.acknowledge('select', selection().filter(liveMobile).map(unit => unit.id));
  }
}
function focusUnit(unit) {
  select([unit.id]);
  world.centre(unit, 320);
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
  combatMenu?.close();
  if (buildOpen || buildKind) return cancelMode();
  if (!builders().length) return toast('Нет строителей. Закажите машину на заводе.');
  orderMode = null;
  buildOpen = true;
  updateUi();
}
function beginPlacement(kind) {
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
  if (!selection().some(unit=>isMobile(unit)&&(mode!=='attack'||config.units[unit.kind].damage>0))) {
    const unit = vehicles().find(unit => config.units[unit.kind].damage > 0) ?? (mode!=='attack'&&vehicles()[0]);
    if (!unit) return;
    select([unit.id], false, false);
  }
  cancelMode();
  orderMode = mode;
  updateUi();
}
function toggleAttackOrder(){if(orderMode==='attack')cancelMode();else beginOrder('attack');}
function saveGame(notify = true) {
  try {
    localStorage.setItem(saveKey, mission.save());
    if (notify) toast('Операция сохранена');
  } catch {
    if (notify) toast('Сохранение недоступно');
  }
}
function stopPrologue() {
  if(!prologuePlaying)return;
  radio.reset();radio.director.stopPrologue();prologuePlaying=false;
  document.body.classList.remove('prologue-playing');$('mission-hud').hidden=!active;
  setButtonIcon($('prologue'),'radio','Прослушать пролог');
}
function start(restore = false) {
  stopPrologue();
  if (restore) {
    try {
      const data = localStorage.getItem(saveKey);
      if (!data) return toast('Сохранения ещё нет');
      mission.load(data);
      if(radio.director)restoreRadioStory(mission.state);
    } catch (error) {
      return toast('Сохранение не открывается. ' + error.message);
    }
  }
  if(!restore)mission.state.storyConstruction={enabled:true,unlocked:['generator']};
  designer.close(false);
  active = true;
  paused = false;
  resultShown = false;
  radio.reset();
  world.storySignals.show(null);
  blockedOrders.clear();
  $('order-feedback').hidden=true;
  $('welcome').hidden = true;
  $('result').hidden = true;
  $('mission-hud').hidden = false;
  document.querySelector('.settings').open = false;
  const worker = builders()[0];
  const centre = restore ? vehicles()[0] : world.field.gridToWorld(config.startGrid);
  if (centre) world.centre(centre, 360);
  select(worker ? [worker.id] : [], false, false);
  sound.unlock();
  radio.consume(mission, performance.now());
  if (restore) toast('Операция загружена');
}
function ordersAt(point, target, mode) {
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
  if ((mode === 'attack'||!mode) && target?.owner === 'scavs') {
    action = 'attack';
    destination = target;
  } else if (mode === 'attack') {
    action='attack-move';
  } else if (!mode && target?.owner === 'rai' && chosen.some(entity => entity.kind === 'builder')) {
    if (target.completed === false) action = 'build';
    else if (target.hp < target.maxHp) action = 'repair';
    if (action !== 'move') destination = target;
  }
  if (!destination) return toast('Укажите точку на карте');
  if (action === 'move'||action === 'attack-move') {
    const pickup=pickupTarget(mission,destination);
    if(pickup){destination=pickup.item;action='move';}
  }
  const result = mission.submitOrder([...selected], action, destination);
  if (!report(result)) return;
  lastCommandRevision=result.revision??null;lastCommandFeedback='';
  const combatOrder=action==='attack'||action==='attack-move';
  world.commandMarker(destination,combatOrder);
  const eligible = chosen.filter(entity => liveMobile(entity) && (!combatOrder || config.units[entity.kind].damage) && (!['build', 'repair'].includes(action) || entity.kind === 'builder'));
  blockedOrders=new Set(result.unassigned);
  blockedUntil=performance.now()+7500;
  const feedback=$('order-feedback');
  const text=blockedOrders.size?result.assigned+' из '+eligible.length+' · без маршрута '+blockedOrders.size:action==='repair'?'Строитель принял приказ на ремонт':'';
  feedback.querySelector('span').textContent=text;
  feedback.hidden=!text;
  $('select-blocked').hidden=!blockedOrders.size;
  sound.acknowledge(combatOrder?'attack':action,result.assignedIds??eligible.filter(unit=>!blockedOrders.has(unit.id)).map(unit=>unit.id));
  orderMode = mode === 'attack' ? 'attack' : null;
  combatMenu?.close();
  updateUi();
}
function hitEntity(x, y) {
  const direct=world.pickEntity(mission,x,y);
  if(direct)return direct;
  let nearest = null, best = 24;
  for (const entity of [...mission.state.units, ...mission.state.buildings]) {
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
  return point && mission.state.buildings.find(b => b.hp > 0 && (b.owner === 'rai' || mission.visibleAt(b.x, b.y)) && Math.abs(point.x - b.x) < b.halfWidth && Math.abs(point.y - b.y) < b.halfDepth);
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
  const check = point && mission.placement(buildKind, point.x, point.y, rotation);
  placing = point ? {...point, ...check, rotation: check?.rotation ?? rotation} : null;
  world.setGhost(buildKind, placing);
  const label = $('placement-status');
  label.textContent = !point ? 'Наведите курсор на карту' : check.ok ? (check.blockers.length ? 'ЛКМ — поставить. Машины освободят площадку.' : 'ЛКМ — поставить · R — повернуть · Esc — отменить') : check.reason;
  label.classList.toggle('invalid', !!check && !check.ok);
}
function suggestSite() {
  if (!buildKind) return;
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
  canvas.addEventListener('pointerdown', event => {
    if (!active || mission.state.status !== 'running') return;
    if (event.button === 2) {
      lastSelectionClick=null;
      event.preventDefault();
      if (buildKind) return cancelMode();
      ordersAt(world.ground(event.clientX, event.clientY), hitEntity(event.clientX, event.clientY), orderMode);
    }
    if (event.button === 0) {
      canvas.setPointerCapture(event.pointerId);
      drag = {x: event.clientX, y: event.clientY, append: event.shiftKey};
    }
  });
  canvas.addEventListener('pointermove', event => {
    pointer = {x: event.clientX, y: event.clientY};
    site = null;
    const oil = !buildKind && !orderMode && oilAt(pointer.x,pointer.y);
    canvas.title = oil ? 'Построить вышку' : '';
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
    if (!drag || event.button !== 0) return;
    const origin = drag;
    const previousClick=lastSelectionClick;
    lastSelectionClick=null;
    drag = null;
    $('drag-box').hidden = true;
    const x = event.clientX, y = event.clientY;
    if (buildKind) {
      pointer = {x,y};
      site = null;
      updatePlacement();
      if (!placing?.ok) return;
      const result = mission.build([...selected], buildKind, placing.x, placing.y, rotation);
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
    const ownTarget=orderMode==='attack'?hitEntity(x,y):null;
    if (orderMode && !(orderMode==='attack'&&(selecting||ownTarget?.owner==='rai'))) return ordersAt(world.ground(x,y), ownTarget??hitEntity(x,y), orderMode);
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
  canvas.addEventListener('pointercancel', () => { drag = null; lastSelectionClick=null; $('drag-box').hidden = true; });
  document.addEventListener('keydown', event => {
    if (!active || designer.visible || event.target.matches('input, select, textarea')) return;
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
          mission.submitOrder(result.members,request.type??'move',request.request);
      }
      return;
    }
    if(event.altKey&&code==='KeyR'&&!event.repeat){
      event.preventDefault();const result=mission.retreat(selection().filter(liveMobile).map(u=>u.id));
      if(report(result))toast('Отходим к базе');
      return;
    }
    if(event.ctrlKey||event.metaKey||event.altKey)return;
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
    else if (code === 'KeyR' && buildKind) {
      rotation = (rotation + Math.PI / 2) % (2 * Math.PI);
      updatePlacement();
    } else if (code === 'Home') $('home').click();
    else if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) {
      event.preventDefault();
      world.keys.add(code);
    }
  });
  document.addEventListener('keyup', event => world.keys.delete(event.code));
  window.addEventListener('blur', () => world.keys.clear());
  $('minimap').addEventListener('pointerdown', event => {
    const rect = $('minimap').getBoundingClientRect();
    const point = world.field.gridToWorld([(event.clientX-rect.left)/rect.width*127, (event.clientY-rect.top)/rect.height*127]);
    world.centre(point);
  });
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
    control.title=building?label+' · Двойной клик — к зданию':'Построить '+spec.name+' · '+spec.cost+' ⚡';
    control.classList.toggle('active',!!building&&selected.has(building.id));
  }
  if (!buildOpen) return;
  const s = mission.state, entries = Object.entries(config.buildings).filter(([kind,spec])=>mission.constructionUnlocked(kind)&&(!spec.requires||s.research[spec.requires]));
  const available = ([kind,spec]) => (!spec.requires || s.research[spec.requires]) && mission.canSpend(spec.cost);
  const key = entries.map(entry => entry[0]+Number(available(entry))).join(',') + Object.keys(s.research).join(',');
  if (key === paletteKey) return;
  paletteKey = key;
  $('build-cards').style.setProperty('--build-columns',entries.length);
  $('build-cards').replaceChildren(...entries.map(([kind,spec]) => {
    const b = button(spec.name, spec.cost + ' ⚡ · ' + spec.seconds + ' с', () => beginPlacement(kind), !available([kind,spec]), kind);
    if (spec.oilSlots) b.title += ' · До ' + spec.oilSlots + ' вышек';
    return b;
  }));
}
function updateRoster() {
  const units=vehicles(),roster=$('roster');
  const tileWidth=roster.firstElementChild?.offsetWidth||40;
  const gap=parseFloat(getComputedStyle(roster).columnGap)||0;
  const columns=Math.max(1,Math.min(6,Math.floor((roster.clientWidth+gap)/(tileWidth+gap))));
  const groups=new Map(),types=new Map();
  const stack=units.length>columns;
  const counts={};
  for(const unit of units){
    counts[unit.kind]=(counts[unit.kind]??0)+1;
    const blocked=blockedOrders.has(unit.id),separate=blocked&&blockedOrders.size<=4;
    const design=unitType(unit);
    if(!types.has(design))types.set(design,types.size);
    const key=stack&&!separate?[blocked,design,selected.has(unit.id)].join(':'):unit.id;
    if(!groups.has(key)){
      const customName=unit.projectId===unit.kind?null:unit.designName;
      const label=customName??config.units[unit.kind].name+(stack&&!separate?'':' '+counts[unit.kind]);
      groups.set(key,{label,kind:unit.kind,design,units:[]});
    }
    groups.get(key).units.push(unit);
  }
  const tiles=[...groups.values()].sort((a,b)=>types.get(a.design)-types.get(b.design));
  const visibleColumns=Math.min(tiles.length,columns);
  roster.style.setProperty('--roster-cols',Math.max(1,visibleColumns));
  const tileKey=tile=>tile.units.map(unit=>unit.id).join('/');
  const key=tiles.map(tileKey).join(',');
  if(key!==rosterKey){
    rosterKey=key;
    const previous=new Map([...roster.children].map(b=>[b.dataset.units,b]));
    roster.replaceChildren(...tiles.map(tile=>{
      const existing=previous.get(tileKey(tile));
      if(existing)return existing;
      const b=document.createElement('button');
      b.dataset.units=tileKey(tile);
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
    const {units,label}=tiles[i],b=roster.children[i];
    const active=units.every(unit=>selected.has(unit.id));
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',String(active));
    const lowest=units.reduce((min,unit)=>unit.hp/unit.maxHp<min.hp/min.maxHp?unit:min);
    b.style.setProperty('--hp',100*lowest.hp/lowest.maxHp+'%');
    b.style.setProperty('--hp-color',hpColor(lowest.hp/lowest.maxHp));
    const blocked=units.filter(unit=>blockedOrders.has(unit.id)).length;
    b.classList.toggle('order-blocked',blocked>0);
    b.title=label+(units.length>1?' ×'+units.length+' · минимум ':' · ')+Math.ceil(lowest.hp)+'/'+lowest.maxHp+' HP'+(blocked?' · Без маршрута'+(blocked>1?' ×'+blocked:''):'');
  }
}
function updateContext(first) {
  const s = mission.state;
  const energy = s.energy;
  const thresholds = [...Object.values(config.units), ...Object.values(config.research)].map(spec => Number(energy >= spec.cost)).join('');
  const factory = first?.owner === 'rai' && first.completed && first.kind === 'factory';
  const projects = factory ? mission.factoryProjects() : [];
  const designs = factory ? s.designs.map(project => project.id + ':' + project.name).join(',') : '';
  const activeResearch = s.buildings.filter(b=>b.hp>0&&b.research).map(b=>b.research.key);
  const key = [first?.id, first?.completed, first?.clearing, first?.research?.key, activeResearch.join(), s.artifactKeys.join(), Object.keys(s.research).join(), thresholds, designs, builders().length].join('|');
  if (key !== actionKey) {
    actionKey = key;
    const items = [];
    const add = (label, detail, action, disabled, icon) => {
      const item = button(label, detail, () => {report(action()); updateUi();}, disabled, icon);
      items.push(item);
      return item;
    };
    if (factory) {
      for (const {id, kind, name, spec} of projects) {
        const label=projectLabel(kind,id,name);
        const control=add(label, spec.cost + ' ⚡ · ' + spec.seconds + ' с', () => {
          const result=mission.produce(first.id,id);
          if(result.ok)sound.signal('order');
          return result;
        }, false, kind);
        control.dataset.production=id;control.dataset.baseTitle=control.title;
        control.oncontextmenu=event=>{
          event.preventDefault();
          if(!first.queue.some(job=>mission.productionProjectId(job)===id))return;
          const result=mission.cancelProduction(first.id,id);
          report(result);if(result.ok)sound.signal('order');updateUi();
        };
        const count=document.createElement('span');count.className='production-count';count.hidden=true;count.setAttribute('aria-hidden','true');control.append(count);
      }
    }
    if (first?.owner === 'rai' && first.completed && first.kind === 'lab') {
      for (const [id,spec] of Object.entries(config.research)) {
        const done = s.research[id], known = s.artifactKeys.includes(id);
        if(done||!known||first.research||activeResearch.includes(id)||!mission.canSpend(spec.cost))continue;
        const label=sampleNames[id]??'Неизвестный образец';
        add(label, spec.cost + ' ⚡ · ' + spec.seconds + ' с', () => mission.research(first.id,id), false, sampleIcons[id] ?? 'research').dataset.research = id;
      }
    }
    if (first?.owner === 'rai' && first.completed === false) {
      add('Достроить', 'Отправить строителей', () => {
        const ids = chooseBuilder(first.kind).map(unit => unit.id);
        const result = mission.order(ids, 'build', first);
        if (result.ok) sound.acknowledge('build', ids);
        return result;
      }, first.clearing||!builders().length, 'build');
      add('Отменить', 'Вернуть остаток энергии', () => mission.cancelBuilding(first.id), false, 'close');
    }
    $('actions').replaceChildren(...items);
    $('actions').classList.toggle('factory-actions', !!factory);
    $('actions').hidden = !items.length;
  }
  const queue=$('queue');
  if(factory){
    queue.hidden=true;queue.replaceChildren();queueKey='';
    const jobs=first.queue,counts=new Map();
    const projectId=job=>mission.productionProjectId(job,projects);
    for(const job of jobs){const id=projectId(job);counts.set(id,(counts.get(id)??0)+1);}
    const current=jobs[0]&&projectId(jobs[0]);
    for(const control of $('actions').querySelectorAll('[data-production]')){
      const id=control.dataset.production,count=counts.get(id)??0,badge=control.querySelector('.production-count'),running=count>0&&id===current;
      const canProduce=mission.canSpend(projects.find(project=>project.id===id).spec.cost);
      // A queued project stays interactive so it can be cancelled without energy.
      control.disabled=!canProduce&&!count;
      control.classList.toggle('cannot-produce',!canProduce);
      badge.hidden=!count;badge.textContent=String(count);
      control.classList.toggle('has-queue',count>0);control.classList.toggle('is-producing',running&&s.powered&&!first.exitBlocked);
      const status=count?'В очереди: '+count+(running?(first.exitBlocked?' · Ждёт выезда':!s.powered?' · Нет питания':' · Выпуск '+Math.floor(jobs[0].progress*100)+'%'):''):'';
      control.title=control.dataset.baseTitle+' · ЛКМ — заказать · ПКМ — отменить один'+(status?' · '+status:'');
      if(status)control.setAttribute('aria-description',status);else control.removeAttribute('aria-description');
    }
    return;
  }
  const job=first?.research;
  queue.hidden = !job;
  if (job) {
    const label=sampleNames[job.key]??'Образец';
    const nextKey=[first.id,s.powered,job.key].join('|');
    if(nextKey!==queueKey){
      queueKey=nextKey;
      const running=document.createElement('div'),progress=document.createElement('progress');
      running.textContent=(s.powered?'':'Нет питания · ')+'Анализ · '+label;
      progress.max=1;running.append(progress);
      queue.replaceChildren(running);
    }
    queue.querySelector('progress').value=job.progress;
  }
}
function positionFieldTasks(){
  $('field-tasks').style.top=($('radio').hidden?54:$('radio').offsetTop+$('radio').offsetHeight+12)+'px';
}
function updateUi() {
  if (!active) return;
  if(performance.now()>=blockedUntil){blockedOrders.clear();$('order-feedback').hidden=true;}
  const s = mission.state;
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
  for (const id of selected) if (!mission.entity(id)) selected.delete(id);
  const group = selection(), first = group[0], mobile = group.filter(isMobile);
  $('energy').textContent = Math.floor(s.energy);
  $('income').textContent = (s.energyRate >= 0 ? '+' : '') + s.energyRate.toFixed(1) + '/с';
  $('income').classList.toggle('deficit',s.energyRate<0);
  const population=vehicles().length;
  $('population').textContent = population + ' / ' + (config.unitLimit??48);
  $('energy-meter').max=config.energyCapacity;
  $('energy-meter').value=s.energy;
  $('fleet-meter').value=population;
  $('power').textContent = s.powered ? 'Сеть онлайн' : 'Нет питания';
  $('power').classList.toggle('online',s.powered);
  setButtonIcon($('pause'), paused ? 'play' : 'pause', paused ? 'Продолжить' : 'Пауза', 'Пробел');
  setButtonIcon($('tempo'), speedIcon(speed), 'Скорость ×' + speed);
  const tasks = mission.objectives();
  const assigned=storyObjectives(mission,{radioEnabled:radio.enabled});
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
  const entityName = first && (projectLabel(first.kind,first.projectId,first.designName)
    ?? config.buildings[first.kind]?.name ?? config.camps.find(camp=>camp.id===first.campId)?.name ?? 'Лагерь');
  $('selection').parentElement.hidden=!first;
  $('selection').textContent = group.length > 1 ? 'Группа · ' + group.length : entityName ?? '';
  const hp = group.reduce((sum,entity)=>sum+entity.hp,0), maxHp = group.reduce((sum,entity)=>sum+entity.maxHp,0);
  const wellStatus=group.length===1&&first?.owner==='rai'&&first.kind==='derrick'&&first.completed
    ? ' · '+(first.powered?'Качает':s.powered?'Лимит АЭС':'Нет питания'):'';
  $('details').textContent = first?.clearing ? 'Освобождение площадки' : first?.awaitingWorkers ? 'В очереди строителей' : first ? Math.ceil(hp) + '/' + maxHp + (first.completed === false ? ' · ' + Math.floor(first.progress*100) + '%' : ' HP')+wellStatus : '';
  $('move-order').classList.toggle('active', orderMode === 'move');
  $('attack-order').classList.toggle('active', orderMode === 'attack');
  $('attack-order').setAttribute('aria-pressed',String(orderMode==='attack'));
  $('move-order').disabled = !vehicles().length;
  $('attack-order').disabled = orderMode!=='attack'&&!mobile.some(unit => config.units[unit.kind].damage > 0);
  $('stop').disabled = !mobile.length;
  $('placement').hidden = !buildKind;
  if (buildKind) $('placement-name').textContent = config.buildings[buildKind].name;
  updateRoster();
  updatePalette();
  updateContext(first);
  designer.refresh();
  combatMenu?.refresh();
}
function minimap(){const canvas=$('minimap'),ctx=canvas.getContext('2d'),size=canvas.width,field=world.field;ctx.fillStyle='#171e1c';ctx.fillRect(0,0,size,size);if(miniBackground.complete&&miniBackground.naturalWidth)ctx.drawImage(miniBackground,0,0,size,size);
 world.drawMinimapFog(ctx,size);
 for(const grid of config.oilFields){const p=field.gridToWorld(grid);if(!mission.exploredAt(p.x,p.y))continue;ctx.fillStyle='#d5b869';ctx.fillRect(grid[0]/127*size-2,grid[1]/127*size-2,4,4);}
 for(const e of [...mission.state.units,...mission.state.buildings]){if(e.hp<=0||e.owner!=='rai'&&!mission.visibleAt(e.x,e.y))continue;const [x,y]=field.worldToGrid(e.x,e.y);ctx.fillStyle=selected.has(e.id)?'#eff2c3':e.owner==='rai'?'#a8c28a':'#d77e60';ctx.fillRect(x/127*size-2,y/127*size-2,e.path?3:5,e.path?3:5);}for(const a of mission.state.artifacts)if(!a.collected&&mission.exploredAt(a.x,a.y)){const [x,y]=field.worldToGrid(a.x,a.y);ctx.fillStyle='#e8d891';ctx.fillRect(x/127*size-3,y/127*size-3,6,6);}if(mission.state.flags.lastRevealed&&!mission.state.camps[3].cleared){const camp=mission.state.camps[3],x=camp.grid[0]/127*size,y=camp.grid[1]/127*size;ctx.strokeStyle='#df997b';ctx.strokeRect(x-5,y-5,10,10);ctx.fillStyle='#edc6a2';ctx.font='10px Arial';ctx.fillText('4',x+7,y+3);}const [cx,cy]=field.worldToGrid(world.controls.target.x,world.controls.target.y);ctx.strokeStyle='#e3d4a3';ctx.lineWidth=1;ctx.strokeRect(cx/127*size-9,cy/127*size-7,18,14);
 world.storySignals.drawMap(ctx,size);
 const contact=visibleRaidContact(mission);
 if(contact){
  const [x,y]=field.worldToGrid(contact.x,contact.y);
  ctx.strokeStyle='#ffd0af';ctx.lineWidth=1.2;ctx.strokeRect(x/127*size-5,y/127*size-5,10,10);
 }
}
function labels() {
  const canvas = $('labels'), dpr = Math.min(devicePixelRatio, 1.5);
  const width = Math.round(innerWidth*dpr), height = Math.round(innerHeight*dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,innerWidth,innerHeight);
  for (const entity of [...mission.state.units, ...mission.state.buildings]) {
    if (entity.hp <= 0 || entity.owner !== 'rai' && !mission.visibleAt(entity.x,entity.y)) continue;
    if (entity.hp === entity.maxHp && !selected.has(entity.id) && entity.completed !== false) continue;
    const unit = config.units[entity.kind];
    const spec = config.buildings[entity.kind];
    const top = entity.completed===false&&spec
      ? buildLayerHeight(entity,spec,config.worldScale)-world.field.heightAt(entity.x,entity.y)
      : (unit ? (SCAV_PROFILES[entity.kind]?.height ?? (entity.kind === 'builder' ? 3.65 : 3.2)) : (spec?.realSizeMetres[2] ?? 4)) * config.worldScale;
    const p = world.screen(entity,top), ground = world.screen(entity,0);
    const visibleHeight = Math.hypot(p.x-ground.x,p.y-ground.y);
    if (!p.visible || visibleHeight < 6 || p.x < 0 || p.x > innerWidth || p.y < 45 || p.y > innerHeight) continue;
    const w=Math.round(Math.max(27,Math.min(53,visibleHeight*1.75))),h=visibleHeight>16?7:6;
    const x=Math.round(p.x-w/2),y=Math.round(p.y-h-3),fraction=entity.hp/entity.maxHp,inside=w-2;
    ctx.fillStyle='#151a16';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#46372c';ctx.fillRect(x+1,y+1,inside,h-2);
    ctx.fillStyle=hpColor(fraction);ctx.fillRect(x+1,y+1,Math.max(1,inside*fraction),h-2);
    const step=inside*100/entity.maxHp>=2.3?50:100;
    for(let hp=step;hp<entity.maxHp;hp+=step){
      const marker=Math.round(x+1+inside*hp/entity.maxHp),major=hp%100===0;
      ctx.fillStyle=major?'#161b16e8':'#1d241d99';
      ctx.fillRect(marker,y+(major?1:3),major?1.25:1,h-(major?2:4));
    }
    if(entity.owner!=='rai'){ctx.fillStyle='#e9856a';ctx.fillRect(x,y+h,w,1);}
    if (entity.completed === false) {
      ctx.fillStyle = '#d4bd88';
      ctx.fillRect(x,y+h+2,w*entity.progress,2);
    }
  }
}

function events() {
  for (const event of mission.drainEvents()) {
    radio?.director?.note(event,mission);
    sound?.storyEvent?.(event);
    if (event.type === 'construction-complete') {
      toast('Построено · ' + config.buildings[event.kind].name);
      sound.signal('complete');
      saveGame(false);
    }
    if (event.type === 'unit-produced') toast((event.name ?? config.units[event.kind].name) + ' · готово к выезду');
    if (event.type === 'field-modification') toast('Установлено · '+event.name+' · +'+event.hpBonus+' HP');
    if (event.type === 'construction-refused') toast(event.reason);
    if (event.type === 'artifact-collected') toast('Артефакт доставлен в НИИ');
    if (event.type === 'camp-cleared') toast('Лагерь зачищен');
  }
}
function presentSignal(signal) {
  world.storySignals.show(signal?.kind==='recon'||signal?.kind==='artifact'?null:signal);
  if(signal?.kind==='anomaly')sound.anomaly?.();
}
function focusSignal(signal) {
  world.focusStorySignal(signal,mission.state.camps[3]);
  if (buildKind) {
    site = pointer = null;
    updatePlacement();
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.65, (now - last) / 1000);
  last = now;
  if (!world || !mission) return;
  if(window.campaign?.renderSuspended)return;
  if (designer?.visible) {
    sound.update();
    return;
  }
  if (active) {
    if (!paused) mission.advance(dt * speed,{budgetMs:mission.config.simulationCpuBudgetMs,rate:speed});
    events();
    radio.consume(mission, now);
  }
  if(prologuePlaying){radio.consume(mission,now);if(radio.director.prologueDone)stopPrologue();}
  world.update(mission, selected, dt, active && !paused && mission.state.status==='running');
  navigationDebug?.update();
  if (active) {
    labels();
    if (now - lastMini > 200) { lastMini = now; minimap(); }
    if (now - lastUi > 220) {
      lastUi = now;
      if (buildKind) updatePlacement();
      updateUi();
      commandFeedback();
    }
    if (mission.state.status !== 'running' && !resultShown) {
      resultShown = true;
      const victory=mission.state.status==='victory';
      $('result-title').textContent = victory ? 'Миссия завершена' : 'Операция прервана';
      $('result-message').textContent = victory ? 'Передовая база действует. Все четыре лагеря зачищены.' : 'Утрачены строители и производство.';
      $('result-signal').hidden=!victory;
      $('result').hidden = false;
    }
  }
  if (now >= toastUntil) $('toast').hidden = true;
}
requestAnimationFrame(frame);
try {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Конфигурация миссии ' + response.status);
  config = await response.json();
  const story = await loadMissionStory();
  sound = new FieldSound($('sound-toggle'), $('story-voice-toggle'));
  world = await createCampaignWorld($('world'), config, sound);
  mission = new Mission(config, world.field);
  world.damage.bindMission(mission);
  designer = new VehicleDesigner($('designer'), $('design-toggle'), mission, {
    makeModel: components => world.vehicles.makeDesignModel(components),
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
      presentSignal(signal);
    },
    onFocus:focusSignal,
  });
  sound.configureStoryVoices(story,mission,()=>!!radio.entry||prologuePlaying);
  new ResizeObserver(positionFieldTasks).observe($('radio'));
  window.campaign = {
    ready: true, mission, world, select, radio,
    get drivingAudio() { return {running:sound.ready(), recordings:!!sound.recordings}; },
    get storyAudio() { return {playing:!!sound.storyPlayback, enabled:sound.storyEnabled, chapter:sound.storyPlayback?.chapter, cueId:sound.storyPlayback?.cueId, urgent:!!sound.storyPlayback?.urgent}; },
    get unitVoice() {return {playing:!!sound.voiceSource,cueId:sound.voiceCueId};},
    get selected() { return [...selected]; },
    get state() { return {active, paused, speed, buildKind, orderMode}; },
    advance(seconds) { mission.advance(seconds); events(); radio.consume(mission, performance.now()); updateUi(); return mission.state; },
  };
  if(new URLSearchParams(location.search).has('damage')){
    const [{installDamageDebug},T]=await Promise.all([import('./damage-debug.js'),import('three')]);
    window.campaign.damageDebug=installDamageDebug(T,world,mission,window.campaign);
  }
  if(new URLSearchParams(location.search).has('navigation'))await toggleNavigationDebug(true);
  miniBackground.src = '../assets/maps/alpha/macro-albedo.jpg';
  installInput();
  $('loading-status').textContent = 'Карта готова. Первый приказ — развернуть базу.';
  $('begin').disabled = false;
  $('prologue').disabled = false;
  $('prologue').onclick = () => {
    if(prologuePlaying)return stopPrologue();
    radio.reset();radio.setEnabled(true);radio.director.startPrologue();
    prologuePlaying=true;document.body.classList.add('prologue-playing');$('mission-hud').hidden=false;
    setButtonIcon($('prologue'),'close','Закончить пролог');sound.unlock();radio.consume(mission,performance.now());
  };
  try { $('resume-save').hidden = !localStorage.getItem(saveKey); } catch {}
  $('begin').onclick = () => start();
  $('resume-save').onclick = $('load').onclick = () => start(true);
  $('save').onclick = () => saveGame();
  $('pause').onclick = () => { paused = !paused; world.keys.clear(); updateUi(); };
  $('tempo').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; updateUi(); };
  $('design-toggle').onclick = toggleDesigner;
  $('build-toggle').onclick = toggleBuild;
  $('lab-toggle').onclick = () => openBuilding('lab');
  $('lab-toggle').ondblclick = () => openBuilding('lab', true);
  $('production-toggle').onclick = () => openBuilding('factory');
  $('production-toggle').ondblclick = () => openBuilding('factory', true);
  $('close-build').onclick = $('cancel-order').onclick = cancelMode;
  $('suggest-site').onclick = suggestSite;
  $('move-order').onclick = () => beginOrder('move');
  combatMenu=new CombatMenu({button:$('attack-order'),mission,selection,isActive:()=>orderMode==='attack',onOpen:()=>beginOrder('attack'),onDeactivate:()=>cancelMode(),onChange:result=>{if(report(result))sound.signal('order');updateUi();}});
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
  $('stop').onclick = () => {
    const ids = selection().filter(liveMobile).map(unit => unit.id);
    if (report(mission.stop(ids))) sound.acknowledge('stop', ids);
    cancelMode({keepAttack:true});
  };
  $('result-close').onclick = () => { $('result').hidden = true; };
  $('result-signal').onclick = () => {
    const signal=missionSignal('outro',mission);
    $('result').hidden = true;
    radio.dismiss();
    presentSignal(signal);
    focusSignal(signal);
  };
  $('restart').onclick = () => location.reload();
} catch (error) {
  console.error(error);
  $('loading-status').textContent = 'Ошибка запуска. ' + error.message;
}
