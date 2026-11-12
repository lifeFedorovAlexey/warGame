import {availableOil,spendOil} from './oil-economy.js';

export const modernizationCost=m=>Math.max(0,m.config.units['twin-machinegun'].cost-m.config.units.bukhanka.cost);
export function modernizationSelection(m,ids){
 const selected=new Set(ids),units=m.state.units.filter(u=>selected.has(u.id)&&u.owner==='rai'&&u.hp>0
  &&u.kind==='bukhanka'&&(u.components??m.config.units.bukhanka.components)[2]==='U01'
  &&!u.modernizationRequested&&!['leaving','departure'].includes(u.factoryVisit?.phase));
 const cost=modernizationCost(m);
 const reason=!m.state.research['twin-machinegun']?'Сначала изучите спаренный пулемёт'
  :!m.state.buildings.some(f=>f.owner==='rai'&&f.kind==='factory'&&f.completed&&f.hp>0)?'Нужен работающий завод'
  :!units.length?'Выберите машины с одиночным пулемётом, ещё не направленные на переоснащение':'';
 return {units,cost,reason};
}
export function setFactoryModernization(m,id,enabled){
 m.finishPendingStep();const f=m.entity(id);
 if(!f||f.owner!=='rai'||f.kind!=='factory'||!f.completed||!m.state.research['twin-machinegun'])return m.fail('Нужны работающий завод и изученная спарка');
 f.autoModernize=!!enabled;return {ok:true};
}
export function needsModernization(m,f,u){
 return f.hp>0&&(f.autoModernize||u.modernizationRequested)&&m.state.research['twin-machinegun']&&u.owner==='rai'&&u.kind==='bukhanka'
  &&(u.components??m.config.units.bukhanka.components)[2]==='U01';
}
export function modernizeAfterRepair(m,f,u){
 if(!needsModernization(m,f,u)||u.hp<u.maxHp||u.factoryVisit?.phase!=='inside')return false;
 const cost=modernizationCost(m);
 if(availableOil(m.state)<cost){if(u.combatRetreat)u.combatRetreat.service='waiting-modernization-oil';return false;}
 spendOil(m,cost);
 u.kind='twin-machinegun';u.components=[...(u.components??m.config.units.bukhanka.components)];u.components[2]='U02';
 // Keep the physical car, ID, health, experience, paint, engine and field armour.
 u.modernization={from:'U01',to:'U02',factoryId:f.id,at:m.state.time,cost};
 delete u.modernizationRequested;
 if(u.projectId==='bukhanka'){delete u.projectId;delete u.designName;}
 if(u.damage)u.damage.revision++;
 m.emit('vehicle-modernized',{unit:u.id,factory:f.id,from:'U01',to:'U02',cost});return true;
}
