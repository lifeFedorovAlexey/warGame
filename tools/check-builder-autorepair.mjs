import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const json=p=>JSON.parse(fs.readFileSync(p)),config=json('assets/campaign/alpha/mission01/gameplay.json');
const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
const field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));
function fixture(){
 const m=new Mission(config,field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],raidReserve:[],artifacts:[],energy:2400,openingScene:null,pendingCinematics:[],storyConstruction:{enabled:false}});
 m.updateMission=()=>{};m.explored.fill(255);m.visible.fill(255);m.constructionUnlocked=()=>true;m.rebuildNavigation();return m;
}
const run=(m,seconds)=>{for(let t=0;t<seconds-.001;t+=.1)m.tick(.1);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const results=[];
for(const kind of ['factory','lab','generator','derrick'])for(const completed of [false,true])for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
 const m=fixture(),target=m.addStructure(kind,'rai',{x:-1600,y:408},{completed,progress:completed?1:.3,groundHeight:field.heightAt(-1600,408)});
 if(completed)target.hp=target.maxHp*.5;
 const u=m.addUnit('builder','rai',{x:target.x+dx*(target.halfWidth+24),y:target.y+dy*(target.halfDepth+24)}),before={x:u.x,y:u.y},hp=target.hp,progress=target.progress;
 m.rebuildNavigation();assert(m.canWorkHere(u,target),kind+' beam reaches '+[dx,dy]);
 assert(m.order([u.id],completed?'repair':'build',target).ok);
 run(m,3);
 assert(distance(u,before)<.2,kind+' must work from the accessible side without driving to a service rail');
 assert(completed?target.hp>hp:target.progress>progress,kind+' must actually advance work');
 assert(u.builderContact&&u.builderWorking,kind+' visible beam contact');
 results.push({kind,completed,side:[dx,dy],travel:distance(u,before)});
}
{
 const m=fixture(),workers=[[-1600,340],[-1450,340],[-1540,290]].map(([x,y])=>m.addUnit('builder','rai',{x,y}));
 const targets=[[-1600,400],[-1450,400]].map(([x,y])=>m.addStructure('generator','rai',{x,y},{completed:true,progress:1,groundHeight:field.heightAt(x,y)}));m.rebuildNavigation();
 for(const t of targets)t.hp=t.maxHp*.2;
 run(m,.5);assert(workers.every(u=>!u.task),'Automatic repair starts disabled');
 assert(m.setBuilderAutoRepair(true).ok);run(m,.1);
 const claims=workers.filter(u=>u.task?.autoRepair).map(u=>u.task.targetId);
 assert.equal(claims.length,2);assert.equal(new Set(claims).size,2,'One worker per target');
 const hp=targets.map(t=>t.hp);run(m,3);assert(targets.every((t,i)=>t.hp>hp[i]),'Both repair targets gain real HP');
 const save=m.save();m.load(save);assert.equal(m.state.builderAutoRepair,true,'Setting persists in saves');
 m.setBuilderAutoRepair(false);assert(m.state.units.every(u=>!u.task?.autoRepair&&!u.builderWorking),'Disable cancels only autonomous work');
}
for(const autoRepair of [false,true]){
 const m=fixture(),u=m.addUnit('builder','rai',{x:-1600,y:360}),car=m.addUnit('bukhanka','rai',{x:-1600,y:400});car.hp=100;
 m.setBuilderAutoRepair(autoRepair);assert(!m.order([u.id],'repair',car).ok);assert(!m.submitOrder([u.id],'repair',car).ok);
 run(m,3);assert.equal(car.hp,100);assert(!u.task,'Damaged vehicles are never automatic repair targets');
 u.task={type:'repair',targetId:car.id,x:car.x,y:car.y,autoRepair};u.builderWorking=true;u.path=[{x:car.x,y:car.y}];
 m.load(m.save());const restored=m.entity(u.id);assert.equal(restored.task,null);assert.deepEqual(restored.path,[]);assert(!restored.builderWorking,'Old vehicle repair orders are retired on load');
 run(m,1);assert.equal(m.entity(car.id).hp,100);
}
{
 const m=fixture(),u=m.addUnit('builder','rai',{x:-1600,y:360}),target=m.addUnit('bukhanka','rai',{x:-1600,y:400});target.hp=100;
 assert(m.order([u.id],'move',{x:-1500,y:360}).ok);m.setBuilderAutoRepair(true);run(m,.5);
 assert.equal(u.task?.type,'move','Manual orders keep priority');
 m.setBuilderAutoRepair(false);assert.equal(u.task?.type,'move','Disabling auto does not cancel manual orders');
}
console.log(JSON.stringify({pass:true,surfaceCases:results.length,maxTravel:Math.max(...results.map(r=>r.travel)),checks:['four building types, four sides, build and repair','real HP/progress and beam','one worker per target','off/on/off','save/load','manual order priority']}));
