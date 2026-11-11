// Campaign distinctions are fictional awards of РАЙ, separate from military rank.
export const personnelMissionName=id=>({m01:'Освоение целины',m02:'Энергетический всплеск'}[id]??id);
export const personnelAwardTypes=Object.freeze({
 participant:{name:'Участник операции',description:'Участие в успешно завершённой операции'},
 hero:{name:'Герой операции',description:'Лучший личный счёт: не менее 5 уничтоженных противников'},
 breacher:{name:'За уничтожение укреплений',description:'Лучший результат по постройкам: не менее 3 уничтоженных объектов'}
});

export function awardMissionPersonnel(personnel,phase,outcome){
 const granted=[];
 if(outcome!=='victory')return granted;
 const participants=Object.values(personnel.soldiers).filter(s=>!s.death||s.death.missionId===phase.id);
 const bestKills=Math.max(5,...participants.map(s=>s.missions[phase.id]?.kills??0));
 const bestStructures=Math.max(3,...participants.map(s=>s.missions[phase.id]?.structuresDestroyed??0));
 for(const soldier of participants){
  const record=soldier.missions[phase.id]??={kills:0,structuresDestroyed:0};
  const awards=record.awards??=[];
  const add=id=>{if(!awards.includes(id)){awards.push(id);granted.push({soldierId:soldier.id,id});}};
  add('participant');
  // In incomplete legacy missions the leaderboard is unknown. Participation
  // is still certain, but a partial score cannot establish a mission winner.
  if(phase.historyComplete){
   if(record.kills>=bestKills)add('hero');
   if(record.structuresDestroyed>=bestStructures)add('breacher');
  }
 }
 return granted;
}

export function personnelAwards(soldier){
 return Object.entries(soldier.missions??{}).flatMap(([missionId,record])=>(record.awards??[])
  .filter(id=>personnelAwardTypes[id]).map(id=>({id,missionId,...personnelAwardTypes[id],
   label:`${personnelAwardTypes[id].name} «${personnelMissionName(missionId)}»${soldier.death?.missionId===missionId?' · посмертно':''}`,
   result:id==='hero'?record.kills:id==='breacher'?record.structuresDestroyed:null})));
}

export function personnelServiceDetails(soldier){
 return personnelAwards(soldier).map(a=>a.label+(a.result!==null?` · ${a.result}`:''));
}

export function personnelAwardIcon(id){
 const ribbon='<path d="M5 2h14l-2 7-5 3-5-3z" fill="#89936b"/><path d="M10 2h4v8l-2 1-2-1z" fill="#b7773c"/>';
 const medal=id==='hero'?'<path d="m12 10 2.2 5 5.4.5-4.1 3.6 1.2 5.3-4.7-2.8-4.7 2.8 1.2-5.3-4.1-3.6 5.4-.5z"/>':
  id==='breacher'?'<path d="M5 13h14v3h-2v8H7v-8H5zm4 4v4h2v-4zm4 0v4h2v-4z" fill-rule="evenodd"/>':
  '<circle cx="12" cy="18" r="7"/><path d="m8 18 3 3 5-6" fill="none" stroke="#394133" stroke-width="2"/>';
 return `<svg class="personnel-award-icon" viewBox="0 0 24 28" fill="currentColor" aria-hidden="true">${ribbon}${medal}</svg>`;
}
