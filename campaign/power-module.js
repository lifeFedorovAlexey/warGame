import {fundedWorkTime} from './oil-economy.js';
export function installPowerModule(mission,buildingId,workerIds){
 mission.finishPendingStep();
 const b=mission.entity(buildingId),spec=mission.config.powerModule;
 if(!mission.state.research['power-module'])return mission.fail('Изучите энергомодуль в НИИ');
 if(!b||b.owner!=='rai'||b.kind!=='generator'||!b.completed)return mission.fail('Выберите готовую АЭС');
 if(b.powerModule)return mission.fail('Энергомодуль уже установлен');
 if(!b.moduleConstruction&&!mission.canSpend(spec.cost))return mission.fail('Недостаточно нефти');
 const result=mission.order(workerIds,'upgrade-power',b);
 if(result.ok)b.moduleConstruction??={cost:spec.cost,progress:0,funding:{paid:0}};
 return result;
}
export function advancePowerModule(mission,building,dt){
 const job=building.moduleConstruction;
 if(!job||building.hp<=0||building.powerModule)return false;
 job.progress=Math.min(1,job.progress+fundedWorkTime(mission,job,dt)/mission.config.powerModule.seconds);
 if(job.progress>=1){building.powerModule=true;delete building.moduleConstruction;mission.emit('power-module-installed',{building:building.id});}
 return true;
}
