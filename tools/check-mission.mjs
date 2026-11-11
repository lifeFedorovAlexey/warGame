import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {raidApproachSignal, southernApproachSignal, warehouseAdvanceHint, waterTower, waterTowerSignal} from '../campaign/threat-guidance.js';
import {vehicleClearance} from '../campaign/vehicle-motion.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=path=>JSON.parse(fs.readFileSync(path,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json'),original=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(original);const field=refineRoadHeightfield(original);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const mission=new Mission(config,field),seen=[],events=[],start=field.gridToWorld(config.startGrid),builders=()=>mission.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&u.kind==='builder').map(u=>u.id);
const scout=new Mission(config,field);
const tower=waterTower(scout),camp=scout.state.camps[2];
const reveal=(point,value=1)=>{
 const [x,y]=field.worldToGrid(point.x,point.y),cell=Math.round(y)*128+Math.round(x);
 scout.visible[cell]=scout.explored[cell]=value;
};
reveal(camp);
scout.updateMission();
assert(!scout.state.flags.thirdSighted,'Seeing the camp is different from spotting the gun');
assert.equal(waterTowerSignal(scout),null);
reveal(tower);
scout.updateMission();
assert(scout.state.pendingCinematics.includes('camp3-sighted'));
assert.deepEqual([waterTowerSignal(scout).x,waterTowerSignal(scout).y],[tower.x,tower.y]);
assert.equal(warehouseAdvanceHint(scout),'');
scout.state.camps[0].cleared=true;
assert.match(warehouseAdvanceHint(scout),/Башня держит дорогу/);
tower.hp=0;
assert.equal(waterTowerSignal(scout),null,'A destroyed tower leaves no threat marker');
assert.match(warehouseAdvanceHint(scout),/К складу по северной дороге/);
scout.state.camps[1].cleared=true;
assert.equal(warehouseAdvanceHint(scout),'');
assert.equal(raidApproachSignal(scout),null,'The approach is quiet before first contact');
scout.state.flags.contact=true;
const approach=field.gridToWorld(config.raidApproachGrid);
reveal(approach,0);
assert.equal(raidApproachSignal(scout),null,'Keep the approach marker out of unexplored terrain');
reveal(approach);
assert.deepEqual([raidApproachSignal(scout).x,raidApproachSignal(scout).y],[approach.x,approach.y]);
scout.state.flags.raidWon=true;
assert.equal(raidApproachSignal(scout),null,'Clear the warning once the raid is over');
assert.equal(southernApproachSignal(scout),null,'Keep the southern approach locked');
scout.state.flags.lastRevealed=true;
scout.state.bounds=config.finalMapBounds.slice();
const finalCamp=config.camps[3],southRally=field.gridToWorld(finalCamp.approachGrid);
const approachRoad=field.localRoads.find(road=>road.id==='m01-original-hq-approach');
const roadEntry=approachRoad.points[0];
scout.explored.fill(0);
assert.equal(southernApproachSignal(scout),null,'Do not focus the camera on a fully uncharted road');
reveal(roadEntry);
const knownRoad=southernApproachSignal(scout);
assert.equal(knownRoad.kind,'recon');
assert(scout.exploredAt(knownRoad.x,knownRoad.y));
assert(scout.nav.roads.coverage(knownRoad.x,knownRoad.y)>.9);
assert(scout.nav.roads.coverage(southRally.x,southRally.y)>.9,'The rally lies on the actual highway');
const southernTowers=scout.state.buildings.filter(b=>b.campId===finalCamp.id&&b.kind==='mg-tower');
for(const arrival of [roadEntry,scout.state.camps[3].gate]){
 const formation=scout.nav.roads.formation(southRally,arrival,12,config.worldScale);
 assert(formation?.slots.length>=12,'The highway fits a whole column from either direction');
 for(const slot of formation.slots.slice(0,12)){
  assert(scout.inBounds(slot.x,slot.y)&&scout.nav.roads.coverage(slot.x,slot.y)>.58);
  assert(southernTowers.every(b=>Math.hypot(slot.x-b.x,slot.y-b.y)>scout.buildingSpec(b).range+12));
 }
}
reveal(southRally);
const rallySignal=southernApproachSignal(scout);
assert.equal(rallySignal.kind,'intel');
assert.deepEqual([rallySignal.x,rallySignal.y],[southRally.x,southRally.y]);
scout.state.camps[3].cleared=true;
assert.equal(southernApproachSignal(scout),null,'Remove the approach after clearing the headquarters');
const oilFirst=new Mission(config,field);
oilFirst.advance(2.7);
const oilPoint=field.gridToWorld(config.oilFields[0]);
const oilOrder=oilFirst.build(['u4'],'derrick',oilPoint.x,oilPoint.y);
assert(oilOrder.ok,oilOrder.reason);
oilFirst.advance(65);
assert(oilFirst.entity(oilOrder.id).completed,'The first builder can park within reach and finish the first derrick alone');
const traffic=new Mission(config,field);
const stalledPair=[
 {x:-1391.9818,y:783.6999,heading:1.33193,waypoint:{x:-1392,y:800},goal:{x:-794.54,y:1077.31}},
 {x:-1375.9505,y:795.6683,heading:1.05886,waypoint:{x:-1360,y:784},goal:{x:-805.46,y:1098.69}},
];
const vans=stalledPair.map(({waypoint,goal,...pose})=>traffic.addUnit('bukhanka','rai',pose,{
 heading:pose.heading,path:[waypoint],task:{type:'move',...goal},
}));
// These saved poses are inside an original cliff cell. A stale route through
// that cell is no longer legal; a replacement order must physically evacuate.
for(const [index,van] of vans.entries())assert(traffic.order([van.id],'move',stalledPair[index].goal).ok,'Saved cliff pose receives a bounded exit route');
const firstMotion=[null,null];
for(let step=0;step<300;step++){
 traffic.advance(.1);
 assert(vehicleClearance(...vans,config.worldScale,field)>=0,'Recovery sweeps must keep the two vans apart');
 for(const [index,van] of vans.entries())if(Math.hypot(van.x-stalledPair[index].x,van.y-stalledPair[index].y)>.1)firstMotion[index]??=(step+1)/10;
}
for(const [index,van] of vans.entries()){
 const origin=stalledPair[index];
 if(process.argv.includes('--diagnose'))console.log(JSON.stringify({case:'old cliff pose',firstMotion:firstMotion[index],van}));
 assert(firstMotion[index]!==null&&firstMotion[index]<=7,`Van ${van.id} waited ${firstMotion[index]} seconds before moving`);
 assert(Math.hypot(van.x-origin.x,van.y-origin.y)>12,`Van ${van.id} must leave the mutual deadlock`);
}
const slopeStart={x:-815.9248,y:453.4290,heading:-.81455};
const firstPoint={x:-832,y:448};
const climbingVan=traffic.addUnit('bukhanka','rai',slopeStart,{
 heading:slopeStart.heading,path:[firstPoint],task:{type:'move',...firstPoint},
});
assert(!traffic.nav.allowed(...traffic.nav.grid(slopeStart.x,slopeStart.y)));
const newGoal=traffic.state.camps[3].gate;
traffic.state.bounds=config.finalMapBounds.slice();
traffic.rebuildNavigation();
assert(traffic.order([climbingVan.id],'move',newGoal).ok,'A van on a steep cell accepts a replacement order');
for(let step=0;step<120;step++)traffic.advance(.1);
assert(Math.hypot(climbingVan.x-slopeStart.x,climbingVan.y-slopeStart.y)>60
 &&traffic.nav.allowed(...traffic.nav.grid(climbingVan.x,climbingVan.y)),'The van must drive off the slope onto its new route');
