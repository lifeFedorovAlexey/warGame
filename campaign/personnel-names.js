import catalog from '../assets/campaign/personnel/names.js';

export const nameCatalog=catalog;
const key=name=>name.normalize('NFC').toLocaleLowerCase('ru').replaceAll('ё','е');
const patronymics=[['Александрович','Александровна'],['Иванович','Ивановна'],['Сергеевич','Сергеевна'],['Николаевич','Николаевна'],['Михайлович','Михайловна'],['Алексеевич','Алексеевна'],['Владимирович','Владимировна'],['Андреевич','Андреевна'],['Дмитриевич','Дмитриевна'],['Павлович','Павловна'],['Викторович','Викторовна'],['Петрович','Петровна']];

// A separate saved RNG never consumes combat/movement randomness.
export function allocatePersonnelName(state){
 state.used??={};state.randomState??=0x524149;state.cycle??=0;
 for(;;state.cycle++){
  const choices=catalog.entries.map(row=>{
   const cycle=state.cycle;
   const suffix=cycle?patronymics[(cycle-1)%patronymics.length][row.gender==='f'?1:0]:'';
   const cohort=cycle>patronymics.length?' '+(Math.floor((cycle-1)/patronymics.length)+1):'';
   const name=row.name+(suffix?' '+suffix:'')+cohort;
   return {row,name,key:key(name)};
  }).filter(item=>!state.used[item.key]);
  if(!choices.length)continue;
  state.randomState=(Math.imul(state.randomState,1664525)+1013904223)>>>0;
  let pick=state.randomState/4294967296*choices.reduce((sum,c)=>sum+c.row.selectionWeight,0),chosen=choices.at(-1);
  for(const item of choices){pick-=item.row.selectionWeight;if(pick<0){chosen=item;break;}}
  state.used[chosen.key]=true;
  return {name:chosen.name,givenName:chosen.row.name,gender:chosen.row.gender};
 }
}
