import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const file=process.argv.find(x=>x.startsWith('--fixture='))?.slice(10)??'campaign/reports/navigation-orders-connected-500-fixture.json';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),input=json(file),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
const m=new Mission(config,field);m.load(input.initialSave);m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);
const pose=u=>structuredClone({id:u.id,x:u.x,y:u.y,heading:u.heading,v:u.driveSpeed,reversing:u.reversing,steering:u.steering,
 path:u.path,task:u.task,detour:u.detour,navigation:u.navigation,decision:m.trafficCoordinator.decisions.get(u.id),intent:m.trafficCoordinator.intents.get(u.id)});
let firstContact=null,last=-1;const history=[],hit=m.vehicleCollision.bind(m);
m.vehicleCollision=(u,speed,blockers)=>{
 if(blockers.size&&!firstContact)firstContact={time:m.state.time,speed,unit:pose(u),blockers:[...blockers].map(b=>({...pose(b),gap:vehicleClearance(u,b,config.worldScale,field)})),
  state:structuredClone(m.state),history:structuredClone(history)};
 return hit(u,speed,blockers);
};
const response=m.submitOrder(input.ids,'move',input.goal),started=performance.now();let frames=0;
for(;frames<1600&&!firstContact&&performance.now()-started<30000;frames++){
 m.advance(1/80,{budgetMs:8});m.effects=[];
 if(m.state.time!==last){last=m.state.time;history.push({time:last,units:m.state.units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,v:u.driveSpeed,
  steering:u.steering,reversing:u.reversing,point:u.path[0],detour:u.detour?.legs?.[0],reason:u.navigation?.reason}))});if(history.length>20)history.shift();}
}
const result={scope:'Production submitOrder replay until first physical contact; CPU diagnostic, no FPS inference',file,response,frames,
 simulatedSeconds:m.state.time,wallMs:performance.now()-started,pending:m.state.units.filter(u=>u.pendingOrder).length,firstContact};
fs.writeFileSync('campaign/reports/mass-first-contact.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,firstContact:firstContact&&{time:firstContact.time,id:firstContact.unit.id,speed:firstContact.speed,
 blockers:firstContact.blockers.map(b=>({id:b.id,gap:b.gap}))}}));