const turningStart={x:-808.7961,y:460.1537,heading:slopeStart.heading};
const emptyPass=new Mission(config,field);
emptyPass.state.units=emptyPass.state.units.filter(u=>u.owner==='rai'&&u.kind==='builder');
emptyPass.state.buildings=emptyPass.state.buildings.filter(b=>b.campId==='west-south');
emptyPass.state.bounds=config.finalMapBounds.slice();
emptyPass.rebuildNavigation();
const turningVan=emptyPass.addUnit('bukhanka','rai',turningStart,{heading:turningStart.heading});
assert(!emptyPass.vehiclePath(turningVan,newGoal),'Fixture needs a slope with no straight entry to the route grid');
assert(emptyPass.order([turningVan.id],'move',newGoal).ok&&turningVan.detour,'The replacement order needs a checked exit arc');
for(let step=0;step<140;step++){
 emptyPass.advance(.1);
 assert(Math.hypot(turningVan.x-turningVan.previousX,turningVan.y-turningVan.previousY)<8,'The slope escape must be driven');
}
assert(Math.hypot(turningVan.x-turningStart.x,turningVan.y-turningStart.y)>60
 &&emptyPass.nav.allowed(...emptyPass.nav.grid(turningVan.x,turningVan.y)),`The arc must reach the route (${turningVan.x}, ${turningVan.y})`);
