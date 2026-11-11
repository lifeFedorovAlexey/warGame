const sites={
 flamethrower:{name:'Лагерь у ущелья',pickup:'Подобран агрегат из лагеря у ущелья',study:'Агрегат из лагеря у ущелья — огнемёт'},
 'mg-ammo-1':{name:'Западный склад',pickup:'Подобраны образцы патронов с западного склада',study:'Патроны с западного склада изучены'},
 'mg-tower':{name:'Лагерь у водонапорной башни',pickup:'Подобраны чертежи из лагеря у водонапорной башни',study:'Чертежи водонапорной башни изучены'},
};

// Collection can happen in the very tick that clears a camp. One notice keeps
// both facts visible instead of letting the second toast erase the first.
export function storyMilestoneNotice(events,mission){
 if(mission.state.m02)return null;
 const lines=[];
 for(const event of events){
  if(event.type==='camp-cleared'){
   const camp=mission.state.camps.find(c=>c.id===event.camp),site=sites[camp?.artifact];
   lines.push((site?.name??camp?.name??'Лагерь')+' зачищен. Хорошая работа.');
  }
  if(event.type==='artifact-collected'&&sites[event.key])lines.push(sites[event.key].pickup+'.');
  if(event.type==='research-complete'&&sites[event.key])lines.push('НИИ: '+sites[event.key].study+'.');
 }
 return lines.length?[...new Set(lines)].join('\n'):null;
}
