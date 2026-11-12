// Game balance for scrap attachments, not a ballistic certification. Protection
// is applied only when the physical attachment intercepts the hit.
export const FIELD_RECIPES={
 'hood-guard':{name:'Защита передка',part:22,stock:'guard-stock',body:'B01',strength:95,hpBonus:0,massKg:24,bulletMultiplier:.82,collisionMultiplier:.85,zone:'Передок: попадания в прутья'},
 'window-grille':{name:'Решётки лобовых стёкол',part:23,stock:'guard-stock',body:'B01',strength:55,hpBonus:0,massKg:12,bulletMultiplier:.92,zone:'Лобовые стёкла: попадания в прутья'},
 'tube-bumper':{name:'Трубчатый бампер',icon:'armor-upgrade',part:26,stock:'tube-stock',body:'B01',strength:125,hpBonus:0,massKg:36,bulletMultiplier:.92,collisionMultiplier:.65,zone:'Нижняя часть передка'},
 'side-hood-left':{name:'Капот на левом борту',icon:'side-hood-left',part:27,stock:'hood-stock',body:'B01',strength:75,hpBonus:0,massKg:18,bulletMultiplier:.80,collisionMultiplier:.9,zone:'Левый борт: площадь капота'},
 'side-hood-right':{name:'Капот на правом борту',icon:'side-hood-right',part:28,stock:'hood-stock',body:'B01',strength:75,hpBonus:0,massKg:18,bulletMultiplier:.80,collisionMultiplier:.9,zone:'Правый борт: площадь капота'},
 'spare-wheel':{name:'Запасное колесо',icon:'spare-wheel',part:29,stock:'wheel-stock',body:'B01',strength:100,hpBonus:0,massKg:26,bulletMultiplier:.9,collisionMultiplier:.8,fireMultiplier:1.15,zone:'Сзади: площадь запаски'},
};
export const fieldInstalled=(unit,part)=>!!unit.damage?.parts?.[part]?.installed&&!unit.damage.parts[part].detached;
export const vehicleBaseMass=kind=>1850+({builder:175,flamer:210,'twin-machinegun':195,sensor:160}[kind]??155);
export function modificationEffects(recipes,baseMass=2005){
 const massKg=recipes.reduce((n,r)=>n+r.massKg,0),ratio=baseMass/(baseMass+massKg);
 return {massKg,speed:ratio**.35,acceleration:ratio,braking:ratio**.6,steeringRate:ratio**.5};
}
const effectsCache=new WeakMap(),specCache=new WeakMap();
const unloadedEffects=Object.freeze(modificationEffects([]));
export function fieldEffects(unit){
 if(!unit.damage?.parts)return unloadedEffects;
 let row=effectsCache.get(unit);const revision=unit.damage?.revision??-1;
 if(row&&row.damage===unit.damage&&row.revision===revision&&row.kind===unit.kind)return row.effects;
 const effects=modificationEffects(Object.values(FIELD_RECIPES).filter(r=>fieldInstalled(unit,r.part)),vehicleBaseMass(unit.kind));
 effectsCache.set(unit,{damage:unit.damage,revision,kind:unit.kind,effects});return effects;
}
export function fieldUnitSpec(unit,base){
 if(!base)return base;
 const effects=fieldEffects(unit);if(!effects.massKg)return base;
 let row=specCache.get(unit);if(row?.base===base&&row.effects===effects)return row.spec;
 const spec={...base,speed:base.speed*effects.speed};specCache.set(unit,{base,effects,spec});return spec;
}
export function fieldRecipeSummary(r){
 const lines=[r.zone,`пули −${Math.round((1-r.bulletMultiplier)*100)}%`,r.collisionMultiplier&&`столкновения −${Math.round((1-r.collisionMultiplier)*100)}%`,r.fireMultiplier&&`огонь +${Math.round((r.fireMultiplier-1)*100)}%`,`масса +${r.massKg} кг`];
 return lines.filter(Boolean).join(' · ');
}
