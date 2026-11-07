import fs from 'node:fs';
import {BUILDER,forwardBuilder,restJoints} from '../campaign/builder-kinematics.js';
const path='assets/blueprints/U25/module.json',spec=JSON.parse(fs.readFileSync(path,'utf8')),mm=point=>point.map(value=>Math.round(value*1000)),degrees=value=>Math.round(value*180/Math.PI*100)/100,fk=forwardBuilder(restJoints());
spec.working_bounds_mm={min:[-8000,-8000,-8000],max:[8000,8000,8000]};
spec.anchors.find(a=>a.name==='tool_tip').position_mm=mm(fk.tip);
const motion=(name,parent,point,axis,kind,min,max,speed,description)=>({name,parent,pivot_mm:mm(point),axis,kind,min,max,speed,rest:0,motion:description,limits:kind==='rotation'?`${min}…${max}°, ${speed}°/с`:`${min}…${max} мм, ${speed} мм/с`});
spec.moving_parts=[
 motion('builder_yaw',null,[0,0,.08],'Z','rotation',...BUILDER.limits.yaw.map(degrees),degrees(BUILDER.rates.yaw),'Поворот стрелы. При работе машина стоит параллельно поверхности; нижний фланец неподвижен.'),
 motion('shoulder','builder_yaw',fk.shoulder,'X','rotation',...BUILDER.limits.shoulder.map(degrees),degrees(BUILDER.rates.shoulder),'Подъём основной стрелы. Перед раскрытием локтя — 25°. Контроль корпуса действует на каждом шаге.'),
 motion('elbow','shoulder',fk.elbow,'X','rotation',...BUILDER.limits.elbow.map(degrees),degrees(BUILDER.rates.elbow),'Раскрытие обратной секции и опускание телескопа к поверхности с сохранением зазора над крышей.'),
 ...Array.from({length:BUILDER.stages},(_,i)=>motion('telescope_'+(i+1),i?'telescope_'+i:'elbow',fk.elbow,'Y','translation',-BUILDER.stroke*1000,0,BUILDER.rates.extension/BUILDER.stages*1000,'Полая вложенная секция длиной 1350 мм. Ход 1200 мм, продольное перекрытие не менее 150 мм; секции движутся синхронно.')),
 motion('wrist','telescope_4',fk.wrist,'X','rotation',...BUILDER.limits.wrist.map(degrees),degrees(BUILDER.rates.wrist),'Ориентация сопла к поверхности. Источник сварки совпадает с открытым торцом сопла, а не с центром головки.'),
];
spec.lights[0].position_mm=mm([fk.wrist[0],fk.wrist[1]+.034,fk.wrist[2]+.10]);
spec.lights[1].behavior='Слабый индикатор в ожидании; яркость усиливается только у работающего строителя.';
spec.states=[
 {name:'Транспорт',description:'Все углы и выдвижение равны нулю; детали внутри 1900×1300×1250 мм. Движение разрешено только в этом состоянии.'},
 {name:'Развёртывание',description:'Остановить машину и повернуть параллельно рабочей поверхности. Поднять плечо на 25°, раскрыть локоть и повернуть yaw. Навести сложенный телескоп; затем выдвинуть секции к подтверждённой точке контакта.'},
 {name:'Строительство',description:'Решение кинематики должно укладываться в пределы суставов, не пересекать корпус, землю и целевую поверхность. Допуск торца инструмента — 2 мм модели. Только после этого разрешены прогресс и искры. Основание и стальная рабочая планка здания неподвижны.'},
 {name:'Ремонт',description:'Работать по стальному участку задней двери B01 ниже окна. При движении цели прекратить сварку, убрать стрелу и следовать к новой рабочей позиции.'},
 {name:'Сворачивание',description:'Сразу прекратить сварку, втянуть все четыре секции, поднять сложенный телескоп в безопасную позу, закрыть локоть и yaw, опустить плечо. До завершения движения машины заблокированы.'},
];
spec.constraints=[...spec.constraints.filter(c=>!c.includes('30 мм')&&!c.startsWith('Четыре вложенных')&&!c.startsWith('Рабочий куб')),'Четыре вложенных полых секции: общий ход 4800 мм, продольное перекрытие каждой пары не менее 150 мм.','Рабочий куб 16×16×16 м — консервативный габарит кинематики, а не обещание досягаемости любой точки. Фактическая зона ограничена корпусом, землёй, поверхностью цели и диапазонами осей.'];
spec.kinematics_source='campaign/builder-kinematics.js';
fs.writeFileSync(path,JSON.stringify(spec,null,2)+'\n');
console.log(JSON.stringify({id:spec.id,axes:spec.moving_parts.length,tip:spec.anchors.find(a=>a.name==='tool_tip').position_mm}));
