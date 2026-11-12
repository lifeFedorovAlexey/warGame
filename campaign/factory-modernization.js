import {availableOil,spendOil} from './oil-economy.js';
import {vehicleUpgrade,hasVehicleUpgrades} from './vehicle-upgrades.js';
import {matchingRecipe} from './vehicle-designs.js';

export function modernizationPlan(m,u){
 const from=u.components??m.config.units[u.kind]?.components,recipe=vehicleUpgrade(m,from);
 if(!recipe)return null;
 const current=matchingRecipe(m.vehicleRecipes,from)?.spec??m.config.units[u.kind];
 return {recipe,from,cost:Math.max(0,recipe.spec.cost-current.cost)};
}
export function modernizationSelection(m,ids){
 const selected=new Set(ids),units=m.state.units.filter(u=>selected.has(u.id)&&u.owner==='rai'&&u.hp>0
  &&!u.modernizationRequested&&!['leaving','departure'].includes(u.factoryVisit?.phase)&&modernizationPlan(m,u));
 const cost=units.reduce((sum,u)=>sum+modernizationPlan(m,u).cost,0);
 const reason=!hasVehicleUpgrades(m)?'Сначала изучите улучшение модулей'
  :!m.state.buildings.some(f=>f.owner==='rai'&&f.kind==='factory'&&f.completed&&f.hp>0)?'Нужен работающий завод'
  :!units.length?'Выберите машины с доступным обновлением, ещё не направленные на завод':'';
 return {units,cost,reason};
}
export function setFactoryModernization(m,id,enabled){
 m.finishPendingStep();const f=m.entity(id);
 if(!f||f.owner!=='rai'||f.kind!=='factory'||!f.completed||!hasVehicleUpgrades(m))return m.fail('Нужны работающий завод и изученное улучшение модулей');
 f.autoModernize=!!enabled;return {ok:true};
}
export function needsModernization(m,f,u){
 return f.hp>0&&(f.autoModernize||u.modernizationRequested)&&u.owner==='rai'&&!!modernizationPlan(m,u);
}
export function modernizeAfterRepair(m,f,u){
 if(!needsModernization(m,f,u)||u.hp<u.maxHp||u.factoryVisit?.phase!=='inside')return false;
 const {recipe,from,cost}=modernizationPlan(m,u);
 if(availableOil(m.state)<cost){if(u.combatRetreat)u.combatRetreat.service='waiting-modernization-oil';return false;}
 spendOil(m,cost);
 u.kind=recipe.kind;u.components=[...recipe.components];
 // Keep the physical car, ID, health, experience, paint, engine and field armour.
 const change={from:from[2],to:u.components[2],fromComponents:[...from],toComponents:[...u.components],cost};
 u.modernization={...change,factoryId:f.id,at:m.state.time};
 if(change.from==='U01'&&change.to==='U02'){
  const campaign=m.state.campaign??={version:1,results:{}};
  campaign.firstTwinModernization??={unitId:u.id,factoryId:f.id,at:m.state.time,radioPlayed:false};
 }
 delete u.modernizationRequested;
 // The saved project still describes the old assembly, not this refitted car.
 delete u.projectId;delete u.designName;
 if(u.damage)u.damage.revision++;
 m.emit('vehicle-modernized',{unit:u.id,factory:f.id,...change});return true;
}