function dismiss(){for(const key of [...mission.state.pendingCinematics]){seen.push({key,time:mission.state.time});mission.finishCinematic(key);}}
const mechanics={workSteps:0,constructionGated:true,repairGated:true,interruptProjection:false,buildingsOnlyRepair:false,builderHandoff:false};
// Builders cannot repair vehicles, including an explicitly requested repair.
{
 const repair=new Mission(config,field),worker=repair.state.units.find(u=>u.kind==='builder'),target=repair.state.units.find(u=>u.kind==='bukhanka');
 repair.damage(target,80,null);const hp=target.hp;assert(!repair.order([worker.id],'repair',target).ok);
 repair.setBuilderAutoRepair(true);repair.advance(1);assert.equal(target.hp,hp);assert(!worker.builderWorking);
 mechanics.buildingsOnlyRepair=true;
}
function step(){
 const progress=new Map(mission.state.buildings.map(b=>[b.id,b.progress])),hp=new Map(mission.state.units.map(u=>[u.id,u.hp])),armor=new Map(mission.state.units.map(u=>[u.id,u.fieldHpBonus??0]));
 const servicing=new Set(mission.state.units.filter(u=>u.factoryVisit?.phase==='inside').map(u=>u.id));
 dismiss();mission.advance(.1);events.push(...mission.drainEvents());mission.drainEffects();
 const workers=mission.state.units.filter(u=>u.hp>0&&u.kind==='builder');
 for(const unit of workers){
  if(!unit.builderWorking)continue;
  mechanics.workSteps++;
  assert(Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)<1e-8,'Projection during movement');
  assert(unit.builderContact?.every(Number.isFinite),'Projection must have a world target');

 }
 for(const b of mission.state.buildings)if(b.progress>(progress.get(b.id)??b.progress))assert(workers.some(u=>u.builderWorking&&u.task?.type==='build'&&u.task.targetId===b.id),'Construction progresses without contact');
 for(const u of mission.state.units)if(u.hp>(hp.get(u.id)??u.hp)){
  const addedArmor=Math.max(0,(u.fieldHpBonus??0)-(armor.get(u.id)??0));
  assert(u.hp-hp.get(u.id)<=addedArmor+1e-8||servicing.has(u.id)||u.factoryVisit?.phase==='inside','Vehicle healing outside the factory');
 }
}
function orderNearby(m,unit){for(const [dx,dy] of [[64,0],[-64,0],[0,64],[0,-64],[48,48],[-48,-48]]){const p=m.nav.nearest(unit.x+dx,unit.y+dy,3);if(p&&Math.hypot(p.x-unit.x,p.y-unit.y)>30&&m.order([unit.id],'move',p).ok)return true;}return false;}
function testInterruptProjection(){
 const m=new Mission(config,field);m.load(mission.save());
 const worker=m.state.units.find(u=>u.kind==='builder'&&u.builderWorking);
 assert(worker,'Interrupt fixture needs an active projector');assert(orderNearby(m,worker));
 let moved=false;
 for(let i=0;i<100&&!moved;i++){
  m.advance(.1);
  moved=Math.hypot(worker.x-worker.previousX,worker.y-worker.previousY)>.0001;
  assert(!worker.builderWorking,'Projector stays on after move order');
 }
 assert(moved,'Builder must leave when ordered');
 mechanics.interruptProjection=true;
}
function testBuilderHandoff(point){
 const m=new Mission(config,field);
 const [first,second]=m.state.units.filter(u=>u.kind==='builder');
 const result=m.build([first.id],'generator',point.x,point.y);
 assert(result.ok,result.reason);
 const building=m.entity(result.id),afterPurchase=m.state.energy;
 for(let i=0;i<500&&!first.builderWorking;i++)m.advance(.1);
 assert(first.builderWorking,'First builder reaches the unfinished structure');
 assert(orderNearby(m,first),'First builder can leave its work position');
 assert(m.order([second.id],'build',building).ok,'Second builder can take over unfinished construction');
 for(let i=0;i<800&&!building.completed;i++)m.advance(.1);
 assert(building.completed,'Second builder finishes the same structure');
 assert.equal(m.state.energy,afterPurchase-building.cost,'Taking over does not charge for the structure again');
 mechanics.builderHandoff=true;
}
function until(predicate,seconds,label){let ticks=0;while(!predicate()&&ticks++<seconds*10)step();if(!predicate()){fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());}assert(predicate(),label+' timed out: '+JSON.stringify({time:mission.state.time,status:mission.state.status,flags:mission.state.flags,energy:mission.state.energy}));}
function site(kind){const points=[];for(let x=start.x-256;x<=start.x+256;x+=8)for(let y=start.y-240;y<=start.y+256;y+=8){const result=mission.placement(kind,x,y);if(result.ok)points.push(result);}points.sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y));return points[0];}
function construct(kind,point=site(kind)){assert(point,'No buildable site: '+kind);const cost=config.buildings[kind].cost,energy=mission.state.energy,result=mission.build(builders(),kind,point.x,point.y);assert(result.ok,kind+': '+result.reason);assert.equal(mission.state.energy,energy);until(()=>mission.entity(result.id)?.completed,180,'Build '+kind);console.log('built',kind,mission.state.time.toFixed(1),point.x,point.y);return mission.entity(result.id);}
assert.equal(mission.advance(.1),1);assert.equal(mission.state.time,.1,'Field radio must leave simulation running');dismiss();
const reservation=field.gridToWorld(config.oilFields[0]);assert(!mission.placement('generator',reservation.x,reservation.y).ok,'Oil reservation');
const generatorSite=site('generator');
testBuilderHandoff(generatorSite);
const generator=construct('generator',generatorSite);testInterruptProjection();const oil=config.oilFields.map(g=>field.gridToWorld(g)).map(p=>mission.placement('derrick',p.x,p.y)).find(p=>p.ok);assert(oil,'No initial oil point');const derrick=construct('derrick',oil);assert(mission.state.powered,'Energy pair online');
const powerTest=new Mission(config,field);
const station=powerTest.addStructure('generator','rai',generatorSite,{completed:true});
const secondStation=powerTest.addStructure('generator','rai',{x:generatorSite.x+96,y:generatorSite.y});
const wells=config.oilFields.slice(0,5).map(grid=>powerTest.addStructure('derrick','rai',field.gridToWorld(grid),{completed:true}));
assert.equal(wells.length,5);
powerTest.updateEconomy(1);
assert.equal(powerTest.state.oilLinked,4,'One finished station powers four wells');
assert.equal(powerTest.state.energyRate,4*config.buildings.derrick.energyPerSecond);
const fifth=wells[4];
assert.equal(fifth.powered,false);
assert.equal(fifth.pumpTime??0,0);
secondStation.completed=true;
powerTest.updateEconomy(1);
assert.equal(powerTest.state.oilLinked,5,'The fifth well starts when the second station is finished');
assert.equal(powerTest.state.energyRate,5*config.buildings.derrick.energyPerSecond);
assert.equal(fifth.pumpTime,1);
station.hp=0;
powerTest.updateEconomy(1);
assert.equal(powerTest.state.oilLinked,4,'Losing one station removes four slots');
assert.equal(fifth.powered,false);
assert.equal(fifth.pumpTime,1,'The disconnected pump stays still');
const cancelSite=site('bunker'),before=mission.state.energy,cancelled=mission.build(builders(),'bunker',cancelSite.x,cancelSite.y);assert(cancelled.ok);assert(mission.cancelBuilding(cancelled.id).ok);assert.equal(mission.state.energy,before,'Unused construction refunded exactly');assert(!mission.cancelBuilding(cancelled.id).ok,'No duplicate refund');
const factory=construct('factory'),lab=construct('lab'),bunker=construct('bunker');
until(()=>mission.canSpend(130),100,'Funds for production');assert(mission.produce(factory.id,'bukhanka').ok);until(()=>mission.state.statistics.produced===1,100,'Factory output');assert(!mission.produce(factory.id,'flamer').ok,'Locked weapon cannot be produced');
const save=mission.save(),loaded=new Mission(config,field);loaded.load(save);assert.equal(loaded.save(),save,'Save round trip exact');
const legacy=JSON.parse(save);
legacy.state.flags.lastRevealed=true;
legacy.state.bounds=[0,0,53,80];
const legacyBunker=legacy.state.buildings.find(building=>building.id===bunker.id);
legacyBunker.rotation=Math.PI/2;
legacyBunker.halfWidth=7*config.worldScale/2;
legacyBunker.halfDepth=8*config.worldScale/2;
loaded.load(legacy);
assert.deepEqual([legacyBunker.halfWidth,legacyBunker.halfDepth],
 [...config.buildings.bunker.footprintMetres].reverse().map(length=>length*config.worldScale/2),
 'Old rotated bunkers use the new collision footprint');
