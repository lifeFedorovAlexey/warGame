import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=path=>JSON.parse(fs.readFileSync(path,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json'),original=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(original);const field=refineRoadHeightfield(original);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const mission=new Mission(config,field),seen=[],events=[],start=field.gridToWorld(config.startGrid),builders=()=>mission.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&u.kind==='builder').map(u=>u.id);
function dismiss(){for(const key of [...mission.state.pendingCinematics]){seen.push({key,time:mission.state.time});mission.finishCinematic(key);}}
const mechanics={workSteps:0,constructionGated:true,repairGated:true,interruptProjection:false,movingRepair:false,builderHandoff:false};
function step(){
 const progress=new Map(mission.state.buildings.map(b=>[b.id,b.progress])),hp=new Map(mission.state.units.map(u=>[u.id,u.hp]));
 dismiss();mission.advance(.1);events.push(...mission.drainEvents());mission.drainEffects();
 const workers=mission.state.units.filter(u=>u.hp>0&&u.kind==='builder');
 for(const unit of workers){
  if(!unit.builderWorking)continue;
  mechanics.workSteps++;
  assert(Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)<1e-8,'Projection during movement');
  assert(unit.builderContact?.every(Number.isFinite),'Projection must have a world target');

 }
 for(const b of mission.state.buildings)if(b.progress>(progress.get(b.id)??b.progress))assert(workers.some(u=>u.builderWorking&&u.task?.type==='build'&&u.task.targetId===b.id),'Construction progresses without contact');
 for(const u of mission.state.units)if(u.hp>(hp.get(u.id)??u.hp))assert(workers.some(w=>w.builderWorking&&w.task?.type==='repair'&&w.task.targetId===u.id),'Healing without contact');
 if(!mechanics.movingRepair){const worker=workers.find(u=>u.builderWorking&&u.task?.type==='repair'&&mission.entity(u.task.targetId)?.hp<mission.entity(u.task.targetId)?.maxHp-4);if(worker)testMovingRepair(worker);}
}
function orderNearby(m,unit){for(const [dx,dy] of [[64,0],[-64,0],[0,64],[0,-64],[48,48],[-48,-48]]){const p=m.nav.nearest(unit.x+dx,unit.y+dy,3);if(p&&Math.hypot(p.x-unit.x,p.y-unit.y)>30&&m.order([unit.id],'move',p).ok)return true;}return false;}
function testMovingRepair(worker){
 // Isolated save clone: array order must not permit healing before target movement.
 const m=new Mission(config,field);m.load(mission.save());for(const id of [...m.state.pendingCinematics])m.finishCinematic(id);
 const target=m.entity(worker.task.targetId);m.state.units.sort((a,b)=>(a.id===target.id?1:0)-(b.id===target.id?1:0));assert(orderNearby(m,target),'Moving repair fixture needs an accessible destination');
 let moved=false;for(let i=0;i<20&&!moved;i++){const before=target.hp;m.advance(.1);moved=Math.hypot(target.x-target.previousX,target.y-target.previousY)>.05;if(moved){assert(target.hp<=before,'Moving target healed');assert(m.state.units.filter(u=>u.task?.type==='repair'&&u.task.targetId===target.id).every(u=>!u.builderWorking),'Moving target still welds');}}
 assert(moved,'Repair target did not move');mechanics.movingRepair=true;
}
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
 assert.equal(m.state.energy,afterPurchase,'Taking over does not charge for the structure again');
 mechanics.builderHandoff=true;
}
function until(predicate,seconds,label){let ticks=0;while(!predicate()&&ticks++<seconds*10)step();if(!predicate()){fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());}assert(predicate(),label+' timed out: '+JSON.stringify({time:mission.state.time,status:mission.state.status,flags:mission.state.flags,energy:mission.state.energy}));}
function site(kind){const points=[];for(let x=start.x-256;x<=start.x+256;x+=8)for(let y=start.y-240;y<=start.y+256;y+=8){const result=mission.placement(kind,x,y);if(result.ok)points.push(result);}points.sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y));return points[0];}
function construct(kind,point=site(kind)){assert(point,'No buildable site: '+kind);const cost=config.buildings[kind].cost,energy=mission.state.energy,result=mission.build(builders(),kind,point.x,point.y);assert(result.ok,kind+': '+result.reason);assert.equal(mission.state.energy,energy-cost);until(()=>mission.entity(result.id)?.completed,180,'Build '+kind);console.log('built',kind,mission.state.time.toFixed(1),point.x,point.y);return mission.entity(result.id);}
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
  if(camp.index===3)for(const unit of army().filter(u=>u.hp<u.maxHp)){mission.stop([unit.id]);reportOrder(mission.order(builders(),'repair',unit),'Field repair');until(()=>unit.hp===unit.maxHp,250,'Repair '+unit.id);}
  while(!camp.cleared&&iterations++<160){
   const visible=[...mission.state.units,...mission.state.buildings].filter(e=>e.hp>0&&e.campId===camp.id&&mission.visibleAt(e.x,e.y)),centre=army().reduce((p,u)=>({x:p.x+u.x/army().length,y:p.y+u.y/army().length}),{x:0,y:0});visible.sort((a,b)=>Math.hypot(a.x-centre.x,a.y-centre.y)-Math.hypot(b.x-centre.x,b.y-centre.y));
   if(visible[0])reportOrder(mission.order(ids(),'attack',visible[0]),camp.id);else reportOrder(mission.order(ids(),'move',camp.gate),camp.id);
   for(let i=0;i<50;i++)step();if(!army().length)throw new Error('Combat force lost at '+camp.id);
  }
  if(!camp.cleared)fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());assert(camp.cleared,'Camp did not clear: '+camp.id);console.log('cleared',camp.id,mission.state.time.toFixed(1),'survivors',army().length);
  if(camp.artifact){const artifact=mission.state.artifacts.find(a=>a.key===camp.artifact);reportOrder(mission.order(ids(),'move',artifact),camp.id+' artifact');until(()=>mission.state.artifactKeys.includes(camp.artifact),150,'Collect '+camp.artifact);until(()=>mission.canSpend(config.research[camp.artifact].cost),100,'Research funds');assert(mission.research(lab.id,camp.artifact).ok);until(()=>mission.state.research[camp.artifact],100,'Research '+camp.artifact);}
 }
 until(()=>mission.state.status==='victory',5,'Victory');dismiss();assert(mission.objectives().every(o=>o.done),'All five objectives');const finalSave=mission.save();loaded.load(finalSave);assert.equal(loaded.save(),finalSave,'Completed mission restores exactly');assert.equal(new Set(seen.map(s=>s.key)).size,seen.length,'Story events play once');
 assert(mechanics.movingRepair,'Moving repair regression fixture ran');const full={seconds:mission.state.time,status:mission.state.status,research:mission.state.research,artifactKeys:mission.state.artifactKeys,camps:mission.state.camps.map(c=>({id:c.id,cleared:c.cleared})),statistics:mission.state.statistics,raidWon:mission.state.flags.raidWon,objectives:mission.objectives(),survivors:army().length,cinematics:seen,mechanics,saveRoundTrip:true};fs.writeFileSync('campaign/reports/mission-full.json',JSON.stringify(full,null,2));fs.writeFileSync('campaign/reports/mission-completed-save.json',finalSave);console.log(JSON.stringify(full));
}
function reportOrder(result,label){if(!result.ok)fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());assert(result.ok,label+': '+result.reason);}
