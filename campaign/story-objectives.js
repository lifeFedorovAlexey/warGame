import {constructionUnlocked,researchUnlocked,defenseReady} from './story-construction.js';

// Orders appear with the spoken assignment; actual construction never waits for radio.
export function storyObjectives(mission,{radioEnabled=true}={}) {
  const s=mission.state,d=s.radioStory;
  if(s.m02)return mission.objectives();
  if(s.status!=='running')return [];
  const told=id=>d?.announced?.[id]||['done','skipped'].includes(d?.scenes[id]?.status);
  const buildings=s.buildings.filter(e=>e.owner==='rai'&&e.hp>0);
  const ready=kind=>buildings.some(e=>e.kind===kind&&e.completed),tasks=[];
  const add=(id,name,done,progress)=>{if(!done)tasks.push({id,name,progress});};
  if(told('r01')||told('r01a')||!radioEnabled)add('generator','Построить электростанцию',ready('generator'));
  if((told('r02')||buildings.some(e=>e.kind==='derrick')||!radioEnabled&&ready('generator'))&&constructionUnlocked(s,'derrick'))
    add('power','Построить нефтяную вышку',s.oilLinked>0);
  if((told('r05')||buildings.some(e=>e.kind==='factory')||!radioEnabled&&s.oilLinked>0)&&constructionUnlocked(s,'factory'))
    add('factory','Построить завод',ready('factory'));
  if(ready('factory')&&constructionUnlocked(s,'lab'))
    add('lab','Построить НИИ',ready('lab'));
  if(ready('factory')&&s.powered)add('production','Выпустить боевую машину',!!d?.facts.firstVan||told('r09'));
  if(s.flags.contact&&!s.flags.raidWon)add('defend','Отразить нападение',false);
  if(told('r21')||buildings.some(e=>e.kind==='bunker')||!radioEnabled&&s.flags.raidWon){
    const required=s.storyConstruction?.requiredBunkers??2,count=buildings.filter(e=>e.kind==='bunker'&&e.completed).length;
    add('defense','Построить ДОТы по периметру',count>=required,Math.min(count,required)+'/'+required);
  }
  if(told('r23')||s.camps.some(c=>c.cleared)||!radioEnabled&&s.flags.raidWon&&defenseReady(s))
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