const southernRoad=field.roadNetwork.paths.find(path=>path.to==='west-south');
const bend=southernRoad.points.reduce((south,point)=>point.y<south.y?point:south);
assert(loaded.inBounds(bend.x,bend.y-bend.width/2),'Expanded sector includes the outside of the western bend in old saves');
assert(loaded.nav.findPath(southernRoad.points[0],bend)&&loaded.nav.findPath(bend,southernRoad.points.at(-1)),'Both sides of the western bend are reachable');
const stronghold=mission.state.camps.find(camp=>camp.id===southernRoad.to);
const defenses=mission.state.buildings.filter(building=>building.campId===stronghold.id);
const towers=defenses.filter(building=>building.kind==='mg-tower');
assert.equal(towers.length,2);
assert(towers.every(tower=>Math.hypot(tower.x-stronghold.gate.x,tower.y-stronghold.gate.y)<config.buildings['mg-tower'].range&&mission.lineOfSight(tower,stronghold.gate)),'Both towers can cover the gate');
assert(defenses.every((a,i)=>defenses.slice(i+1).every(b=>Math.abs(a.x-b.x)>=a.halfWidth+b.halfWidth||Math.abs(a.y-b.y)>=a.halfDepth+b.halfDepth)),
 'Stronghold collision footprints stay separate');
