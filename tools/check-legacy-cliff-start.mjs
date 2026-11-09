import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {checkManeuver,vehicleClearance} from '../campaign/vehicle-motion.js';
const read=p=>JSON.parse(fs.readFileSync(p));
const config=read('assets/campaign/alpha/mission01/gameplay.json'),raw=createHeightfield(read('assets/maps/alpha/heightfield.json'));
shapeMesaRims(raw);const field=refineRoadHeightfield(raw);applyRoadGrades(field,read('assets/maps/alpha/roads.json'));
const m=new Mission(config,field),poses=[
 {x:-1391.9818,y:783.6999,heading:1.33193,goal:{x:-794.54,y:1077.31}},
 {x:-1375.9505,y:795.6683,heading:1.05886,goal:{x:-805.46,y:1098.69}},
];
const units=poses.map(p=>m.addUnit('bukhanka','rai',p,{heading:p.heading}));
for(let i=0;i<units.length;i++)assert(m.order([units[i].id],'move',poses[i].goal).ok);
const state=()=>units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,task:u.task,path:u.path,detour:u.detour,watch:u.driveWatch,
 traffic:u.traffic,hold:u.trafficHold,rest:u.trafficRest,speed:u.driveSpeed,reverseDebt:u.reverseDebt,escape:u.terrainEscape,navigation:u.navigation}));
const history=[{t:0,units:structuredClone(state())}],first=[null,null];let gap=Infinity;
for(let i=1;i<=300;i++){
 m.advance(.1);gap=Math.min(gap,vehicleClearance(...units,config.worldScale,field));
 for(let n=0;n<units.length;n++)if(Math.hypot(units[n].x-poses[n].x,units[n].y-poses[n].y)>.1)first[n]??=i/10;
 if([1,5,10,20,30,50,70,90,100,150,300].includes(i))history.push({t:i/10,units:structuredClone(state())});
}
const result={first,gap,hp:units.map(u=>u.hp),displacement:units.map((u,i)=>Math.hypot(u.x-poses[i].x,u.y-poses[i].y)),history};
fs.writeFileSync('campaign/reports/legacy-cliff-start.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,history:undefined}));
if(!process.argv.includes('--diagnose'))assert(first.every(t=>t!==null&&t<=7)&&gap>=0);
