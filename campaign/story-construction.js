export function constructionUnlocked(state,kind) {
  return !state.storyConstruction?.enabled||state.storyConstruction.unlocked.includes(kind);
}
export function researchUnlocked(state){return !state.storyConstruction?.enabled||!!state.storyConstruction.research;}
export function defenseReady(state){
  const ready=state.buildings.filter(e=>e.owner==='rai'&&e.hp>0&&e.completed);
  return state.storyConstruction?.enabled?ready.filter(e=>e.kind==='bunker').length>=(state.storyConstruction.requiredBunkers??2):ready.some(e=>['bunker','mg-tower'].includes(e.kind));
}

export function migrateStoryOpening(mission,data){
  if(data.scriptRevision===4)return;
  data.scriptRevision=4;
  if(!Object.keys(data.scenes).some(id=>/^0[1-9]|^1[0-3]$/.test(id)))return;
  const s=mission.state,ready=kind=>s.buildings.some(e=>e.owner==='rai'&&e.hp>0&&e.kind===kind&&e.completed);
  const told=(...ids)=>ids.some(id=>['done','skipped'].includes(data.scenes[id]?.status));
  const skip=(id,condition)=>{if(condition&&!data.scenes[id])data.scenes[id]={status:'skipped',cursor:0,endedAt:data.clock};};
  skip('o01',told('01','01a','01b')||ready('generator'));
  skip('o02',told('03')||ready('factory'));
  skip('o03',ready('derrick'));skip('o04',s.powered);skip('o05',ready('factory'));
  skip('o06',ready('lab'));skip('o07',ready('lab'));
  skip('o08',told('10','10-alt')||s.flags.raidWon);skip('o09',s.flags.raidWon);
  skip('o10',ready('bunker'));skip('o11',ready('bunker'));skip('o12',s.camps.some(c=>c.cleared));
}

export function updateStoryConstruction(mission,{radioEnabled=true}={}) {
  const s=mission.state,progress=s.storyConstruction;
  if(!progress?.enabled)return;
  const told=id=>['done','skipped'].includes(s.radioStory?.scenes[id]?.status);
  const ready=kind=>s.buildings.some(e=>e.owner==='rai'&&e.kind===kind&&e.hp>0&&e.completed);
  const unlock=(kind,condition)=>{if(condition&&!progress.unlocked.includes(kind))progress.unlocked.push(kind);};
  unlock('derrick',told('o03')||!radioEnabled&&ready('generator'));
  unlock('factory',told('o05')||!radioEnabled&&s.powered);
  unlock('lab',told('o06')||!radioEnabled&&ready('factory'));
  if(told('o07')||!radioEnabled&&ready('lab'))progress.research=true;
  unlock('bunker',told('o10')||!radioEnabled&&s.flags.raidWon);
  unlock('mg-tower',progress.research&&s.research['mg-tower']);
}
