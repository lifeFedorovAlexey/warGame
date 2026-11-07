import {constructionUnlocked,researchUnlocked,defenseReady} from './story-construction.js';

// An assignment is shown after its dialogue; outpaced or completed work disappears.
export function storyObjectives(mission,{radioEnabled=true}={}) {
  const s=mission.state,d=s.radioStory;
  if(s.status!=='running')return [];
  const told=id=>['done','skipped'].includes(d?.scenes[id]?.status);
  const buildings=s.buildings.filter(e=>e.owner==='rai'&&e.hp>0);
  const ready=kind=>buildings.some(e=>e.kind===kind&&e.completed),tasks=[];
  const add=(id,name,done,progress)=>{if(!done)tasks.push({id,name,progress});};
  if(told('o01')||!radioEnabled)add('generator','Построить электростанцию',ready('generator'));
  if((told('o03')||!radioEnabled&&ready('generator'))&&constructionUnlocked(s,'derrick'))
    add('power','Построить нефтяную вышку',s.powered);
  if((told('o05')||!radioEnabled&&s.powered)&&constructionUnlocked(s,'factory'))
    add('factory','Построить завод',ready('factory'));
  if((told('o06')||!radioEnabled&&ready('factory'))&&constructionUnlocked(s,'lab'))
    add('lab','Построить НИИ',ready('lab'));
  if(ready('factory')&&s.powered)add('production','Выпустить боевую машину',s.statistics.produced>0);
  if(told('o08')&&!s.flags.raidWon)add('defend','Отразить нападение',false);
  if(told('o10')||!radioEnabled&&s.flags.raidWon){
    const required=s.storyConstruction?.requiredBunkers??2,count=buildings.filter(e=>e.kind==='bunker'&&e.completed).length;
    add('defense','Построить ДОТы по периметру',count>=required,Math.min(count,required)+'/'+required);
  }
  if(told('o12')||!radioEnabled&&s.flags.raidWon&&defenseReady(s))
    add('security','Уничтожить четыре лагеря отбросов',s.camps.every(c=>c.cleared),s.camps.filter(c=>c.cleared).length+'/4');
  const names={'flamethrower':'огнемёт','mg-ammo-1':'боеприпасы','mg-tower':'узел башни'};
  for(const key of Object.keys(names)){
    const artifact=s.artifacts.find(a=>a.key===key),collected=s.artifactKeys.includes(key);
    const discovered=artifact&&(artifact.collected||mission.exploredAt(artifact.x,artifact.y));
    if(collected&&researchUnlocked(s))add('research-'+key,'Изучить в НИИ: '+names[key],s.research[key]);
    else if(discovered&&!collected)add('pickup-'+key,'Подобрать: '+names[key],s.research[key]);
  }
  return tasks;
}
