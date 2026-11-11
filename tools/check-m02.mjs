import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeField,makeMission,readJson} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {updateM02,updateM02Steps} from '../campaign/mission02.js';
import {M02} from '../campaign/mission02-config.js';
import {updateCampaignProductionSteps} from '../campaign/scav-production.js';
import {appendM02Story} from '../campaign/mission02-radio.js';
import {StoryDirector} from '../campaign/story-director.js';
import {vehicleClearance} from '../campaign/vehicle-motion.js';
import layout from '../assets/campaign/alpha/mission02/layout.js';
import {setFactoryModernization,modernizeAfterRepair} from '../campaign/factory-modernization.js';
import {fixture as flatFixture} from './check-start-latency-coordinator.mjs';
const field=makeField(),passed=[],full=g=>{let step;do{step=g.next();}while(!step.done);return step.value;};
const fresh=()=>prepareM02Diagnostic(makeMission(field));
const check=(name,fn)=>{const started=performance.now();fn();passed.push({name,ms:Math.round(performance.now()-started)});console.log('PASS '+name);};
const pulse=m=>{m.state.time+=.6;updateM02(m);};
const saveRoundTrip=m=>{const json=m.save();m.load(json);return json;};
const kill=(m,id)=>{const e=m.entity(id);if(e)m.damage(e,100000,m.state.units.find(u=>u.owner==='rai'));};

