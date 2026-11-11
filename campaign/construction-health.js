// A plan has no built structure yet. Work adds strength without healing damage.
export const isBlueprint=building=>building.owner==='rai'&&!building.completed&&(building.progress??0)<=0;
export function restoreConstructionHealth(building){
 if(building.owner!=='rai'||building.completed||building.hp<=0)return;
 const limit=1+(building.maxHp-1)*Math.max(0,Math.min(1,building.progress??0));
 building.hp=Math.min(building.hp,limit);
}
export function advanceConstruction(building,progress){
 const before=building.progress??0;
 building.progress=Math.max(before,Math.min(1,progress));
 building.hp=Math.min(building.maxHp,building.hp+(building.progress-before)*(building.maxHp-1));
 if(building.maxHp-building.hp<1e-7)building.hp=building.maxHp;
}
