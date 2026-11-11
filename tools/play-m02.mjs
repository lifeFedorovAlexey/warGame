// Real public orders, movement and damage. No teleporting, HP edits or scripted kills.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
import {setFactoryModernization} from '../campaign/factory-modernization.js';
const dir='docs/campaign/alpha/m02',resumePath=process.argv.find(arg=>arg.startsWith('--resume='))?.slice(9);
const m=makeMission();if(resumePath)m.load(JSON.parse(fs.readFileSync(resumePath,'utf8')).state);else prepareM02Diagnostic(m);
const army=()=>m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&m.unitSpec(u).damage);
const log=[],out=(name,data={})=>{const row={name,time:+m.state.time.toFixed(1),alive:army().length,...data};log.push(row);console.log(JSON.stringify(row));};
const start=m.field.gridToWorld(m.config.startGrid),desired=Number(process.argv[2]??20);
for(let row=0;!resumePath&&row<12&&army().length<desired;row++)for(let col=0;col<9&&army().length<desired;col++){
 const p={x:start.x-160+col*32,y:start.y-140-row*32,heading:0,kind:'bukhanka',owner:'rai'};
 if(m.vehicleMotionClear(p,p,p)&&m.state.units.every(u=>Math.hypot(u.x-p.x,u.y-p.y)>28)&&m.vehiclePath(p,start,{maxGoalDistance:100})?.length)m.addUnit('bukhanka','rai',p);
}
if(!resumePath)assert.equal(army().length,desired);
const reinforce=()=>{
 const factory=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='factory');
 if(!factory||factory.queue.length>=3||army().length+factory.queue.length>=Math.min(desired,40))return;
 const kind=m.state.research['twin-machinegun']?'twin-machinegun':'bukhanka';let project=m.factoryProjects().find(p=>p.kind===kind);
 if(!project){const result=m.saveDesign('Полевая спарка',['C01','B01','U02'],'sand');if(!result.ok)return;project={id:result.id};}
 m.produce(factory.id,project.id);
};let nextReinforcement=0;
const audit={samples:0,minimumGap:null,intersections:[]};let nextAudit=0;
const advance=(seconds,until=()=>false)=>{for(let i=0;i<seconds*10;i++){
 m.advance(.1);m.drainEvents();m.drainEffects();
 if(process.argv.includes('--defend')&&m.state.status==='running'&&m.state.time>=nextReinforcement){nextReinforcement=m.state.time+1;reinforce();}
 if(process.argv.includes('--audit')&&m.state.time>=nextAudit){
  nextAudit=m.state.time+1;const cars=army().filter(u=>u.factoryVisit?.phase!=='inside');audit.samples++;
  for(let a=0;a<cars.length;a++)for(let b=0;b<a;b++){
   if(Math.hypot(cars[a].x-cars[b].x,cars[a].y-cars[b].y)>40)continue;
   const gap=vehicleClearance(cars[a],cars[b],m.config.worldScale,m.field);audit.minimumGap=Math.min(audit.minimumGap??Infinity,gap);
   if(gap<-.05&&audit.intersections.length<20)audit.intersections.push({time:m.state.time,ids:[cars[a].id,cars[b].id],gap});
  }
 }
 if(until())return true;if(m.state.status!=='running')return false;
}return until();};
const order=(type,target)=>{const result=m.order(army().map(u=>u.id),type,target);out('order',{type,target:{id:target.id,x:target.x,y:target.y},result});assert(result.ok,result.reason);};
const refit=()=>{
 const factory=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='factory'),lab=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='lab');
 if(!factory){out('refit-unavailable',{reason:'factory destroyed'});return;}
 const key=m.state.artifactKeys.includes('twin-machinegun')&&!m.state.research['twin-machinegun']?'twin-machinegun':m.state.artifactKeys.includes('flamer-upgrade')&&!m.state.research['flamer-upgrade']?'flamer-upgrade':null;
 if(key&&lab){assert(m.research(lab.id,key).ok);out('research',{key});}
 else if(key)out('research-unavailable',{key,reason:'laboratory destroyed in battle'});
 const damaged=army().filter(u=>u.hp<u.maxHp);
 if(damaged.length){assert(m.retreat(damaged.map(u=>u.id)).ok);out('repair-retreat',{units:damaged.map(u=>u.id)});}
 for(let seconds=0;seconds<500;seconds++){
  if(process.argv.includes('--defend')&&m.state.research['twin-machinegun']&&!factory.autoModernize){assert(setFactoryModernization(m,factory.id,true).ok);out('modernization-enabled');}
  if(army().length+factory.queue.length<Math.min(desired,40)){
   const kind=m.state.research['twin-machinegun']?'twin-machinegun':'bukhanka';
   let project=m.factoryProjects().find(p=>p.kind===kind);
   if(!project){const created=m.saveDesign('Полевая спарка',['C01','B01','U02'],'sand');assert(created.ok);project={id:created.id};}
   if(factory.queue.length<3)m.produce(factory.id,project.id);
  }
  advance(1);
  if(m.state.status!=='running')break;
  if(seconds>30&&!lab?.research&&!factory.queue.length&&army().length>=Math.min(desired,40)&&damaged.every(u=>u.hp<=0||u.hp===u.maxHp&&!u.combatRetreat))break;
 }
 out('refitted',{hp:army().reduce((n,u)=>n+u.hp/u.maxHp,0)/army().length,produced:m.state.statistics.produced});
};
try{
 out(resumePath?'resumed':'start',{source:resumePath});
 if(resumePath)refit();
 const builders=m.state.units.filter(u=>u.kind==='builder'&&u.owner==='rai');let towers=0;
 for(const grid of !resumePath&&process.argv.includes('--defend')?[[21,49],[21,53],[21,56],[17,47],[13,47]]:[]){
  const p=m.field.gridToWorld(grid);if(!m.placement('mg-tower',p.x,p.y).ok)continue;
  const result=m.build([builders[towers%builders.length].id],'mg-tower',p.x,p.y);
  if(result.ok){out('defensive-construction',{grid});if(++towers===5)break;}
 }
 for(const grid of resumePath?[]:[[37.5,76.5],[39.5,91]]){
  const p=m.field.gridToWorld(grid);order('attack-move',p);
  const ok=advance(240,()=>army().filter(u=>Math.hypot(u.x-p.x,u.y-p.y)<180).length>=Math.ceil(army().length*.8));
  out('waypoint',{grid,arrived:ok,units:army().map(u=>({id:u.id,x:u.x,y:u.y,hp:u.hp,task:u.task?.type}))});assert(ok,'Column did not reach '+grid);
 }
 for(const id of ['hill_factory','east_factory','energy_hub','sensor_outpost']){
  const base=m.state.m02.bases[id];if(base.state==='neutralized'&&base.artifact.state==='collected')continue;order('attack-move',base.gate);
  advance(240,()=>base.discovered&&army().some(u=>Math.hypot(u.x-base.gate.x,u.y-base.gate.y)<200));
  for(let round=0;round<24&&base.state!=='neutralized';round++){
   if(army().length<6){refit();order('attack-move',base.gate);advance(200,()=>army().some(u=>Math.hypot(u.x-base.gate.x,u.y-base.gate.y)<180));}
   const targets=[...base.structureIds,...base.garrisonIds].map(id=>m.entity(id)).filter(u=>u&&m.visibleAt(u.x,u.y));
   const target=targets.find(u=>u.kind==='bunker')??targets.find(u=>u.kind==='scav-factory')??targets[0];
   if(target)order('attack',target);else order('attack-move',base.artifact.point);
   advance(100,()=>target?!m.entity(target.id):[...base.structureIds,...base.garrisonIds].some(id=>{const u=m.entity(id);return u&&m.visibleAt(u.x,u.y);}));
   assert.equal(m.state.status,'running','Base defence failed');
   advance(.6);out('engagement',{base:id,remaining:[...base.structureIds,...base.garrisonIds].filter(id=>m.entity(id))});
  }
  assert.equal(base.state,'neutralized',id);
  const artifact=m.state.artifacts.find(a=>a.id===base.artifact.id);assert(artifact);
  order('move',artifact);assert(advance(120,()=>base.artifact.state==='collected'),'collect '+id);out('base-cleared',{base:id});
  fs.writeFileSync(dir+'/playthrough-checkpoint.json',m.save());
  if(id!=='sensor_outpost')refit();
  if(process.argv.includes('--sortie')){
   const p=m.field.gridToWorld([39.5,91]);order('attack-move',p);
   assert(advance(300,()=>army().filter(u=>Math.hypot(u.x-p.x,u.y-p.y)<240).length>=Math.ceil(army().length*.7)),'Return to the southern passage');
   out('sortie-returned');break;
  }
 }
 if(!process.argv.includes('--sortie')){assert.equal(m.state.status,'victory');out('victory');}
}catch(error){out('failed',{error:error.message});process.exitCode=1;}
finally{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/playthrough-'+desired+'.json',JSON.stringify({log,audit,state:JSON.parse(m.save())},null,2));}
