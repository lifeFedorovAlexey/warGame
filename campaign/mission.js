import {requestTransport,loadTransport,cancelTransportLoading,departTransport,unloadTransport,updateTransport,transportObstacles,transportPose} from './korovnik-transport.js';
import {prepareTransportSite,transportSite} from './transport-site.js';
import {TerrainNavigator} from './navigation.js';
import {livingEntity} from './entity-lookup.js';
import {waterTower} from './threat-guidance.js';
import {checkBuildingPlacement} from './building-placement.js';
import {factoryAccessVersion,refreshFactoryAccess} from './factory-access.js';
import {canDemolish,advanceDemolition} from './building-demolition.js';
import {constructionUnlocked,researchUnlocked,defenseReady} from './story-construction.js';
import {driveStep,clearOfVehicles,vehicleClearance,planManeuver,planManeuverSteps,maneuverStep,maneuverPlanStep,checkManeuver} from './vehicle-motion.js';
import {commandPathFromLive,retryCommandFromRest} from './command-motion.js';
import {footprintSupport,vehicleEnvelope,vehicleSweep,vehicleObstacle,vehicleRadiusBound,footprintGap,trafficCollisionRequired} from './vehicle-collision.js';
import {passageStillOpen,preparePassageEgress} from './passage-egress.js';
import {vehicleRecipes,starterProjects,matchingRecipe,projectDesignation,designNameKey,projectAssemblyKey,latestVehicleProjects,latestVehicleProject} from './vehicle-designs.js';
import {vehiclePaint} from './vehicle-paint.js';
import {chooseProductionFactory,productionCancellation,productionFactories,rebalanceProduction} from './factory-production.js';
import {isCampPerimeter,updateCampPerimeters,advanceCampDemolition} from './camp-demolition.js';
import {isBlueprint,restoreConstructionHealth,advanceConstruction} from './construction-health.js';
import {availableOil,oilFundingRemaining,oilRefund,beginOilFlow,finishOilFlow,transferOil,fundedWorkTime,repairWithOil} from './oil-economy.js';
import {angleDelta} from './builder-kinematics.js';
import {workProjection,projectorHasSight} from './builder-optics.js';
import {setBuilderAutoRepair,assignAutomaticRepair,releaseInvalidRepairTarget,repairableBuilding} from './builder-auto-repair.js';
import {combatContact} from './combat-contact.js';
import {clearCombatSight} from './combat-sight.js';
import {recordDamage} from './damage-contact.js';
import {destroyDamage,damageMobility,partMissing,upgradeDamageState} from './damage-state.js';
import {ensureSalvage,updateSalvage,armorMultiplier,salvageFromWreck,availableFieldRecipes,modificationInstalled,touchesSalvage,salvagePickupReach,canInstallRecipe,syncFieldHp} from './vehicle-salvage.js';
import {fieldUnitSpec} from './field-modifications.js';
import {scheduleWreck,updateWrecks} from './wreck-lifecycle.js';
import {updateBurning} from './burning.js';
import {updateStreetFurniture} from './street-furniture.js';
import {updateOpeningConstruction} from './opening-construction.js';
import {installScavBases,campGuardPose} from './scav-base-layout.js';
import {syncScavBaseRoads} from './scav-base-roads.js';
import {installCampResources,captureCampResources} from './camp-resources.js';
import {migrateScavLayout} from './scav-layout-migration.js';
const completeSteps=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
import {UnitSpatialIndex} from './unit-spatial-index.js';
import {vehicleContact,impactPower,fallbackVehicleImpact,resolveVehicleOverlapsSteps} from './vehicle-impact.js';
import {kickContactRock} from './vehicle-contact-rock.js';
import {PredictiveTraffic} from './predictive-traffic.js';
import {retreatSpeed,applyRetreatContact} from './retreat-contact.js';
import {departureSlotOrder,recordYieldStep,borrowedHomeClear,checkedPassageBackoff,checkedYieldPassage} from './traffic-start.js';
import {checkedRouteShortcut,checkedProgressTurn,checkedDetourAlternative,checkedRouteRejoin,checkedGoalArrival,recoveryConditions,unchangedRecoveryFailure,rememberRecoveryFailure} from './traffic-shortcut.js';
import {maneuverAdmissionBlocker} from './maneuver-admission.js';
import {resumeCycleRoute} from './traffic-cycle.js';
import {corridorBlocker,reserveManeuverCorridor} from './traffic-corridor.js';
import {vehicleDynamics,rollSteeringDamage,updateSteeringDamage} from './vehicle-dynamics.js';
import {SCAV_PROFILES,SCAV_ROSTERS,isInfantry} from './scav-unit-profiles.js';
import {infantryNavigator} from './infantry-navigation.js';
import {placeExtraCampGuards,updateScavReinforcements} from './scav-reinforcements.js';
import {alertScavs,updateScavCombat} from './scav-ai.js';
import {configureCombat,configureArmyCombat,armyCombatPolicy,normalizeCombatPolicy,rememberHostileHit,cancelCombatRetreat,automaticCombatTarget,forceCombatRetreat} from './combat-policy.js';
import {updateFactoryRepairs} from './factory-repair.js';
import {modernizationSelection} from './factory-modernization.js';
import {currentVehicleRecipes} from './vehicle-upgrades.js';
import {updateFactoryVisit,insideFactory,factoryProductionPaused,tryEnterFactory} from './factory-garage.js';
import {inFactoryInterior,shouldAutoRetreat,canAutoRetreat,canReceiveAttack} from './combat-retreat-state.js';
import {blockingCombatTarget,interruptedCombatTargets,movementCombatTarget} from './combat-orders.js';
import {cancelCombatDeployment,updateCombatDeployment,updateCombatParking,combatPositionConditions} from './combat-deployment.js';
import {pickupTarget,orderPickupSteps,updatePickupOrder} from './pickup-orders.js';
import {roadTrafficRank,compareRoadTrafficRanks} from './traffic-priority.js';
import {roadDrivingLane,deferRoadMerge} from './road-merge.js';
import {turningHeadway} from './turning-headway.js';
import {passageWaitClear} from './passage-reservations.js';
import {beginNavigationStep,navigationDecision,finishNavigationStep,auditNavigationWaits} from './navigation-state.js';
import {CommandPlanner,commandBoundary,activateCommand} from './command-planner.js';
import {appendOrder,clearQueuedOrders,orderCandidates,dispatchQueuedTravel,startQueuedWork} from './queued-orders.js';
import {ArrivalPlanner} from './arrival-planner.js';
import {followsContinuation,applyRouteContinuations,waitingForContinuation} from './route-continuation.js';
import {configureCommandGroup,refreshCommandGroups,expandCommandIds,commandGroupFor,formationRequest} from './group-command.js';
import {installM02Config} from './mission02-config.js';
import {installM01Layout,restoreM01Layout} from './mission01-layout.js';
import {installM02Terrain,selectMissionTerrain,missionRoads} from './mission02-terrain.js';
import {installM02Fortifications} from './mission02-fortifications.js';
import {m02SiteObstacles} from './mission02-site-plan.js';
import {enterM02,updateM02,updateM02Steps,m02Objectives} from './mission02.js';
import {restoreM02Continuity} from './mission02-continuity.js';
import {installPowerModule,advancePowerModule} from './power-module.js';
import {beginPersonnelMission,registerPersonnel,recordPersonnelDeath,restorePersonnel,finalizeMissionResults} from './personnel.js';
import {installM03Config} from './mission03-config.js';
import {m03TerrainSight} from './mission03-sight.js';
import {enterM03,initializeM03Expedition,updateM03,m03Objectives,m03DepartureAllowed,m03RequestAllowed} from './mission03.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const routeOrderRevision=2;
const workArrivalTolerance=2;
function selectedCommandIds(mission,ids,action,target){
 const tactical=['move','attack-move','attack'].includes(action);
 return tactical&&!(action==='move'&&target&&pickupTarget(mission,target))?expandCommandIds(mission,ids,{action}):ids;
}
function halfFootprint(footprint,scale,rotation){
 const [w,d]=footprint.map(length=>length*scale/2);
 return Math.abs(Math.round(rotation/(Math.PI/2)))%2?[d,w]:[w,d];
}

