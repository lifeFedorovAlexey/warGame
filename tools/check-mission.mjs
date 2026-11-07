import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {BUILDER,forwardBuilder,vehiclePose,vehicleToWorld} from '../campaign/builder-kinematics.js';
const json=path=>JSON.parse(fs.readFileSync(path,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json'),original=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(original);const field=refineRoadHeightfield(original);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const mission=new Mission(config,field),seen=[],events=[],start=field.gridToWorld(config.startGrid),builders=()=>mission.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&u.kind==='builder').map(u=>u.id);
function dismiss(){for(const key of [...mission.state.pendingCinematics]){seen.push({key,time:mission.state.time});mission.finishCinematic(key);}}
const mechanics={workSteps:0,foldLockedSteps:0,constructionGated:true,repairGated:true,interruptFold:false,movingRepair:false};
function step(){
 const progress=new Map(mission.state.buildings.map(b=>[b.id,b.progress])),hp=new Map(mission.state.units.map(u=>[u.id,u.hp]));
 dismiss();mission.advance(.1);events.push(...mission.drainEvents());mission.drainEffects();
 const workers=mission.state.units.filter(u=>u.hp>0&&u.kind==='builder');
 for(const unit of workers){
  if(unit.rig&&unit.rig.phase!=='stowed'){assert(Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)<1e-8,'Deployed builder moved');if(unit.rig.phase.startsWith('fold-'))mechanics.foldLockedSteps++;}
  if(!unit.builderWorking)continue;mechanics.workSteps++;assert(unit.rig.ready,'Work before deployment');
  const p=forwardBuilder(unit.rig.q).tip,tip=vehicleToWorld(p.map((v,i)=>v+BUILDER.mount[i]),vehiclePose(unit,field,config.worldScale));
  assert(Math.hypot(...tip.map((v,i)=>v-unit.builderContact[i]))<=.002*config.worldScale+1e-6,'Work without rendered contact');
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
function testInterruptFold(){
 const m=new Mission(config,field);m.load(mission.save());for(const id of [...m.state.pendingCinematics])m.finishCinematic(id);const worker=m.state.units.find(u=>u.kind==='builder'&&u.rig?.ready);assert(worker,'Interrupt fixture needs deployed builder');assert(orderNearby(m,worker));let waited=0,moved=false;
 for(let i=0;i<600&&!moved;i++){m.advance(.1);moved=Math.hypot(worker.x-worker.previousX,worker.y-worker.previousY)>.0001;if(moved)assert.equal(worker.rig.phase,'stowed','Movement started before folding');else if(worker.rig.phase!=='stowed')waited++;}
 assert(waited>0&&moved,'Builder must fold and then move');mechanics.interruptFold=true;
}
function until(predicate,seconds,label){let ticks=0;while(!predicate()&&ticks++<seconds*10)step();if(!predicate()){fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/mission-failure.json',mission.save());}assert(predicate(),label+' timed out: '+JSON.stringify({time:mission.state.time,status:mission.state.status,flags:mission.state.flags,energy:mission.state.energy}));}
function site(kind){const points=[];for(let x=start.x-256;x<=start.x+256;x+=8)for(let y=start.y-240;y<=start.y+256;y+=8){const result=mission.placement(kind,x,y);if(result.ok)points.push(result);}points.sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y));return points[0];}
function construct(kind,point=site(kind)){assert(point,'No buildable site: '+kind);const cost=config.buildings[kind].cost,energy=mission.state.energy,result=mission.build(builders(),kind,point.x,point.y);assert(result.ok,kind+': '+result.reason);assert.equal(mission.state.energy,energy-cost);until(()=>mission.entity(result.id)?.completed,180,'Build '+kind);console.log('built',kind,mission.state.time.toFixed(1),point.x,point.y);return mission.entity(result.id);}
assert.equal(mission.advance(5),50);assert.equal(mission.state.time,0,'Cinematic freezes simulation');dismiss();
const reservation=field.gridToWorld(config.oilFields[0]);assert(!mission.placement('generator',reservation.x,reservation.y).ok,'Oil reservation');
const generator=construct('generator');testInterruptFold();const oil=config.oilFields.map(g=>field.gridToWorld(g)).map(p=>mission.placement('derrick',p.x,p.y)).find(p=>p.ok);assert(oil,'No initial oil point');const derrick=construct('derrick',oil);assert(mission.state.powered,'Energy pair online');
const cancelSite=site('bunker'),before=mission.state.energy,cancelled=mission.build(builders(),'bunker',cancelSite.x,cancelSite.y);assert(cancelled.ok);assert(mission.cancelBuilding(cancelled.id).ok);assert.equal(mission.state.energy,before,'Unused construction refunded exactly');assert(!mission.cancelBuilding(cancelled.id).ok,'No duplicate refund');
const factory=construct('factory'),lab=construct('lab'),bunker=construct('bunker');
until(()=>mission.canSpend(130),100,'Funds for production');assert(mission.produce(factory.id,'bukhanka').ok);until(()=>mission.state.statistics.produced===1,100,'Factory output');assert(!mission.produce(factory.id,'flamer').ok,'Locked weapon cannot be produced');
const save=mission.save(),loaded=new Mission(config,field);loaded.load(save);assert.equal(loaded.save(),save,'Save round trip exact');
const result={realTerrain:true,baseBuildings:mission.state.buildings.filter(b=>b.owner==='rai'&&b.completed).map(b=>b.kind),oilLinked:mission.state.oilLinked,produced:mission.state.statistics.produced,seconds:mission.state.time,cancelRefund:true,saveRoundTrip:true,cinematics:seen,events:events.map(e=>e.type),status:mission.state.status};
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
