export function constructionUnlocked(state,kind) {
  return !state.storyConstruction?.enabled||state.storyConstruction.unlocked.includes(kind);
}

export function updateStoryConstruction(mission,{radioEnabled=true}={}) {
  const s=mission.state,progress=s.storyConstruction;
  if(!progress?.enabled)return;
  const told=id=>['done','skipped'].includes(s.radioStory?.scenes[id]?.status);
  const ready=kind=>s.buildings.some(e=>e.owner==='rai'&&e.kind===kind&&e.hp>0&&e.completed);
  if(told('03')||!radioEnabled&&ready('generator')){
    if(!progress.unlocked.includes('factory'))progress.unlocked.push('factory');
  }
  // The following oil briefing is being authored by the owner. Keep later
  // construction closed until that explicit story milestone is introduced.
  if(told('oil-briefing'))for(const kind of Object.keys(mission.config.buildings)){
    if(!progress.unlocked.includes(kind))progress.unlocked.push(kind);
  }
}
