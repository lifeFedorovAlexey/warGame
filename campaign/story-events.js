import {waterTower} from './threat-guidance.js';
import {defenseReady} from './story-construction.js';

const live=e=>e.hp>0;

// Facts come from the simulation, never from the number of radio messages played.
export function storyFacts(mission,d) {
  const s=mission.state,b=s.buildings.filter(live),own=b.filter(e=>e.owner==='rai');
  const building=kind=>own.find(e=>e.kind===kind),ready=kind=>own.some(e=>e.kind===kind&&e.completed);
  const visible=e=>mission.visibleAt?.(e.x,e.y)??false;
  const shots=(mission.effects??[]).filter(e=>e.type==='shot');
  if(shots.length||s.projectiles?.length)d.lastCombat=d.clock;
  const raiders=s.units.filter(e=>e.owner==='scavs'&&live(e)&&s.flags.raidIds?.includes(e.id));
  if(!d.facts.contact&&raiders.some(visible))d.facts.contact={ids:[...s.flags.raidIds],fired:false};
  const contact=d.facts.contact;
  if(contact&&shots.some(e=>contact.ids.includes(e.from)||contact.ids.includes(e.targetId)))contact.fired=true;
  if(s.flags.raidWon||contact?.fired&&!raiders.length)d.facts.firstWin=true;
  if(d.facts.firstVan&&d.facts.firstVanAt==null)d.facts.firstVanAt=d.clock;
  const known=key=>s.artifactKeys.includes(key)||s.artifacts.some(a=>a.key===key&&(a.collected||visible(a)));
  const researching=key=>own.some(e=>e.research?.key===key);
  const campFor=key=>s.camps.find(c=>(c.artifact??(mission.config.camps??[]).find(spec=>spec.id===c.id)?.artifact)===key);
  const tower=waterTower(mission),chiefCamp=s.camps[3];
  const chief=b.find(e=>e.owner==='scavs'&&e.campId===chiefCamp?.id&&e.kind==='camp-core');
  if(shots.some(e=>[...s.units,...b].some(target=>target.campId===chiefCamp?.id&&target.id===e.targetId)))d.facts.chiefAssault=true;
  d.facts.camps??={};
  for(const camp of s.camps){
    if(b.some(e=>e.owner==='scavs'&&e.campId===camp.id&&visible(e)))d.facts.camps[camp.id]=true;
  }
  if(tower&&visible(tower))d.facts.tower=tower.id;
  if(ready('generator'))d.facts.hadPower=true;
  const oilKnown=(mission.config.oilFields??[]).some(grid=>{
    const p=mission.field.gridToWorld(grid);return mission.exploredAt?.(p.x,p.y);
  });
  if(oilKnown)d.facts.oilKnown=true;
  const movers=s.units.filter(e=>e.owner==='rai'&&live(e)&&e.kind!=='builder'&&e.path?.length);
  const moving=movers.filter(e=>Math.abs(e.speed??0)>1);
  const queued=movers.filter(e=>mission.trafficCoordinator?.queueing(e));
  if(queued.length>=2){d.facts.queueSince??=d.clock;d.facts.queueIds=queued.map(e=>e.id);}
  else {
    if(d.facts.queueSince!=null&&d.clock-d.facts.queueSince>8000&&moving.some(e=>d.facts.queueIds?.includes(e.id)))d.facts.roadFreedAt=d.clock;
    delete d.facts.queueSince;
  }
  // A yielded oncoming vehicle must actually have passed before this anecdote is true.
  d.facts.yielding??={};
  for(const unit of s.units.filter(e=>e.owner==='rai'&&live(e))){
    const traffic=unit.traffic;
    const oncoming=traffic&&s.units.find(e=>e.id===traffic.leader&&Math.cos((unit.heading??0)-(e.heading??0))<-.5);
    if(traffic&&!traffic.cycle&&traffic.forward&&oncoming)d.facts.yielding[unit.id]={leader:traffic.leader,forward:traffic.forward};
    const prior=d.facts.yielding[unit.id];
    if(prior&&!traffic){
      const leader=s.units.find(e=>e.id===prior.leader&&live(e));
      if(leader&&(unit.x-leader.x)*prior.forward.x+(unit.y-leader.y)*prior.forward.y<-(mission.config.worldScale??4.5)*2.5)d.facts.passedAt=d.clock;
      delete d.facts.yielding[unit.id];
    }
  }
  const fortifications=b.filter(e=>e.owner==='scavs'&&visible(e)&&['bunker','mg-tower','camp-core'].includes(e.kind));
  const approachingFortification=moving.some(e=>fortifications.some(target=>{
    const goal=e.path.at(-1),dx=target.x-e.x,dy=target.y-e.y;
    return Math.hypot(dx,dy)<500&&goal&&(goal.x-e.x)*dx+(goal.y-e.y)*dy>0;
  }));
  return {s,d,building,ready,known,researching,contact,contactAlive:raiders.some(live),
    battle:d.clock-d.lastCombat<6000,quiet:d.clock-d.lastCombat,
    bunkers:own.filter(e=>e.kind==='bunker'&&e.completed).length,defense:defenseReady(s),
    campFor,seenCamp:key=>!!d.facts.camps[campFor(key)?.id],
    cleared:key=>!!campFor(key)?.cleared,
    tower:!!tower&&d.facts.tower===tower.id,chief:!!chief&&!chiefCamp?.cleared,
    chiefReachable:!!chief&&visible(chief),victory:s.status==='victory',
    allCamps:s.camps.every(c=>c.cleared),moving:moving.length>=2,
    columnReady:moving.length>=2&&moving.length===movers.length&&moving.some(e=>e.kind==='bukhanka'),approachingFortification,
    flameStudied:!!s.research.flamethrower,ammoStudied:!!s.research['mg-ammo-1'],towerStudied:!!s.research['mg-tower']};
}