// Authoritative game state has no renderer objects, audio clocks or DOM references.
export class Mission{
 constructor(config,field){
  installM01Layout(config);
  installM02Config(config);
  installM03Config(config);
  if(field.mapId!=='m03')installM02Terrain(field);
  prepareTransportSite(field);
  selectMissionTerrain(field,false);
  this.config=config;this.field=field;this.nav=new TerrainNavigator(field,{bounds:config.initialMapBounds.slice(),vehicleScale:config.worldScale});this.accumulator=0;this.serial=1;this.randomState=19452;this.events=[];this.effects=[];
  this.state={version:1,mission:config.id,time:0,status:'running',energy:config.initialEnergy,energyRate:0,powered:false,oilLinked:0,units:[],buildings:[],camps:[],artifacts:[],research:{},artifactKeys:[],seenCinematics:[],pendingCinematics:['intro','briefing','arrival'],flags:{},statistics:{produced:0,buildingsCompleted:0,enemiesDestroyed:0},bounds:config.initialMapBounds.slice()};
  this.state.m01LayoutVersion=config.m01LayoutVersion;
  beginPersonnelMission(this);
  this.vehicleRecipes=vehicleRecipes(config);
  this.unitIndex=new UnitSpatialIndex();this.unitIndexActive=false;
  this.trafficCoordinator=new PredictiveTraffic();
  this.pendingTick=null;this.unitFrameTimes=new WeakMap();
  this.nav.beforeSynchronousSearch=()=>this.finishPendingStep();
  ensureSalvage(this);
  this.state.designs=starterProjects(this.vehicleRecipes);
  this.visible=new Uint8Array(128*128);this.explored=new Uint8Array(128*128);this.visionSources=[];this.fogTimer=1;this.fogRevision=0;
  if(field.mapId==='m03'){this.state.scavRosterVersion=1;this.state.projectiles=[];return;}
  const start=field.gridToWorld(config.startGrid);
  const row=config.initialRow??{offset:[-(config.initialUnits.length-1)*14,-60],spacing:28};
  config.initialUnits.forEach((kind,index)=>this.addUnit(kind,'rai',{x:start.x+row.offset[0]+index*row.spacing,y:start.y+row.offset[1]}));
  config.camps.forEach((data,index)=>{
   const point=field.gridToWorld(data.grid),gate=field.gridToWorld(data.gateGrid);
   const camp={...data,index,...point,gate,cleared:false,artifactSpawned:false};
   this.state.camps.push(camp);
   const rotation=(data.coreRotationDegrees??0)*Math.PI/180;
   this.addStructure('camp-core','scavs',point,{campId:data.id,hp:750*data.strength,halfWidth:28,halfDepth:22,rotation});
   for(const grid of data.towerGrids??[]){
    this.addStructure('mg-tower','scavs',field.gridToWorld(grid),{campId:data.id,hp:850*data.strength});
   }
   const roster=SCAV_ROSTERS[data.id];
   for(let i=0;i<data.units;i++){const pose=campGuardPose(camp,i);this.addUnit(roster?.[i%roster.length]??'raider','scavs',pose,{campId:data.id,heading:pose.heading,guard:pose.guard});}
  });
  this.state.scavRosterVersion=1;this.state.projectiles=[];installScavBases(this);installCampResources(this);
  this.rebuildNavigation();this.updateFog();this.reserveRaid();placeExtraCampGuards(this);
 }
 id(prefix){return prefix+this.serial++;}
 transportSite(){return transportSite(this.field,this.config);}
 requestTransport(){const allowed=m03RequestAllowed(this);return allowed.ok?requestTransport(this):allowed;}
 loadTransport(ids){return loadTransport(this,ids);}
 cancelTransportLoading(ids){return cancelTransportLoading(this,ids);}
 departTransport(){const allowed=m03DepartureAllowed(this);return allowed.ok?departTransport(this):allowed;}
 unloadTransport(ids){return unloadTransport(this,ids);}
 enterM02(){return enterM02(this);}
 enterM03(){return enterM03(this);}
 installPowerModule(buildingId,workerIds){return installPowerModule(this,buildingId,workerIds);}
 reserveRaid(unseen=false){
  const camp=this.state.camps[0],positions=[],target=this.field.gridToWorld(this.config.startGrid);
  const staging=this.config.raidStagingGrid&&this.field.gridToWorld(this.config.raidStagingGrid);
  this.state.raidReserve=[];
  for(const anchor of staging?[staging,camp.gate]:[camp.gate]){
   if(positions.length===4)break;
   const candidates=[];
   for(let row=-6;row<=6;row++)for(let col=-6;col<=6;col++){
    const x=anchor.x+col*20,y=anchor.y+row*20;
    if(Math.hypot(x-camp.x,y-camp.y)<54)continue;
    const point=this.nav.nearest(x,y,1);
    if(point&&(!(unseen||staging)||!this.visibleAt(point.x,point.y)))candidates.push(point);
   }
   candidates.sort((a,b)=>distance(a,anchor)-distance(b,anchor));
   for(const point of candidates){
    if(positions.length===4)break;
    if(this.state.units.some(unit=>unit.hp>0&&distance(unit,point)<25))continue;
    const path=this.nav.findPath(point,target);
    if(!path?.length)continue;
    positions.push(point);
    const roster=this.config.raidRoster;
    const heading=staging?Math.atan2(point.x-path[0].x,path[0].y-point.y):0;
    const unit=this.addUnit(roster?.[(positions.length-1)%roster.length]??'raider','scavs',point,{heading,raidReserve:true,guard:{x:point.x,y:point.y}});
    this.state.raidReserve.push(unit.id);
   }
  }
 }
 launchRaid(){
  const state=this.state,target=this.field.gridToWorld(this.config.startGrid);
  if(!state.raidReserve)this.reserveRaid(true);
  state.flags.raidStarted=true;
  state.flags.raidIds=state.raidReserve.slice();
  for(const [index,id] of state.flags.raidIds.entries()){
   const unit=this.entity(id);
   if(!unit)continue;
   unit.raidReserve=false;
   unit.raid=true;
   const goal={x:target.x+(index-1.5)*23,y:target.y+22};
   unit.path=this.vehiclePath(unit,goal)??this.nav.findPath(unit,target)??[];
   unit.task={type:'move',x:goal.x,y:goal.y};
  }
  this.emit('raid-start');
 }
 updateRaid(activate){
  const {flags,time}=this.state;
  if(flags.raidWon)return;
  if(!flags.raidStarted){
   // Older saves may already have played the warning and scheduled the sortie.
   if(Number.isFinite(flags.raidAt)?time<flags.raidAt:!activate)return;
   this.launchRaid();
  }
  const raiders=flags.raidIds.map(id=>this.entity(id)).filter(Boolean);
  if(!raiders.length){flags.raidWon=true;this.cinematic('raid-won');return;}
  if(flags.contact)return;
  const approach=this.field.gridToWorld(this.config.raidApproachGrid??this.config.startGrid);
  const warningRange=10*(this.field.cellMetres??32);
  if(raiders.some(unit=>this.visibleAt(unit.x,unit.y)||distance(unit,approach)<=warningRange)){
   flags.contact=true;
   this.cinematic('first-contact');
  }
 }
 random(){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return this.randomState/4294967296;}
 emit(type,data={}){const event={id:this.id('e'),type,time:this.state.time,...data};this.events.push(event);this.radioObserver?.note(event);}
 drainEvents(){return this.events.splice(0);}
 drainEffects(){return this.effects.splice(0);}
 cinematic(id){if(!this.state.seenCinematics.includes(id)&&!this.state.pendingCinematics.includes(id)){this.state.pendingCinematics.push(id);this.emit('cinematic',{chapter:id});}}
 finishCinematic(id){const index=this.state.pendingCinematics.indexOf(id);if(index>=0)this.state.pendingCinematics.splice(index,1);if(!this.state.seenCinematics.includes(id))this.state.seenCinematics.push(id);}
 unitSpec(unit){return fieldUnitSpec(unit,this.config.units[unit.kind]);}
 buildingSpec(building){return this.config.buildings[building.kind]??{name:'Лагерь отбросов',seconds:1,hp:750,vision:180,power:0};}
 entity(id){return livingEntity(this.state.units,id)??livingEntity(this.state.buildings,id);}
 addUnit(kind,owner,point,extra={}){const spec=this.config.units[kind],unit={id:this.id('u'),kind,owner,x:point.x,y:point.y,previousX:point.x,previousY:point.y,hp:spec.hp,maxHp:spec.hp,heading:0,path:[],task:null,cooldown:0,tool:0,foldTime:0,...extra};
  if(owner==='rai'&&canAutoRetreat(spec))unit.combatPolicy={...armyCombatPolicy(this)};
  this.state.units.push(unit);registerPersonnel(this,unit);if(this.unitIndexActive)this.unitIndex.insert(unit,this.state.units.length-1);return unit;}
 addStructure(kind,owner,point,extra={}){const spec=this.config.buildings[kind]??{},scale=this.config.worldScale,foot=spec.footprintMetres??[14,12],item={id:this.id('b'),kind,owner,x:point.x,y:point.y,rotation:0,hp:spec.hp??750,maxHp:spec.hp??750,halfWidth:foot[0]*scale/2,halfDepth:foot[1]*scale/2,progress:owner==='rai'?0:1,completed:owner!=='rai',queue:[],research:null,cooldown:0,...extra};item.maxHp=item.hp;restoreConstructionHealth(item);this.state.buildings.push(item);return item;}
 rebuildNavigation(){
  this.finishPendingStep();
  if(this.field.mapId==='m03'){this.nav.bounds=this.state.bounds.slice();this.nav.rebuild([...this.state.buildings,...(this.field.m03Ruins??[]),...transportObstacles(this)]);return;}
  const changed=syncScavBaseRoads(this.field,this.config),southern=this.state.m02?.version>=2;
  const terrainChanged=selectMissionTerrain(this.field,southern);
  if(changed)this.field.localRoads=missionRoads(this.field,southern);
  if(changed||terrainChanged){
   const {topologyRevision:revision,routeAdvisor}=this.nav;
   this.nav=new TerrainNavigator(this.field,{bounds:this.state.bounds.slice(),vehicleScale:this.config.worldScale});
   this.nav.routeAdvisor=routeAdvisor;
   this.nav.topologyRevision=revision+1;this.nav.beforeSynchronousSearch=()=>this.finishPendingStep();
   // Saved command intents are resumed with the new terrain, not discarded.
   this.commandPlanner=null;this.scavJob=null;
  }
  this.nav.bounds=this.state.bounds.slice();this.nav.rebuild([...this.state.buildings.filter(building=>!building.clearing),...m02SiteObstacles(this),...transportObstacles(this)]);
 }
 fail(reason){return {ok:false,reason};}
 canSpend(cost){return availableOil(this.state)+1e-6>=cost;}
 inBounds(x,y){const [gx,gy]=this.field.worldToGrid(x,y),b=this.state.bounds;return gx>=b[0]&&gx<=b[2]&&gy>=b[1]&&gy<=b[3];}
 exploredAt(x,y){const [gx,gy]=this.field.worldToGrid(x,y),col=Math.round(gx),row=Math.round(gy);return col>=0&&row>=0&&col<128&&row<128&&!!this.explored[row*128+col];}
 visibleAt(x,y){const [gx,gy]=this.field.worldToGrid(x,y),col=Math.round(gx),row=Math.round(gy);return col>=0&&row>=0&&col<128&&row<128&&!!this.visible[row*128+col];}
 constructionUnlocked(kind){return this.state.m03?.location!=='expedition'&&!this.config.buildings[kind]?.enemyOnly&&constructionUnlocked(this.state,kind);}
 researchUnlocked(){return researchUnlocked(this.state);}
 defenseReady(){return defenseReady(this.state);}
 placement(kind,x,y,rotation=0,options={}){return checkBuildingPlacement(this,kind,x,y,rotation,options);}
 siteBounds(site){
  const margin=this.nav.clearance,work=this.workPoint(site),apron=this.config.builderRangeMetres+8;
  return {left:Math.min(site.x-site.halfWidth-margin,work.x-apron),right:Math.max(site.x+site.halfWidth+margin,work.x+apron),bottom:Math.min(site.y-site.halfDepth-margin,work.y-apron),top:Math.max(site.y+site.halfDepth+margin,work.y+apron)};
 }
 siteUnits(site){
  const {left,right,bottom,top}=this.siteBounds(site);
  const contains=point=>point.x>left&&point.x<right&&point.y>bottom&&point.y<top;
  return this.state.units.filter(unit=>vehicleObstacle(unit)&&(contains(unit)||contains(this.nav.position(...this.nav.grid(unit.x,unit.y)))));
 }
 vehiclePath(...args){this.finishPendingStep();return completeSteps(this.vehiclePathSteps(...args));}
 terrainEscapeFor(unit){
  // Old saves may retain a slope exception. Level walls have no such bypass.
  delete unit.terrainEscape;return null;
 }
 *vehiclePathSteps(unit,goal,options={}){
  if(!isInfantry(unit))return yield* this.vehiclePathUsingSteps(unit,goal,options);
  const nav=infantryNavigator(this.nav),search=this.vehiclePathUsingSteps(unit,goal,options);
  let result;
  do{
   const previous=this.nav;nav.workDeadline=previous.workDeadline;
   this.nav=nav;try{result=search.next();}finally{this.nav=previous;}
   if(!result.done)yield;
  }while(!result.done);
  return result.value;
 }
 *vehiclePathUsingSteps(unit,goal,{avoidMoving=false,avoidPoint=null,fallback=true,ignoreUnits=null,obstacles=this.state.units,escapeSteepStart=unit.owner==='rai',...options}={}){
  const terrainEscape=escapeSteepStart?this.terrainEscapeFor(unit):null;
  const occupied=this.nav.occupied,changed=[],pendingCells=new Set(),scale=this.config.worldScale;
  // Preparing dense vehicle masks can outlast a frame. Keep these cells
  // private across yields; only search.next() temporarily publishes them.
  const padding=vehicleRadiusBound(unit.kind,scale)+.1*scale;
  // Commands share a terrain/building corridor. Temporary bodies are handled
  // by endpoint reservation and swept local avoidance, not baked into A*.
  const staticCommand=this.commandJob&&!avoidMoving&&!avoidPoint;
  for(const other of staticCommand?[]:obstacles){
   if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
   if(other===unit||unit.id&&other.id===unit.id||ignoreUnits?.has(other)||!vehicleObstacle(other)||!trafficCollisionRequired(unit,other)||other.hp>0&&other.owner!==unit.owner&&!this.visibleAt(other.x,other.y))continue;
   if(other.hp>0&&other.path.length&&(!avoidMoving||distance(unit,other)>56))continue;
   const shape=vehicleEnvelope(other,scale,this.field),radius=vehicleRadiusBound(other.kind,scale)+padding;
   const gap=p=>footprintGap({x:p.x,y:p.y,radius:0},shape)-padding;
   const bound=(shape.ellipse?Math.max(shape.width,shape.depth):Math.hypot(shape.width,shape.depth))+padding+1e-6;
   const outside=p=>(p.x-shape.x)**2+(p.y-shape.y)**2>=bound*bound;
   const startGap=outside(unit)?0:gap(unit);
   const [col,row]=this.nav.grid(other.x,other.y),r=Math.ceil(radius/this.nav.cell),size=this.nav.size;
   for(let y=Math.max(0,row-r);y<=Math.min(size-1,row+r);y++)for(let x=Math.max(0,col-r);x<=Math.min(size-1,col+r);x++){
    if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
    const i=y*size+x,p=this.nav.position(x,y);
    if(occupied[i]||pendingCells.has(i)||distance(unit,p)<=this.nav.cell*.78||outside(p))continue;
    // Plan for the whole vehicle, not a point which drives into a neighbour's
    // side before it can turn. A close start can leave the inflated envelope.
    const clearance=gap(p),escape=startGap<0&&clearance>=startGap-.01&&distance(unit,p)<this.nav.cell*2.5;
    if(clearance<0&&!escape){pendingCells.add(i);changed.push(i);}
   }
  }
  if(avoidPoint){
   const [col,row]=this.nav.grid(avoidPoint.x,avoidPoint.y),size=this.nav.size;
   for(let y=Math.max(0,row-1);y<=Math.min(size-1,row+1);y++)for(let x=Math.max(0,col-1);x<=Math.min(size-1,col+1);x++){
    const i=y*size+x,p=this.nav.position(x,y);
    if(!occupied[i]&&!pendingCells.has(i)&&distance(p,unit)>this.nav.cell&&distance(p,goal)>this.nav.cell*2){pendingCells.add(i);changed.push(i);}
   }
  }
  const search=this.nav.findPathSteps(unit,goal,{...options,escapeSteepStart,terrainEscape,occupancyKey:changed.slice().sort((a,b)=>a-b).join(',')});
  let result;
  do{
   for(const i of changed)occupied[i]=1;
   try{result=search.next();}finally{for(const i of changed)occupied[i]=0;}
   // Temporary vehicle cells must never leak into UI placement or another
   // frame while the search is suspended. The simulation order stays fixed.
   if(!result.done)yield;
  }while(!result.done);
  const path=result.value;
  return path??(fallback&&changed.length?(yield* this.nav.findPathSteps(unit,goal,{...options,escapeSteepStart,terrainEscape})):null);
 }
 movePath(...args){this.finishPendingStep();return completeSteps(this.movePathSteps(...args));}
 *movePathSteps(unit,goal,reserved=[],parkingRadius=0,roadOnly=false,parkingAllowed=()=>true,pathOptions={}){
  const {compareDetours=false,...searchOptions}=pathOptions;
  const spacing=this.config.worldScale*4.55;
  const liveOccupied=point=>reserved.some(other=>distance(point,other)<spacing)
   ||this.state.units.some(other=>other!==unit&&other.id!==unit.id&&vehicleObstacle(other)&&(!other.path.length||other.damage?.wreck)
    &&(other.damage?.wreck||other.owner===unit.owner||this.visibleAt(other.x,other.y))&&distance(point,other)<spacing);
  const buckets=new Map(),add=point=>{const key=Math.floor(point.x/spacing)+','+Math.floor(point.y/spacing);const bucket=buckets.get(key)??[];bucket.push({x:point.x,y:point.y});buckets.set(key,bucket);};
  reserved.forEach(add);
  for(const other of this.state.units)if(other!==unit&&other.id!==unit.id&&vehicleObstacle(other)&&(!other.path.length||other.damage?.wreck)
   &&(other.damage?.wreck||other.owner===unit.owner||this.visibleAt(other.x,other.y)))add(other);
  const occupied=point=>{
   const x=Math.floor(point.x/spacing),y=Math.floor(point.y/spacing);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(buckets.get((x+dx)+','+(y+dy))?.some(other=>distance(point,other)<spacing))return true;
   return false;
  };
  const acceptEnd=point=>parkingAllowed(point)&&!occupied(point)&&(!roadOnly||this.nav.roads.coverage(point.x,point.y)>=.58);
  const acceptEndKey=this.nav.endFilterSerial=(this.nav.endFilterSerial??0)+1;
  const candidates=[goal];
  const searchRadius=Math.max(parkingRadius,occupied(goal)?spacing*2.35:0);
  for(let radius=spacing;radius<=searchRadius;radius+=spacing*.7){
   const sectors=Math.ceil(radius*Math.PI*2/(spacing*.85));
   for(let side=0;side<sectors;side++){
    const angle=side*Math.PI*2/sectors;
    candidates.push({x:goal.x+Math.cos(angle)*radius,y:goal.y+Math.sin(angle)*radius});
   }
  }
  let fallbackPath=null,fallbackCost=Infinity,searched=0,reachableEnd=false;
  const detourLimit=compareDetours&&parkingRadius>0?distance(unit,goal)*1.6+this.config.worldScale*12:Infinity;
  for(const candidate of candidates){
   if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
   if(!parkingAllowed(candidate)||occupied(candidate)||roadOnly&&this.nav.roads.coverage(candidate.x,candidate.y)<.58)continue;
   searched++;
   const path=(yield* this.vehiclePathSteps(unit,candidate,{maxGoalDistance:16,...searchOptions,acceptEnd,acceptEndKey}));
   const end=path?.at(-1);
   if(end)reachableEnd=true;
   if(end&&parkingAllowed(end)&&!liveOccupied(end)&&(!roadOnly||this.nav.roads.coverage(end.x,end.y)>=.58)){
    let length=0,previous=unit;for(const point of path){length+=distance(previous,point);previous=point;}
    if(length<=detourLimit)return path;
    // Adjacent cells can lie on different sides of a ridge. Check the other
    // allowed parking places before sending one member on a huge detour.
    const cost=length+distance(end,goal)*2;
    if(cost<fallbackCost){fallbackCost=cost;fallbackPath=path;}
   }
  }
  if(!fallbackPath&&this.commandJob){
   const obstruction=this.nav.solids.find(solid=>Math.abs(goal.x-solid.x)<solid.halfWidth&&Math.abs(goal.y-solid.y)<solid.halfDepth);
   const reason=obstruction?'destination-occupied':!this.nav.terrainAllowed(goal.x,goal.y)?'destination-terrain-forbidden'
    :reachableEnd?'parking-claimed-during-search':'no-free-parking-in-area';
   this.commandJob.failures[unit.id??this.commandJob.currentUnit]={reason,blockerId:obstruction?.id??null};
  }
  return fallbackPath;
 }
 siteExit(unit,site,occupied=[]){
  const {left,right,bottom,top}=this.siteBounds(site);
  const candidates=[];
  for(const n of [0,-16,16,-32,32]){
   for(const x of [left-10,right+10])candidates.push({x,y:clamp(unit.y+n,bottom-10,top+10)});
   for(const y of [bottom-10,top+10])candidates.push({x:clamp(unit.x+n,left-10,right+10),y});
  }
  const exitCost=point=>{
   const angle=Math.abs(angleDelta(Math.atan2(unit.x-point.x,point.y-unit.y),unit.heading));
   return distance(point,unit)+24*Math.min(angle,Math.PI-angle);
  };
  candidates.sort((a,b)=>exitCost(a)-exitCost(b));
  for(const point of candidates){
   const goal=this.nav.nearest(point.x,point.y,2);
   if(!goal||occupied.some(other=>distance(other,goal)<18))continue;
   if(unit.siteExit?.failed?.some(other=>distance(other,goal)<12))continue;
   if(goal.x>left-6&&goal.x<right+6&&goal.y>bottom-6&&goal.y<top+6)continue;
   if(this.state.units.some(other=>other!==unit&&other.hp>0&&distance(other,goal)<21))continue;
   const path=this.vehiclePath(unit,goal,{maxGoalDistance:.01});
   if(!path)continue;
   const obstacle=this.state.units.some(other=>{
    if(other===unit||other.hp<=0||other.task?.type==='clear-site')return false;
    const outside=other.x<=left||other.x>=right||other.y<=bottom||other.y>=top;
    if(!outside)return false;
    return path.some((end,index)=>{
     const start=path[index-1]??unit, dx=end.x-start.x,dy=end.y-start.y;
     const t=clamp(((other.x-start.x)*dx+(other.y-start.y)*dy)/Math.max(.01,dx*dx+dy*dy),0,1);
     return Math.hypot(other.x-start.x-dx*t,other.y-start.y-dy*t)<11;
    });
   });
   if(!obstacle)return{unit,goal,path};
  }
  return null;
 }
 evacuate(building,exit){
  const {unit,goal,path}=exit;
  const previous=unit.siteExit?.buildingId===building.id?unit.siteExit:null;
  unit.siteExit={buildingId:building.id,resume:previous?.resume??unit.task,failed:previous?.failed??[],origin:{x:unit.x,y:unit.y},elapsed:0};
  unit.task={type:'clear-site',targetId:building.id,x:goal.x,y:goal.y};
  unit.path=path;
 }
 releaseSite(building,assigned=[]){
  for(const unit of this.state.units){
   if(unit.siteExit?.buildingId!==building.id)continue;
   const resume=unit.siteExit.resume;
   delete unit.siteExit;
   if(assigned.includes(unit.id)||unit.task?.type!=='clear-site')continue;
   unit.task=null;unit.path=[];
   if(!resume||unit.hp<=0)continue;
   const target=resume.targetId?this.entity(resume.targetId):resume;
   const {left,right,bottom,top}=this.siteBounds(building);
   const inside=target&&target.x>left&&target.x<right&&target.y>bottom&&target.y<top;
   if(target&&!inside&&resume.type!=='clear-site')this.order([unit.id],resume.type,target,{preserveQueue:true});
  }
 }
 availableBuilders(building){
  const position=this.state.buildings.indexOf(building);
  const earlier=this.state.buildings.slice(0,position).filter(b=>b.hp>0&&(b.clearing||b.awaitingWorkers));
  return building.builderIds.filter(id=>{
   const unit=this.entity(id);
   if(!unit||earlier.some(b=>b.builderIds.includes(id)))return false;
   return !unit.orderQueue?.length&&(!unit.task||unit.task.type==='move'||unit.task.type==='clear-site'&&unit.task.targetId===building.id);
  });
 }
 assignConstruction(building){
  const builders=this.availableBuilders(building);
  if(!builders.length){building.awaitingWorkers=true;return {ok:true,waiting:true};}
  const result=this.order(builders,'build',building,{preserveQueue:true});
  if(result.ok){
   building.awaitingWorkers=false;
   delete building.builderIds;
   this.emit('construction-start',{building:building.id});
  }
  return result;
 }
 updateConstructionSites(){
  for(const building of this.state.buildings){
   if(building.hp<=0)continue;
   if(!building.clearing){
    if(building.awaitingWorkers&&this.state.time-(building.lastAssignment??-2)>1){
     building.lastAssignment=this.state.time;
     const result=this.assignConstruction(building);
     if(!result.ok&&this.availableBuilders(building).length===building.builderIds.length){this.cancelBuilding(building.id);this.emit('construction-refused',{reason:result.reason});}
    }
    continue;
   }
   const blockers=this.siteUnits(building);
   if(blockers.length){
    const taken=[];
    for(const unit of blockers){
     if(unit.owner!=='rai')continue;
     if(unit.task?.type==='clear-site'&&unit.task.targetId===building.id&&unit.path.length){
      const exit=unit.siteExit;
      if(exit){
       exit.elapsed+=this.config.simulationStep;
       if(exit.elapsed>=3){
        if(distance(unit,exit.origin)<4){
         exit.failed.push({x:unit.task.x,y:unit.task.y});
         unit.path=[];
        }
        exit.origin={x:unit.x,y:unit.y};exit.elapsed=0;
       }
      }
      if(unit.path.length){taken.push(unit.task);continue;}
     }
     const exit=this.siteExit(unit,building,taken);
     if(exit){this.evacuate(building,exit);taken.push(exit.goal);}
     else if(unit.siteExit?.failed?.length)unit.siteExit.failed.shift();
    }
    continue;
   }
   building.clearing=false;
   this.rebuildNavigation();
   const result=this.assignConstruction(building);
   this.releaseSite(building);
   if(!result.ok){this.cancelBuilding(building.id);this.emit('construction-refused',{reason:result.reason});}
  }
 }
 workPoint(building,offset=0){if(this.config.units[building.kind])return{x:building.x+Math.sin(building.heading)*20+Math.cos(building.heading)*offset,y:building.y-Math.cos(building.heading)*20+Math.sin(building.heading)*offset};const spec=this.buildingSpec(building),local=spec.workAnchor??[0,-building.halfDepth/this.config.worldScale-4,0],c=Math.cos(building.rotation),s=Math.sin(building.rotation),scale=this.config.worldScale;return{x:building.x+(local[0]*c-local[1]*s)*scale+c*offset,y:building.y+(local[0]*s+local[1]*c)*scale+s*offset};}
 workPath(...args){this.finishPendingStep();return completeSteps(this.workPathSteps(...args));}
 *workPathSteps(unit,target,offset=unit.task?.workOffset??0){
  const repair=!!this.config.units[target.kind],scale=this.config.worldScale;
  if(this.canWorkHere(unit,target))return [];
  const goal=this.workPoint(target,offset),[col,row]=this.nav.grid(goal.x,goal.y),candidates=[],seen=new Set();
  const reservations=this.state.units.filter(other=>other!==unit&&other.hp>0&&other.task?.targetId===target.id&&other.path.length&&['build','repair','demolish','upgrade-power'].includes(other.task.type)).map(other=>({...other,...other.path.at(-1)}));
  const sample=(x,y)=>{
   const key=y*this.nav.size+x;
   if(seen.has(key)||!this.nav.allowed(x,y))return;
   seen.add(key);
   const p=this.nav.position(x,y);
   if(distance(unit,p)<workArrivalTolerance)return;
   const parked={...p,heading:Math.atan2(unit.x-p.x,p.y-unit.y)};
   if(!clearOfVehicles(unit,parked,this.state.units,scale,true)||!clearOfVehicles(unit,parked,reservations,scale,true))return;
   const at={...unit,...parked};
   const aim=this.projectorAim(at,target);
   if(!aim||!projectorHasSight(aim,at,target,reservations,this.field,scale))return;
   // Leave room for the final chassis heading. A tall building's rising layer
   // can request a nearer pose later; do not insist on its roof from the start.
   if(!workProjection(at,target,this.config,this.field,{reachMargin:1}))return;
   candidates.push(p);
  };
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)sample(col+dx,row+dy);
  if(repair){
   // The repair beam can reach around the nominal rear parking point.
   // Sample several rings, beginning on the approaching side.
   const approach=Math.atan2(unit.y-target.y,unit.x-target.x);
   for(const radius of [6,9,12,15,18].map(value=>value*scale)){
    for(let sector=0;sector<16;sector++){
     const angle=approach+sector*Math.PI/8;
     sample(...this.nav.grid(target.x+Math.cos(angle)*radius,target.y+Math.sin(angle)*radius));
    }
   }
  }else{
   const w=target.halfWidth+this.nav.clearance,d=target.halfDepth+this.nav.clearance;
   for(const gap of [6,14,24])for(const along of [0,-12,12,-24,24])for(const side of [-1,1]){
    sample(...this.nav.grid(target.x+side*(w+gap),target.y+along));
    sample(...this.nav.grid(target.x+along,target.y+side*(d+gap)));
   }
  }
  const cost=p=>distance(p,unit);
  candidates.sort((a,b)=>cost(a)-cost(b));
  for(const p of candidates.slice(0,24)){
   const path=(yield* this.vehiclePathSteps(unit,p,{maxGoalDistance:.01}));
   if(path)return path;
  }
  return null;
 }
 attackPath(...args){this.finishPendingStep();return completeSteps(this.attackPathSteps(...args));}
 *attackPathSteps(unit,target,reserved=[]){
  const spec=this.unitSpec(unit);
  if(distance(unit,target)<=spec.range&&this.lineOfSight(unit,target))return[];
  const last=unit.task?.targetId===target.id&&unit.path.at(-1);
  if(unit.detour&&last&&distance(last,target)<=spec.range&&this.lineOfSight({...unit,...last},target))return unit.path;
  const angle=Math.atan2(unit.y-target.y,unit.x-target.x);
  for(const radius of [spec.range*.82,spec.range*.94,spec.range*.68]){
   for(const offset of [0,.28,-.28,.55,-.55,.9,-.9,1.4,-1.4,Math.PI]){
    const goal={x:target.x+Math.cos(angle+offset)*radius,y:target.y+Math.sin(angle+offset)*radius};
    if(!this.inBounds(goal.x,goal.y))continue;
    const path=(yield* this.vehiclePathSteps(unit,goal,{maxGoalDistance:16})),end=path?.at(-1);
    if(!end||distance(end,target)>spec.range||!this.lineOfSight({...unit,...end},target))continue;
    if(reserved.some(point=>distance(end,point)<this.config.worldScale*4.55))continue;
    if(this.state.units.some(other=>other!==unit&&other.hp>0&&other.owner===unit.owner&&!other.path.length&&distance(end,other)<this.config.worldScale*4.55))continue;
    return path;
   }
  }
  return null;
 }
 salvagePath(...args){this.finishPendingStep();return completeSteps(this.salvagePathSteps(...args));}
 *salvagePathSteps(unit,item){
  const state=ensureSalvage(this),scale=this.config.worldScale;
  if(!state.enabled||!availableFieldRecipes(this).some(r=>state.wanted.includes(r.id)&&r.stock===item.stock&&canInstallRecipe(this,unit,r)&&!modificationInstalled(unit,r.part)))return null;
  const candidates=[],pickupDistance=salvagePickupReach(scale).front-scale*.3;
  for(let i=0;i<12;i++){
   const angle=i*Math.PI/6,dx=Math.cos(angle),dy=Math.sin(angle),heading=Math.atan2(dx,-dy);
   const end={x:item.x+dx*pickupDistance,y:item.y+dy*pickupDistance,heading,kind:unit.kind};
   const approach={...end,x:end.x+dx*scale*4,y:end.y+dy*scale*4};
   if(!clearOfVehicles(unit,end,this.state.units,scale,true,end,this.field)||!this.vehicleMotionClear(unit,approach,end))continue;
   candidates.push({end,approach,cost:distance(unit,approach)});
  }
  candidates.sort((a,b)=>a.cost-b.cost);
  for(const {end,approach} of candidates){
   const path=yield* this.vehiclePathSteps(unit,approach,{maxGoalDistance:.01,fallback:false});
   if(path)return [...path,{x:end.x,y:end.y}];
  }
  return null;
 }
 configureGroup(ids,options){this.finishPendingStep();return configureCommandGroup(this,ids,options);}
 retreat(ids){ids=expandCommandIds(this,ids);const result=forceCombatRetreat(this,ids);if(result.ok){clearQueuedOrders(this,ids);this.trafficCoordinator.intentChanged();}return result;}
 modernize(ids){
  this.finishPendingStep();const {units,reason}=modernizationSelection(this,ids);
  if(reason)return this.fail(reason);
  const assignedIds=units.map(u=>u.id),outside=units.filter(u=>!inFactoryInterior(u)).map(u=>u.id);
  // Only the selected eligible cars leave the formation. A transfer already
  // inside the doorway retains its physical visit and queue position.
  if(outside.length)forceCombatRetreat(this,outside);
  this.commandPlanner?.cancel(assignedIds);clearQueuedOrders(this,assignedIds);
  for(const u of units){
   u.modernizationRequested=true;
   u.combatRetreat??={status:'planning',started:this.state.time};
   u.combatRetreat.forced=true;
  }
  this.trafficCoordinator.intentChanged();
  return {ok:true,assigned:units.length,assignedIds};
 }
 submitOrder(ids,action,target,{append=false,expandGroup=true,preserveQueue=false}={}){
  if(action==='retreat')return this.retreat(ids);
  if(expandGroup)ids=selectedCommandIds(this,ids,action,target);
  if(append)return appendOrder(this,ids,action,target);
  const result=(this.commandPlanner??=new CommandPlanner(this)).submit(ids,action,target);
  if(result.ok&&!preserveQueue)clearQueuedOrders(this,result.assignedIds??[]);
  return result;
 }
 order(ids,action,target,{preserveQueue=false}={}){ids=selectedCommandIds(this,ids,action,target);this.finishPendingStep();const result=completeSteps(this.orderSteps(ids,action,target));if(result.ok){const accepted=result.assignedIds??ids.filter(id=>!result.unassigned?.includes(id));this.commandPlanner?.cancel(accepted);if(!preserveQueue)clearQueuedOrders(this,accepted);if(result.pickup)this.radioObserver?.order(action,result.assignedIds);}return result;}
 *orderSteps(ids,action,target){
  const check=orderCandidates(this,ids,action,target);if(!check.ok)return check;
  const {units,pickup}=check,assigned=new Set();
  const travel=action==='move'||action==='attack-move',combat=action==='attack'||action==='attack-move';
  if(pickup)return yield* orderPickupSteps(this,units,pickup);
  const commandGroup=commandGroupFor(this,units),formationMode=commandGroup?.formation??'auto';
  const disengage=action==='attack-move'?(yield* interruptedCombatTargets(this,units)):[];
  const repeat=new Map();
  for(const unit of units){
   if(unit.pendingOrder?.started)continue;
   const order=unit.routeOrder;
   const deployment=unit.combatDeployment;
   if(deployment&&(action==='attack'&&deployment.resume.targetId===target.id
     ||action==='attack-move'&&!disengage.length&&order?.type===action&&order.revision===routeOrderRevision&&distance(order.request,target)<3)){
    repeat.set(unit.id,deployment.goal??unit);continue;
   }
   if(travel&&order?.revision===routeOrderRevision&&(order.formation??'auto')===formationMode&&(order.type??'move')===action&&distance(order.request,target)<3){
    if(unit.task?.type===action&&unit.path.length)repeat.set(unit.id,unit.path.at(-1));
    else if(!unit.task&&distance(unit,order.destination)<5)repeat.set(unit.id,unit);
   }
   const last=unit.task?.type==='attack'&&unit.task.targetId===target.id&&unit.path.at(-1);
   if(action==='attack'&&last&&distance(last,target)<=this.unitSpec(unit).range&&this.lineOfSight({...unit,...last},target))repeat.set(unit.id,last);
  }
  const finishRepeat=function*(mission,unit){
   const job=mission.commandJob;
   if(job){
    while(!job.copiedIds?.has(unit.id)&&!commandBoundary(job.mission)){job.waitingTick=true;yield;}
    job.waitingTick=false;
    if(unit.hp<=0||unit.pendingOrder?.revision!==job.revision)return;
    // A -> B -> A may reuse A's still-valid route while B was cancelled in
    // the queue. Reusing geometry must also complete the NEW intent, or the
    // pending guard freezes a route which this very command accepted.
    delete unit.pendingOrder;if(!job.copiedIds?.has(unit.id))activateCommand(job.mission,unit);job.assigned.push(unit.id);
   }
   if(disengage.length)unit.combatDisengage=[...disengage];
   if(combat)unit.retreatSuppressed=false;
   assigned.add(unit.id);if(job)yield;
  };
  if(repeat.size===units.length){
   for(const unit of units)yield* finishRepeat(this,unit);
   return {ok:true,assigned:units.length,assignedIds:units.map(u=>u.id),unassigned:[]};
  }
  const reserved=[...repeat.values(),...units.filter(u=>this.commandJob?.tailSources&&!repeat.has(u.id)&&u.routeContinuation?.ready)
   .map(u=>u.routeContinuation.destination).filter(Boolean)],changedTraffic=new Set();
  const combatGroup=combat?'combat-'+(this.state.combatOrderSerial=(this.state.combatOrderSerial??0)+1):null;
  const groupCentre=units.reduce((centre,unit)=>({x:centre.x+unit.x/units.length,y:centre.y+unit.y/units.length}),{x:0,y:0});
  const requestedFormation=travel?formationRequest(this,units,target):null;
  const passage=travel?this.nav.passageBetween(units.length===1?units[0]:groupCentre,target,this.config.worldScale):null;
  // A real narrow passage controls its entrance/exit, not where the whole
  // group must park afterwards. Destination slots may use any legal ground.
  // A road can pass through a throat narrower than the conservative grid
  // clearance. Road parking does not replace the checked physical passage.
  const egress=passage?preparePassageEgress(this,passage,units,target):null;
  if(egress?.blocked)return this.fail('Не удалось проложить безопасный выезд из прохода');
  const departure=egress?.end??passage?.exit;
  const convoy=egress?new Set(units):null;
  let preceding=null;
  const direction=Math.atan2(groupCentre.x-target.x,target.y-groupCentre.y);
  const forward={x:-Math.sin(direction),y:Math.cos(direction)},right={x:forward.y,y:-forward.x};
  const departureOrder=travel&&!requestedFormation&&!passage?departureSlotOrder(units,target,this.config.worldScale):null;
  const columns=requestedFormation?.columns??departureOrder?.columns??(units.length>16?Math.ceil(Math.sqrt(units.length)):Math.min(3,units.length));
  const formationSpacing=requestedFormation?.spacing??(this.commandJob&&units.length>12
   ?Math.max(24,...units.map(unit=>{const box=vehicleEnvelope(unit,this.config.worldScale,this.field);return 2*Math.hypot(box.width,box.depth)+this.config.worldScale*.4;})):24);
  const formationOptions={...(travel&&units.length>=32?{ignoreUnits:new Set(units)}:{}),compareDetours:action==='attack-move'};
  const parkingClearance=egress?.parkingClearance??this.config.worldScale*3.6;
  const beyondPassage=point=>!passage||(point[passage.along]-departure[passage.along])*passage.direction>=parkingClearance;
  const tail=passage?Math.floor((units.length-1)/columns)*formationSpacing*Math.abs(forward[passage.along])+(columns-1)*formationSpacing/2*Math.abs(right[passage.along]):0;
  const passageShift=passage?Math.max(0,tail+parkingClearance-(target[passage.along]-departure[passage.along])*passage.direction):0;
  if(passage){
   units.sort((a,b)=>distance(a,passage.entrance)-distance(b,passage.entrance));
  }else if(departureOrder){
   const rank=new Map(departureOrder.orderedIds.map((id,index)=>[id,index]));
   units.sort((a,b)=>rank.get(a.id)-rank.get(b.id));
  }else if(travel){
   units.sort((a,b)=>(b.x-a.x)*forward.x+(b.y-a.y)*forward.y);
   for(let index=0;index<units.length;index+=columns){
    const row=units.slice(index,index+columns).sort((a,b)=>(a.x-b.x)*right.x+(a.y-b.y)*right.y);
    units.splice(index,row.length,...row);
   }
  }else if(this.commandJob&&action==='attack'){
   // Units with a clear shot need no route and can engage before the flankers plan.
   const ready=new Set(units.filter(unit=>distance(unit,target)<=this.unitSpec(unit).range&&this.lineOfSight(unit,target)));
   units.sort((a,b)=>Number(ready.has(b))-Number(ready.has(a))||distance(a,target)-distance(b,target));
  }
  const arrivals=this.commandJob&&travel&&!passage?new ArrivalPlanner(this,units,target,{forward,right,spacing:formationSpacing,reserved}):null;
  const failUnit=unit=>{
   const job=this.commandJob;if(!job||unit.pendingOrder?.revision!==job.revision)return;
   const failure=job.failures[unit.id]??={reason:'route-not-found',blockerId:null};
   Object.assign(unit.pendingOrder,{status:'blocked',...failure});
   const live=job.mission.entity(unit.id);
   if(live?.hp>0&&live.pendingOrder?.revision===job.revision)Object.assign(live.pendingOrder,{status:'blocked',...failure});
  };
  for(let index=0;index<units.length;index++){const unit=units[index],workOffset=(index-(units.length-1)/2)*18,goal=['build','repair','demolish','upgrade-power'].includes(action)?this.workPoint(target,workOffset):target;
   if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
   if(this.commandJob&&unit.pendingOrder?.revision!==this.commandJob.revision)continue;
   this.commandJob?.prepareUnit?.(unit);
   if(this.commandJob&&unit.pendingOrder?.revision!==this.commandJob.revision)continue;
   const planningUnit=this.commandJob?{...unit}:unit;
   if(this.commandJob)this.commandJob.currentUnit=unit.id;
   if(repeat.has(unit.id)){yield* finishRepeat(this,unit);if(unit.passage)preceding=unit.id;continue;}
   const side=(index%columns-(columns-1)/2)*formationSpacing, row=Math.floor(index/columns)*formationSpacing;
   const heldDestination=(this.commandJob?.tailSources?.has(unit.id)?unit.routeContinuation?.destination:null)??unit.pendingOrder?.destination;
   const formation={...(heldDestination??requestedFormation?.slots.get(unit.id)??{x:goal.x+right.x*side-forward.x*row,y:goal.y+right.y*side-forward.y*row})};
   if(passage)formation[passage.along]+=passageShift*passage.direction;
   const parkingRadius=units.length>1?this.config.worldScale*11:0;
   let viaPassage=null;
   if(passage){
    const approach=distance(planningUnit,passage.entrance)<.01?[{...passage.entrance}]
     :yield* this.vehiclePathSteps(planningUnit,passage.entrance,{maxGoalDistance:10,ignoreUnits:convoy});
    const departureRadius=egress?this.config.worldScale*18:parkingRadius;
    const far=(yield* this.movePathSteps(departure,formation,reserved,departureRadius,false,beyondPassage))
     ??(yield* this.movePathSteps(departure,goal,reserved,departureRadius,false,beyondPassage));
    if(approach?.length&&far?.length&&distance(approach.at(-1),passage.entrance)<.1){
     viaPassage=[...approach,egress?.start??passage.exit,...far];
    }
   }
   if(egress&&!viaPassage){failUnit(unit);continue;}
   let path=heldDestination?(yield* this.vehiclePathSteps(planningUnit,heldDestination,{maxGoalDistance:.01,fallback:false})):action==='attack'?(yield* this.attackPathSteps(planningUnit,target,reserved)):['build','repair','demolish','upgrade-power'].includes(action)?(yield* this.workPathSteps(planningUnit,target,workOffset)):viaPassage??(arrivals
    ?(yield* arrivals.path(planningUnit,formation,{pathOptions:formationOptions}))
    :(yield* this.movePathSteps(planningUnit,formation,reserved,parkingRadius,false,()=>true,formationOptions))??(yield* this.movePathSteps(planningUnit,goal,reserved,parkingRadius,false,()=>true,formationOptions)));
   let remainingEscape=null;
   if(!path&&travel){
    const [startCol,startRow]=this.nav.grid(unit.x,unit.y);
    const startCell=startRow*this.nav.size+startCol;
    if(this.nav.walkable[startCell]&&!this.nav.occupied[startCell]){failUnit(unit);continue;}
    // A checked exit and turn can reach the grid even if no straight entry does.
    const scale=this.config.worldScale,allowed=(from,to)=>this.vehicleMotionClear(unit,from,to,.60);
    const starts=[];
    if(unit.detour?.rough&&!unit.detour.parking)starts.push(unit.detour.legs);
    const limit=Math.tan(vehicleDynamics(unit).steeringLimit),curves=[0,-limit/2,limit/2,-limit,limit];
    for(const length of [2,3,5,7])for(const curve of curves)starts.push([{direction:1,curve,remaining:scale*length}]);
    const reverse=Math.min(scale*2,Math.max(0,scale*4-(unit.reverseDebt??0)));
    if(reverse>=scale)for(const curve of curves)starts.push([{direction:-1,curve,remaining:reverse}]);
    for(const legs of starts){
     const exit=checkManeuver(unit,legs,scale,allowed);
     if(!exit)continue;
     const onwardPath=(yield* this.movePathSteps(exit,formation,reserved,parkingRadius))??(yield* this.movePathSteps(exit,goal,reserved,parkingRadius));
     if(!onwardPath?.length)continue;
     const turn=planManeuver(exit,onwardPath[0],{scale,allowed,attempts:2,reverseBudget:0,maximumLegs:5});
     if(!turn)continue;
     path=onwardPath;
     remainingEscape={legs:[...legs,...turn],parking:false,rough:true,blocked:0};
     break;
    }
   }
   if(!path){failUnit(unit);continue;}
   if(this.commandJob){
    // A private search may run during a suspended tick, but replacement is
    // committed between unit controllers, never inside an active controller.
    while(!this.commandJob.copiedIds?.has(unit.id)&&!commandBoundary(this.commandJob.mission,!!(unit.passage||viaPassage))){this.commandJob.waitingTick=true;yield;}
    this.commandJob.waitingTick=false;
    if(unit.hp<=0||unit.pendingOrder?.revision!==this.commandJob.revision)continue;
    if(!this.commandJob.copiedIds?.has(unit.id)){
     const joined=commandPathFromLive(this.commandJob.mission,unit,planningUnit,path,!!remainingEscape||!!viaPassage);
     if(!joined){retryCommandFromRest(this.commandJob,unit,path.at(-1));continue;}
     path=joined;
    }
   }
   if(combat&&!canReceiveAttack(unit,this.unitSpec(unit)))continue;
   const destination=travel?path.at(-1)??goal:goal;
   if(travel||action==='attack')reserved.push(path.at(-1)??unit);
   const targetId=travel?null:target.id??null;
   delete unit.yieldReturn;
   if(unit.detour?.departure)delete unit.detour;
   if(unit.task?.type!==action||unit.task?.targetId!==targetId||travel&&(unit.routeOrder?.revision!==routeOrderRevision||distance(unit.task,destination)>5)){
    delete unit.detour;delete unit.traffic;delete unit.trafficHold;delete unit.driveWatch;delete unit.reverseDebt;delete unit.failedArcs;delete unit.workEscapeRetryAt;
   }
   delete unit.passage;
   if(viaPassage){
    unit.passage={preceding,along:passage.along,direction:passage.direction,admit:passage.admit,throat:passage.throat};
    if(egress){
     unit.passage.egress={...egress,leader:preceding,phase:'approach'};
     unit.passage.parkingEdge=departure[passage.along]+passage.direction*parkingClearance;
    }
    preceding=unit.id;
   }
   if(travel){
    unit.routeOrder={revision:routeOrderRevision,request:{x:target.x,y:target.y},destination};
    if(commandGroup){unit.routeOrder.groupId=commandGroup.id;unit.routeOrder.formation=formationMode;}
    if(action==='attack-move')unit.routeOrder.type=action;
    // A single car may have to park beside a currently occupied click. Keep
    // the reason so a subsequent departure order can release that claim.
    // Group slots are intentional and must never collapse onto the click.
    if(units.length===1&&distance(destination,target)>3){
     const own=vehicleEnvelope(unit,this.config.worldScale,this.field);
     const blockers=this.state.units.filter(other=>{
      if(other===unit||!vehicleObstacle(other)||other.owner!==unit.owner)return false;
      const shape=vehicleEnvelope(other,this.config.worldScale,this.field);
      return distance(other,target)<Math.hypot(own.width,own.depth)+Math.hypot(shape.width,shape.depth)+this.nav.cell*1.5;
     });
     if(blockers.length){
      unit.routeOrder.goalBlockers=blockers.map(other=>other.id);
      // The blocker may already have been moving when this asynchronous
      // result was planned. Schedule release at the normal tick boundary;
      // otherwise its later disappearance has no new order event to trigger.
      const moving=blockers.filter(other=>other.path.length).map(other=>other.id);
      if(moving.length)this.state.parkingGoalReleases=[...new Set([...(this.state.parkingGoalReleases??[]),...moving])];
     }
    }
   }
   else delete unit.routeOrder;
   cancelCombatRetreat(unit,!combat);
   cancelCombatDeployment(unit);
   if(disengage.length)unit.combatDisengage=[...disengage];
   if(combat&&units.length>1)unit.combatGroup=combatGroup;
   unit.path=path;unit.task={type:action,targetId,x:destination.x,y:destination.y,workOffset};
   delete unit.mergeTraffic;changedTraffic.add(unit.id);
   if(remainingEscape)unit.detour=remainingEscape;
   if(action==='build')unit.resumeConstructionId=target.id;
   assigned.add(unit.id);
   if(this.commandJob){delete unit.pendingOrder;if(!this.commandJob.copiedIds?.has(unit.id))activateCommand(this.commandJob.mission,unit);this.commandJob.assigned.push(unit.id);yield;}
  }
  if(this.commandJob){
   if(changedTraffic.size)this.state.parkingGoalReleases=[...new Set([...(this.state.parkingGoalReleases??[]),...changedTraffic])];
  }else yield* this.releaseParkingGoalsSteps(changedTraffic);
  if(action==='build'&&assigned.size){target.awaitingWorkers=false;delete target.builderIds;}
  if(!this.commandJob&&assigned.size)this.radioObserver?.order(action,[...assigned]);
  return assigned.size?{ok:true,assigned:assigned.size,assignedIds:[...assigned],unassigned:units.filter(unit=>!assigned.has(unit.id)).map(unit=>unit.id)}:
   this.fail('Нет доступного пути или подходящего строителя');
 }
 releaseParkingGoals(changed){return completeSteps(this.releaseParkingGoalsSteps(changed));}
 *releaseParkingGoalsSteps(changed){
  if(!changed.size)return;
  const spacing=this.config.worldScale*4.55;
  for(const unit of this.state.units){
   const order=unit.routeOrder;
   if(unit.hp<=0||!order?.goalBlockers?.some(id=>changed.has(id))||!['move','attack-move'].includes(unit.task?.type)
    ||!unit.path.length||unit.combatRetreat||unit.combatDeployment||unit.passage||unit.detour)continue;
   const goal=order.request;
   const occupied=this.state.units.some(other=>other!==unit&&vehicleObstacle(other)
    &&(!other.path.length&&distance(other,goal)<spacing
     ||other.path.length&&['move','attack-move'].includes(other.task?.type)&&distance(other.task,goal)<spacing));
   if(occupied)continue;
   const path=yield* this.vehiclePathSteps(unit,goal,{maxGoalDistance:.01,fallback:false});
   if(!path?.length||distance(path.at(-1),goal)>.01)continue;
   const destination={x:goal.x,y:goal.y};
   unit.path=path;Object.assign(unit.task,destination);
   unit.routeOrder={...order,destination};delete unit.routeOrder.goalBlockers;
   delete unit.traffic;delete unit.trafficHold;delete unit.driveWatch;delete unit.failedArcs;delete unit.passingLane;delete unit.mergeTraffic;
   changed.add(unit.id);
   if(performance.now()>=(this.nav.workDeadline??Infinity))yield;
  }
  // Replaced routes supersede merge leases in both directions. Exact repeat
  // commands never enter this method with changed members.
  for(const other of this.state.units)for(const id of Object.keys(other.mergeTraffic??{}))
   if(changed.has(id))delete other.mergeTraffic[id];
 }
 build(ids,kind,x,y,rotation=0,{snap=true}={}){this.finishPendingStep();
  const builders=this.state.units.filter(u=>ids.includes(u.id)&&u.owner==='rai'&&u.hp>0&&this.unitSpec(u).role==='builder');if(!builders.length)return this.fail('Выберите строителя');const place=this.placement(kind,x,y,rotation,{snap});if(!place.ok)return place;
  const exits=[];
  for(const id of place.blockers){
   const exit=this.siteExit(this.entity(id),{...place,kind},exits.map(item=>item.goal));
   if(!exit)return this.fail('Машинам некуда выехать с площадки');
   exits.push(exit);
  }
  const building=this.addStructure(kind,'rai',place,{rotation:place.rotation,halfWidth:place.halfWidth,halfDepth:place.halfDepth,groundHeight:place.height,accessRoads:place.accessRoads,accessRoadVersion:kind==='factory'?factoryAccessVersion:undefined,cost:this.config.buildings[kind].cost,funding:{paid:0}});
  const builderIds=builders.map(unit=>unit.id);
  building.builderIds=builderIds;
  if(exits.length){
   building.clearing=true;building.builderIds=builderIds;

   for(const exit of exits)this.evacuate(building,exit);
   return {ok:true,id:building.id,clearing:true};
  }
  this.rebuildNavigation();
  const result=this.assignConstruction(building);
  if(!result.ok){this.state.buildings.pop();this.rebuildNavigation();return result;}
  return {ok:true,id:building.id,waiting:result.waiting};
 }
 setCombatPolicy(ids,changes){const result=configureCombat(this,ids,changes);if(result.ok)this.trafficCoordinator.intentChanged();return result;}
 setArmyCombatPolicy(changes){const result=configureArmyCombat(this,changes);if(result.ok)this.trafficCoordinator.intentChanged();return result;}
 setBuilderAutoRepair(enabled){return setBuilderAutoRepair(this,enabled);}
 stop(ids,{expandGroup=true,preserveQueue=false}={}){
  if(expandGroup)ids=expandCommandIds(this,ids);
  ids=ids.filter(id=>{const unit=this.entity(id);return !unit||!inFactoryInterior(unit);});
  if(!preserveQueue)clearQueuedOrders(this,ids);
  this.commandPlanner?.cancel(ids);
  const selected=this.state.units.filter(unit=>ids.includes(unit.id)&&unit.owner==='rai'&&unit.hp>0);
  // Stop is a new intent even for an idle car which never had a revision.
  // Deleting undefined cannot invalidate a suspended proof that intends to
  // borrow that car. Use the same monotonic intent sequence as new orders.
  const revision=this.state.commandRevision=(this.state.commandRevision??0)+1;
  for(const unit of selected){
   unit.commandRevision=revision;delete unit.commandStartAfter;delete unit.routeContinuation;
   unit.pendingOrder={revision,type:'stop',status:'queued',queuedAt:this.state.time};
   (this.pendingStops??=new Map()).set(unit,revision);
  }
  this.applyPendingStops();
  return {ok:true};
 }
 applyPendingStops(){
  // Invalidate intent immediately, then clear controller state at the same
  // safe boundary used by Move. Draining an unrelated recovery search in
  // the input handler can block every browser event for several seconds.
  if(!this.pendingStops?.size||!commandBoundary(this))return;
  for(const [unit,revision] of this.pendingStops){
   if(unit.commandRevision!==revision||unit.pendingOrder?.type!=='stop')continue;
   delete unit.pendingOrder;unit.driveSpeed=0;
   this.radioObserver?.order('stop',[unit.id],'stop:'+revision);
   delete unit.yieldReturn;delete unit.routeOrder;unit.task=null;unit.path=[];unit.builderWorking=false;
   cancelCombatRetreat(unit);cancelCombatDeployment(unit);delete unit.detour;delete unit.traffic;delete unit.trafficHold;delete unit.resumeConstructionId;
  }
  this.pendingStops.clear();
 }
 setRally(id,point){const factory=this.entity(id);if(factory?.kind!=='factory'||factory.owner!=='rai'||!factory.completed)return this.fail('Выберите готовый завод');if(!this.inBounds(point.x,point.y)||!this.exploredAt(point.x,point.y))return this.fail('Точка сбора должна быть разведана');factory.rally={x:point.x,y:point.y};return{ok:true};}
 cancelBuilding(id){this.finishPendingStep();const building=this.entity(id);if(!building||building.owner!=='rai'||building.completed)return this.fail('Отменить можно только незавершённую стройку');this.state.energy=Math.min(this.config.energyCapacity,this.state.energy+oilRefund(building));building.hp=0;this.rebuildNavigation();this.releaseSite(building);for(const unit of this.state.units)if(unit.task?.targetId===id){unit.task=null;unit.path=[];unit.foldTime=2.6;}this.emit('construction-cancelled',{building:id});return {ok:true};}
 availableVehicleRecipes(){
  return currentVehicleRecipes(this);
 }
 factoryProjects(){
  // Existing projects and paid queues survive obsolescence in the designer.
  const recipes=this.vehicleRecipes.filter(({spec})=>!spec.requires||this.state.research[spec.requires]);
  return latestVehicleProjects(this.state.designs).flatMap(project=>{
   const recipe=matchingRecipe(recipes,project.components);
   return recipe?[{...project,...recipe,components:project.components}]:[];
  });
 }
 saveDesign(name,components,paint){
  const recipe=matchingRecipe(this.availableVehicleRecipes(),components);
  if(!recipe)return this.fail('Компоненты несовместимы или ещё не изучены');
  const custom=typeof name==='string'?name.trim().replace(/\s+/g,' '):'';
  const title=custom||projectDesignation(recipe.components,this.state.designs,this.config,this.state.research);
  if(title.length>36)return this.fail('Название должно содержать не больше 36 знаков');
  const paintId=vehiclePaint({components,paint}).id;
  const key=projectAssemblyKey({...recipe,paint:paintId});
  const others=this.state.designs.filter(project=>projectAssemblyKey(project)!==key);
  if(others.some(project=>designNameKey(project.name)===designNameKey(title))){
   return this.fail('Проект с таким названием уже есть');
  }
  const id=this.id('p');
  this.state.designs=[...others,{id,name:title,components:[...recipe.components],paint:paintId}];
  return {ok:true,id};
 }
 productionProjectId(job,projects=this.factoryProjects()){
  return projects.find(project=>project.id===job.projectId)?.id
   ??projects.find(project=>project.kind===job.kind&&(!job.components||projectAssemblyKey(project)===projectAssemblyKey(job)))?.id;
 }
 cancelProduction(id,projectId,{distributed=false}={}){this.finishPendingStep();
  const factory=distributed?productionCancellation(this,projectId)?.factory:this.entity(id);
  if(!factory||factory.hp<=0||factory.owner!=='rai'||factory.kind!=='factory'||!factory.completed)return this.fail('Нужен построенный завод');
  const projects=this.factoryProjects();
  // Remove the newest matching order first, preserving work already in progress.
  const index=factory.queue.findLastIndex(job=>this.productionProjectId(job,projects)===projectId);
  if(index<0)return this.fail('В очереди нет этого проекта');
  const [job]=factory.queue.splice(index,1),refund=oilRefund(job);
  this.state.energy=Math.min(this.config.energyCapacity,this.state.energy+refund);
  if(index===0){delete factory.exitBlocked;delete factory.exitRetryAt;}
  return {ok:true,refund};
 }
 produce(id,projectId,{distributed=false}={}){this.finishPendingStep();
  const project=this.factoryProjects().find(candidate=>candidate.id===projectId);
  if(!project)return this.fail('Сначала сохраните проект в конструкторе');
  const {kind,spec,components,name}=project;
  const factory=distributed?chooseProductionFactory(this,id,{kind,cost:spec.cost,progress:0,funding:{paid:0}}):this.entity(id);
  if(!factory||factory.hp<=0||factory.owner!=='rai'||factory.kind!=='factory'||!factory.completed)return this.fail('Нужен построенный завод');
  if(!this.canSpend(spec.cost))return this.fail('Недостаточно нефти');
  const deployed=this.state.units.filter(unit=>unit.owner==='rai'&&unit.hp>0).length+(this.state.transport?.manifest.length??0);
  const queued=productionFactories(this).reduce((sum,building)=>sum+building.queue.length,0);
  if(deployed+queued>=(this.config.unitLimit??48))return this.fail('Достигнут предел техники');

  factory.queue.push({kind,projectId,name,components:[...components],paint:vehiclePaint(project).id,progress:0,cost:spec.cost,funding:{paid:0},orderSerial:this.serial++,autoFactory:distributed});
  return {ok:true,factoryId:factory.id};
 }
 research(id,key){this.finishPendingStep();if(!this.researchUnlocked())return this.fail('НИИ ещё не принят в эксплуатацию');const lab=this.entity(id),spec=this.config.research[key];if(!lab||lab.kind!=='lab'||lab.owner!=='rai'||!lab.completed)return this.fail('Нужен исследовательский центр');if(!spec||!this.state.artifactKeys.includes(key))return this.fail('Сначала найдите артефакт');if(this.state.research[key]||this.state.buildings.some(b=>b.hp>0&&b.research?.key===key))return this.fail('Исследование уже выполнено или выполняется');if(lab.research)return this.fail('Лаборатория занята');if(!this.canSpend(spec.cost))return this.fail('Недостаточно нефти');lab.research={key,progress:0,cost:spec.cost,funding:{paid:0}};this.emit('research-start',{key});return {ok:true};}
 lineOfSight(from,to){return clearCombatSight(this,from,to);}
 damage(target,amount,source,contact){
  this.finishPendingStep();if(insideFactory(target)||target.hp<=0||!Number.isFinite(amount)||amount<=0)return;
  const blueprint=!!this.config.buildings[target.kind]&&isBlueprint(target);
  const previousFraction=target.hp/target.maxHp;
  const hit=recordDamage(this,target,amount,source,contact);
  target.hp=blueprint?0:Math.max(0,target.hp-amount*armorMultiplier(hit,target));
  if(blueprint)this.state.energy=Math.min(this.config.energyCapacity,this.state.energy+oilRefund(target));
  if(target.owner==='rai'&&source?.owner&&source.owner!=='rai'&&contact?.type!=='collision'&&this.state.time-(target.lastAttackNotice??-Infinity)>=1){
   target.lastAttackNotice=this.state.time;
   this.emit('under-attack',{target:target.id,x:target.x,y:target.y,building:!!this.config.buildings[target.kind]});
  }
  syncFieldHp(this,target);
  rollSteeringDamage(this,target,previousFraction);
  rememberHostileHit(this,target,source);
  alertScavs(this,target,source);
  if(!target.hp){
   if(blueprint){delete target.damage;this.releaseSite(target);}
   recordPersonnelDeath(this,target,source,{cause:contact?.type==='collision'?'collision':undefined});
   if(this.config.units[target.kind]){
    this.freezeWreck(target);
    // Queue only affected parking claims. Their route search uses the next
    // simulation tick's budget instead of blocking an explosion's damage loop.
    if(this.state.units.some(unit=>unit.routeOrder?.goalBlockers?.includes(target.id)))
     (this.state.parkingGoalReleases??=[]).push(target.id);
   }
   if(target.damage){destroyDamage(target.damage);if(!isInfantry(target))target.damage.burn=Math.max(target.damage.burn,.48);salvageFromWreck(this,target,hit);this.onDamageDestroyed?.(target,hit);}
   scheduleWreck(this,target);
   if(!blueprint)this.explodeWreck(target);
   this.radioObserver?.destroyedTarget?.(target,source,{exploded:!blueprint&&!isInfantry(target)});
   this.emit('destroyed',{target:target.id,owner:target.owner,kind:target.kind});
   if(target.owner==='scavs')this.state.statistics.enemiesDestroyed++;
   this.navigationDirty=true;
  }else if(target.owner==='rai'&&this.state.time-(target.lastDamageBark??-20)>12){target.lastDamageBark=this.state.time;this.emit('unit-damaged',{target:target.id});}
  this.radioObserver?.hit(target,source,contact);
  return hit;
 }
 explodeWreck(target){
  if(isInfantry(target))return;
  const mobile=!!this.config.units[target.kind],scale=this.config.worldScale;
  const height=mobile?1:(this.config.buildings[target.kind]?.realSizeMetres?.[2]??6)*.45;
  this.effects.push({type:'explosion',targetId:target.id,owner:target.owner,to:{x:target.x,y:target.y,z:(target.groundHeight??this.field.heightAt(target.x,target.y))+height*scale},radius:mobile?2.4*scale:Math.min(32,Math.max(target.halfWidth,target.halfDepth)*.7)});
 }
 attack(attacker,target,spec){
  if(!spec.damage||attacker.cooldown>0||partMissing(attacker.damage,9)||distance(attacker,target)>spec.range||!this.lineOfSight(attacker,target))return false;
  attacker.cooldown=spec.cooldown;
  if(attacker.owner!==target.owner&&(attacker.owner==='rai'||target.owner==='rai'))this.lastPlayerCombatAt=this.state.time;
  const weapon=spec.weapon??(attacker.kind==='flamer'?'flame':'mg');
  if(weapon==='grenade'){
   const scale=this.config.worldScale,to={x:target.x,y:target.y,z:this.field.heightAt(target.x,target.y)+.2};
   const duration=clamp(distance(attacker,target)/(18*scale),.55,1.4),born=this.state.time;
   const from={x:attacker.x,y:attacker.y,z:this.field.heightAt(attacker.x,attacker.y)+1.4*scale};
   this.state.projectiles.push({id:this.id('g'),owner:attacker.owner,sourceId:attacker.id,sourceKind:attacker.kind,from,to,born,impactAt:born+duration,damage:spec.damage,radius:spec.splash});
   attacker.aimTarget=to;attacker.lastThrowAt=born;
   this.effects.push({type:'shot',from:attacker.id,to,weapon:'grenade'});
   return true;
  }
  const multiplier=attacker.owner!=='rai'?1:attacker.kind==='flamer'?(this.state.research['flamer-upgrade']?1.2:1):(this.state.research['mg-ammo-1']?1.25:1);
  const {x,y,z,surface}=combatContact(attacker,target,this.config,this.field);
  const hit=this.damage(target,spec.damage*multiplier,attacker);
  attacker.aimTarget=hit?.worldPoint?{x:hit.worldPoint[0],y:hit.worldPoint[1],z:hit.worldPoint[2]}:{x,y,z};
  this.effects.push({type:'shot',from:attacker.id,targetId:target.id,to:attacker.aimTarget,surface,destroyed:target.hp<=0,weapon});
  if(this.effects.length>128)this.effects.shift();
  return true;
 }
 enemyOf(item,other){return !insideFactory(other)&&other.hp>0&&item.owner!==other.owner&&(item.owner==='rai'||other.owner==='rai')&&(!other.campId||this.inBounds(other.x,other.y));}
 updateProjectiles(){
  const waiting=[];
  for(const shot of this.state.projectiles){
   if(shot.impactAt>this.state.time){waiting.push(shot);continue;}
   const source={id:shot.sourceId,kind:shot.sourceKind,owner:shot.owner,...shot.from};
   for(const target of [...this.state.units,...this.state.buildings]){
    const d=distance(target,shot.to);
    if(target.hp>0&&target.owner!==shot.owner&&d<=shot.radius)this.damage(target,shot.damage*(1-.6*d/shot.radius),source);
   }
   this.effects.push({type:'explosion',owner:shot.owner,to:shot.to,radius:shot.radius*.55});
  }
  this.state.projectiles=waiting;
 }
 nearbyUnits(point,range,excludeOwner){return this.unitIndexActive?this.unitIndex.query(point,range,excludeOwner):this.state.units;}
 nearestEnemy(item,range,canTarget=null){let nearest=null,best=range;for(const target of [...this.nearbyUnits(item,range,item.owner),...this.state.buildings]){if(!this.enemyOf(item,target))continue;const d=distance(item,target);if(d<best&&(item.owner!=='rai'||this.visibleAt(target.x,target.y))&&(!canTarget||canTarget(target))){best=d;nearest=target;}}return nearest;}
 *planManeuverSteps(unit,goal,options){return yield* planManeuverSteps(unit,goal,{...options,deadline:()=>this.nav.workDeadline??Infinity});}
 requestPassage(...args){this.finishPendingStep();return completeSteps(this.requestPassageSteps(...args));}
 *requestPassageSteps(unit,blockers){
  if(unit.task?.type==='clear-site'||unit.detour||unit.traffic||unit.trafficHold)return false;
  const scale=this.config.worldScale,workOrder=['build','repair','demolish','upgrade-power'].includes(unit.task?.type);
  for(const other of blockers){
   const holding=other.combatDeployment&&['arrived','reserve'].includes(other.combatDeployment.status);
   if(other.hp<=0||other.owner!==unit.owner||other.path.length||other.task&&!holding||other.detour||this.unitSpec(other).role==='builder'
    ||other.jointTraffic||other.yieldReturn?.cooperativeRequester||other.trafficRest>this.state.time||distance(unit,other)>scale*7)continue;
   if(!other.routeOrder&&!holding&&!workOrder&&(!['move','attack-move','combat-position'].includes(unit.task?.type)||this.unitSpec(unit).role==='builder'))continue;
   const world=this.state,requestRevision=unit.commandRevision,yieldRevision=other.commandRevision;
   other.trafficRest=this.state.time+5;
   const parkingBlockers=new Set();
   const park=yield* this.parkingManeuverSteps(other,unit,(from,to)=>this.vehicleMotionClear(other,from,to,.52,parkingBlockers));
   if(!park){
    // A parked vehicle can be unable to turn because the requester occupies
    // its only reversing exit. Check both phases before moving either: the
    // requester backs out, then the parked member clears the entire route.
    if(parkingBlockers.has(unit)){
     const budget=Math.max(0,scale*4-(unit.reverseDebt??0));
     if(budget<scale*2){
      const backoff=yield* checkedPassageBackoff(this,unit,other);
      if(backoff){unit.detour=backoff;return true;}
      if(this.state!==world||unit.pendingOrder||other.pendingOrder||unit.commandRevision!==requestRevision||other.commandRevision!==yieldRevision)return false;
     }
     for(const length of [scale*2,scale*3,scale*4]){
      if(length>budget)continue;
      const legs=[{direction:-1,curve:0,remaining:length}];
      const exit=checkManeuver(unit,legs,scale,(from,to)=>this.vehicleMotionClear(unit,from,to));
      if(!exit)continue;
      const leader={...unit,...exit},obstacles=this.state.units.map(candidate=>candidate===unit?leader:candidate);
      const yielding=yield* this.parkingManeuverSteps(other,leader,(from,to)=>this.vehicleMotionClear(other,from,to,.52,undefined,obstacles));
      if(!yielding)continue;
      unit.detour={legs,parking:false,blocked:0,yieldHandoff:{id:other.id,legs:yielding.legs}};
      return true;
     }
    }
    continue;
   }
   if(yield* checkedYieldPassage(this,unit,other,park.legs))return true;
   if(this.state!==world||unit.pendingOrder||other.pendingOrder||unit.commandRevision!==requestRevision||other.commandRevision!==yieldRevision)return false;
  }
  // Predictive braking may stop an opposing pair before a collision sweep
  // reports a blocker. It still needs a checked right-side reversing exit.
  const passing=unit.passingLane&&this.entity(unit.passingLane.otherId);
  const candidatesForPassage=new Set(blockers);
  if(passing&&(unit.driveSpeed??0)<scale*.18&&(passing.driveSpeed??0)<scale*.18)candidatesForPassage.add(passing);
  const course=vehicle=>{const point=vehicle.path.at(-1);return Math.atan2(point.y-vehicle.y,point.x-vehicle.x);};
  const direction=course(unit);
  const candidates=[...candidatesForPassage].filter(other=>other.hp>0&&other.owner===unit.owner&&other.path.length
   &&!other.traffic&&!other.detour&&!other.trafficHold&&!other.passage
   &&(other.driveSpeed??0)<scale*.18
   &&other.task?.type!=='clear-site'&&distance(unit,other)<this.config.worldScale*6
   &&Math.cos(direction-course(other))<.55);
  if(!candidates.length)return false;
  const serial=vehicle=>Number(vehicle.id.slice(1));
  candidates.sort((a,b)=>distance(unit,a)-distance(unit,b)||serial(a)-serial(b));
  const other=candidates[0],higher=serial(unit)<serial(other);
  const leader=higher?unit:other, follower=higher?other:unit;
  if(follower.trafficRest>this.state.time)return false;
  if(yield* this.trafficCoordinator.movingPassageSteps(this,leader,follower))return true;
  follower.trafficRest=this.state.time+1.2;return false;
 }
 *workRouteExitSteps(unit,goal){
  const scale=this.config.worldScale;
  const allowed=(from,to)=>this.vehicleMotionClear(unit,from,to);
  const ignoreUnits=new Set([unit]);
  const curve=Math.tan(vehicleDynamics(unit).steeringLimit);
  // Check both the backing arc and the turn onto the new route before moving.
  for(const length of [1.5,2.5,3.5]){
   for(const steering of [0,curve/2,-curve/2,curve,-curve]){
    if(performance.now()>=this.nav.workDeadline)yield;
    const first={direction:-1,curve:steering,remaining:length*scale};
    const exit=checkManeuver(unit,[first],scale,allowed);
    if(!exit)continue;
    const path=yield* this.vehiclePathSteps(exit,goal,{ignoreUnits,avoidMoving:true,fallback:false,maxGoalDistance:.01});
    if(!path?.length)continue;
    const onward=yield* this.planManeuverSteps(exit,path[0],{scale,allowed,attempts:2,reverseBudget:0,maximumLegs:5});
    if(onward)return {path,legs:[first,...onward]};
   }
  }
  return null;
 }
 vehicleMotionNeighbours(unit,from,to){
  if(!this.unitIndexActive)return this.state.units;
  const scale=this.config.worldScale,radius=Math.max(vehicleRadiusBound(from.kind??unit.kind,scale),vehicleRadiusBound(to.kind??unit.kind,scale));
  const angle=(to.heading??0)-(from.heading??0),turn=Math.atan2(Math.sin(angle),Math.cos(angle));
  const padding=scale*.055+.012+Math.SQRT2*radius*turn*turn/24;
  return this.unitIndex.query(to,distance(from,to)+radius+this.unitIndex.maxBodyRadius*scale+padding).filter(other=>trafficCollisionRequired(unit,other));
 }
 vehicleMotionClear(unit,from,to,grade=.52,blockers,obstacles=this.state.units,reservationWitness,regionSolids){
  const reserved=corridorBlocker(this,unit,from,to,reservationWitness);
  if(reserved){blockers?.add(reserved);return false;}
  if(!passageWaitClear(this,unit,from,to))return false;
  if(obstacles===this.state.units)obstacles=this.vehicleMotionNeighbours(unit,from,to);
  const sweep=this.vehicleTerrainSweep(unit,from,to,grade,regionSolids);
  return sweep!==false&&clearOfVehicles(unit,to,obstacles,this.config.worldScale,false,from,this.field,blockers,sweep);
 }
 // Static feasibility is also used for future arrival slots. A temporary
 // traffic reservation is not a permanent obstacle at that destination.
 // Return false for a blocked sweep, null when there are no nearby solids,
 // or the prepared sweep so execution can reuse it for vehicle checks.
 vehicleTerrainSweep(unit,from,to,grade=.52,regionSolids){
  const field=this.field,scale=this.config.worldScale;
  const terrainEscape=unit.owner==='rai'?this.terrainEscapeFor(unit):null;
  if(!this.nav.lineClear(from,to,false,true,grade,true,false,terrainEscape))return false;
  const reach=scale*4.8+distance(from,to);
  const solids=regionSolids?regionSolids.filter(item=>Math.abs(to.x-item.x)<item.halfWidth+reach&&Math.abs(to.y-item.y)<item.halfDepth+reach)
   :this.nav.nearbySolids(to,reach);
  const sweep=solids.length?vehicleSweep(from,to,scale,field):null;
  return sweep&&!this.nav.clearSolidSweep(sweep,solids)?false:sweep;
 }
 passingLane(unit,point,course,scale){
  const admission=this.trafficCoordinator.passageDecisions.get(unit.id),throat=unit.passage?.throat;
  if(admission&&throat){
   const shape=vehicleEnvelope(unit,scale,this.field),half=throat.along==='x'?footprintSupport(shape,1,0):footprintSupport(shape,0,1);
   const centre=throat.along==='x'?shape.x:shape.y;
   const outside=unit.passage.direction>0?centre-half>throat.high+scale*.055:centre+half<throat.low-scale*.055;
   const apron=2.6*scale/Math.tan(.67)*2+Math.hypot(shape.width,shape.depth)+shape.depth;
   const before=unit.passage.direction>0?centre+half<throat.low-apron:centre-half>throat.high+apron;
   if(!admission.admitted||!outside&&!before)return null;
  }
  // A short intermediate waypoint is not the end of an encounter. Reserve
  // one stable right-hand corridor until both complete hulls have passed.
  // The final repair/attack destination may be behind a plateau while the
  // current route goes the other way. Detect opposing traffic on the next
  // local leg, skipping only a short corner for anticipation (not movement).
  const localPoint=body=>body.path.find(p=>distance(body,p)>scale*4)??body.path.at(-1);
  const goal=unit.path.at(-1)??point,next=localPoint(unit)??point,length=distance(unit,next),range=160;
  if(length<.1){delete unit.passingLane;return null;}
  const ux=(next.x-unit.x)/length,uy=(next.y-unit.y)/length;
  let lane=unit.passingLane;
  if(lane&&(!lane.localCourse||lane.goalX!==goal.x||lane.goalY!==goal.y))lane=null;
  const eligible=other=>{
   if(!other||other===unit||other.hp<=0||other.owner!==unit.owner||!other.path.length)return false;
   const next=localPoint(other),d=distance(other,next);if(d<.1)return false;
   const dx=other.x-unit.x,dy=other.y-unit.y,along=dx*ux+dy*uy;
   const opposing=((next.x-other.x)*ux+(next.y-other.y)*uy)/d;
   return along> -scale*6&&along<range&&Math.abs(dx*uy-dy*ux)<scale*4.5
    &&opposing<-.83;
  };
  const neighbours=this.nearbyUnits(unit,range+scale*4).filter(other=>trafficCollisionRequired(unit,other));
  let other=lane?neighbours.find(candidate=>candidate.id===lane.otherId):null;
  const otherGoal=other?.path.at(-1);
  if(lane&&otherGoal&&(lane.otherGoalX!==otherGoal.x||lane.otherGoalY!==otherGoal.y))lane=null;
  const retained=other?.hp>0&&other.owner===unit.owner&&otherGoal
   &&lane&&lane.otherGoalX===otherGoal.x&&lane.otherGoalY===otherGoal.y
   &&(other.x-unit.x)*lane.ux+(other.y-unit.y)*lane.uy> -scale*6;
  if(!retained&&!eligible(other)){
   other=null;let closest=Infinity;
   for(const candidate of neighbours)if(eligible(candidate)){
    const d=distance(unit,candidate);if(d<closest){other=candidate;closest=d;}
   }
  }
  if(!other){delete unit.passingLane;return null;}
  // A checked shoulder manoeuvre has already cleared this leader's route.
  // Continuing to reserve the yielder's hypothetical future trajectory would
  // brake the leader again while the yielder is explicitly waiting for it.
  if(other.traffic?.leader===unit.id&&other.traffic.phase==='parked')return null;
  if(!lane||lane.otherId!==other.id){
   const shared=other.passingLane;
   const otherGoal=other.path.at(-1);
   if(shared?.localCourse&&shared.otherId===unit.id&&shared.goalX===otherGoal.x&&shared.goalY===otherGoal.y)lane={x:shared.x,y:shared.y,ux:-shared.ux||0,uy:-shared.uy||0};
   else{
    const next=localPoint(other),d=distance(other,next),dx=ux-(next.x-other.x)/d,dy=uy-(next.y-other.y)/d,l=Math.hypot(dx,dy);
    lane={x:(unit.x+other.x)/2,y:(unit.y+other.y)/2,ux:dx/l,uy:dy/l};
   }
   Object.assign(lane,{localCourse:true,otherId:other.id,goalX:goal.x,goalY:goal.y,otherGoalX:otherGoal.x,otherGoalY:otherGoal.y});
  }
  const shape=vehicleEnvelope(unit,scale,this.field),obstacle=vehicleEnvelope(other,scale,this.field),rx=lane.uy,ry=-lane.ux;
  const otherAdmission=this.trafficCoordinator.passageDecisions.get(other.id);
  // Both marching and retreating cars share the right-hand separation.
  // Work approaches and denied passage admissions keep their fixed course.
  const otherKeepsCourse=['build','repair','demolish','clear-site','combat-position'].includes(other.task?.type)
   ||otherAdmission&&!otherAdmission.admitted;
  const otherSide=(obstacle.x-lane.x)*rx+(obstacle.y-lane.y)*ry;
  const offset=(otherKeepsCourse?otherSide+shape.width+footprintSupport(obstacle,rx,ry):Math.max(shape.width,obstacle.width))+scale*.9;
  const along=(unit.x-lane.x)*lane.ux+(unit.y-lane.y)*lane.uy+scale*3.6;
  const target={x:lane.x+lane.ux*along+rx*offset,y:lane.y+lane.uy*along+ry*offset};
  // Until lateral separation fits the actual oriented hulls, share the
  // available braking distance. A right-side target alone does not prevent
  // two fast vehicles meeting before their steering arcs have separated.
  const dx=obstacle.x-shape.x,dy=obstacle.y-shape.y,ahead=dx*lane.ux+dy*lane.uy;
  const across=Math.abs(dx*rx+dy*ry),width=footprintSupport(shape,rx,ry)+footprintSupport(obstacle,rx,ry)+scale*.11;
  const gap=ahead-footprintSupport(shape,lane.ux,lane.uy)-footprintSupport(obstacle,lane.ux,lane.uy)-scale*.4;
  const braking=Math.min(vehicleDynamics(unit).braking,vehicleDynamics(other).braking),reaction=braking*(this.config.simulationStep??.1);
  target.trafficLimit=ahead>0&&across<width?Math.max(0,Math.sqrt(braking*Math.max(0,gap)+reaction**2)-reaction):Infinity;
  const pose={...target,heading:Math.atan2(-lane.ux,lane.uy),kind:unit.kind};
  if(!this.nav.lineClear(unit,target,false,true,.52,true)||
   !this.nav.clearSolidSweep(vehicleSweep(pose,pose,scale,this.field),this.nav.nearbySolids(target,scale*4))){
   // An unavailable shoulder removes the steering target, not the actual
   // opposing hull or its stopping distance.
   unit.passingLane=lane;return {...point,trafficLimit:target.trafficLimit};
  }
  // The checked encounter corridor may pass a short A* waypoint sideways.
  // Do not U-turn back to it afterwards. Only discard intermediate points
  // already behind this corridor, and validate the connector to the next.
  while(unit.path.length>1){
   const first=unit.path[0],next=unit.path[1];
   if((first.x-unit.x)*lane.ux+(first.y-unit.y)*lane.uy>=0
    ||(next.x-unit.x)*lane.ux+(next.y-unit.y)*lane.uy<=0
    ||!this.nav.lineClear(unit,next,false,true,.52,true))break;
   unit.path.shift();
  }
  unit.passingLane=lane;return {...target,passingCorridor:lane};
 }
 drivingIntent(unit,point,course,scale){
  const roadLane=!['build','repair','demolish','clear-site','combat-position'].includes(unit.task?.type)?roadDrivingLane(this,unit,point,scale):null;
  if(roadLane&&this.nav.lineClear(unit,roadLane,false,true)){
   delete unit.passingLane;
   // Passing a centre-line route point on its right must not cause a turn
   // back to that point. Only a clear connector releases it, never the goal.
   while(unit.path.length>1){
    const first=unit.path[0],next=unit.path[1];
    if((first.x-unit.x)*roadLane.ux+(first.y-unit.y)*roadLane.uy>=0
     ||(next.x-unit.x)*roadLane.ux+(next.y-unit.y)*roadLane.uy<=0
     ||!this.nav.lineClear(unit,next,false,true))break;
    unit.path.shift();
   }
   const d=distance(unit,roadLane);
   return deferRoadMerge(this,unit,{point,waypoint:roadLane,roadLane,trafficLimit:Infinity,
    course:d>0?{x:(roadLane.x-unit.x)/d,y:(roadLane.y-unit.y)/d}:course},scale);
  }
  const cruising=!['build','repair','demolish','clear-site','combat-position'].includes(unit.task?.type);
  const passing=cruising?this.passingLane(unit,point,course,scale):null;
  // Away from a road leg, the accepted field route and local passing apply.
  delete unit.mergeTraffic;
  const waypoint=passing??point,d=distance(unit,waypoint);
  return {point,waypoint,roadLane:null,passingLane:passing?.passingCorridor??null,trafficLimit:passing?.trafficLimit??Infinity,yieldTo:passing?unit.passingLane?.otherId:null,
   course:d>0?{x:(waypoint.x-unit.x)/d,y:(waypoint.y-unit.y)/d}:course};
 }
 trafficSpeed(unit,course,lane,scale,stoppedObstacles){
  // Solve v²/(2a) + dt*v <= free distance. A constant 3.24-world
  // standstill buffer unnecessarily stopped every row of a compact column.
  const braking=vehicleDynamics(unit).braking,reaction=braking*(this.config.simulationStep??.1);
  const brakingSpeed=gap=>Math.max(0,Math.sqrt(2*braking*Math.max(0,gap)+reaction**2)-reaction);
  // Match the collision skin AND the swept-volume padding. Stopping exactly
  // on the static skin repeatedly trips the .012-world sweep allowance.
  const standstill=scale*.055+.02;
  const field=this.field,shape=vehicleEnvelope(unit,scale,field);
  const front=footprintSupport(shape,course.x,course.y);
  const width=footprintSupport(shape,course.y,-course.x);
  const laneRank=lane?roadTrafficRank(unit,lane.progress,this.nav.roads.nearest(unit,scale*7),lane.direction,scale):null;
  for(const [id,merge] of Object.entries(unit.mergeTraffic??{})){
   if(merge.expires<this.state.time)delete unit.mergeTraffic[id];
  }
  let limit=this.trafficCoordinator.limit(unit);
  for(const other of this.nearbyUnits(unit,scale*13)){
   if(!trafficCollisionRequired(unit,other))continue;
   if(other===unit||other.hp<=0||other.owner!==unit.owner||distance(unit,other)>scale*13)continue;
   // Actual bodies constrain every moving vehicle, regardless of route
   // alignment. A turning neighbour can cross this corridor while its next
   // waypoint points behind it and has no straight junction reservation.
   {
    const obstacle=vehicleEnvelope(other,scale,field),dx=obstacle.x-shape.x,dy=obstacle.y-shape.y;
    const fx=-Math.sin(unit.heading),fy=Math.cos(unit.heading);
    const along=dx*fx+dy*fy,across=Math.abs(dx*fy-dy*fx);
    const speed=(other.driveSpeed??0)*(other.reversing?-1:1),look=other.combatRetreat?.status==='moving'?.7:0;
    const vx=-Math.sin(other.heading)*speed*look,vy=Math.cos(other.heading)*speed*look;
    const lateral=dx*fy-dy*fx,nextLateral=lateral+vx*fy-vy*fx;
    const sweepAcross=lateral*nextLateral<=0?0:Math.min(across,Math.abs(nextLateral));
    const sweepAlong=Math.min(along,along+vx*fx+vy*fy);
    const turning=look>0?Math.hypot(obstacle.width,obstacle.depth):null;
    if(along>0&&sweepAcross<footprintSupport(shape,fy,-fx)+(turning??footprintSupport(obstacle,fy,-fx))+scale*(look?.5:.055)){
     const gap=sweepAlong-footprintSupport(shape,fx,fy)-(turning??footprintSupport(obstacle,fx,fy))-(look?scale*2:standstill);
     limit=Math.min(limit,brakingSpeed(gap));
     if(gap<scale*.3&&(other.driveSpeed??0)<scale*.3)stoppedObstacles?.add(other);
    }
   }
   const point=other.path[0];
   if(!point||(other.driveSpeed??0)<scale*.18){
    if(!['move','attack-move','combat-position'].includes(unit.task?.type))continue;
    // A stopped body is solid even when it retains a route whose next point
    // is behind it. Route alignment must never suppress physical braking.
    const obstacle=vehicleEnvelope(other,scale,field),dx=obstacle.x-shape.x,dy=obstacle.y-shape.y;
    const along=dx*course.x+dy*course.y,across=Math.abs(dx*course.y-dy*course.x);
    if(along>0&&across<width+footprintSupport(obstacle,course.y,-course.x)+scale*.15){
     const gap=along-front-footprintSupport(obstacle,course.x,course.y)-standstill;
     if(gap<scale*.18&&(other.driveSpeed??0)<scale*.18&&!other.detour)stoppedObstacles?.add(other);
     limit=Math.min(limit,brakingSpeed(gap));
    }
    continue;
   }
   const goalDistance=distance(other,point);
   if(!goalDistance)continue;
   const otherCourse={x:(point.x-other.x)/goalDistance,y:(point.y-other.y)/goalDistance};
   const aligned=-Math.sin(other.heading)*otherCourse.x+Math.cos(other.heading)*otherCourse.y;
   if(aligned<.77)continue;
   const obstacle=vehicleEnvelope(other,scale,field);
   const dx=obstacle.x-shape.x,dy=obstacle.y-shape.y;
   const otherLane=lane?roadDrivingLane(this,other,point,scale):null;
   if(otherLane&&lane.path===otherLane.path&&lane.direction===otherLane.direction){
    const separate=!!lane.retreatShoulder!==!!otherLane.retreatShoulder||lane.retreatShoulder&&lane.retreatSide!==otherLane.retreatSide;
    const across=Math.abs(dx*course.y-dy*course.x);
    if(separate&&across>width+footprintSupport(obstacle,course.y,-course.x)+scale*.15)continue;
    const along=otherLane.progress-lane.progress;
    if(Math.abs(along)>scale*8)continue;
    let merge=unit.mergeTraffic?.[other.id];
    if(!merge||merge.path!==lane.path||merge.direction!==lane.direction||merge.expires<this.state.time){
     const otherRank=roadTrafficRank(other,otherLane.progress,this.nav.roads.nearest(other,scale*7),otherLane.direction,scale);
     const leader=compareRoadTrafficRanks(laneRank,otherRank)<=0?unit:other;
     merge={leader:leader.id,path:lane.path,direction:lane.direction,expires:this.state.time+1.8};
     (unit.mergeTraffic??={})[other.id]=merge;
     (other.mergeTraffic??={})[unit.id]={...merge};
    }
    merge.expires=this.state.time+1.8;
    (other.mergeTraffic??={})[unit.id]={...merge};
    if(merge.leader!==unit.id){
     const rear=footprintSupport(obstacle,lane.ux,lane.uy);
     const gap=along-footprintSupport(shape,lane.ux,lane.uy)-rear-standstill;
     limit=Math.min(limit,brakingSpeed(gap));
    }
    continue;
   }
   const dot=course.x*otherCourse.x+course.y*otherCourse.y;
   if(dot>-.53&&dot<.81)continue; // One shared junction decision above.
   if(dot<.81)continue;
   const alignment=-Math.sin(other.heading)*course.x+Math.cos(other.heading)*course.y;
   if(alignment<.76)continue;
   const along=dx*course.x+dy*course.y;
   const rear=footprintSupport(obstacle,course.x,course.y);
   const across=Math.abs(dx*course.y-dy*course.x);
   const following=across<Math.min(scale*2.4,width+footprintSupport(obstacle,course.y,-course.x)+scale*.15);
   if(!following||along<=0)continue;
   const gap=along-front-rear-standstill;
   // Keep enough room to stop even when the leader receives an immediate Stop.
   const limitHere=brakingSpeed(gap);
   limit=Math.min(limit,limitHere);
  }
  return limit;
 }
 parkingManeuver(...args){this.finishPendingStep();return completeSteps(this.parkingManeuverSteps(...args));}
 *parkingManeuverSteps(unit,leader,allowed,{accept=()=>true,acceptPlan=()=>true,requireInverse=true,fine=false}={}){
  const point=leader.path[0];
  const encounter=unit.passingLane?.otherId===leader.id?unit.passingLane:null;
  const angle=encounter?Math.atan2(-encounter.uy,-encounter.ux):point?Math.atan2(point.y-leader.y,point.x-leader.x):leader.heading+Math.PI/2;
  const forward={x:Math.cos(angle),y:Math.sin(angle)},right={x:forward.y,y:-forward.x};
  const scale=this.config.worldScale;
  const lateral=p=>(p.x-leader.x)*right.x+(p.y-leader.y)*right.y;
  const side=Math.sign(lateral(unit))||1;
  // Reserve the next part of the route, including bends and the last partial
  // segment. A nearly reached first waypoint does not end the passing aisle.
  const aisle=[],append=pose=>{
   const previous=aisle.at(-1)?.pose??leader;
   aisle.push({pose,sweep:vehicleSweep(previous,pose,scale,this.field),previous});
  };
  let origin={x:leader.x,y:leader.y,heading:leader.heading,kind:leader.kind},remaining=scale*12;
  append({...origin});
  for(const end of leader.path){
   const length=distance(origin,end);if(length<1e-6)continue;
   const lengthHere=Math.min(length,remaining),ux=(end.x-origin.x)/length,uy=(end.y-origin.y)/length;
   const heading=Math.atan2(-ux,uy),turn=angleDelta(heading,origin.heading);
   // Include the actual initial heading and the rotated full body at bends.
   const turns=Math.ceil(Math.abs(turn)/.15);
   for(let i=1;i<=turns;i++)append({...origin,heading:origin.heading+turn*i/turns});
   const steps=Math.ceil(lengthHere/scale);
   for(let i=1;i<=steps;i++)append({x:origin.x+ux*lengthHere*i/steps,y:origin.y+uy*lengthHere*i/steps,heading,kind:leader.kind});
   origin=aisle.at(-1).pose;remaining-=lengthHere;if(remaining<=1e-6)break;
  }
  const clearLane=pose=>{
   const obstacle={...pose,kind:unit.kind,hp:1};
   for(const passing of aisle){
    if(vehicleClearance(obstacle,passing.pose,scale,this.field)<scale*.35
     ||!clearOfVehicles(leader,passing.pose,[obstacle],scale,false,passing.previous,this.field,undefined,passing.sweep))return false;
   }
   return true;
  };
  const final=leader.path.at(-1),previous=leader.path.at(-2)??leader;
  const finalPose=final&&{...final,heading:Math.atan2(previous.x-final.x,final.y-previous.y),kind:leader.kind,hp:1};
  const borrowed=unit.yieldReturn,home=borrowed?.home??unit,history=borrowed?.legs??[];
  const reserveReturn=finalPose&&clearOfVehicles(null,home,[finalPose],scale,true,null,this.field);
  const canReturn=(pose,legs)=>!requireInverse||!reserveReturn||!!checkManeuver(pose,
   [...history,...legs].reverse().map(leg=>({direction:-leg.direction,curve:-leg.curve,remaining:leg.remaining})),scale,
   (from,to)=>clearOfVehicles(null,to,[finalPose],scale,false,from,this.field));
  // In a head-on encounter the yielder's right is the leader's left. Never
  // try the opposite shoulder merely because that search was cheaper.
  for(const offset of encounter?[5]:[5,7,9])for(const sign of encounter?[-1]:[side,-side]){
   const goal={x:unit.x+right.x*scale*offset*sign,y:unit.y+right.y*scale*offset*sign};
   const path=yield* this.planManeuverSteps(unit,goal,{scale,allowed,attempts:2,
    // Tight parking may require sub-car-length shunts. Keep the same finite
    // travel/reverse bounds while refining pose and heading resolution.
    maximumLegs:Math.ceil((encounter?12:offset===5?9:offset===7?12:15)*(fine?1.2/.45:1)),
    stride:fine?.45*scale:undefined,headingStep:fine?.1:undefined,reverseBudget:scale*(encounter?4:6),
    accept:(pose,legs)=>lateral(pose)*sign>scale*1.3&&distance(pose,unit)>scale*.6&&accept(pose)&&clearLane(pose)&&canReturn(pose,legs)
     &&(!encounter||-Math.sin(pose.heading)*encounter.ux+Math.cos(pose.heading)*encounter.uy>.85)&&acceptPlan(pose,legs)});
   if(path)return {legs:path,forward};
  }
  return null;
 }
 recoverTrafficCluster(...args){this.finishPendingStep();return completeSteps(this.recoverTrafficClusterSteps(...args));}
 *recoverTrafficClusterSteps(unit,includeParked=false,blockers,{aisleOnly=false}={}){
  const scale=this.config.worldScale;
  const idle=other=>!other.path.length&&!other.task&&!other.builderWorking&&!other.tool&&!other.foldTime;
  const neighbours=this.state.units.filter(other=>other.owner===unit.owner&&other.hp>0
   &&(other.path.length&&other.task?.type!=='clear-site'||includeParked&&idle(other)&&distance(unit,other)<scale*12));
  const cluster=[unit];
  for(let index=0;index<cluster.length;index++){
   const current=cluster[index];
   for(const other of neighbours){
    if(cluster.includes(other)||distance(current,other)>scale*6.5)continue;
    // A turning sweep can hit a vehicle even when both parked hulls are clear.
    const sweptBlocker=current===unit&&blockers?.has(other)&&other.path.length&&(other.driveSpeed??0)<scale*.18;
    if(sweptBlocker||vehicleClearance(current,other,scale,this.field)<scale*.52)cluster.push(other);
   }
  }
  if(cluster.length<2||cluster.some(other=>other.detour||other.jointTraffic||other.trafficHold||other.traffic))return false;
  const mission=this;
  const yieldSpace=function*(vehicle,legs,rough=true){
   if(idle(vehicle))return yield* checkedYieldPassage(mission,unit,vehicle,legs,{rough});
   for(const leader of cluster.filter(other=>other!==vehicle&&other.path.length))
    if(yield* mission.trafficCoordinator.movingPassageSteps(mission,leader,vehicle,{parkingLegs:legs,rough}))return true;
   return false;
  };
  if(includeParked&&cluster.length>=4
   &&(aisleOnly||cluster.every(other=>other===unit||vehicleClearance(unit,other,scale,this.field)>=0))
   &&(yield* this.clearParkedAisleSteps(unit,neighbours.filter(idle),yieldSpace)))return true;
  if(aisleOnly)return false;
  const centre=cluster.reduce((sum,other)=>({x:sum.x+other.x/cluster.length,y:sum.y+other.y/cluster.length}),{x:0,y:0});
  // A van on a forbidden slope needs to gain ground along its route as it separates.
  const onBlockedSlope=unit.terrainEscape&&this.nav.terrainAllowed?.(unit.x,unit.y)===false;
  const escapePoint=!includeParked&&cluster.length===2&&onBlockedSlope?unit.path[0]:null;
  const outer=escapePoint?cluster:cluster.slice().sort((a,b)=>distance(b,centre)-distance(a,centre)||Number(b.id.slice(1))-Number(a.id.slice(1)));
  for(const vehicle of outer){
   if(includeParked&&!idle(vehicle))continue;
   if(vehicle.traffic||vehicle.trafficRest>this.state.time)continue;
   const offset={x:vehicle.x-centre.x,y:vehicle.y-centre.y};
   const radius=Math.max(1,distance(vehicle,centre));
   const escaping=vehicle===unit&&!!escapePoint;
   const goal=escaping?escapePoint:{x:vehicle.x+offset.x/radius*scale*4.5,y:vehicle.y+offset.y/radius*scale*4.5};
   const others=cluster.filter(other=>other!==vehicle);
   const allowed=(from,to)=>this.vehicleMotionClear(vehicle,from,to,.60);
   const legs=yield* this.planManeuverSteps(vehicle,goal,{scale,allowed,attempts:2,maximumLegs:escaping?10:6,
    accept:pose=>(!escaping||distance(pose,goal)<distance(vehicle,goal)-scale)
     &&distance(vehicle,pose)>scale*2.5&&distance(pose,centre)>radius+scale*1.3
     &&others.every(other=>vehicleClearance(pose,other,scale,this.field)>scale*.4)});
   if(!legs){
    if(includeParked)vehicle.trafficRest=this.state.time+4;
    continue;
   }
   if(includeParked){if(yield* yieldSpace(vehicle,legs))return true;continue;}
   // Advancing the front of an aligned file is departure, not yielding to
   // the vehicle behind it. Parking here would recreate the obstruction and
   // hold the whole file until the unrelated nine-second lease expired.
   const forward={x:-Math.sin(vehicle.heading),y:Math.cos(vehicle.heading)};
   const sameCourse=other=>{
    const point=other.path[0],d=point&&distance(other,point);
    return d>.1&&Math.cos(other.heading-vehicle.heading)>.85
     &&((point.x-other.x)*forward.x+(point.y-other.y)*forward.y)/d>.85;
   };
   if(legs.every(leg=>leg.direction===1&&leg.curve===0)&&sameCourse(vehicle)&&others.every(sameCourse)){
    const departure=[{direction:1,curve:0,remaining:legs.reduce((sum,leg)=>sum+leg.remaining,0)}];
    const normal=checkManeuver(vehicle,departure,scale,(from,to)=>this.vehicleMotionClear(vehicle,from,to));
    vehicle.detour={legs:departure,parking:false,rough:!normal,blocked:0};
    return true;
   }
   if(others.length===1&&(blockers?.has(vehicle)||blockers?.has(others[0]))
    &&vehicleClearance(vehicle,others[0],scale,this.field)>=scale*.52){
    // Once this manoeuvre clears a known blocker, both vans can resume.
    const normal=checkManeuver(vehicle,legs,scale,(from,to)=>this.vehicleMotionClear(vehicle,from,to));
    for(const other of cluster)other.trafficRecoveryUntil=this.state.time+32;
    return yield* yieldSpace(vehicle,legs,!normal);
   }
   if(yield* yieldSpace(vehicle,legs,true))return true;
  }
  return false;
 }
 clearParkedAisle(...args){this.finishPendingStep();return completeSteps(this.clearParkedAisleSteps(...args));}
 *clearParkedAisleSteps(unit,parked,yieldSpace){
  // A boxed vehicle must drive along its row before it has room to turn.
  const scale=this.config.worldScale,fx=-Math.sin(unit.heading),fy=Math.cos(unit.heading);
  const along=other=>(other.x-unit.x)*fx+(other.y-unit.y)*fy;
  const lateral=other=>(other.x-unit.x)*fy-(other.y-unit.y)*fx;
  const allowed=(from,to)=>this.vehicleMotionClear(unit,from,to);
  const reverse=Math.max(0,scale*4-(unit.reverseDebt??0));
  const ignoreUnits=new Set([unit]);
  for(const [direction,lengths] of [[1,[10*scale,8*scale,6*scale]],[-1,[reverse]]]){
   for(const length of lengths){
    if(length<scale*3)continue;
    const legs=[{direction,curve:0,remaining:length}];
    const exit=checkManeuver(unit,legs,scale,allowed);
    if(!exit)continue;
    const path=(yield* this.vehiclePathSteps(exit,unit.task,{ignoreUnits,maxGoalDistance:8,fallback:false}));
    if(!path?.length)continue;
    const onward=yield* this.planManeuverSteps(exit,path[0],{scale,allowed,attempts:2,reverseBudget:0,maximumLegs:7});
    if(!onward)continue;
    unit.path=path;
    unit.detour={legs:[...legs,...onward],parking:false,blocked:0};
    return true;
   }
  }
  const row=parked.filter(other=>!other.detour&&!other.traffic&&Math.abs(lateral(other))<scale*1.2)
   .sort((a,b)=>along(b)-along(a));
  for(const other of row){
   const alignment=-Math.sin(other.heading)*fx+Math.cos(other.heading)*fy;
   if(Math.abs(alignment)<.72)continue;
   const advance=along(other),direction=Math.sign(alignment*advance);
   if(!direction)continue;
   const clearance=Math.max(scale*9,scale*20-Math.abs(advance));
   const canMove=(from,to)=>this.vehicleMotionClear(other,from,to);
   for(const remaining of [clearance,scale*10]){
    const legs=[{direction,curve:0,remaining}];
    if(checkManeuver(other,legs,scale,canMove)&&(yield* yieldSpace(other,legs,false)))return true;
   }
  }
  return false;
 }
 move(...args){this.finishPendingStep();return completeSteps(this.moveSteps(...args));}
 *moveSteps(unit,dt){
  if(isInfantry(unit))return this.walk(unit,dt);
  const directed=yield* this.trafficCoordinator.prepareMovementSteps(this,unit,dt);
  if(directed!==null)return directed;
  const backgroundRecovery=this.trafficCoordinator.planner?.pendingFor(unit);
  if(unit.detour?.cooperativeYield){
   const other=this.entity(unit.detour.cooperativeYield);
   if(!other||other.hp<=0||other.pendingOrder||other.commandRevision!==unit.detour.yieldingRevision
    ||other.yieldReturn?.cooperativeRequester?.id!==unit.id){delete unit.detour;delete unit.trafficHold;}
  }
  const stop=()=>{unit.driveSpeed=0;unit.steering=(unit.steering??0)*.68;};
  const idleYield=!unit.path.length&&unit.detour?.idleYield;
  if(!unit.path.length&&!idleYield){stop();delete unit.detour;delete unit.traffic;delete unit.trafficHold;delete unit.passingLane;delete unit.passage;return false;}
  const gate=unit.passage;
  const passageAdmission=this.trafficCoordinator.passageDecisions.get(unit.id);
  if(passageAdmission&&!passageAdmission.admitted&&!unit.detour&&passageAdmission.limit<.01&&(unit.driveSpeed??0)<.01){
   navigationDecision(unit,'WAITING_RESERVATION','opposing-passage-batch',passageAdmission.yieldTo,'admit-after-actual-exit');
   stop();return false;
  }
  if(gate?.preceding){
   const leader=this.entity(gate.preceding);
   const leaderGate=leader?.passage;
   const leaderAdmission=leader&&this.trafficCoordinator.passageDecisions.get(leader.id);
   const alongX=gate.along==='x'?gate.direction:0,alongY=gate.along==='y'?gate.direction:0;
   const sameFile=leader&&passageAdmission?.admitted&&leaderAdmission?.admitted
    &&passageAdmission.key===leaderAdmission.key&&!gate.egress&&!leaderGate?.egress
    &&Math.cos(unit.heading-leader.heading)>.97
    &&-Math.sin(unit.heading)*alongX+Math.cos(unit.heading)*alongY>.98
    &&Math.abs((leader.x-unit.x)*alongY-(leader.y-unit.y)*alongX)<this.config.worldScale*.3
    &&(leader.x-unit.x)*alongX+(leader.y-unit.y)*alongY
      >footprintSupport(vehicleEnvelope(unit,this.config.worldScale,this.field),alongX,alongY)
       +footprintSupport(vehicleEnvelope(leader,this.config.worldScale,this.field),alongX,alongY)+this.config.worldScale*.055+.02;
   if(leader?.hp>0&&leader.path.length&&leaderGate?.along===gate.along&&leaderGate.admit===gate.admit
    &&(leader[gate.along]-gate.admit)*gate.direction<0&&!sameFile){
    navigationDecision(unit,'WAITING_RESERVATION','passage-predecessor',leader.id,'follow-predecessor');
    stop();return false;
   }
   gate.preceding=null;
  }
  if(unit.trafficHold){
   const yielding=this.entity(unit.trafficHold),cycle=yielding?.traffic;
   if(unit.detour?.cooperativeYield===unit.trafficHold
    &&(!yielding||yielding.hp<=0||yielding.pendingOrder||yielding.commandRevision!==unit.detour.yieldingRevision)){
    delete unit.detour;delete unit.trafficHold;
   }
   if(unit.trafficHold&&(yielding?.detour?.parking||cycle?.cycle&&cycle.checkedPassage&&cycle.phase==='parked'&&cycle.leader!==unit.id)){
    navigationDecision(unit,'YIELDING','vehicle-clearing-passage',unit.trafficHold,'resume-when-clear');stop();return false;
   }
   delete unit.trafficHold;
  }
  const egress=gate?.egress;
  const scale=this.config.worldScale;
  if(egress?.phase==='approach'&&!egress.admitted&&distance(unit,egress.entry)<scale*7){
   // Replay the already planned sweep; this does not run a new path search.
   // A departing/destroyed blocker releases admission on the next step.
   if(!passageStillOpen(this,egress)){navigationDecision(unit,'WAITING_RESERVATION','exit-occupied',null,'recheck-planned-sweep');stop();return false;}
   delete egress.admitAfter;
   egress.admitted=true;
  }
  const point=unit.path[0]??unit, next=unit.path[1], d=distance(unit,point);
  const atPivot=egress?.phase==='approach'&&point.x===egress.start.x&&point.y===egress.start.y;
  const precise=!next&&['build','repair','demolish','upgrade-power'].includes(unit.task?.type);
  const preciseMove=!next&&unit.routeOrder&&!unit.task?.yieldHome
   &&['move','attack-move'].includes(unit.task?.type)&&!followsContinuation(unit);
  const tolerance=atPivot?.45:(precise||preciseMove||unit.task?.salvageId)?.65:2;
  const blockers=new Set();
  const applyPose=pose=>{
   const travelled=distance(unit,pose),debt=unit.reverseDebt??0;
   unit.reverseDebt=Math.max(0,debt+(pose.reversing?travelled:-travelled*.33));
   Object.assign(unit,pose);
   if(unit.failedArcs&&distance(unit,unit.failedArcs.origin)>2)delete unit.failedArcs;
  };
  const canRoll=(from,to,grade)=>this.vehicleMotionClear(unit,from,to,grade,blockers);
  const allowed=(from,to)=>canRoll(from,to);
  const roughAllowed=(from,to)=>canRoll(from,to,.60);
  // A nearby click beside/behind a stopped car is a parking manoeuvre, not
  // a forward-only trip around its complete turning circle. Prove the whole
  // endpoint before moving; ordinary following still handles aligned goals.
  if(!backgroundRecovery&&!unit.detour&&!unit.traffic&&!gate&&unit.path.length===1&&unit.routeOrder
   &&['move','attack-move'].includes(unit.task?.type)&&!followsContinuation(unit)
   &&d<scale*6&&(unit.driveSpeed??0)<.01
   &&Math.abs(angleDelta(Math.atan2(unit.x-point.x,point.y-unit.y),unit.heading))>vehicleDynamics(unit).steeringLimit
   &&!(this.trafficCoordinator.queueing(unit)&&this.trafficCoordinator.limit(unit)<.01)){
   const arrival=yield* checkedGoalArrival(this,unit,(from,to)=>this.vehicleMotionClear(unit,from,to)
    &&!maneuverAdmissionBlocker(this,unit,from,to,dt),pose=>borrowedHomeClear(this,unit,pose));
   if(unit.pendingOrder||unit.hp<=0)return false;
   if(arrival)unit.detour={legs:arrival,parking:false,arrival:true,blocked:0,passedWaypoints:unit.path.map(p=>({...p})),
    reservedCorridor:reserveManeuverCorridor(this,unit,arrival)};
  }

  const advancingThroughExit=other=>{
   const otherExit=other?.passage?.egress;
   return egress&&other?.hp>0&&other.path.length&&otherExit?.phase==='turning'
    &&otherExit.start.x===egress.start.x&&otherExit.start.y===egress.start.y;
  };
  if(egress?.phase==='waiting'||atPivot&&d<tolerance){
   if(atPivot){unit.path.shift();egress.phase='waiting';}
   const leader=this.entity(egress.leader);
   const awaitingLeader=leader?.hp>0&&leader.path.length&&leader.passage?.egress
    &&(!advancingThroughExit(leader)||distance(unit,leader)<scale*8);
   if(awaitingLeader){
    navigationDecision(unit,'WAITING_RESERVATION','predecessor-in-exit',leader.id,'follow-predecessor');
    stop();return false;
   }
   // Moving vehicles ahead can clear the planned arc before this unit gets
   // there. The actual step still sweeps against every vehicle.
   const obstacles=this.state.units.filter(other=>!advancingThroughExit(other));
   const exitClear=(from,to)=>this.vehicleMotionClear(unit,from,to,.52,undefined,obstacles);
   const end=checkManeuver(unit,egress.legs,scale,exitClear);
   let legs=end&&distance(end,egress.end)<scale*1.4?egress.legs:null;
   const retryCondition=!legs?recoveryConditions(this,unit,scale*37)+'|'+egress.end.x+','+egress.end.y+','+egress.end.heading:null;
   if(!legs){
    // The previous sweep is still checked every tick. A failed alternative
    // search is reused only while its physical search region is unchanged;
    // an opening beside that sweep must not wait for a retry timer.
    if(unchangedRecoveryFailure(egress,retryCondition,this.state.time)){navigationDecision(unit,'BLOCKED','exit-sweep-blocked',null,'retry-after-delay-or-change');stop();return false;}
    legs=yield* this.planManeuverSteps(unit,egress.end,{scale,allowed:exitClear,attempts:3,maximumLegs:25,reverseBudget:0,
     accept:pose=>distance(pose,egress.end)<scale*.65&&Math.cos(pose.heading-egress.end.heading)>.94
      &&this.nav.lineClear(pose,egress.end,false,true)});
   }
   if(!legs){rememberRecoveryFailure(egress,retryCondition,this.state.time);navigationDecision(unit,'BLOCKED','no-local-exit',null,'retry-after-delay-or-change');stop();return false;}
   delete egress.retryAt;
   unit.detour={legs:legs.map(leg=>({...leg})),passageExit:true,blocked:0};
   egress.phase='turning';
  }

  const traffic=unit.traffic;
  if(traffic){
   if(traffic.cycle){
    if(traffic.phase==='parked'&&(yield* resumeCycleRoute(this,unit)))return false;
   }else{
   const leader=this.entity(traffic.leader),age=this.state.time-traffic.since;
   const passed=traffic.forward&&leader
    &&(unit.x-leader.x)*traffic.forward.x+(unit.y-leader.y)*traffic.forward.y < -scale*2.5;
   if(!leader?.path.length||distance(unit,leader)>scale*10||age>9||passed){
    delete unit.traffic;unit.trafficRest=this.state.time+1.2;
    if(unit.detour?.parking)delete unit.detour;
   }else if(traffic.phase==='parked'){
    navigationDecision(unit,'YIELDING','reserved-passing-order',leader.id,'resume-after-passing');
    stop();return false;
   }else if(traffic.phase==='seek'&&!unit.detour){
    const park=yield* this.parkingManeuverSteps(unit,leader,allowed);
    if(park){
     unit.detour={legs:park.legs,parking:true,blocked:0};
     traffic.phase='move';traffic.forward=park.forward;
    }
    else{delete unit.traffic;unit.trafficRest=this.state.time+2;}
   }
   }
  }
  const pickup=!next&&unit.task?.salvageId&&this.state.salvage.items.find(item=>item.id===unit.task.salvageId);
  if(pickup&&!unit.detour&&d<scale*6&&this.state.time>=(unit.pickupRetryAt??0)){
   const touches=pose=>touchesSalvage({...pose,previousX:pose.x,previousY:pose.y,previousHeading:pose.heading},pickup,scale);
   if(!touches(unit)){
    const legs=yield* this.planManeuverSteps(unit,pickup,{scale,allowed,attempts:2,maximumLegs:8,reverseBudget:scale*6,accept:touches});
    if(legs)unit.detour={legs,blocked:0,pickup:true};
    else unit.pickupRetryAt=this.state.time+1;
   }
  }
  if(unit.detour){
   const plan=unit.detour,leg=plan.legs[0];
   // A coordinated passage is one manoeuvre, even when its proof contains
   // many short arcs. Brake at its end or a gear change, rather than nearly
   // stopping at every same-direction sampling boundary of the shared plan.
   const throughSpeed=plan.departure?plan.departureSpeed??13:plan.legs[1]?.direction===leg.direction
    ?plan.passageExit?16:plan.cyclePassage||plan.cooperativeYield||plan.preciseArrival?vehicleDynamics(unit).maneuverForward:plan.parking&&!plan.rough?8:0:0;
   const detourAllowed=plan.rough?roughAllowed:allowed;
   const admitted=(from,to)=>{
    if(!detourAllowed(from,to))return false;
    if(!plan.departure){
     const blocker=maneuverAdmissionBlocker(this,unit,from,to,dt);
     if(blocker){blockers.add(blocker);return false;}
    }
    return true;
   };
   const step=plan.continuousPassage&&!plan.rough?maneuverPlanStep(unit,plan.legs,dt,{scale,allowed:admitted})
    :maneuverStep(unit,leg,dt,{scale,allowed:admitted,crawl:!!plan.rough,
     throughSpeed,forwardSpeed:plan.departure?plan.departureSpeed??13:plan.passageExit?18:vehicleDynamics(unit).maneuverForward});
   if(step){
    applyPose(step.pose);
    for(const part of step.consumed??[{leg,length:step.length}]){
     recordYieldStep(unit,plan,part.leg,part.length);
     part.leg.remaining-=part.length;
     if(part.leg.remaining<1e-6)plan.legs.shift();
    }
    plan.blocked=0;
    if(leg.remaining<1e-6){
     if(plan.legs[0]?.direction!==leg.direction&&!(plan.departure&&!plan.legs.length&&unit.path.length))unit.driveSpeed=0;
    }
    if(!plan.legs.length){
     if(plan.cooperativeBackoff){
      const other=this.entity(plan.cooperativeYield),stages=plan.cooperativeBackoff,origin=stages.otherStart;
      if(other?.hp>0&&!other.pendingOrder&&other.commandRevision===plan.yieldingRevision
       &&other.x===origin.x&&other.y===origin.y&&other.heading===origin.heading
       &&checkManeuver(other,stages.park,scale,(from,to)=>this.vehicleMotionClear(other,from,to)
        &&!maneuverAdmissionBlocker(this,other,from,to,dt))){
       other.detour={legs:stages.park,parking:true,idleYield:true,blocked:0};
       unit.detour={...plan,legs:stages.arrival,cooperativeBackoff:null,preciseArrival:true,passedWaypoints:plan.passedWaypointsAfterBackoff};
       delete unit.detour.passedWaypointsAfterBackoff;
       unit.trafficHold=other.id;
      }
     }
     if(plan.cyclePassage){
      const yielding=this.entity(plan.cyclePassage);
      if(yielding?.traffic?.leader===unit.id)yielding.traffic.passageComplete=true;
     }
      for(const passed of plan.passedWaypoints??[]){
       if(unit.path[0]?.x!==passed.x||unit.path[0]?.y!==passed.y)break;
       unit.path.shift();
      }
     if(plan.yieldReturning)delete unit.yieldReturn;
     if(plan.yieldHandoff){
      const other=this.entity(plan.yieldHandoff.id),legs=plan.yieldHandoff.legs;
      if(other?.hp>0&&!other.path.length&&!other.task&&!other.detour
       &&checkManeuver(other,legs,scale,(from,to)=>this.vehicleMotionClear(other,from,to))){
       yield* checkedYieldPassage(this,unit,other,legs);
      }
     }
     if(plan.parking&&unit.traffic)unit.traffic.phase='parked';
     if(plan.passageExit&&gate)delete gate.egress;
     if(unit.detour===plan)delete unit.detour;delete unit.driveWatch;
    }
    return true;
   }
   stop();
   navigationDecision(unit,'BLOCKED','manoeuvre-sweep-blocked',blockers.values().next().value?.id??null,'local-recovery');
   if(backgroundRecovery)return false;
   if(leg.direction<0&&blockers.size&&!plan.parking&&!plan.idleYield&&!plan.yieldReturning
    &&!plan.departure&&!plan.passageExit&&!plan.progressRecovery&&unit.path.length
    &&(point.x-unit.x)*-Math.sin(unit.heading)+(point.y-unit.y)*Math.cos(unit.heading)>0
    &&(yield* checkedRouteShortcut(this,unit,point,{allowed,tolerance}))){
    // Traffic may have cleared the original route while a reverse recovery
    // was being executed. Cancel only after proving the complete connector;
    // normal motion still applies its live headway and reservation checks.
    delete unit.detour;delete unit.driveWatch;
    return yield* this.moveSteps(unit,dt);
   }
   if(plan.passageExit&&[...blockers].some(advancingThroughExit))return false;
   const alternative=yield* checkedDetourAlternative(this,unit,plan,point,admitted,dt);
   if(unit.detour!==plan||unit.pendingOrder||unit.hp<=0)return false;
   if(alternative){unit.detour={legs:alternative,parking:false,blocked:0};return false;}
   plan.blocked+=dt;
   if(plan.blocked<1)return false;
   if(plan.passageExit&&egress){
    // Resume from the current pose using only the untraversed part of the arc.
    egress.legs=plan.legs.map(leg=>({...leg}));
    egress.phase='waiting';delete egress.retryAt;
    delete unit.detour;
    return false;
   }
   if(!blockers.size&&!plan.parking&&!plan.rough){
    const failed=unit.failedArcs??={origin:{x:unit.x,y:unit.y},legs:[]};
    failed.legs.push({direction:leg.direction,curve:leg.curve});
   }
   if(plan.parking&&unit.traffic){
    if(unit.traffic.cycle)delete unit.traffic;
    else unit.traffic.phase='seek';
   }
   delete unit.detour;
  }
  if(idleYield)return false;

  const repair=unit.task?.type==='repair';
  const workTarget=repair||precise&&d<4?this.entity(unit.task.targetId):null;
  const targetStopped=!repair||workTarget&&(!this.config.units[workTarget.kind]||Math.hypot(workTarget.x-workTarget.previousX,workTarget.y-workTarget.previousY)<.05);
  const atWork=workTarget&&targetStopped&&this.canWorkHere(unit,workTarget);
  const canRoundCorner=!atPivot&&next&&d<Math.max(5,Math.min(10,(unit.driveSpeed??0)*.42))
   &&this.nav.lineClear(unit,next,false,true);
  if(atWork&&repair){
   unit.path.length=0;
   stop();
   return true;
  }
  const finalTravel=!next&&!followsContinuation(unit)&&['move','attack-move'].includes(unit.task?.type);
  const fitsBorrowedHome=!finalTravel||borrowedHomeClear(this,unit);
  if(!backgroundRecovery&&finalTravel&&!fitsBorrowedHome&&d<scale*.7){
   const parking=yield* this.planManeuverSteps(unit,unit.task,{scale,allowed,attempts:2,
    tolerance:.5,maximumLegs:8,reverseBudget:scale*3,
    accept:pose=>distance(pose,unit.task)<1.95&&borrowedHomeClear(this,unit,pose)});
   if(parking){unit.detour={legs:parking,arrival:true,parking:false,blocked:0};return false;}
  }
  // A position within the normal driving tolerance can still be outside the
  // projector's reach at the top layer. Keep driving to the checked work spot.
  if(atWork||d<(precise?workArrivalTolerance:tolerance)&&fitsBorrowedHome||canRoundCorner){
   unit.path.shift();
   if(!unit.path.length)stop();
   return true;
  }
  const course={x:(point.x-unit.x)/d,y:(point.y-unit.y)/d};
  const cruising=!precise&&unit.task?.type!=='clear-site';
  const planned=this.trafficCoordinator.intents.get(unit.id);
  const {waypoint,roadLane,course:motionCourse}=planned?.point===point?planned:this.drivingIntent(unit,point,course,scale);
  const remaining=distance(unit,waypoint);
  const grade=0;
  const forward={x:-Math.sin(unit.heading),y:Math.cos(unit.heading)};
  const aligned=forward.x*motionCourse.x+forward.y*motionCourse.y>.72;
  // Braking for a parked van can stop us before a movement sweep ever hits it.
  const stoppedObstacles=new Set();
  const coordinatorLimit=this.trafficCoordinator.limit(unit);
  const curving=Math.abs(angleDelta(Math.atan2(unit.x-waypoint.x,waypoint.y-unit.y),unit.heading))>1e-4/1.55;
  // A curve has its own swept braking corridor below. Requiring the straight
  // projected corridor as well can freeze two safe turning arcs forever.
  // Shared intersection/passing priority still constrains every candidate.
  const checkingTurn=cruising&&!aligned;
  let trafficLimit=curving?coordinatorLimit:cruising&&aligned?this.trafficSpeed(unit,motionCourse,roadLane,scale,stoppedObstacles)
   :checkingTurn?Math.min(coordinatorLimit,this.trafficSpeed(unit,forward,null,scale,stoppedObstacles)):coordinatorLimit;
  const speed=retreatSpeed(unit,this.unitSpec(unit).speed*this.nav.roads.factor(unit.x,unit.y)*damageMobility(unit.damage));
  if(unit.navigation)unit.navigation.desiredSpeed=speed;
  const reverseLimit=unit.task?.type==='clear-site'?scale*4:precise?scale*1.5:0;
  const reverseApproach=remaining<reverseLimit
   &&Math.abs(angleDelta(Math.atan2(unit.x-waypoint.x,waypoint.y-unit.y),unit.heading))>(unit.reversing?Math.PI*.47:Math.PI*.61);
  // A work approach still has the same physical body and braking distance.
  // Precision changes endpoint tolerance, not whether it brakes for a car.
  if(!curving&&!cruising&&!reverseApproach)trafficLimit=Math.min(trafficLimit,this.trafficSpeed(unit,forward,null,scale,stoppedObstacles));
  const steeringLimit=vehicleDynamics(unit).steeringLimit;
  const requestedCurve=Math.tan(clamp(angleDelta(Math.atan2(unit.x-waypoint.x,waypoint.y-unit.y),unit.heading)*1.55,-steeringLimit,steeringLimit));
  const requestedLimit=reverseApproach?Infinity:turningHeadway(this,unit,waypoint,dt,scale,stoppedObstacles,.52,requestedCurve);
  const commonTrafficLimit=trafficLimit;
  if(!reverseApproach)trafficLimit=Math.min(trafficLimit,requestedLimit);
  let contactSpeed;
  const onBlockedContact=speed=>{contactSpeed=speed;};
  let pose=driveStep(unit,waypoint,dt,{speed,grade,scale,tolerance,trafficLimit:commonTrafficLimit,
   reverseLimit,allowed,onBlockedContact,
   curveLimit:reverseApproach?undefined:curve=>curve===requestedCurve?requestedLimit
    :turningHeadway(this,unit,waypoint,dt,scale,stoppedObstacles,.52,curve)});
  if(!pose&&aligned&&cruising&&trafficLimit>speed*.25&&[...blockers].some(other=>
   other.owner===unit.owner&&Math.cos(unit.heading-other.heading)>.85)){
   const forward={x:unit.x-Math.sin(unit.heading)*scale*6,y:unit.y+Math.cos(unit.heading)*scale*6};
   pose=driveStep(unit,forward,dt,{speed:Math.min(9,speed),grade,scale,tolerance,allowed,onBlockedContact});
  }
  const impactSpeed=pose?.impactSpeed??(!pose?contactSpeed:undefined);if(pose)delete pose.impactSpeed;
  if((!pose||pose.driveSpeed<=.01)&&trafficLimit<=.01&&!blockers.size){
   const decision=this.trafficCoordinator.decisions.get(unit.id);
   const merge=Object.values(unit.mergeTraffic??{}).find(item=>item.leader!==unit.id&&this.entity(item.leader)?.hp>0);
   const junctionStopped=decision?.limit<=.01;
   const physical=[...stoppedObstacles].map(other=>other.id);
   const dependencies=[...physical,...this.trafficCoordinator.blockingVehicles(unit),
    ...(!physical.length&&!junctionStopped?[merge?.leader??unit.passingLane?.otherId].filter(Boolean):[])];
   navigationDecision(unit,'YIELDING',physical.length?'headway':junctionStopped?'junction-reservation':merge?'road-merge':'headway',dependencies,'resume-when-clear',speed);
  }
  else if(!pose)navigationDecision(unit,'BLOCKED',blockers.size?'vehicle-sweep-blocked':'terrain-or-steering-blocked',blockers.values().next().value?.id??null,'local-recovery',speed);
  if(pose)applyPose(pose);else stop();
  if(impactSpeed){this.vehicleCollision(unit,impactSpeed,blockers);if(unit.hp<=0)return !!pose;}
  if(backgroundRecovery)return !!pose;
  if(!pose&&commonTrafficLimit>0&&!gate&&!unit.combatParking
   &&['move','attack-move'].includes(unit.task?.type)
   &&[...blockers,...stoppedObstacles].some(other=>other.hp>0&&(other.driveSpeed??0)<.01)){
   const rejoin=yield* checkedRouteRejoin(this,unit,point,(from,to)=>this.vehicleMotionClear(unit,from,to)
    &&!maneuverAdmissionBlocker(this,unit,from,to,dt),dt);
   if(unit.pendingOrder||unit.hp<=0)return false;
   if(rejoin){unit.detour={legs:rejoin,parking:false,progressRecovery:true,blocked:0};return false;}
  }
  if(!pose&&trafficLimit>0&&!blockers.size&&!stoppedObstacles.size
   &&['move','attack-move','combat-position'].includes(unit.task?.type)
   &&(unit.reverseDebt??0)>=scale*3.4&&(point.x-unit.x)*forward.x+(point.y-unit.y)*forward.y<0){
   const destination=unit.routeOrder?.destination??unit.task;
   const escape=yield* checkedProgressTurn(this,unit,point,destination,allowed);
   if(escape){unit.detour={legs:escape,parking:false,progressRecovery:true,blocked:0};return false;}
  }

  if(unit.passingLane&&(unit.driveSpeed??0)<scale*.18
   &&this.trafficCoordinator.intents.get(unit.id)?.trafficLimit===0
   &&(yield* this.requestPassageSteps(unit,blockers)))return !!pose;

  let watch=unit.driveWatch;
  const resuming=unit.trafficRecoveryUntil>this.state.time;
  if(!watch||watch.x!==point.x||watch.y!==point.y){
   const sameFailure=watch?.origin&&distance(unit,watch.origin)<scale*.25;
   // Large formations must not all launch a costly recovery search on the
   // same tick. Only the first retry is staggered; collisions stay immediate.
   let phase=0;
   if(this.state.units.length>=128){let hash=0;for(const c of unit.id)hash=(hash*31+c.charCodeAt(0))>>>0;phase=(hash%10)*.1;}
   watch=unit.driveWatch={x:point.x,y:point.y,distance:d,elapsed:-phase,blocked:-phase,
    origin:sameFailure?watch.origin:{x:unit.x,y:unit.y},
    attempts:resuming||sameFailure?(watch?.attempts??0):0,stalledAt:resuming?watch?.stalledAt:undefined};
  }
  watch.elapsed+=dt;
  watch.blocked=pose?0:(watch.blocked??0)+dt;
  const waiting=trafficLimit<speed*.3&&!blockers.size&&(!pose||pose.driveSpeed<speed*.14);
  const mergeQueue=waiting&&Object.values(unit.mergeTraffic??{}).some(lease=>{
   const leader=this.entity(lease.leader);
   return lease.leader!==unit.id&&lease.expires>=this.state.time&&leader?.hp>0&&leader.path.length
    &&(planned?.point===point&&planned.mergeYieldTo===leader.id
     ||roadLane&&lease.path===roadLane.path&&lease.direction===roadLane.direction);
  });
  // A low speed limit is not itself a queue: the steering probe can also
  // fail on terrain. Only a live reservation/merge dependency suspends
  // recovery; otherwise a safe alternative arc must be attempted now.
  const queued=waiting&&!this.navigationDiagnostics?.deadlockedIds?.has(unit.id)
   &&(commonTrafficLimit<speed*.3&&this.trafficCoordinator.queueing(unit)||mergeQueue);
  watch.queued=queued;
  if(queued){
   // A named queue gets a short grace period. Only actual progress renews
   // it; a stopped leader must not erase this car's recovery clock forever.
   if(watch.queueSince===undefined||d<(watch.queueDistance??d)-scale*.5){
    watch.queueSince=this.state.time;watch.queueDistance=d;
   }
   if(this.state.time-watch.queueSince<2.1)return !!pose;
  }else{delete watch.queueSince;delete watch.queueDistance;}
  const stoppedPair=()=>!pose&&!gate&&!unit.traffic&&blockers?.size===1&&[...blockers].some(other=>other.owner===unit.owner
   &&other.path.length&&!other.traffic&&!other.passage&&(other.driveSpeed??0)<scale*.18
   &&vehicleClearance(unit,other,scale,this.field)>=scale*.52);
  const nearbyStall=!pose&&!gate&&!unit.traffic&&(stoppedObstacles.size||[...blockers].some(other=>
   other.hp>0&&other.owner===unit.owner&&(other.driveSpeed??0)<scale*.18));
  const blockDelay=stoppedPair() ? .55 : nearbyStall&&this.state.units.length<128 ? .35 : .85;
  if(watch.elapsed<2.1&&watch.blocked<blockDelay)return !!pose;
  const jammed=watch.distance-d<2.2||watch.blocked>=blockDelay;
  watch.distance=d;watch.elapsed=0;watch.blocked=0;
  if(!jammed){watch.attempts=0;delete watch.stalledAt;return !!pose;}
  const recoveryCondition=!pose?recoveryConditions(this,unit):null;
  if(recoveryCondition&&unchangedRecoveryFailure(unit,recoveryCondition,this.state.time)){
   navigationDecision(unit,'BLOCKED','unchanged-local-obstruction',blockers.values().next().value?.id
    ??stoppedObstacles.values().next().value?.id??null,'retry-after-delay-or-change',speed);
   return false;
  }
  const recoveryRoute=unit.path.map(point=>point.x+','+point.y).join(';');
  if(resuming&&(!watch.stalledAt||distance(unit,watch.stalledAt)>=scale*.75)){
   watch.stalledAt={x:unit.x,y:unit.y};watch.attempts=0;
  }
  watch.attempts=(watch.attempts??0)+1;
  if(egress?.phase==='approach'){
   if(blockers.size||trafficLimit<speed*.4)return !!pose;
   const local=yield* this.planManeuverSteps(unit,point,{scale,allowed,tolerance,attempts:2,reverseBudget:scale*2,maximumLegs:5});
   if(local)unit.detour={legs:local,parking:false,blocked:0};
   return !!pose;
  }
  const target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  const travel=['move','attack-move','combat-position'].includes(unit.task?.type);
  const fixedGoal=travel&&(unit.routeOrder||followsContinuation(unit))&&!unit.combatParking;
  if(fixedGoal&&!gate&&!followsContinuation(unit)){
   const arrival=yield* checkedGoalArrival(this,unit,(from,to)=>this.vehicleMotionClear(unit,from,to)
    &&!maneuverAdmissionBlocker(this,unit,from,to,dt),pose=>borrowedHomeClear(this,unit,pose));
   if(unit.pendingOrder||unit.hp<=0)return false;
   if(arrival){unit.detour={legs:arrival,parking:false,arrival:true,blocked:0,passedWaypoints:unit.path.map(p=>({...p})),
    reservedCorridor:reserveManeuverCorridor(this,unit,arrival)};return !!pose;}
  }
  if(travel&&stoppedPair()&&(yield* this.recoverTrafficClusterSteps(unit,false,blockers)))return !!pose;
  for(const other of stoppedObstacles)blockers.add(other);
  // A parked yielder and the vehicle waiting for it form a temporary queue.
  // Give that queue time to clear before planning a detour around both hulls.
  const clearingTraffic=travel&&[...blockers].some(other=>other.owner===unit.owner&&other.hp>0
   &&(other.detour?.parking||other.traffic?.phase==='parked'||this.entity(other.trafficHold)?.detour?.parking));
  if(clearingTraffic){
   watch.trafficWaitAt??=this.state.time;
   if(this.state.time-watch.trafficWaitAt<4)return !!pose;
  }else delete watch.trafficWaitAt;
  // With legacy overlaps, small side nudges can create new obstructions
  // along the one straight aisle that still permits a checked exit.
  if(travel&&!pose&&watch.attempts<=2&&unit.owner==='rai'&&[...blockers].some(other=>
   other.owner===unit.owner&&other.hp>0&&!other.path.length&&vehicleClearance(unit,other,scale,this.field)<0)
   &&(yield* this.recoverTrafficClusterSteps(unit,true,blockers,{aisleOnly:true})))return !!pose;
  if(yield* this.requestPassageSteps(unit,blockers))return !!pose;
  const destination=followsContinuation(unit)?unit.path.at(-1)??unit.routeContinuation.frontier
   :travel||unit.task?.type==='clear-site'?unit.task:unit.path.at(-1);
  const stalledNearParked=travel&&[...blockers].some(other=>!other.path.length);
  const routeStale=stalledNearParked&&unit.trafficReplan&&distance(unit,unit.trafficReplan)<scale*.7
   &&this.state.time-unit.trafficReplan.time<4;
  if(blockers.size&&watch.attempts%2===1&&!routeStale){
   const bypass=(yield* this.vehiclePathSteps(unit,destination,{avoidMoving:true,fallback:false,maxGoalDistance:precise||fixedGoal?.01:8}));
   if(bypass?.length&&distance(bypass[0],point)>4&&distance(unit,bypass[0])>4){
    unit.path=bypass;
    if(stalledNearParked)unit.trafficReplan={x:unit.x,y:unit.y,time:this.state.time};
    return !!pose;
   }
  }
  const reverseBudget=Math.max(0,scale*4-(unit.reverseDebt??0));
  const maneuverOptions={scale,allowed,tolerance,attempts:watch.attempts,failedArcs:unit.failedArcs?.legs??[]};
  // A coarse grid corner can end up behind a vehicle that has already
  // cleared it while yielding. Repeatedly accepting a small manoeuvre back
  // toward that corner prevents the later route-repair branch from running.
  // Discard only an intermediate point, and only after checking a complete
  // kinematic connector to its successor against terrain and every hull.
  const behind=(point.x-unit.x)*forward.x+(point.y-unit.y)*forward.y<0;
  const passedCorner=next&&(unit.x-point.x)*(next.x-point.x)+(unit.y-point.y)*(next.y-point.y)>0;
  const cornerPose={...point,heading:unit.heading,kind:unit.kind};
  const cornerBlockers=new Set();
  const occupiedCorner=next&&!this.vehicleMotionClear(unit,cornerPose,cornerPose,.52,cornerBlockers);
  if(occupiedCorner&&watch.attempts>=2){
   if(cornerBlockers.size&&(yield* this.requestPassageSteps(unit,cornerBlockers)))return !!pose;
   const replacement=yield* this.vehiclePathSteps(unit,destination,{avoidMoving:true,avoidPoint:point,
    fallback:false,maxGoalDistance:fixedGoal ? .01 : 8});
   if(replacement?.length&&distance(replacement[0],point)>4){
    unit.path=replacement;delete unit.driveWatch;delete unit.failedArcs;return !!pose;
   }
  }
  if(next&&(behind&&passedCorner||occupiedCorner)&&watch.attempts>=2){
   for(let index=Math.min(2,unit.path.length-1);index>=1;index--){
    const successor=unit.path[index];if(distance(unit,successor)>=scale*12)continue;
    const connector=yield* this.planManeuverSteps(unit,successor,{scale,allowed,attempts:2,
     maximumLegs:14,reverseBudget,accept:pose=>distance(pose,successor)<tolerance});
    if(connector){
     // Retain normal headway/traffic control while following the connector;
     // its feasibility proof does not reserve moving neighbours in time.
     unit.path.splice(0,index);
     delete unit.driveWatch;delete unit.failedArcs;
     return !!pose;
    }
   }
  }
  // A temporary connector around a former queue can remain ahead of us,
  // yet be too close to reach with the current steering radius. Prove the
  // entire drive to its successor, including long final segments, before
  // dropping that intermediate point. Passage pivots retain their contract.
  if(next&&travel&&!gate&&watch.attempts>=2){
   for(let index=Math.min(2,unit.path.length-1);index>=1;index--){
    if(yield* checkedRouteShortcut(this,unit,unit.path[index],{
     allowed:(from,to)=>this.vehicleMotionClear(unit,from,to),tolerance})){
     unit.path.splice(0,index);delete unit.driveWatch;delete unit.failedArcs;
     return !!pose;
    }
   }
  }
  const legs=(yield* this.planManeuverSteps(unit,point,{...maneuverOptions,reverseBudget:0}))
   ??(reverseBudget>=scale*.6?(yield* this.planManeuverSteps(unit,point,{...maneuverOptions,reverseBudget})):null);
  if(legs){unit.detour={legs,parking:false,blocked:0};return !!pose;}
  if(target&&['build','repair','demolish','upgrade-power'].includes(unit.task.type)&&watch.attempts>=2&&this.state.time>=(unit.workEscapeRetryAt??0)){
   unit.workEscapeRetryAt=this.state.time+4;
   const escape=yield* this.workRouteExitSteps(unit,destination);
   if(escape){
    unit.path=escape.path;
    unit.detour={legs:escape.legs,parking:false,blocked:0};
    return !!pose;
   }
  }
  if(blockers.size&&(watch.attempts>=2||travel&&stoppedPair())&&unit.task?.type!=='clear-site'){
   if((yield* this.recoverTrafficClusterSteps(unit,false,blockers))
    ||travel&&unit.owner==='rai'&&(yield* this.recoverTrafficClusterSteps(unit,true,blockers)))return !!pose;
  }
  if(!blockers.size&&watch.attempts>=2){
   const [col,row]=this.nav.grid(unit.x,unit.y),steepStart=!this.nav.walkable[row*this.nav.size+col];
   if((resuming&&travel&&next||steepStart&&!precise&&unit.owner==='rai')&&watch.attempts%4===2){
    // The cheapest grid waypoint can be behind a vehicle facing up a slope.
    // Find a reachable start pose and validate the turn onto its new route.
    const lengths=[scale*7,scale*5,scale*3];
    if(steepStart&&reverseBudget>=scale)lengths.unshift(-Math.min(reverseBudget,scale*2));
    for(const length of lengths){
     const first={direction:Math.sign(length),curve:0,remaining:Math.abs(length)};
     const exit=checkManeuver(unit,[first],scale,roughAllowed);
     if(!exit)continue;
     const path=(yield* this.vehiclePathSteps(exit,destination,{ignoreUnits:new Set([unit]),avoidMoving:true,fallback:false,maxGoalDistance:fixedGoal?.01:8}));
     if(!path?.length)continue;
     const onward=yield* this.planManeuverSteps(exit,path[0],{scale,allowed:roughAllowed,attempts:2,reverseBudget:0,maximumLegs:5});
     if(!onward)continue;
     unit.path=path;
     unit.detour={legs:[first,...onward],parking:false,rough:true,blocked:0};
     return !!pose;
    }
   }
   const rough=yield* this.planManeuverSteps(unit,point,{...maneuverOptions,allowed:roughAllowed,
    failedArcs:[],maximumLegs:5,reverseBudget});
   if(rough){unit.detour={legs:rough,parking:false,rough:true,blocked:0};return !!pose;}
  }
  if(next&&watch.attempts>=2){
   const alternative=(yield* this.vehiclePathSteps(unit,destination,{avoidMoving:true,avoidPoint:point,fallback:false,maxGoalDistance:precise||fixedGoal?.01:12}));
   if(alternative?.length&&distance(alternative[0],point)>4){
    unit.path=alternative;return !!pose;
   }
   if(distance(unit,next)<scale*10){
    const around=yield* this.planManeuverSteps(unit,next,{...maneuverOptions,reverseBudget});
    if(around){unit.path.shift();unit.detour={legs:around,parking:false,blocked:0};return !!pose;}
   }
  }
  if(target&&['build','repair','demolish','upgrade-power'].includes(unit.task.type))unit.path=(yield* this.workPathSteps(unit,target))??unit.path;
  else if(target&&unit.task.type==='attack')unit.path=(yield* this.attackPathSteps(unit,target))??unit.path;
  else if(travel&&!unit.combatParking&&watch.attempts>=3&&distance(unit,destination)<scale*12){
   const parkingAllowed=point=>gate?.parkingEdge===undefined||(point[gate.along]-gate.parkingEdge)*gate.direction>=0;
   if(!next&&d<scale*5.5&&watch.attempts%5===3){
    const parking=yield* this.nearbyParkingSteps(unit,destination,allowed,reverseBudget,parkingAllowed);
    if(parking&&(!fixedGoal||this.nav.lineClear(parking.point,destination,false,true))){
     // Parking is an intermediate recovery manoeuvre. It cannot silently
     // replace the accepted destination of a player's movement order.
     unit.path=fixedGoal?[parking.point,{x:destination.x,y:destination.y}]:[parking.point];
     if(!fixedGoal)Object.assign(unit.task,parking.point);
     unit.detour={legs:parking.legs,parking:false,blocked:0};
     return !!pose;
    }
   }
   const parking=(yield* this.movePathSteps(unit,destination,[],scale*14,false,parkingAllowed));
   if(parking?.length&&distance(parking.at(-1),destination)>2
    &&(!fixedGoal||this.nav.lineClear(parking.at(-1),destination,false,true))){
    unit.path=fixedGoal?[...parking,{x:destination.x,y:destination.y}]:parking;
    if(!fixedGoal)Object.assign(unit.task,parking.at(-1));
   }
  }else{
   // Parked bodies can close the coarse occupancy grid around an otherwise
   // valid accepted slot. Do not retain a route through a newly built wall
   // just because the body-aware search failed. A terrain/building route
   // keeps the same exact destination; live hull checks still govern travel.
   const blockedStaticLeg=!this.nav.lineClear(unit,point,false,true);
   unit.path=(yield* this.vehiclePathSteps(unit,destination,{avoidMoving:true,
    maxGoalDistance:precise||fixedGoal?.01:unit.combatParking?4:16,
    fallback:!unit.combatParking&&(!fixedGoal||blockedStaticLeg)}))??unit.path;
  }
  if(recoveryCondition&&watch.attempts>=3&&!unit.detour&&unit.path.map(point=>point.x+','+point.y).join(';')===recoveryRoute)
   rememberRecoveryFailure(unit,recoveryCondition,this.state.time);
  return !!pose;
 }
 nearbyParking(...args){this.finishPendingStep();return completeSteps(this.nearbyParkingSteps(...args));}
 *nearbyParkingSteps(unit,goal,allowed,reverseBudget,parkingAllowed){
  const scale=this.config.worldScale;
  const initialDistance=distance(unit,goal),candidates=[];
  for(const radius of [scale*1.5,scale*2.6,scale*3.7]){
   for(let index=0;index<8;index++){
    const angle=index*Math.PI/4;
    const point={x:goal.x+Math.cos(angle)*radius,y:goal.y+Math.sin(angle)*radius};
    if(!parkingAllowed(point))continue;
    const travel=distance(unit,point);
    if(travel<scale*.45||travel>Math.min(initialDistance+4,scale*4.7))continue;
    const heading=Math.atan2(unit.x-point.x,point.y-unit.y);
    const pose={...point,heading,kind:unit.kind};
    if(!this.vehicleMotionClear(unit,pose,pose))continue;
    const turn=Math.abs(angleDelta(heading,unit.heading));
    candidates.push({point,score:radius+turn*scale*.85+travel*.12});
   }
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const {point} of candidates.slice(0,7)){
   const legs=yield* this.planManeuverSteps(unit,point,{scale,allowed,attempts:2,maximumLegs:6,reverseBudget,
    accept:pose=>distance(pose,point)<1.8});
   if(legs)return {point,legs};
  }
  return null;
 }
 projectorAim(unit,target){
  const aim=workProjection(unit,target,this.config,this.field);
  return aim&&projectorHasSight(aim,unit,target,this.state.units,this.field,this.config.worldScale,this.state.buildings,this.config.buildings)?aim:null;
 }
 canWorkHere(unit,target){
  if(!target||!clearOfVehicles(unit,unit,this.state.units,this.config.worldScale,true))return false;
  if(!this.projectorAim(unit,target))return false;
  return true;
 }
 updateBuilder(...args){this.finishPendingStep();return completeSteps(this.updateBuilderSteps(...args));}
 *updateBuilderSteps(unit,dt){
  unit.builderWorking=false;
  unit.builderContact=null;
  unit.projector??={yaw:0,pitch:0};
  releaseInvalidRepairTarget(this,unit);
  yield* assignAutomaticRepair(this,unit);
  let target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  const job=unit.task?.type;
  if(unit.task?.targetId&&(!target||job==='build'&&target.completed||job==='repair'&&target.hp>=target.maxHp||job==='demolish'&&!canDemolish(this,target)||job==='upgrade-power'&&target.powerModule)){
   unit.task=null;unit.path=[];target=null;
  }
  const working=target&&['build','repair','demolish','upgrade-power'].includes(job)&&!target.clearing;
  const moving=working&&this.config.units[target.kind]&&Math.hypot(target.x-target.previousX,target.y-target.previousY)>.05;
  const parked=working&&!moving&&this.canWorkHere(unit,target);
  if(parked){
   unit.path=[];unit.driveSpeed=0;
   for(const key of ['detour','driveWatch','trafficHold','routeOrder','routeContinuation'])delete unit[key];
  }
  const aim=parked&&!moving?this.projectorAim(unit,target):null;
  const requested=aim??{yaw:0,pitch:0};
  const yawError=angleDelta(requested.yaw,unit.projector.yaw), pitchError=requested.pitch-unit.projector.pitch;
  const previousYaw=unit.projector.yaw,previousPitch=unit.projector.pitch;
  unit.projector.yaw=angleDelta(unit.projector.yaw+clamp(yawError,-2*dt,2*dt),0);
  unit.projector.pitch+=clamp(pitchError,-1.4*dt,1.4*dt);
  if(aim){
   unit.driveSpeed=0;
   if(Math.abs(yawError)<.06&&Math.abs(pitchError)<.06){
    unit.projector.yaw=aim.yaw;unit.projector.pitch=aim.pitch;
    unit.builderWorking=job!=='build'||oilFundingRemaining(target)===0;
    if(unit.builderWorking)unit.builderContact=aim.world;
   }else if(Math.abs(angleDelta(unit.projector.yaw,previousYaw))+Math.abs(unit.projector.pitch-previousPitch)>1e-7){
    // The parked builder is already at a verified working pose. Diagnose
    // actual projector motion, never turn a blocked approach into a fake wait.
    navigationDecision(unit,'IDLE','preparing-projector',null,'align-projector');
   }
   return;
  }
  if(working&&!unit.path.length&&this.state.time-(unit.lastRepath??-10)>=.4){
   unit.path=(yield* this.workPathSteps(unit,target))??[];unit.lastRepath=this.state.time;
  }
  (yield* this.moveSteps(unit,dt));
  if(unit.task?.type==='move'&&!unit.path.length&&!followsContinuation(unit)){
   if(distance(unit,unit.task)<(unit.routeOrder?2:24)&&borrowedHomeClear(this,unit)){
    unit.task=null;
    const building=unit.resumeConstructionId&&this.entity(unit.resumeConstructionId);
    if(building&&!building.completed&&!building.clearing&&this.canWorkHere(unit,building))this.order([unit.id],'build',building,{preserveQueue:true});
   }
   else if(this.state.time-(unit.lastRepath??-10)>=.4){unit.path=(yield* this.vehiclePathSteps(unit,unit.task,unit.routeOrder?{fallback:false,maxGoalDistance:.01}:{}))??[];unit.lastRepath=this.state.time;}
  }
 }
 finalizeBuilderContacts(dt){
  for(const unit of this.state.units){
   if(unit.hp<=0||!unit.builderWorking)continue;
   const target=this.entity(unit.task?.targetId);
   const moving=target&&this.config.units[target.kind]&&Math.hypot(target.x-target.previousX,target.y-target.previousY)>.05;
   if(!target||moving||!this.projectorAim(unit,target)){unit.builderWorking=false;unit.builderContact=null;continue;}
   if(unit.task.type==='build'&&!target.completed){
    advanceConstruction(target,target.progress+(oilFundingRemaining(target)>0?0:dt)/this.buildingSpec(target).seconds);
    if(target.progress>=1){target.completed=true;this.state.statistics.buildingsCompleted++;this.emit('construction-complete',{kind:target.kind,building:target.id});}
   }else if(unit.task.type==='repair'&&repairableBuilding(this,target)&&target.hp<target.maxHp){
    repairWithOil(this,target,dt);
   }else if(unit.task.type==='upgrade-power'){
    unit.builderWorking=advancePowerModule(this,target,dt);
   }else if(unit.task.type==='demolish'){
    unit.builderWorking=advanceDemolition(this,unit,target,dt);
   }else unit.builderWorking=false;
  }
 }
 updateUnit(...args){this.finishPendingStep();return completeSteps(this.updateUnitSteps(...args));}
 *updateUnitSteps(unit,dt){
  const x=unit.x,y=unit.y;beginNavigationStep(unit);
  try{return yield* this.trafficCoordinator.currentIntentSteps(this,this.executeUnitSteps(unit,dt),[unit]);}
  finally{finishNavigationStep(this,unit,dt,x,y);}
 }
 *executeUnitSteps(unit,dt){
  if(unit.hp<=0)return;unit.previousX=unit.x;unit.previousY=unit.y;unit.previousHeading=unit.heading;unit.previousWheelDistance=unit.wheelDistance??0;unit.previousSteering=unit.steering??0;unit.cooldown=Math.max(0,unit.cooldown-dt);const spec=this.unitSpec(unit);
  if(unit.orderQueue?.length)yield* startQueuedWork(this,unit);
  updateSteeringDamage(this,unit);
  // Clear the vehicle's own route before normal targeting. Withdrawal also
  // keeps its turret active when traffic or garage handling returns early.
  if(spec.damage&&unit.cooldown<=0&&!inFactoryInterior(unit)){
   const blocker=blockingCombatTarget(this,unit,spec);
   const retreating=unit.combatRetreat||unit.factoryVisit||shouldAutoRetreat(unit,spec);
   const enemy=blocker??(retreating?automaticCombatTarget(this,unit,spec):null);
   if(enemy)this.attack(unit,enemy,spec);
  }
  if(unit.factoryVisit&&['entering','inside','leaving','departure'].includes(unit.factoryVisit.phase)){
   const factory=this.state.buildings.find(b=>b.id===unit.factoryVisit.factoryId)??{...unit.factoryVisit.factory,hp:0};
   yield* updateFactoryVisit(this,unit,factory,dt);return;
  }
  // A checked shutter approach can finish from the live pose while a generic
  // local turn is queued. Entering invalidates that search's route intent.
  if(unit.factoryVisit?.phase==='gate'&&this.trafficCoordinator.routes?.get(unit.id)?.kind==='maneuver'){
   const factory=this.entity(unit.factoryVisit.factoryId);
   if(tryEnterFactory(this,unit,factory)){yield* updateFactoryVisit(this,unit,factory,dt);return;}
  }
  if(yield* this.trafficCoordinator.prepareUnitSteps(this,unit,spec,dt))return;
  if(unit.task?.artifactId||unit.task?.salvageId){
   if(yield* updatePickupOrder(this,unit)){
    const enemy=spec.damage&&automaticCombatTarget(this,unit,spec);if(enemy)this.attack(unit,enemy,spec);
    return;
   }
  }
  if(spec.role==='builder'){(yield* this.updateBuilderSteps(unit,dt));return;}
  if(unit.foldTime>0){unit.foldTime=Math.max(0,unit.foldTime-dt);unit.tool=Math.max(0,unit.tool-dt/2.6);return;}
  if(yield* updateScavCombat(this,unit,spec,dt))return;
  if(yield* updateCombatDeployment(this,unit,spec,dt))return;
  if(unit.task?.type==='attack-move'){
   const enemy=movementCombatTarget(this,unit,spec);
   if(enemy){
    navigationDecision(unit,'ARRIVED','engaging-visible-target',enemy.id,'resume-after-engagement');
    unit.driveSpeed=0;unit.steering=(unit.steering??0)*.68;
    this.attack(unit,enemy,spec);
    return;
   }
   // A deliberate position change retains turret fire without letting the
   // previous contact replace the new movement order again.
   if(unit.combatDisengage){const target=automaticCombatTarget(this,unit,spec);if(target)this.attack(unit,target,spec);}
   yield* updateCombatParking(this,unit);
   if(unit.pendingOrder||unit.task?.type!=='attack-move')return;
   if(waitingForContinuation(unit))return;
   if(!unit.path.length){
    if(distance(unit,unit.task)<(unit.routeOrder?2:unit.combatParking?this.config.worldScale*4:24)
      &&(!unit.combatParking||this.nav.lineClear(unit,unit.task,false,true))&&borrowedHomeClear(this,unit))unit.task=null;
    else if(this.state.time-(unit.lastRepath??-10)>=.4){
     unit.path=(yield* this.vehiclePathSteps(unit,unit.task,unit.routeOrder?{fallback:false,maxGoalDistance:.01}:unit.combatParking?{fallback:false,maxGoalDistance:4}:{}))??[];unit.lastRepath=this.state.time;
    }
   }
   (yield* this.moveSteps(unit,dt));
   return;
  }
  let target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  if(unit.task?.targetId&&(!target||unit.task.type==='build'&&target.completed)){unit.task=null;unit.path=[];if(unit.tool>.01)unit.foldTime=2.6;target=null;}
  if(unit.task?.type==='attack'&&target&&spec.damage){
   if(distance(unit,target)<=spec.range&&this.lineOfSight(unit,target)){
    unit.path=[];navigationDecision(unit,'ARRIVED','engaging-visible-target',target.id,'follow-if-target-leaves-range');this.attack(unit,target,spec);
   }else if(!unit.path.length||unit.attackRouteTarget&&distance(unit.attackRouteTarget,target)>spec.range*.2){
    const conditions=combatPositionConditions(this,unit,target);
    if(unit.attackFailedConditions!==conditions){
     navigationDecision(unit,'GLOBAL_REPLAN','seeking-target-approach',target.id,'apply-attack-route');
     const task=unit.task,path=yield* this.attackPathSteps(unit,target);
     if(unit.task!==task||unit.pendingOrder)return;
     unit.path=path??[];
     unit.attackRouteTarget={x:target.x,y:target.y};
     if(!unit.path.length)unit.attackFailedConditions=conditions;else delete unit.attackFailedConditions;
    }
    if(!unit.path.length)navigationDecision(unit,'BLOCKED','attack-position-unavailable',target.id,'retry-on-obstacle-change');
   }else unit.attackRouteTarget??={x:target.x,y:target.y};
  }
  else if(spec.damage){const enemy=automaticCombatTarget(this,unit,spec);if(enemy)this.attack(unit,enemy,spec);}
  const working=target&&['build','repair','demolish','upgrade-power'].includes(unit.task?.type)&&!unit.path.length&&distance(unit,this.workPoint(target,unit.task.workOffset??0))<=this.config.builderRangeMetres;
  if(working){unit.path=[];unit.tool=Math.min(1,unit.tool+dt/2.6);unit.aimTarget={x:target.x,y:target.y};if(unit.tool<.99)return;
   if(unit.task.type==='build'&&!target.completed){advanceConstruction(target,target.progress+(oilFundingRemaining(target)>0?0:dt)/this.buildingSpec(target).seconds);if(target.progress>=1){target.completed=true;this.state.statistics.buildingsCompleted++;this.emit('construction-complete',{kind:target.kind,building:target.id});}}
   else if(unit.task.type==='repair'&&repairableBuilding(this,target)&&target.hp<target.maxHp){repairWithOil(this,target,dt);}
   if((unit.task.type==='build'&&target.completed)||(unit.task.type==='repair'&&target.hp>=target.maxHp)){unit.task=null;unit.foldTime=2.6;}
  }else{
   if(unit.tool>0){unit.foldTime=2.6;return;}
   if(target&&['build','repair','demolish','upgrade-power'].includes(unit.task?.type)&&!unit.path.length&&this.state.time-(unit.lastRepath??-10)>1){
    unit.path=(yield* this.workPathSteps(unit,target));unit.lastRepath=this.state.time;
   }
   if(unit.task?.type==='move'&&!unit.path.length&&!followsContinuation(unit)){
    if(distance(unit,unit.task)<(unit.routeOrder?2:24)&&borrowedHomeClear(this,unit))unit.task=null;
    else if(this.state.time-(unit.lastRepath??-10)>=.4){
     unit.path=(yield* this.vehiclePathSteps(unit,unit.task,unit.routeOrder?{fallback:false,maxGoalDistance:.01}:{}))??[];
     unit.lastRepath=this.state.time;
    }
   }
   yield* this.moveSteps(unit,dt);
  }
 }
 clearFactoryApron(...args){this.finishPendingStep();return completeSteps(this.clearFactoryApronSteps(...args));}
 *clearFactoryApronSteps(building,departure,blockers,current=()=>true,entry=false){
  const idle=other=>other.owner===building.owner&&!other.detour&&!other.jointTraffic
   &&!other.pendingOrder&&!other.yieldReturn&&this.unitSpec(other).role!=='builder'
   &&(!other.task&&!other.path.length&&!other.combatRetreat||entry&&other.factoryVisit?.phase==='approach'
    &&!other.traffic&&!other.trafficHold&&(other.driveSpeed??0)<.01);
  if(![...blockers].every(idle))return;
  const scale=this.config.worldScale;
  const leader={...departure,path:[{
   x:departure.x-Math.sin(departure.heading)*scale*9,
   y:departure.y+Math.cos(departure.heading)*scale*9
  }]};
  for(const other of blockers){
   if(other.trafficRest>this.state.time)continue;
   other.trafficRest=this.state.time+4;
   const world=this.state,revision=other.commandRevision,topology=this.nav.topologyRevision,
    pose={x:other.x,y:other.y,heading:other.heading};
   const parking=yield* this.trafficCoordinator.currentIntentSteps(this,this.parkingManeuverSteps(other,leader,(from,to)=>this.vehicleMotionClear(other,from,to),{requireInverse:!entry}),[other,leader]);
   if(this.state!==world||!current()||this.nav.topologyRevision!==topology)return;
   if(other.hp<=0||!idle(other)||other.commandRevision!==revision
    ||other.x!==pose.x||other.y!==pose.y||other.heading!==pose.heading)continue;
   if(!parking)continue;
   other.detour={legs:parking.legs,parking:true,idleYield:true,blocked:0,factoryExit:building.id};
   if(entry)this.trafficCoordinator.routes?.delete(other.id);
   else building.exitYield=other.id;
   return;
  }
 }
 spawnProducedVehicle(...args){this.finishPendingStep();return completeSteps(this.spawnProducedVehicleSteps(...args));}
 *spawnProducedVehicleSteps(building,item,spec){
  const world=this.state,topology=this.nav.topologyRevision,rallyKey=JSON.stringify(building.rally);
  const current=()=>this.state===world&&building.hp>0&&building.queue[0]===item
   &&this.nav.topologyRevision===topology&&JSON.stringify(building.rally)===rallyKey;
  if(building.exitYield){
   const yielding=this.entity(building.exitYield);
   if(yielding?.hp>0&&yielding.detour?.factoryExit===building.id)return false;
   delete building.exitYield;
  }
  const [x,y]=spec.exitAnchor,c=Math.cos(building.rotation),s=Math.sin(building.rotation),scale=this.config.worldScale;
  const point={x:building.x+(x*c-y*s)*scale,y:building.y+(x*s+y*c)*scale};
  const exit=this.nav.nearest(point.x,point.y,2);
  if(!exit)return false;
  const heading=angleDelta(building.rotation+(y>0?0:Math.PI),0);
  const departure={...exit,heading,owner:building.owner,kind:item.kind};
  const door={...departure,...point};
  const solids=this.nav.nearbySolids(door,scale*4.8+distance(door,departure));
  const apron=vehicleSweep(door,departure,scale,this.field);
  if(!this.nav.lineClear(door,departure,false,true,.52,true)
   ||!this.nav.clearSolidSweep(vehicleSweep(door,door,scale,this.field),solids)
   ||!this.nav.clearSolidSweep(apron,solids))return false;
  const blockers=new Set();
  const doorClear=clearOfVehicles(null,door,this.state.units,scale,true,null,this.field,blockers);
  const apronClear=clearOfVehicles(null,departure,this.state.units,scale,false,door,this.field,blockers,apron);
  if(!doorClear||!apronClear){
   yield* this.clearFactoryApronSteps(building,door,blockers,current);
   return false;
  }

  const slot=building.producedCount??0;
  const side=(slot%3-1)*24,forward=(y>0?1:-1)*(42+Math.floor(slot/3)%3*24);
  const rally=building.rally??{x:point.x+side*c-forward*s,y:point.y+side*s+forward*c};
  const reservations=[exit];
  for(const other of this.state.units){
   const end=other.path.at(-1);
   if(other.hp>0&&other.owner===building.owner&&end&&distance(end,rally)<scale*25)reservations.push(end);
  }
  const path=yield* this.movePathSteps(departure,rally,reservations,scale*27);
  if(!path||!current())return false;
  const project=latestVehicleProject(this.state.designs,item,this.config);
  const design=item.projectId?{projectId:project?.id??item.projectId,designName:project?.name??item.name,components:[...item.components],paint:vehiclePaint(item).id}:{};
  const unit=this.addUnit(item.kind,building.owner,exit,design),destination=path.at(-1);
  unit.heading=heading;
  unit.path=path;
  unit.task={type:'move',x:destination.x,y:destination.y};
  building.producedCount=slot+1;
  building.queue.shift();
  if(building.owner==='rai')this.state.statistics.produced++;
  this.emit(building.owner==='rai'?'unit-produced':'scav-produced',{unit:unit.id,kind:unit.kind,name:unit.designName??item.name??this.config.units[item.kind].name,first:this.state.statistics.produced===1});
  return true;
 }
 linkOilWells(structures,dt){
  const stations=structures.filter(b=>b.kind==='generator');
  const connections=stations.flatMap(b=>Array(this.buildingSpec(b).oilSlots??0).fill(b.powerModule?this.config.powerModule.multiplier:1)),slots=connections.length;
  let linked=0,generation=0;
  for(const well of structures){
   if(well.kind!=='derrick')continue;
   well.powered=linked<slots;
   if(!well.powered)continue;
   linked++;
   generation+=(this.buildingSpec(well).energyPerSecond??0)*connections[linked-1];
   if(dt>0)well.pumpTime=(well.pumpTime??0)+dt;
  }
  this.state.oilLinked=linked;
  this.state.powered=slots>0;
  return generation;
 }
 updateEconomy(dt){this.finishPendingStep();return completeSteps(this.updateEconomySteps(dt));}
 *updateEconomySteps(dt){
  const structures=this.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed);
  const generation=this.linkOilWells(structures,dt);
  beginOilFlow(this,generation,dt);
  rebalanceProduction(this);
  for(const b of structures)if(b.kind==='factory')b.productionPaused=factoryProductionPaused(this,b);
  updateFactoryRepairs(this,structures,dt);
  transferOil(this,dt);
  for(const building of structures){building.cooldown=Math.max(0,building.cooldown-dt);const spec=this.buildingSpec(building);if(spec.damage){const target=this.nearestEnemy(building,spec.range);if(target)this.attack(building,target,spec);}
   if(building.queue.length){
    const item=building.queue[0],unitSpec=this.config.units[item.kind];
    if(!building.productionPaused)item.progress=Math.min(1,item.progress+fundedWorkTime(this,item,dt)/unitSpec.seconds);
    if(item.progress>=1&&!(building.exitRetryAt>this.state.time)){
     if(yield* this.spawnProducedVehicleSteps(building,item,spec)){
      delete building.exitBlocked;
      delete building.exitRetryAt;
     }else{
      building.exitBlocked=true;
      building.exitRetryAt=this.state.time+.8;
     }
    }
   }
   if(building.research){const task=building.research;task.progress=Math.min(1,task.progress+fundedWorkTime(this,task,dt)/this.config.research[task.key].seconds);if(task.progress>=1){this.state.research[task.key]=true;this.emit('research-complete',{key:task.key});this.cinematic('research-'+task.key);building.research=null;}}
  }
  finishOilFlow(this,dt);
 }
 updateFog(){
  this.fogRevision++;
  this.visible.fill(0);this.visionSources.length=0;
  const stamp=(item,vision)=>{
   const [x,y]=this.field.worldToGrid(item.x,item.y),radius=vision/(this.field.cellMetres??32),b=this.state.bounds;
   if(!radius)return;
   this.visionSources.push({x,y,radius});
   for(let row=Math.max(0,b[1],Math.ceil(y-radius));row<=Math.min(127,b[3],Math.floor(y+radius));row++)
    for(let col=Math.max(0,b[0],Math.ceil(x-radius));col<=Math.min(127,b[2],Math.floor(x+radius));col++)
     if(Math.hypot(col-x,row-y)<=radius){if(this.field.mapId==='m03'){const p=this.field.gridToWorld([col,row]);if(!m03TerrainSight(this.field,item,p.x,p.y))continue;}this.visible[row*128+col]=255;this.explored[row*128+col]=255;}
  };
  for(const unit of this.state.units)if(unit.owner==='rai'&&unit.hp>0&&!insideFactory(unit))stamp(unit,this.unitSpec(unit).vision);for(const b of this.state.buildings)if(b.owner==='rai'&&b.hp>0&&b.completed)stamp(b,this.buildingSpec(b).vision);
  if(this.state.transport&&!['absent','departed'].includes(this.state.transport.phase))stamp(transportPose(this.state.transport),300);
 }
 updateMission(){
  if(this.state.status!=='running')return;
  updateCampPerimeters(this);
  if(this.state.m03){updateM03(this);return;}
  if(this.state.m02){updateM02(this);return;}
  const s=this.state,captured=s.camps.filter(c=>c.cleared).length;
  for(const camp of s.camps){if(camp.cleared)continue;const hostile=[...s.units,...s.buildings].some(e=>e.campId===camp.id&&e.owner==='scavs'&&e.hp>0&&!isCampPerimeter(e)&&!e.campResource);if(!hostile){camp.cleared=true;captureCampResources(this,camp);this.emit('camp-cleared',{camp:camp.id});if(camp.artifact&&!camp.artifactSpawned){const point=this.nav.nearest(camp.x+35,camp.y,8)??camp;s.artifacts.push({id:this.id('a'),key:camp.artifact,x:point.x,y:point.y,collected:false});camp.artifactSpawned=true;}}}
  for(const artifact of s.artifacts)if(!artifact.collected&&s.units.some(u=>u.owner==='rai'&&u.hp>0&&distance(u,artifact)<24)){artifact.collected=true;if(!s.artifactKeys.includes(artifact.key))s.artifactKeys.push(artifact.key);this.emit('artifact-collected',{key:artifact.key});if(artifact.key!=='mg-tower')this.cinematic('artifact-'+artifact.key);}
  const enemyVisible=s.units.some(u=>u.owner==='scavs'&&u.hp>0&&this.visibleAt(u.x,u.y));const has=kind=>s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind===kind);
  this.updateRaid(s.storyConstruction?.enabled
   ? s.powered&&has('factory')&&has('lab')&&s.statistics.produced>0
   : enemyVisible||(has('factory')&&has('lab')&&s.statistics.produced>0));
  if(!s.flags.thirdSighted){
   const tower=waterTower(this);
   if(tower&&this.visibleAt(tower.x,tower.y)){s.flags.thirdSighted=true;this.cinematic('camp3-sighted');}
  }
  if(!s.flags.lastRevealed&&s.camps.filter(c=>c.cleared).length>=3){s.flags.lastRevealed=true;s.bounds=this.config.finalMapBounds.slice();this.rebuildNavigation();this.cinematic('last-camp');this.emit('map-expanded',{bounds:s.bounds});}
  if(s.camps.every(c=>c.cleared)&&has('generator')&&has('derrick')&&has('factory')&&has('lab')&&this.defenseReady()&&s.statistics.produced>0&&Object.keys(this.config.research).filter(key=>!['m02','m03'].includes(this.config.research[key].mission)).every(key=>s.research[key])&&s.flags.raidWon){s.status='victory';this.cinematic('victory');this.cinematic('outro');this.emit('victory');}
  if(!s.units.some(u=>u.owner==='rai'&&u.hp>0&&this.unitSpec(u).role==='builder')&&!s.transport?.manifest.some(c=>c.unit.hp>0&&this.unitSpec(c.unit).role==='builder')&&!s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind==='factory')){s.status='defeat';this.emit('defeat',{reason:'Утрачены строители и производство'});}
  finalizeMissionResults(this);
 }
 beginTick(dt,budgeted=false){
  updateTransport(this,dt);
  dispatchQueuedTravel(this);
  this.trafficCoordinator.publishPlanning(this);
  refreshCommandGroups(this);
  auditNavigationWaits(this);
  this.state.time+=dt;this.unitIndex.rebuild(this.state.units);
  this.unitIndexActive=true;
  applyRouteContinuations(this);
  try{this.trafficCoordinator.update(this);}finally{this.unitIndexActive=false;}
  this.pendingTick={dt,cursor:0,units:this.state.units.slice(),budgeted};
  if(this.state.parkingGoalReleases?.length){
   this.pendingTick.goalRelease=this.releaseParkingGoalsSteps(new Set(this.state.parkingGoalReleases));
   delete this.state.parkingGoalReleases;
  }
 }
 continueTick(deadline=Infinity){
  const pending=this.pendingTick;if(!pending)return true;
  const {dt}=pending;this.unitIndexActive=true;this.nav.workDeadline=deadline;
  try{
   while(pending.goalRelease){
    if(pending.goalRelease.next().done)pending.goalRelease=null;
    if(performance.now()>=deadline)return false;
   }
   this.applyPendingStops();
   while(pending.cursor<pending.units.length){
    const unit=pending.units[pending.cursor];
    pending.iterator??=this.updateUnitSteps(unit,dt);
    if(!pending.iterator.next().done){if(performance.now()>=deadline)return false;continue;}
    pending.iterator=null;this.applyPendingStops();pending.cursor++;this.unitIndex.update(unit);this.radioObserver?.unit(unit);
    if(pending.budgeted)this.unitFrameTimes.set(unit,performance.now());else this.unitFrameTimes.delete(unit);
    if(performance.now()>=deadline&&pending.cursor<pending.units.length)return false;
   }
   if(!pending.overlapsComplete){
    pending.overlaps??=resolveVehicleOverlapsSteps(this,dt);
    while(true){const step=pending.overlaps.next();if(step.done){pending.overlapsComplete=true;pending.overlaps=null;break;}
     if(performance.now()>=deadline)return false;}
   }
   if(!pending.economyStarted){
    this.updateProjectiles();updateBurning(this);updateStreetFurniture(this);updateSalvage(this);updateWrecks(this);this.finalizeBuilderContacts(dt);this.updateConstructionSites();
    pending.economyStarted=true;pending.iterator=this.updateEconomySteps(dt);
   }
   // Factory parking and exit routing can be as expensive as unit recovery.
   // Keep them in the same suspended controller slot, so command publication
   // and Stop retain their existing safe-boundary and cancellation rules.
   while(pending.iterator){
    if(pending.iterator.next().done){pending.iterator=null;this.applyPendingStops();break;}
    if(performance.now()>=deadline)return false;
   }
   if(!pending.missionUpdated){
   for(const b of this.state.buildings)if(b.owner==='scavs'&&b.hp>0){b.cooldown=Math.max(0,b.cooldown-dt);const spec=this.buildingSpec(b);if(spec.damage){const enemy=this.nearestEnemy(b,spec.range);if(enemy)this.attack(b,enemy,spec);}}
   this.fogTimer+=dt;if(this.fogTimer>=.25){this.fogTimer=0;this.updateFog();}this.updateMission();if(this.navigationDirty){this.rebuildNavigation();this.navigationDirty=false;}
   pending.missionUpdated=true;pending.scenario=this.state.m02&&!this.state.m03?updateM02Steps(this):null;
   }
   while(pending.scenario){if(pending.scenario.next().done){pending.scenario=null;break;}if(performance.now()>=deadline)return false;}
   this.pendingTick=null;if(!this.state.m02&&!this.state.m03){updateOpeningConstruction(this);updateScavReinforcements(this);}this.radioObserver?.tick();return true;
  }finally{this.unitIndexActive=false;this.nav.workDeadline=Infinity;}
 }
 vehicleCollision(unit,speed,blockers){
  const scale=this.config.worldScale,pairs=this.collisionPairs??=new Map(),rockPairs=this.contactRockPairs??=new Map();
  const vx=-Math.sin(unit.heading)*speed,vy=Math.cos(unit.heading)*speed;
  for(const other of blockers){
   if(!vehicleObstacle(other)||other===unit||!trafficCollisionRequired(unit,other))continue;
   const contact=vehicleContact(unit,other,scale,this.field);if(contact.gap>1.5||contact.gap<-.25*scale)continue;
   const v=other.hp>0?(other.driveSpeed??0)*(other.reversing?-1:1):0,n=contact.normal;
   const closing=((vx+Math.sin(other.heading)*v)*n[0]+(vy-Math.cos(other.heading)*v)*n[1])/scale,power=impactPower(closing);
   if(closing<=.18)continue;
   if((unit.combatRetreat||other.combatRetreat)&&!isInfantry(unit)&&!isInfantry(other)){
    applyRetreatContact(this,unit,other,closing,contact);continue;
   }
   const key=[unit.id,other.id].sort().join('|'),rock=this.state.time-(rockPairs.get(key)??-Infinity)>=.35,
    damage=power>=1&&this.state.time-(pairs.get(key)??-Infinity)>=.6;
   if(!rock&&!damage)continue;
   if(rock){rockPairs.set(key,this.state.time);if(rockPairs.size>512)rockPairs.delete(rockPairs.keys().next().value);}
   if(damage){pairs.set(key,this.state.time);if(pairs.size>512)pairs.delete(pairs.keys().next().value);}
   for(const [target,source,sign] of [[unit,other,-1],[other,unit,1]]){
    const direction=n.map(v=>v*sign),point=contact.point.slice();point[2]=this.field.heightAt(point[0],point[1])+(target.kind==='raider'||target.kind==='command'?1.22:1.65)*scale;
    if(rock&&!isInfantry(target))kickContactRock(target,direction,closing,this.state.time);
    if(!damage)continue;
    const hit=this.resolveVehicleImpact?this.resolveVehicleImpact(target,point,direction):fallbackVehicleImpact(target,point,direction,this.field,scale);
    if(!hit)continue;
    if(target.hp>0)this.damage(target,power*.2,source,{...hit,type:'collision',kineticPower:power});
    else recordDamage(this,target,power,source,{...hit,type:'collision'});
   }
  }
 }
 freezeWreck(unit){delete unit.orderQueue;unit.previousX=unit.x;unit.previousY=unit.y;unit.previousHeading=unit.heading;unit.previousWheelDistance=unit.wheelDistance??0;unit.previousSteering=unit.steering??0;unit.driveSpeed=0;unit.path=[];unit.task=null;delete unit.detour;delete unit.traffic;delete unit.trafficHold;}
 walk(unit,dt){
  unit.driveSpeed=0;unit.steering=0;unit.reversing=false;
  const point=unit.path[0];if(!point)return false;
  const d=distance(unit,point);if(d<1){unit.path.shift();return true;}
  const travel=Math.min(d,this.unitSpec(unit).speed*dt),heading=Math.atan2(unit.x-point.x,point.y-unit.y);
  const step=heading=>({x:unit.x-Math.sin(heading)*travel,y:unit.y+Math.cos(heading)*travel,heading,kind:unit.kind});
  const blockers=new Set();
  let next=step(heading);
  if(!this.vehicleMotionClear(unit,unit,next,.6,blockers)){
   next=null;
   // The route grid is coarser than a person. Resolve a nearby body with
   // short checked steps before asking for the same global route again.
   if(blockers.size)for(const offset of [.45,-.45,.9,-.9,1.35,-1.35]){
    const side=step(heading+offset);
    if(this.vehicleMotionClear(unit,unit,side,.6)){next=side;break;}
   }
  }
  if(!next){
   if(this.state.time-(unit.lastWalkRepath??-10)>1.5){unit.path=infantryNavigator(this.nav).findPath(unit,unit.path.at(-1))??unit.path;unit.lastWalkRepath=this.state.time;}
   return false;
  }
  unit.x=next.x;unit.y=next.y;unit.heading=next.heading;unit.driveSpeed=travel/dt;unit.wheelDistance=(unit.wheelDistance??0)+travel;
  if(distance(unit,point)<1)unit.path.shift();return true;
 }
 finishPendingStep(){if(this.pendingTick&&!this.unitIndexActive)this.continueTick();}
 tick(dt){this.continueTick();if(this.state.status!=='running'){advanceCampDemolition(this,dt);return;}this.trafficCoordinator.advancePlanning(this,2);this.beginTick(dt);this.continueTick();}
 advance(seconds,{budgetMs=Infinity,rate=1}={}){
  if(!this.pendingTick&&this.state.status!=='running')return advanceCampDemolition(this,seconds);
  const frameStarted=performance.now();
  if(!this.commandPlanner&&this.state.commandOrders?.some(order=>['queued','planning'].includes(order.status)))this.commandPlanner=new CommandPlanner(this);
  // Command routes, local recovery and publication share one frame allowance.
  // Individual JS geometry operations remain cooperative, not preemptible.
  const planningBudget=Number.isFinite(budgetMs)?Math.min(2,Math.max(0,budgetMs)):2;
  const planningDeadline=frameStarted+planningBudget;
  this.commandPlanner?.advance(Math.min(planningBudget*.5,Math.max(0,planningDeadline-performance.now())));
  this.trafficCoordinator.advancePlanning(this,Math.max(0,planningDeadline-performance.now()));
  const planningMs=performance.now()-frameStarted;
  this.planningStats??={maxFrameMs:0,maxOverrunMs:0};
  this.planningStats.maxFrameMs=Math.max(this.planningStats.maxFrameMs,planningMs);
  this.planningStats.maxOverrunMs=Math.max(this.planningStats.maxOverrunMs,planningMs-planningBudget);
  this.presentationRate=Math.max(.01,rate);
  this.accumulator+=Math.max(0,seconds);let ticks=0;
  const budgeted=Number.isFinite(budgetMs);
  // During overload, drop old wall time instead of fast-forwarding later.
  if(budgeted)this.accumulator=Math.min(this.accumulator,Math.max(0,this.config.simulationStep*2-(this.pendingTick?this.config.simulationStep:0)));
  const backlog=this.accumulator+(this.pendingTick?this.config.simulationStep:0);
  const catchup=budgetMs>0?Math.min(2.5,Math.max(0,backlog-.1)*20):0;
  const deadline=budgeted?frameStarted+budgetMs+catchup:Infinity;
  while(this.pendingTick||this.accumulator+1e-8>=this.config.simulationStep){
   if(!this.pendingTick){
    this.accumulator-=this.config.simulationStep;if(this.state.status!=='running'){advanceCampDemolition(this,this.config.simulationStep);continue;}
    // Offline advance(largeDelta) has no render callbacks to service searches.
    // Keep planning alive between its fixed steps on every map. Live frames
    // retain their single shared wall-time budget above.
    if(!budgeted&&ticks){const end=performance.now()+2;this.commandPlanner?.advance(1);this.trafficCoordinator.advancePlanning(this,Math.max(0,end-performance.now()));}
    this.beginTick(this.config.simulationStep,budgeted);
   }
   if(!this.continueTick(deadline))break;ticks++;
   if(performance.now()>=deadline)break;
  }
  return ticks;
 }
 renderUnitPhase(unit,nowMs){const at=this.unitFrameTimes.get(unit);return at===undefined?null:clamp((nowMs-at)*(this.presentationRate??1)/(this.config.simulationStep*1000),0,1);}
 objectives(){if(this.state.m03)return m03Objectives(this);if(this.state.m02)return m02Objectives(this);const s=this.state,has=kind=>s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind===kind);return [{id:'base',name:'Развернуть передовую базу',done:has('generator')&&has('factory')&&has('lab')&&this.defenseReady()},{id:'power',name:'Обеспечить энергоснабжение',done:s.powered},{id:'production',name:'Наладить производство техники',done:s.statistics.produced>0},{id:'research',name:'Организовать научные исследования',done:Object.keys(this.config.research).filter(key=>!['m02','m03'].includes(this.config.research[key].mission)).every(key=>s.research[key]),progress:Object.keys(s.research).length+'/3'},{id:'security',name:s.flags.contact?'Уничтожить четыре лагеря':'Обеспечить безопасность района',done:s.camps.every(c=>c.cleared)&&s.flags.raidWon,progress:s.camps.filter(c=>c.cleared).length+'/4'}];}
 save(){this.continueTick();this.updateFog();finalizeMissionResults(this);this.radioObserver?.save();return JSON.stringify({version:1,mission:this.config.id,serial:this.serial,randomState:this.randomState,accumulator:this.accumulator,fogTimer:this.fogTimer,state:this.state,explored:Array.from(this.explored)});}
 async saveAsync(){
  const world=this.state;
  while(this.pendingTick){
   this.continueTick(performance.now()+5);
   if(this.pendingTick)await new Promise(resolve=>setTimeout(resolve,0));
   if(this.state!==world)throw new Error('Mission changed while saving');
  }
  return this.save();
 }
 updateUnrevealedCampLayout(){
  // Revealed camps keep their saved positions so ongoing battles can resume.
  if(this.state.flags.lastRevealed)return;
  for(const data of this.config.camps){
   if(!data.requiresCamps||!data.towerGrids)continue;
   const camp=this.state.camps.find(item=>item.id===data.id);
   if(!camp||camp.towerGrids)continue;
   const buildings=this.state.buildings.filter(b=>b.campId===data.id);
   const core=buildings.find(b=>b.kind==='camp-core');
   const point=this.field.gridToWorld(data.grid);
   Object.assign(camp,{...point,grid:data.grid,towerGrids:data.towerGrids,coreRotationDegrees:data.coreRotationDegrees});
   if(core)Object.assign(core,point,{rotation:(data.coreRotationDegrees??0)*Math.PI/180});
   buildings.filter(b=>b.kind==='mg-tower').forEach((tower,index)=>{
    const grid=data.towerGrids[index];
    if(grid)Object.assign(tower,this.field.gridToWorld(grid));
   });
  }
 }
 load(json){const data=typeof json==='string'?JSON.parse(json):json;if(data.version!==1||data.mission!==this.config.id||data.state?.m02&&![1,2].includes(data.state.m02.version)||!Array.isArray(data.state?.units)||data.explored?.length!==16384)throw new Error('Несовместимое сохранение');this.state=data.state;for(const unit of this.state.units)delete unit.trafficOnScreen;
  if(this.field.mapId!=='m03')restoreM01Layout(this);installM02Config(this.config);installM03Config(this.config);restorePersonnel(this);
  this.oilSpent=0;this.oilWorkTime=null;
  this.factoryBalanceAt=undefined;
  for(const building of this.state.buildings)restoreConstructionHealth(building);
  this.commandPlanner=null;this.scavJob=null;this.pendingStops=null;
  this.pendingTick=null;this.unitFrameTimes=new WeakMap();this.unitIndexActive=false;this.collisionPairs=new Map();this.contactRockPairs=new Map();this.trafficCoordinator=new PredictiveTraffic();
  for(const unit of this.state.units)if(this.unitSpec(unit).role==='builder')releaseInvalidRepairTarget(this,unit);
  ensureSalvage(this);
  this.state.projectiles??=[];
  if(!this.state.scavRosterVersion){
   const convert=(unit,kind)=>{if(unit.kind!=='raider'||unit.hp!==unit.maxHp||unit.damage?.hits||!this.config.units[kind])return;unit.kind=kind;unit.hp=unit.maxHp=this.config.units[kind].hp;};
   for(const camp of this.config.camps){const roster=SCAV_ROSTERS[camp.id];this.state.units.filter(u=>u.owner==='scavs'&&u.campId===camp.id).forEach((u,i)=>convert(u,roster?.[i%roster.length]));}
   this.state.units.filter(u=>u.raidReserve).forEach((u,i)=>convert(u,this.config.raidRoster?.[i%this.config.raidRoster.length]));
   this.state.scavRosterVersion=1;
  }
  for(const unit of this.state.units)if(unit.hp<=0&&unit.damage?.wreck)this.freezeWreck(unit);
  const legacyWrecks=[],armyPolicy=normalizeCombatPolicy(armyCombatPolicy(this));this.state.armyCombatPolicy=armyPolicy;
  for(const entity of [...this.state.units,...this.state.buildings]){
   if(entity.combatPolicy)entity.combatPolicy=normalizeCombatPolicy(entity.combatPolicy);
   // Army defaults fill legacy omissions; explicit saved unit rules survive.
   if(entity.owner==='rai'&&canAutoRetreat(this.config.units[entity.kind])&&!entity.combatPolicy)entity.combatPolicy={...armyPolicy};
   // Older attacks incorrectly saved the manual-movement retreat override.
   // Keep it for actual movement/Stop, but restore the policy for combat.
   const intent=entity.pendingOrder??entity.combatDeployment?.resume??entity.task;
   if(intent?.type==='attack'||intent?.type==='attack-move')entity.retreatSuppressed=false;
   upgradeDamageState(entity.damage,!!this.config.units[entity.kind]);
   if(this.config.units[entity.kind])syncFieldHp(this,entity);
   if(entity.hp<=0){if(entity.destroyedAt===undefined)legacyWrecks.push(entity);scheduleWreck(this,entity);}
  }
  if(this.field.mapId!=='m03'){this.updateUnrevealedCampLayout();migrateScavLayout(this);restoreM02Continuity(this);}
  // Live towers from older saves must not lose their weapon before destruction.
  for(const building of this.state.buildings)if(building.owner==='scavs'&&building.kind==='mg-tower'&&building.hp>0&&building.damage)this.restoreLiveTowerParts?.(building);
  // Keep existing wells on their authored oil points after the base-yard edit.
  // This is a building relocation; vehicle positions and orders are untouched.
  for(const relocation of this.config.oilFieldRelocations??[]){
   const from=this.field.gridToWorld(relocation.from),to=this.field.gridToWorld(relocation.to);
   for(const building of this.state.buildings){
    if(building.kind!=='derrick'||building.owner!=='rai'||building.hp<=0||distance(building,from)>.5)continue;
    const occupied=this.state.buildings.some(b=>b!==building&&(b.hp>0||b.damage?.wreck)
     &&Math.abs(b.x-to.x)<b.halfWidth+building.halfWidth&&Math.abs(b.y-to.y)<b.halfDepth+building.halfDepth);
    if(occupied)continue;
    Object.assign(building,to);
    building.groundHeight=Math.max(...[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=>this.field.heightAt(to.x+dx*building.halfWidth,to.y+dy*building.halfDepth))));
   }
  }
  for(const building of this.state.buildings){
   if(!this.field.preparedPads?.some(({rect:[left,bottom,right,top]})=>building.x-building.halfWidth>=left
    &&building.x+building.halfWidth<=right&&building.y-building.halfDepth>=bottom&&building.y+building.halfDepth<=top))continue;
   building.groundHeight=Math.max(...[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=>this.field.heightAt(building.x+dx*building.halfWidth,building.y+dy*building.halfDepth))));
  }
  const bunker=this.config.buildings.bunker;
  if(bunker)for(const building of this.state.buildings){
   if(building.kind!=='bunker'||building.owner!=='rai')continue;
   const [halfWidth,halfDepth]=halfFootprint(bunker.footprintMetres,this.config.worldScale,building.rotation);
   building.halfWidth=Math.min(building.halfWidth,halfWidth);
   building.halfDepth=Math.min(building.halfDepth,halfDepth);
  }
  this.state.bounds=(this.state.m02||this.state.m03?this.state.bounds:this.state.flags.lastRevealed?this.config.finalMapBounds:this.config.initialMapBounds).slice();this.state.designs=Array.isArray(this.state.designs)?latestVehicleProjects(this.state.designs):starterProjects(this.vehicleRecipes);this.serial=data.serial;this.randomState=data.randomState;this.explored.set(data.explored);this.events=[];this.effects=[];this.accumulator=data.accumulator??0;this.fogTimer=data.fogTimer??0;this.navigationDirty=false;this.linkOilWells(this.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed),0);this.rebuildNavigation();this.updateFog();
  if(this.field.mapId!=='m03'){installScavBases(this,{restoring:true});installCampResources(this);installM02Fortifications(this);}else initializeM03Expedition(this);this.rebuildNavigation();
  if(refreshFactoryAccess(this))this.rebuildNavigation();
  for(const entity of legacyWrecks){
   const state=entity.damage,mark=state?.marks?.at(-1);
   if(state){state.burn=Math.max(state.burn,.48);state.revision++;}
   if(mark)salvageFromWreck(this,entity,{point:mark.point,power:state.lastImpact?.power??0});
   this.explodeWreck(entity);
  }
 }
}
