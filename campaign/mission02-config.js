import layout from '../assets/campaign/alpha/mission02/layout.js';
// Values are simulation seconds and existing world-grid coordinates (32 m).
export const M02={
 id:'m02',version:2,bounds:[0,0,53,127],checkInterval:.5,globalCap:40,maxRaids:2,
 factories:{
  east_factory:{seconds:12,size:6,cap:12,activation:'proximity',radius:390,roster:['raider','scav-zaporozhets']},
  hill_factory:{seconds:18,size:6,patrolSize:4,cap:12,activation:'immediate',radius:400,roster:['raider','scav-zaporozhets','scav-firetruck']},
  energy_hub:{seconds:16,size:8,cap:16,activation:'south',delay:360,radius:500,roster:['raider','scav-bus','scav-firetruck']},
 },
 technologies:{east_factory:'flamer-upgrade',hill_factory:'twin-machinegun',sensor_outpost:'sensor',energy_hub:'power-module'},
 guards:{east_factory:['raider','scav-rifleman','scav-grenadier'],hill_factory:['raider','scav-firetruck','scav-rifleman','scav-grenadier'],sensor_outpost:['scav-zaporozhets','scav-rifleman'],energy_hub:['scav-bus','raider','scav-firetruck','scav-grenadier','scav-rifleman']},
};
export const M02_FACTORY={name:'Завод отбросов',enemyOnly:true,renderKind:'camp-core',realSizeMetres:[12,10,6],footprintMetres:[14,12],hp:1100,vision:200,power:0,seconds:1,exitAnchor:[0,-10,0]};
export function installM02Config(config){
 for(const grid of layout.oilFields??[])if(!config.oilFields.some(p=>p[0]===grid[0]&&p[1]===grid[1]))config.oilFields.push(grid.slice());
 const gunCost=config.vehicleComponents?.U01?.cost??50;
 config.units['twin-machinegun']??={...config.units.bukhanka,name:'Спаренный пулемёт',components:['C01','B01','U02'],requires:'twin-machinegun',cost:config.units.bukhanka.cost+gunCost*.3,seconds:21,damage:config.units.bukhanka.damage*1.4};
 config.units.sensor??={...config.units.bukhanka,name:'Сенсор',components:['C01','B01','U21'],requires:'sensor',role:'recon',cost:165,seconds:22,damage:0,range:0,vision:config.units.bukhanka.vision*1.5};
 config.buildings['scav-factory']??={...M02_FACTORY};
 config.buildings['scav-generator']??={...config.buildings.generator,name:'Генератор отбросов',enemyOnly:true,hp:500};
 config.buildings['scav-flame-tower']??={...config.buildings['mg-tower'],name:'Огнемётная вышка',enemyOnly:true,renderKind:'mg-tower',realSizeMetres:[5,5,8],footprintMetres:[5.1,5.1],hp:650,range:95,damage:18,cooldown:.7};
 config.buildings['scav-cannon-tower']??={...config.buildings['mg-tower'],name:'Пушечная вышка',enemyOnly:true,renderKind:'mg-tower',realSizeMetres:[5,5,8],footprintMetres:[5.1,5.1],hp:950,range:230,damage:28,cooldown:1.8};
 config.buildings['scav-sensor']??={name:'Радар — сенсорная установка',enemyOnly:true,renderKind:'sensor',realSizeMetres:[6,6,8],footprintMetres:[8,8],hp:650,vision:300,power:0,seconds:1};
 config.research['flamer-upgrade']??={mission:'m02',name:'Усиление огнемёта',description:'Урон всех огнемётов +20%.',cost:120,seconds:35,damageMultiplier:1.2};
 config.research['twin-machinegun']??={mission:'m02',name:'Спаренный пулемёт',description:'Два ствола: урон +40%, прежняя дальность. Модуль U02 в конструкторе.',cost:140,seconds:40,unlocksUnit:'twin-machinegun'};
 config.research.sensor??={mission:'m02',name:'Сенсор',description:'Обнаружение ×1,5. Устанавливается вместо оружия; не стреляет.',cost:130,seconds:35,unlocksUnit:'sensor'};
 config.research['power-module']??={mission:'m02',name:'Энергомодуль',description:'Достройка АЭС строителем: отдача подключённых вышек +25%, число подключений прежнее.',cost:160,seconds:45};
 config.powerModule??={cost:120,seconds:25,multiplier:1.25};
 for(const kind of ['twin-machinegun','sensor'])if(!config.buildings.factory.production.includes(kind))config.buildings.factory.production.push(kind);
 config.vehicleComponents={...config.vehicleComponents,U01:{...config.vehicleComponents?.U01,cost:gunCost},U02:{name:'Спарка',cost:gunCost*1.3},U21:{name:'Дозор'}};
 return config;
}