check('m01 → m02 preserves the actual base, army, groups, orders, funding and fog',()=>{
 const m=makeMission(field),s=m.state;
 const b=m.addStructure('factory','rai',field.gridToWorld([13.5,50.75]),{completed:true,progress:1,hp:713,queue:[{kind:'bukhanka',progress:.42,cost:130,funding:{paid:68}}]});
 const lab=m.addStructure('lab','rai',field.gridToWorld([18.5,50]),{completed:true,progress:1,research:{key:'mg-ammo-1',progress:.38,cost:100,funding:{paid:70}}});
 m.addStructure('bunker','rai',field.gridToWorld([18,53]),{completed:true,progress:1,hp:456});
 const unit=s.units.find(u=>u.owner==='rai');unit.hp=187;unit.experience=72;unit.modifications=['hood-guard'];unit.task={type:'move',x:unit.x-24,y:unit.y-24};unit.combatPolicy={stance:'hold',retreat:.35};
 const builder=s.units.find(u=>u.kind==='builder');builder.task={type:'repair',targetId:'already-removed'};
 s.commandGroups=[{id:'unusual',unitIds:[unit.id],formation:'line'}];s.energy=937;s.designs.push({id:'custom',name:'Свой проект',components:['C01','B01','U01'],paint:'sand'});
 s.status='victory';s.camps.forEach(c=>c.cleared=true);s.flags.raidWon=true;
 m.explored[700]=255;const before=JSON.stringify({buildings:s.buildings.filter(b=>b.owner==='rai'),unit,groups:s.commandGroups,designs:s.designs,energy:s.energy});
 const count=s.units.filter(u=>u.owner==='rai').length;
 assert(m.enterM02().ok);delete unit.trafficOnScreen;
 assert.equal(JSON.stringify({buildings:s.buildings.filter(b=>b.owner==='rai'),unit,groups:s.commandGroups,designs:s.designs,energy:s.energy}),before);
 assert.equal(s.units.filter(u=>u.owner==='rai').length,count);assert.equal(builder.task,null);assert.equal(m.explored[700],255);assert.equal(s.campaign.results.m01.status,'victory');
 assert.equal(m.entity(b.id),b);assert.equal(m.entity(lab.id),lab);
});
check('idempotent entry, legacy m01 victory load and all m02 checkpoints',()=>{
 const m=makeMission(field);m.state.status='victory';m.state.camps.forEach(c=>c.cleared=true);saveRoundTrip(m);assert(m.enterM02().ok);
 const counts=[m.state.units.length,m.state.buildings.length];assert(m.enterM02().alreadyInitialized);saveRoundTrip(m);assert(m.enterM02().alreadyInitialized);
 assert.deepEqual([m.state.units.length,m.state.buildings.length],counts);assert.deepEqual(m.state.bounds,M02.bounds);
 assert(!m.state.pendingCinematics.includes('intro'));
});
check('authored zones, artifacts, exits, rally points and observer route are reachable',()=>{
 const m=fresh(),start=field.gridToWorld(m.config.startGrid),pose={...start,kind:'bukhanka',owner:'rai',heading:0};
 for(const base of Object.values(m.state.m02.bases)){
  for(const p of [base.gate,base.artifact.point,...base.rally]){
   assert(m.nav.findPath(start,p)?.length,base.id+' route');
   assert(m.vehicleMotionClear({...pose,...p},{...pose,...p},{...pose,...p}),base.id+' terrain');
  }
  for(const id of base.structureIds){const b=m.entity(id);assert.equal(m.nav.roads.coverage(b.x,b.y),0,id+' outside road');}
  if(base.factoryId){const b=m.entity(base.factoryId),p={...pose,x:b.x+Math.sin(b.rotation)*45,y:b.y-Math.cos(b.rotation)*45,heading:b.rotation,owner:'scavs'};assert(m.vehicleMotionClear(p,p,p),b.id+' exit');}
 }
 const o=m.entity(m.state.m02.observer.unitId);assert(m.vehiclePath(o,m.state.m02.observer.exit,{maxGoalDistance:12})?.length);
 for(const u of m.state.units.filter(u=>u.scenarioId))assert(m.vehicleMotionClear(u,u,u),u.scenarioId+' initial placement');
});
check('factory intervals, occupied exit, per-producer/global caps and destruction',()=>{
 const m=fresh(),b=m.state.m02.bases.hill_factory,p=b.production,f=m.entity(b.factoryId);
 m.advance(17.9);assert.equal(p.count,0);m.advance(1);assert.equal(p.count,1);assert.equal(p.waiting.length,1);
 m.advance(10); // Let the first physical vehicle leave the doorway before blocking it.
 const savedNext=p.nextAt;saveRoundTrip(m);assert.equal(m.state.m02.bases.hill_factory.production.nextAt,savedNext);
 const base=m.state.m02.bases.hill_factory,production=base.production,factory=m.entity(base.factoryId);
 const blocker=m.addUnit('bukhanka','rai',{x:factory.x,y:factory.y-45},{heading:Math.PI});
 production.nextAt=m.state.time;delete m.state.m02.nextProductionCheckAt;full(updateCampaignProductionSteps(m));assert.equal(production.count,1);assert.equal(factory.queue.length,1);
 const queued=factory.queue[0];m.state.time+=1;delete m.state.m02.nextProductionCheckAt;full(updateCampaignProductionSteps(m));assert.equal(factory.queue[0],queued);
 blocker.hp=0;m.state.time+=1;delete m.state.m02.nextProductionCheckAt;full(updateCampaignProductionSteps(m));assert.equal(production.count,2);
 const produced=m.state.units.filter(u=>u.m02Produced);for(let i=0;i<produced.length;i++)for(let j=0;j<i;j++)assert(vehicleClearance(produced[i],produced[j],m.config.worldScale,field)>=0);
 for(let i=produced.length;i<40;i++)m.addUnit('raider','scavs',{x:1400+i*25,y:-1700},{m02Produced:true,producerId:factory.id});
 production.nextAt=0;m.state.time+=1;delete m.state.m02.nextProductionCheckAt;full(updateCampaignProductionSteps(m));assert.equal(production.count,2);
 const old=m.state.units.filter(u=>u.hp>0&&u.m02Produced).length;kill(m,factory.id);pulse(m);m.state.time+=20;full(updateCampaignProductionSteps(m));assert.equal(production.count,2);assert.equal(m.state.units.filter(u=>u.hp>0&&u.m02Produced).length,old);
});
check('four unique carrier artifacts, immediate research unlock and stable neutralization',()=>{
 const m=fresh(),unit=m.state.units.find(u=>u.owner==='rai');
 for(const id of Object.keys(m.state.m02.bases)){
  const base=m.state.m02.bases[id];
  assert.equal(base.artifact.state,'sealed');kill(m,base.artifact.carrierId);pulse(m);assert.equal(base.artifact.state,'available');saveRoundTrip(m);
  const b=m.state.m02.bases[base.id.split('.').at(-1)];
  const collector=m.entity(unit.id);Object.assign(collector,b.artifact.point);pulse(m);assert.equal(b.artifact.state,'collected');assert(m.state.artifactKeys.includes(b.artifact.key));
  pulse(m);assert.equal(m.state.artifacts.filter(a=>a.id===b.artifact.id).length,1);
 }
 const b=m.state.m02.bases.east_factory;for(const id of b.structureIds)kill(m,id);for(const id of b.garrisonIds.slice(1))kill(m,id);
 const guard=m.entity(b.garrisonIds[0]);guard.x=b.gate.x+401;guard.y=b.gate.y;pulse(m);assert.notEqual(b.state,'neutralized','A guard beyond an arbitrary radius still holds its home assignment');kill(m,guard.id);pulse(m);assert.equal(b.state,'neutralized');saveRoundTrip(m);assert.equal(m.state.m02.bases.east_factory.state,'neutralized');
});
check('free outpost order; victory needs four samples, not research or remote raiders',()=>{
 for(const order of [['energy_hub','hill_factory','east_factory','sensor_outpost'],['sensor_outpost','east_factory','hill_factory','energy_hub']]){
  const m=fresh(),unit=m.state.units.find(u=>u.owner==='rai');let withheld;
  for(const id of order){const base=m.state.m02.bases[id];for(const target of [...base.structureIds,...base.garrisonIds])kill(m,target);Object.assign(unit,base.artifact.point);m.updateFog();pulse(m);if(!withheld){withheld=base.artifact;withheld.state='available';m.state.artifacts.find(a=>a.id===withheld.id).collected=false;}}
  Object.assign(unit,field.gridToWorld(m.config.startGrid));pulse(m);assert.equal(m.state.status,'running');
  m.addUnit('raider','scavs',field.gridToWorld([100,120]),{m02Produced:true,producerId:'destroyed-factory'});
  Object.assign(unit,withheld.point);m.updateFog();pulse(m);assert.equal(m.state.status,'victory');assert(!m.state.research.sensor);assert.equal(m.drainEvents().filter(e=>e.type==='victory').length,1);
  saveRoundTrip(m);pulse(m);assert.equal(m.state.status,'victory');assert.equal(m.drainEvents().filter(e=>e.type==='victory').length,0);
 }
});
check('flamer damage +20% once across save/load, no automatic weapon replacement',()=>{
 const m=fresh(),p=field.gridToWorld(m.config.startGrid),u=m.addUnit('flamer','rai',p),target=m.addUnit('raider','scavs',{x:p.x+40,y:p.y});
 const state=m.save();assert(m.attack(u,target,m.unitSpec(u)));const baseline=170-target.hp;
 m.load(state);m.state.research['flamer-upgrade']=true;assert(m.attack(m.entity(u.id),m.entity(target.id),m.unitSpec(u)));assert(Math.abs(170-m.entity(target.id).hp-baseline*1.2)<1e-6);
 const kinds=m.state.units.filter(u=>u.owner==='rai').map(u=>u.kind);saveRoundTrip(m);assert.deepEqual(m.state.units.filter(u=>u.owner==='rai').map(u=>u.kind),kinds);assert.equal(m.config.units.flamer.damage,24);
});
check('twin gun research → designer → real production and combat',()=>{
 const m=fresh(),lab=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='lab'),factory=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='factory');
 assert.equal(m.config.vehicleComponents.U02.cost/m.config.vehicleComponents.U01.cost,1.3);
 assert.equal(m.config.units['twin-machinegun'].range,m.config.units.bukhanka.range);
 assert(!m.availableVehicleRecipes().some(r=>r.kind==='twin-machinegun'));m.state.artifactKeys.push('twin-machinegun');assert(m.research(lab.id,'twin-machinegun').ok);m.advance(50);assert(m.state.research['twin-machinegun']);
 const design=m.saveDesign('Спарка',['C01','B01','U02'],'sand');assert(design.ok);assert(m.produce(factory.id,design.id).ok);m.advance(45);
 const unit=m.state.units.find(u=>u.owner==='rai'&&u.kind==='twin-machinegun');assert(unit,'A physical vehicle exits the player factory');
 const target=m.addUnit('raider','scavs',{x:unit.x+35,y:unit.y});unit.cooldown=0;assert(m.attack(unit,target,m.unitSpec(unit)));assert(target.hp<170);assert(m.state.units.some(u=>u.owner==='rai'&&u.kind==='bukhanka'));
});
check('sensor increases actual fog radius, cannot fire, loses current vision on death',()=>{
 const m=fresh();m.state.units=m.state.units.filter(u=>u.owner!=='rai');m.state.buildings=m.state.buildings.filter(b=>b.owner!=='rai');
 const p=field.gridToWorld([45,93]),u=m.addUnit('bukhanka','rai',p);m.updateFog();const standard=m.visible.filter(Boolean).length;
 u.kind='sensor';m.updateFog();assert(m.visible.filter(Boolean).length>standard*1.8);assert.equal(m.unitSpec(u).vision/m.config.units.bukhanka.vision,1.5);
 const enemy=m.addUnit('raider','scavs',{x:u.x+20,y:u.y});assert.equal(m.attack(u,enemy,m.unitSpec(u)),false);
 assert(!m.visibleAt(...Object.values(field.gridToWorld([120,93]))));u.hp=0;m.updateFog();assert.equal(m.visible.filter(Boolean).length,0);assert(m.explored.filter(Boolean).length>0);
});
check('builder installs one power module, preserves HP and oil-slot dependency',()=>{
 const m=fresh(),station=m.state.buildings.find(b=>b.kind==='generator'&&b.owner==='rai'),workers=m.state.units.filter(u=>u.kind==='builder');m.state.research['power-module']=true;
 station.hp=705;const before=m.linkOilWells(m.state.buildings.filter(b=>b.owner==='rai'&&b.completed),0);
 assert(m.installPowerModule(station.id,[workers[0].id]).ok);m.advance(160);assert(station.powerModule,'Builder must drive to the station and complete the module');assert.equal(station.hp,705);
 assert.equal(m.linkOilWells(m.state.buildings.filter(b=>b.owner==='rai'&&b.completed),0),before*1.25);assert(!m.installPowerModule(station.id,[workers[0].id]).ok);saveRoundTrip(m);
 assert.equal(m.linkOilWells(m.state.buildings.filter(b=>b.owner==='rai'&&b.completed),0),before*1.25);
 for(const b of m.state.buildings)if(b.kind==='derrick')b.hp=0;assert.equal(m.linkOilWells(m.state.buildings.filter(b=>b.owner==='rai'&&b.completed&&b.hp>0),0),0);
});
check('observer: death before/while fleeing, death wins same tick, saved escape',()=>{
 for(const phase of ['watching','fleeing','same-tick','escaped']){
  const m=fresh(),o=m.state.m02.observer,u=m.entity(o.unitId);
  if(phase!=='watching'){o.seen=true;o.state='fleeing';o.needsRoute=true;full(updateM02Steps(m));assert(u.path.length);}
  if(phase==='same-tick'||phase==='escaped')Object.assign(u,o.exit);
  if(phase!=='escaped')kill(m,u.id);saveRoundTrip(m);pulse(m);
  assert.equal(m.state.m02.observer.outcome,phase==='escaped'?'escaped':'intercepted');assert.equal(m.state.status,'running');assert(!m.entity(u.id));
  pulse(m);assert.equal(m.state.m02.observer.outcome,phase==='escaped'?'escaped':'intercepted');
 }
});
check('radio uses live facts, cancels obsolete scenes and never replays its prologue',()=>{
 const story=appendM02Story(readJson('assets/campaign/alpha/mission01/story-v2.json'),readJson('assets/campaign/alpha/mission02/story.json'));
 const m=fresh(),d=new StoryDirector(story);let cue=d.update(m,0);assert(cue.id.startsWith('m02-radio-start'));assert.equal(cue.clip,null);d.skip();
 m.state.m02.entranceSeen=true;kill(m,m.state.m02.entranceIds[0]);kill(m,m.state.m02.entranceIds[1]);cue=d.update(m,3000);assert.equal(cue.storyScene,'m02-radio-entrance-clear');d.skip();saveRoundTrip(m);cue=d.update(m,6000);assert(!cue||!cue.id.startsWith('m02-radio-start'));
 const b=m.state.m02.bases.hill_factory;b.productionObserved=true;kill(m,b.factoryId);pulse(m);d.update(m,9000);assert.notEqual(d.data.active,'m02-radio-factory-working');
 m.state.m02.observer.outcome='intercepted';m.state.m02.observer.seen=true;d.update(m,12000);assert.notEqual(d.data.active,'m02-radio-observer-escaped');
});
check('observer physically drives to the exit without teleporting',()=>{
 const m=fresh(),o=m.state.m02.observer,u=m.entity(o.unitId),from={x:u.x,y:u.y};
 o.seen=true;o.state='fleeing';o.needsRoute=true;
 m.advance(120);assert.equal(o.outcome,'escaped');assert(Math.hypot(u.x-from.x,u.y-from.y)>100);assert(!m.entity(u.id));
});
check('defeat has priority and unsupported scenario saves fail before replacing the world',()=>{
 const m=fresh(),previous=m.state,data=JSON.parse(m.save());data.state.m02.version=999;
 assert.throws(()=>m.load(data),/Несовместимое/);assert.equal(m.state,previous);
 for(const b of m.state.buildings)if(b.owner==='rai'&&b.kind==='factory')kill(m,b.id);
 for(const u of m.state.units)if(u.owner==='rai'&&u.kind==='builder')kill(m,u.id);
 pulse(m);assert.equal(m.state.status,'defeat');saveRoundTrip(m);assert.equal(m.state.status,'defeat');
});
check('optional modernization after actual factory repair, paid once, preserves the car',()=>{
 const m=flatFixture(),f=m.addStructure('factory','rai',{x:0,y:250},{completed:true,progress:1});m.rebuildNavigation();
 const u=m.addUnit('bukhanka','rai',{x:0,y:100},{hp:200,experience:91,paint:'sand',components:['C01','B01','U01'],engineUpgradeLevel:2});
 const id=u.id;m.state.energy=1000;m.state.research['twin-machinegun']=true;
 assert(!f.autoModernize);assert(!m.availableVehicleRecipes().some(r=>r.components[2]==='U01'));
 assert(m.availableVehicleRecipes().some(r=>r.components[2]==='U02'));
 assert(!m.saveDesign('Устаревший',['C01','B01','U01'],'olive').ok);
 assert(m.factoryProjects().some(p=>p.kind==='bukhanka'),'Existing saved projects remain usable');
 assert(setFactoryModernization(m,f.id,true).ok);assert(m.retreat([id]).ok);m.advance(70);
 assert.equal(u.kind,'twin-machinegun');assert.equal(u.hp,u.maxHp);assert.equal(u.id,id);assert.equal(u.experience,91);assert.equal(u.paint,'sand');assert.equal(u.engineUpgradeLevel,2);
 assert.equal(u.components[2],'U02');assert.equal(u.modernization.cost,15);assert(Math.abs(m.state.energy-980.5)<1e-6);
 assert.equal(m.drainEvents().filter(e=>e.type==='vehicle-modernized').length,1);
 const saved=m.save();m.load(saved);assert(m.entity(f.id).autoModernize);assert.equal(m.entity(id).kind,'twin-machinegun');
 const oil=m.state.energy;assert(!modernizeAfterRepair(m,m.entity(f.id),m.entity(id)));assert.equal(m.state.energy,oil);
 const old=m.addUnit('bukhanka','rai',{x:200,y:100},{factoryVisit:{factoryId:f.id,phase:'inside'}});m.state.energy=0;
 assert(!modernizeAfterRepair(m,m.entity(f.id),old));assert.equal(old.kind,'bukhanka');
 assert(setFactoryModernization(m,f.id,false).ok);m.state.energy=100;assert(!modernizeAfterRepair(m,m.entity(f.id),old));assert.equal(old.kind,'bukhanka');
});
fs.mkdirSync('docs/campaign/alpha/m02',{recursive:true});fs.writeFileSync('docs/campaign/alpha/m02/checks.json',JSON.stringify({passed:passed.length,tests:passed},null,2)+'\n');
console.log(JSON.stringify({passed:passed.length,tests:passed}));
