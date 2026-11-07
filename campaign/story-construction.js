export function constructionUnlocked(state,kind) {
  return !state.storyConstruction?.enabled||state.storyConstruction.unlocked.includes(kind);
}
export function researchUnlocked(state){return !state.storyConstruction?.enabled||!!state.storyConstruction.research;}
export function defenseReady(state){
  const ready=state.buildings.filter(e=>e.owner==='rai'&&e.hp>0&&e.completed);
  return state.storyConstruction?.enabled?ready.filter(e=>e.kind==='bunker').length>=(state.storyConstruction.requiredBunkers??2):ready.some(e=>['bunker','mg-tower'].includes(e.kind));
}

export function migrateStoryOpening(mission,data){
  if(data.scriptRevision===5)return;
  data.scriptRevision=5;
  if(!Object.keys(data.scenes).length)return;
  const s=mission.state,ready=kind=>s.buildings.some(e=>e.owner==='rai'&&e.hp>0&&e.kind===kind&&e.completed);
  const told=(...ids)=>ids.some(id=>['done','skipped'].includes(data.scenes[id]?.status));
  const skip=(id,condition)=>{if(condition&&!data.scenes[id])data.scenes[id]={status:'skipped',cursor:0,endedAt:data.clock};};
  const old={r01:['o01','01','01a','01b'],r02:['o02','o03','03'],r04:['o04'],r05:['o05'],
    r08:['04'],r09:['05'],r10:['06'],r11:['o06','07','08'],r13:['o07','09'],
    r14:['o08','10','10-alt'],r16:['11'],r18:['o09','12'],r19:['o12','13'],
    r21:['o10'],r22:['o11'],r23:['o12'],r26:['14'],r27:['15'],r29:['16','16-alt'],
    'r30-alt':['16','16-alt'],r32:['17'],r33:['18'],r36:['19'],r39:['20'],r40:['21'],
    r41:['22'],r42:['22','23'],r45:['24'],r48:['25'],r49:['26'],r50:['27','28'],r54:['29','d04'],u01:['d01'],u02:['d02'],u04:['d03']};
  for(const [id,prior] of Object.entries(old))skip(id,told(...prior));
  for(const [condition,ids] of [
    [ready('generator'),['r01','r01a','r01b']],
    [s.powered,['r02','r03','r04']],
    [ready('factory'),['r05','r06','r08']],
    [s.statistics.produced>0,['r09','r10']],
    [ready('lab'),['r11','r13']],
    [s.flags.raidWon,['r14','r16']],
    [ready('bunker'),['r21','r22']],
    [s.camps.some(c=>c.cleared),['r23']],
    [s.camps.every(c=>c.cleared),['r24','r24a','r25','r31','r35','r38','r41','r42','r45','r46','r47']],
  ])for(const id of ids)skip(id,condition);
}

export function updateStoryConstruction(mission,{radioEnabled=true}={}) {
  const s=mission.state,progress=s.storyConstruction;
  if(!progress?.enabled)return;
  const ready=kind=>s.buildings.some(e=>e.owner==='rai'&&e.kind===kind&&e.hp>0&&e.completed);
  const unlock=(kind,condition)=>{if(condition&&!progress.unlocked.includes(kind))progress.unlocked.push(kind);};
  // Radio announces these milestones, but cannot hold a completed economy hostage.
  unlock('derrick',ready('generator'));
  unlock('factory',s.powered);
  unlock('lab',ready('factory'));
  if(ready('lab'))progress.research=true;
  unlock('bunker',s.flags.raidWon);
  unlock('mg-tower',progress.research&&s.research['mg-tower']);
}
