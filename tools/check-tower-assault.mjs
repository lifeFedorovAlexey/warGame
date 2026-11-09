import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const positions=[[-804,1044],[-751,1014],[-758,934],[-744,850],[-713,847],[-729,819],[-750,788],[-718,785]];
const results=[];
for(const mode of ['attack-move','attack-unit','attack-tower']){
 const m=new Mission(config,field);m.state.units=m.state.units.filter(u=>u.campId==='nw-east');m.state.buildings=m.state.buildings.filter(b=>b.campId==='nw-east');m.state.camps=m.state.camps.filter(c=>c.id==='nw-east');m.state.pendingCinematics=[];m.updateMission=()=>{};
 const units=positions.map(([x,y])=>m.addUnit('bukhanka','rai',{x,y}));m.rebuildNavigation();m.updateFog();
 const target=mode==='attack-tower'?m.state.buildings.find(b=>b.kind==='mg-tower'):m.state.units.find(u=>u.kind==='scav-firetruck');
 const goal=mode==='attack-move'?{x:-764,y:1190}:target;
 const order=m.order(units.map(u=>u.id),mode==='attack-move'?'attack-move':'attack',goal),shots={},firstShot={},timeline=[];
 const attack=m.attack.bind(m);m.attack=(u,...args)=>{const fired=attack(u,...args);if(fired&&u.owner==='rai'){shots[u.id]=(shots[u.id]??0)+1;firstShot[u.id]??=m.state.time;}return fired;};
 fs.mkdirSync('campaign/reports',{recursive:true});
 if(mode==='attack-move')fs.writeFileSync('campaign/reports/tower-assault-initial.json',m.save());
 for(let step=0;step<900;step++){
  m.advance(.1);m.effects=[];
  if(step%100===99)timeline.push({time:m.state.time,enemies:m.state.units.filter(u=>u.owner==='scavs'&&u.hp>0).length,units:units.map(u=>({id:u.id,x:Math.round(u.x),y:Math.round(u.y),hp:u.hp,shots:shots[u.id]??0,task:u.task,status:u.combatDeployment?.status,path:u.path.length,slot:u.combatDeployment?.slot,watch:u.driveWatch,retreat:u.combatRetreat}))});
 }
 const result={mode,order,firstShot,shots,timeline};results.push(result);console.log(JSON.stringify({mode,order,firstShot,final:timeline.at(-1)}));
}
fs.writeFileSync('campaign/reports/tower-assault.json',JSON.stringify(results,null,2));