export function storyRules(director,f) {
  const {s,d}=f,done=id=>director.finished(id),heard=id=>director.heard(id);
  const after=(id,seconds=0)=>done(id)&&d.clock-director.ended(id)>=seconds*1000;
  const p=(priority,trigger,valid=true,gap=0,continueValid=true)=>({priority,trigger,valid,gap,continueValid});
  const openingDone=director.anyFinished(['r01','r01a','r01b']);
  const flameDone=['r29','r30-alt'].some(done),fullFlame=heard('r27');
  const firstWin=!!d.facts.firstWin;
  return {
    r01:p(1,!openingDone,!f.building('generator')),
    r01a:p(1,!openingDone&&!!f.building('generator'),!f.ready('generator')),
    r01b:p(1,!openingDone&&f.ready('generator'),!s.powered),
    r02:p(1,f.ready('generator'),!s.powered),
    r03:p(2,f.ready('generator')&&!!d.facts.oilKnown,!f.ready('derrick')&&!s.powered),
    r04:p(1,s.powered,!f.ready('factory')),
    r05:p(1,s.powered&&(done('r04')||!!f.building('factory')),!f.ready('factory')),
    r06:p(2,!!f.building('factory'),!f.ready('lab')),
    r08:p(1,f.ready('factory'),!d.facts.firstVan),
    r09:p(1,!!d.facts.firstVan),
    r10:p(2,!!d.facts.firstVan&&d.clock-d.facts.firstVanAt>=12000&&after('r09',12),true,12),
    r11:p(2,!!f.building('lab')),
    r13:p(2,f.ready('lab')&&heard('r11')),
    r14:p(0,!!f.contact,f.contactAlive,0,f.contactAlive),
    r16:p(0,heard('r14')&&!!f.contact,!f.contact?.fired&&f.contactAlive&&!f.battle,0,!f.contact?.fired&&f.contactAlive&&!f.battle),
    r18:p(1,firstWin&&!f.battle),
    r19:p(2,after('r18',10),!f.allCamps,0),
    r21:p(1,firstWin&&(done('r19')||f.allCamps||f.bunkers>0),!f.defense),
    r22:p(1,f.bunkers>0&&firstWin),
    r23:p(1,firstWin&&f.defense&&done('r22'),!f.allCamps),
    r24:p(1,f.seenCamp('flamethrower'),!f.cleared('flamethrower')&&!s.camps.some(c=>c.cleared)),
    r24a:p(1,f.seenCamp('flamethrower')&&s.camps.some(c=>c.cleared)&&!heard('r24'),!f.cleared('flamethrower')),
    r25:p(1,f.cleared('flamethrower'),!f.flameStudied&&!f.researching('flamethrower')),
    r26:p(1,f.known('flamethrower'),!f.flameStudied&&!f.researching('flamethrower')),
    r27:p(2,s.artifactKeys.includes('flamethrower')&&heard('r26'),!f.flameStudied&&!f.researching('flamethrower')),
    r29:p(1,f.flameStudied&&!flameDone&&fullFlame),
    'r30-alt':p(1,f.flameStudied&&!flameDone&&!fullFlame),
    r31:p(1,f.seenCamp('mg-ammo-1'),!f.cleared('mg-ammo-1')),
    r32:p(1,f.cleared('mg-ammo-1')&&f.known('mg-ammo-1'),!f.ammoStudied),
    r33:p(1,f.ammoStudied),
    r35:p(2,f.ammoStudied&&f.approachingFortification,!f.allCamps,35),
    r36:p(1,!!d.facts.tower,f.tower),
    r38:p(1,!!d.facts.tower&&!f.tower&&f.known('mg-tower'),!f.towerStudied),
    r39:p(1,f.towerStudied),
    r40:p(2,after('r39',12),true,12),
    r41:p(1,f.chiefReachable,f.chief),
    r42:p(2,heard('r41'),f.chief,0,f.chief),
    r45:p(2,heard('r42')&&!!s.storyFacts?.enemyGarden&&!!s.storyFacts?.ownThreeHangarsRooflessLatrine,f.chief,35,f.chief),
    r46:p(0,!!d.facts.chiefAssault,f.chief,0,f.chief),
    r47:p(1,f.allCamps,!f.victory),
    r48:p(1,f.victory),
    r49:p(2,after('r48',5),f.victory,5),
    r50:p(1,after('r49',5),f.victory),
    r54:p(2,after('r50',15),f.victory,15),
    a01:p(3,firstWin&&f.columnReady,!f.allCamps,45),
    a02:p(3,d.clock-(d.facts.passedAt??-Infinity)<10000,!f.allCamps,45),
    a03:p(3,d.facts.queueSince!=null&&d.clock-d.facts.queueSince>10000,!f.allCamps,45),
    a04:p(3,d.clock-(d.facts.roadFreedAt??-Infinity)<10000,!f.allCamps,45),
    u01:p(1,!!d.facts.labAccident),
    u02:p(2,!!d.facts.food,true,35),
    u04:p(1,!!d.facts.generatorBroken),
  };
}
