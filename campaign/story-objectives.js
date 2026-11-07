// Display only assignments that have been introduced or reached by the player.
// Mission victory conditions and available commands remain independent of radio playback.
export function storyObjectives(mission,{radioEnabled=true}={}) {
  const s=mission.state,d=s.radioStory;
  if(s.status!=='running')return [];
  const told=(...ids)=>ids.some(id=>['done','skipped'].includes(d?.scenes[id]?.status));
  if(radioEnabled&&!told('01','01a','01b'))return [];
  const buildings=s.buildings.filter(e=>e.owner==='rai'&&e.hp>0);
  const ready=kind=>buildings.some(e=>e.kind===kind&&e.completed),tasks=[];
  const add=(id,name,done,progress)=>{if(!done)tasks.push({id,name,progress});};
  add('generator','Построить электростанцию',ready('generator'));
  if(s.storyConstruction?.enabled){
    const unlocked=s.storyConstruction.unlocked;
    if(unlocked.includes('factory'))add('factory','Построить завод',ready('factory'));
    if(!unlocked.includes('derrick'))return tasks;
  }
  if(ready('generator'))add('power','Подключить нефтяную вышку к АЭС',s.powered);
  if(told('02')||s.powered){
    if(!s.storyConstruction?.enabled)add('factory','Построить завод',ready('factory'));
    if(ready('factory')||told('09'))add('lab','Построить НИИ',ready('lab'));
  }
  if(ready('factory')&&(told('04')||!radioEnabled))add('production','Выпустить боевую машину',s.statistics.produced>0);
  const names={'flamethrower':'огнемёт','mg-ammo-1':'боеприпасы','mg-tower':'узел башни'};
  for(const key of Object.keys(names)){
    const artifact=s.artifacts.find(a=>a.key===key),collected=s.artifactKeys.includes(key);
    const discovered=artifact&&(artifact.collected||mission.exploredAt(artifact.x,artifact.y));
    if(collected||discovered)add('research-'+key,(collected?'Изучить в НИИ: ':'Подобрать: ')+names[key],s.research[key]);
  }
  if(told('10','10-alt')&&!s.flags.raidWon)add('defend','Отразить нападение',false);
  if(told('12','13')||s.camps.some(c=>c.cleared)){
    add('security',s.flags.lastRevealed?'Зачистить штаб Петровича':'Разведать и зачистить лагеря',s.camps.every(c=>c.cleared),s.camps.filter(c=>c.cleared).length+'/4');
    add('defense','Построить укрепление базы',ready('bunker')||ready('mg-tower'));
  }
  return tasks;
}
