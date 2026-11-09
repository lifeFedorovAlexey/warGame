import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
// Reconstructed incident geometry and queue, not a complete gameplay save.
const file=process.argv[2]??'tools/fixtures/factory-queue-19.json';
const capture=JSON.parse(fs.readFileSync(file)),config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const source=createHeightfield(JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json')));shapeMesaRims(source);const field=refineRoadHeightfield(source);applyRoadGrades(field,JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json')));
const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],pendingCinematics:[],bounds:capture.bounds,energy:2400,time:capture.sim});m.updateMission=()=>{};m.explored.fill(255);m.visible.fill(255);
const visitors=capture.units.filter(u=>u.owner==='rai'&&u.factoryVisit),factoryIds=new Set(visitors.map(u=>u.factoryVisit.factoryId));
for(const row of capture.buildings){const spec=config.buildings[row.kind];m.state.buildings.push({...row,owner:factoryIds.has(row.id)?'rai':'neutral',completed:true,progress:1,queue:[],cooldown:0,rotation:visitors.find(u=>u.factoryVisit.factoryId===row.id)?.factoryVisit.factory.rotation??0,maxHp:row.hp,...(spec?{cost:spec.cost}:{} )});}
for(const row of capture.units.filter(u=>u.owner==='rai')){
 const unit=m.addUnit(row.kind,'rai',row);Object.assign(unit,{...structuredClone(row),path:[],task:null,combatPolicy:{retreat:'never',response:'ignore',priority:'nearest'}});
 if(unit.factoryVisit){delete unit.factoryVisit.waitGeometry;delete unit.factoryVisit.waitingPoint;unit.combatRetreat={...unit.retreat,forced:true};delete unit.combatRetreat.resume;delete unit.retreat;}
}
m.rebuildNavigation();m.events=[];const ids=new Set(visitors.map(u=>u.id)),released=new Set(),events=[],started=performance.now();
for(let i=0;i<6000&&performance.now()-started<45000;i++){
 m.advance(.1);m.finishPendingStep();m.effects=[];
 for(const e of m.events)if(['factory-admitted','factory-repair-complete','factory-released'].includes(e.type)){events.push(e);if(e.type==='factory-released')released.add(e.unit);}m.events=[];
 if(released.size===ids.size)break;
}
const report={source:file,simulated:m.state.time,cpuMs:performance.now()-started,total:ids.size,released:released.size,remaining:m.state.units.filter(u=>ids.has(u.id)&&u.factoryVisit).map(u=>({id:u.id,hp:u.hp,max:u.maxHp,x:u.x,y:u.y,phase:u.factoryVisit.phase,reason:u.navigation?.reason})),events};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/factory-live-queue.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,events:events.length}));
fs.writeFileSync('campaign/reports/factory-live-final.json',m.save());
assert.equal(released.size,ids.size,'Every captured repair visitor must repair and leave');
