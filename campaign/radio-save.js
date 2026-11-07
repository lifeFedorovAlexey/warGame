const openingScenes=['01','01a','01b','02','03','04','05','06','07','08','09','10','10-alt','11','12','13'];

function retire(scenes,ids,endedAt=0) {
  for(const id of ids){
    if(!['done','skipped'].includes(scenes[id]?.status))scenes[id]={status:'skipped',cursor:0,endedAt};
  }
}

export function parkRadioStory(data) {
  if(!data)return;
  for(const scene of Object.values(data.scenes)){
    if(scene.status==='playing')scene.status='pending';
  }
  data.active=null;
}

export function restoreRadioStory(state) {
  if(state.radioStory){
    const story=state.radioStory;
    parkRadioStory(story);
    // Older imports could save a newly queued opening scene at the final sector.
    if(state.flags.lastRevealed)retire(story.scenes,openingScenes,story.clock);
    return;
  }

  const seen=new Set(state.seenCinematics);
  const ready=kind=>state.buildings.some(b=>b.owner==='rai'&&b.kind===kind&&b.completed&&b.hp>0);
  const [first,warehouse,east,chief]=state.camps;
  const beyondOpening=state.flags.raidWon||first?.cleared;
  const beyondRaid=first?.cleared||state.artifactKeys.length>0;
  const milestones=[
    [seen.has('intro')||seen.has('briefing')||seen.has('arrival')||beyondOpening, ['01','01a','01b']],
    [seen.has('briefing')||beyondOpening, ['02','07','08']],
    [ready('generator'), ['03']],
    [ready('factory'), ['04']],
    [state.statistics.produced>0, ['05','06']],
    [ready('lab'), ['09']],
    [seen.has('first-contact')||beyondOpening, ['10','10-alt','11']],
    [seen.has('raid-won')||beyondRaid, ['12']],
    [beyondRaid, ['13']],
    [seen.has('artifact-flamethrower')||state.research.flamethrower, ['14','15']],
    [seen.has('research-flamethrower')||warehouse?.cleared&&state.research.flamethrower, ['16','16-alt']],
    [seen.has('artifact-mg-ammo-1')||state.research['mg-ammo-1'], ['17']],
    [seen.has('research-mg-ammo-1')||state.flags.lastRevealed&&state.research['mg-ammo-1'], ['18']],
    [seen.has('camp3-sighted')||east?.cleared, ['19']],
    [seen.has('research-mg-tower')||chief?.cleared&&state.research['mg-tower'], ['20']],
    [seen.has('research-mg-tower')||state.flags.lastRevealed, ['21']],
    [chief?.cleared, ['22','23','24']],
    [seen.has('victory')||seen.has('outro'), ['25','26']],
    [seen.has('outro'), ['27','28','29','d04']],
  ];
  const scenes={};
  // These records retire old material without claiming that its new lines were heard.
  for(const [passed,ids] of milestones){
    if(passed)retire(scenes,ids);
  }
  state.radioStory={version:2,clock:0,scenes,facts:{},journal:[],lastEnd:-30000,lastCombat:-30000};
}