assert(defenses.every(b=>southernRoad.points.every(p=>
 Math.abs(p.x-b.x)>=b.halfWidth+mission.nav.clearance||Math.abs(p.y-b.y)>=b.halfDepth+mission.nav.clearance)),
 'Stronghold defenses leave the entire approach centerline clear for vehicles');
const oldLayout=JSON.parse(save);
const oldCamp=oldLayout.state.camps.find(camp=>camp.id===stronghold.id);
delete oldCamp.towerGrids;
delete oldCamp.coreRotationDegrees;
const oldGrid=[12,72],oldCenter=field.gridToWorld(oldGrid);
Object.assign(oldCamp,oldCenter,{grid:oldGrid});
const oldDefenses=oldLayout.state.buildings.filter(building=>building.campId===stronghold.id);
Object.assign(oldDefenses[0],oldCenter,{rotation:0});
oldDefenses.slice(1).forEach((tower,i)=>Object.assign(tower,{x:oldCenter.x+(i?48:-48),y:oldCenter.y-30}));
loaded.load(structuredClone(oldLayout));
assert.deepEqual(loaded.state.buildings.filter(building=>building.campId===stronghold.id),defenses,'A hidden stronghold moves without changing structure identity');
oldLayout.state.flags.lastRevealed=true;
loaded.load(structuredClone(oldLayout));
assert.deepEqual(loaded.state.buildings.filter(building=>building.campId===stronghold.id),oldDefenses,'A revealed stronghold stays in place when an old battle is resumed');
const result={realTerrain:true,baseBuildings:mission.state.buildings.filter(b=>b.owner==='rai'&&b.completed).map(b=>b.kind),oilLinked:mission.state.oilLinked,produced:mission.state.statistics.produced,seconds:mission.state.time,cancelRefund:true,saveRoundTrip:true,legacySectorExpanded:true,builderHandoff:mechanics.builderHandoff,cinematics:seen,events:events.map(e=>e.type),status:mission.state.status};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/mission-base.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));

