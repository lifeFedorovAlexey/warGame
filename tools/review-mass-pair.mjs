import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),config=json('assets/campaign/alpha/mission01/gameplay.json');
const source=json('campaign/reports/navigation-browser-connected.json').results.find(r=>r.phase==='move-order').contactLog[0];
const initial=json('campaign/reports/navigation-browser-connected-500-fixture.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const m=new Mission(config,field);m.load(initial.initialSave);m.updateMission=()=>{};
const records=[source.unit,source.blockers[0]],units=records.map(r=>m.entity(r.id));
if(!process.argv.includes('--all'))m.state.units=units;
m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
const contacts=[],history=[],hit=m.vehicleCollision.bind(m);
m.vehicleCollision=(u,speed,blockers)=>{if(blockers.size)contacts.push({time:m.state.time,id:u.id,speed,
 blockers:[...blockers].map(b=>({id:b.id,gap:vehicleClearance(u,b,config.worldScale,field)}))});return hit(u,speed,blockers);};
const give=i=>{const u=units[i],r=records[i];u.path=structuredClone(r.path);u.task=structuredClone(r.task);u.routeOrder=structuredClone(r.routeOrder);};
give(0);let last=-1;
for(let frame=0;frame<8*80;frame++){
 if(frame===16)give(1);
 m.advance(1/80,{budgetMs:8});m.effects=[];
 if(m.state.time!==last){last=m.state.time;history.push({time:last,units:structuredClone(units)});}
}
const report={scope:'Physics isolation: unchanged browser accepted routes, original poses, second route begins0.2s later',contacts,history};
fs.writeFileSync('campaign/reports/mass-pair.json',JSON.stringify(report,null,2));console.log(JSON.stringify({contacts,seconds:m.state.time}));
