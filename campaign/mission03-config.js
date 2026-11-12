import {m03Landing,m03Artifact,m03Point} from './mission03-terrain.js';
export const M03={
 id:'m03',version:1,name:'Первый вылет',seconds:900,checkInterval:.25,
 bounds:[43,18,84,108],landingGrid:m03Landing,heading:Math.PI/2,
 artifact:{id:'m03-heavy-machinegun',key:'heavy-machinegun',...m03Artifact},
 inspection:{...m03Point([37.5,61.5]),radius:70},evacuationRadius:340,
};
export function installM03Config(config){
 const base=config.units.bukhanka;
 config.units['heavy-machinegun']??={...base,name:'Тяжёлый пулемёт',components:['C01','B01','mission-heavy-mg'],requires:'heavy-machinegun',cost:210,seconds:28,damage:base.damage*2.1,range:base.range*1.18,cooldown:(base.cooldown??.4)*1.3};
 config.research['heavy-machinegun']??={mission:'m03',name:'Тяжёлый пулемёт',description:'Довоенный крупнокалиберный модуль. Повышенные урон и дальность; новая сборка в конструкторе.',cost:190,seconds:55,unlocksUnit:'heavy-machinegun'};
 config.vehicleComponents['mission-heavy-mg']??={name:'Тяжёлый пулемёт',cost:95};
 config.buildings['m03-flame-tower']??={...config.buildings['scav-flame-tower'],weapon:'flame',name:'Огнемётная башня склада'};
 if(!config.buildings.factory.production.includes('heavy-machinegun'))config.buildings.factory.production.push('heavy-machinegun');
 config.transport??={capacity:10,maxWidth:4.25,maxHeight:5.4,slotLength:5.2,boardingTimeout:100,classes:{light:{slots:1,width:2.3,length:4.8,height:3.6},medium:{slots:2,width:3.1,length:8.8,height:4.5},heavy:{slots:4,width:4.1,length:18,height:5.2}}};
 for(const spec of Object.values(config.units))if(spec.components&&!spec.enemyOnly&&!spec.infantry)spec.transport??='light';
 config.m03??={seconds:M03.seconds};
 return config;
}