if(process.argv.includes('--full')){
 // Drive the real command API, costs, combat and artifact pickup. No HP, fog,
 // resources, unlocks or mission flags are injected by this playthrough.
 const army=()=>mission.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&u.kind==='bukhanka');
 const defence={x:factory.x+120,y:factory.y};assert(mission.setRally(factory.id,defence).ok);reportOrder(mission.order(army().map(u=>u.id),'move',defence),'Defend factory');
 for(let i=0;i<9;i++){until(()=>mission.canSpend(config.units.bukhanka.cost),100,'Army resources');assert(mission.produce(factory.id,'bukhanka').ok);}
 until(()=>mission.state.statistics.produced===10,400,'Army production');
 until(()=>mission.state.flags.raidWon,300,'Repel first raid');
 for(const camp of mission.state.camps){
  const ids=()=>army().map(u=>u.id);let iterations=0;
  if(camp.index===1&&!camp.cleared){
   // The northern road passes the eastern tower before it reaches the warehouse.
   reportOrder(mission.order(ids(),'attack-move',camp.gate),'Advance through the northern road with combat');
   until(()=>camp.cleared||!army().length,235,'Clear the warehouse with one attack-move order');
  }
  const rally=camp.index===3?field.gridToWorld(config.camps[3].approachGrid):null;
  if(camp.index===3){
   const mustered=()=>army().filter(u=>Math.hypot(u.x-rally.x,u.y-rally.y)<100);
   reportOrder(mission.order(ids(),'move',rally),'Muster outside tower range');
   until(()=>mission.exploredAt(rally.x,rally.y),220,'Scout the legal southern approach');
   assert(mission.setRally(factory.id,rally).ok);
   const reinforcements=Math.max(0,12-army().length);
   for(let i=0;i<reinforcements;i++){
    until(()=>mission.canSpend(config.units.bukhanka.cost),100,'Reinforcement resources');
    assert(mission.produce(factory.id,'bukhanka').ok);
   }
   until(()=>mustered().length>=8,360,'Gather eight vans on the western approach');
   const damaged=mustered().find(u=>u.hp<u.maxHp);
   if(damaged){
    mission.stop([damaged.id]);
    reportOrder(mission.retreat([damaged.id]),'Vehicle service at the factory');
    until(()=>damaged.hp===damaged.maxHp,250,'Repair '+damaged.id);
   }
   const westTower=towers.reduce((west,tower)=>tower.x<west.x?tower:west);
   // Use the road beyond the bend to engage the western tower on its own.
   reportOrder(mission.order(ids(),'attack-move',field.gridToWorld([9,75.1875])),'Advance to the western firing line');
   until(()=>westTower.hp<=0||!army().length,90,'Disable the western tower first');
   assert(westTower.hp<=0,'The column must disable the western tower before advancing');
  }
  while(!camp.cleared&&iterations++<160){
   const visible=[...mission.state.units,...mission.state.buildings].filter(e=>e.hp>0&&e.campId===camp.id&&mission.visibleAt(e.x,e.y)),centre=army().reduce((p,u)=>({x:p.x+u.x/army().length,y:p.y+u.y/army().length}),{x:0,y:0});visible.sort((a,b)=>Math.hypot(a.x-centre.x,a.y-centre.y)-Math.hypot(b.x-centre.x,b.y-centre.y));
   const tower=camp.index===3&&visible.filter(e=>e.kind==='mg-tower')
    .sort((a,b)=>Math.hypot(a.x-rally.x,a.y-rally.y)-Math.hypot(b.x-rally.x,b.y-rally.y))[0];
   const target=tower??visible[0];
   if(target)reportOrder(mission.order(ids(),'attack',target),camp.id);
   else reportOrder(mission.order(ids(),camp.index===3?'attack-move':'move',camp.gate),camp.id);
   for(let i=0;i<50;i++)step();if(!army().length){fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());throw new Error('Combat force lost at '+camp.id);}
  }
  if(!camp.cleared)fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());assert(camp.cleared,'Camp did not clear: '+camp.id);console.log('cleared',camp.id,mission.state.time.toFixed(1),'survivors',army().length);
  if(camp.artifact){const artifact=mission.state.artifacts.find(a=>a.key===camp.artifact);reportOrder(mission.order(ids(),'move',artifact),camp.id+' artifact');until(()=>mission.state.artifactKeys.includes(camp.artifact),150,'Collect '+camp.artifact);until(()=>mission.canSpend(config.research[camp.artifact].cost),100,'Research funds');assert(mission.research(lab.id,camp.artifact).ok);until(()=>mission.state.research[camp.artifact],100,'Research '+camp.artifact);}
 }
 until(()=>mission.state.status==='victory',5,'Victory');dismiss();assert(mission.objectives().every(o=>o.done),'All five objectives');const finalSave=mission.save();loaded.load(finalSave);assert.equal(loaded.save(),finalSave,'Completed mission restores exactly');assert.equal(new Set(seen.map(s=>s.key)).size,seen.length,'Story events play once');
 assert(mechanics.buildingsOnlyRepair,'Building-only repair regression fixture ran');const full={seconds:mission.state.time,status:mission.state.status,research:mission.state.research,artifactKeys:mission.state.artifactKeys,camps:mission.state.camps.map(c=>({id:c.id,cleared:c.cleared})),statistics:mission.state.statistics,raidWon:mission.state.flags.raidWon,objectives:mission.objectives(),survivors:army().length,cinematics:seen,mechanics,saveRoundTrip:true};fs.writeFileSync('campaign/reports/mission-full.json',JSON.stringify(full,null,2));fs.writeFileSync('campaign/reports/mission-completed-save.json',finalSave);console.log(JSON.stringify(full));
}
function reportOrder(result,label){if(!result.ok)fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());assert(result.ok,label+': '+result.reason);}
