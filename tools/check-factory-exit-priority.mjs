import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {factoryPoint,insideFactory,updateFactoryVisit} from '../campaign/factory-garage.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
config.initialMapBounds=config.finalMapBounds=[0,0,127,127];
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const observe=process.argv.includes('--observe'),reports=[];
for(const rotation of [0,Math.PI/2,Math.PI]){
 const m=new Mission(config,field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],pendingCinematics:[],bounds:[0,0,127,127],energy:2400});
 m.updateMission=()=>{};m.explored.fill(255);m.visible.fill(255);
 const f=m.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1,rotation});
 const cars=Array.from({length:12},(_,i)=>m.addUnit('bukhanka','rai',factoryPoint(m,f,(i%4-1.5)*9,-35-Math.floor(i/4)*9),{heading:rotation}));
 for(const u of cars){u.hp=100;u.combatRetreat={forced:true,status:'planning',started:0};}
 m.rebuildNavigation();m.events=[];
 const log=[],started=performance.now(),left=new Set();let readyWithoutGate=0,freeReadySteps=0,maxFreeReadySteps=0;
 for(let i=0;i<6000&&performance.now()-started<45000;i++){
  m.advance(.1);m.finishPendingStep();m.effects=[];
  for(const e of m.events)if(['factory-admitted','factory-repair-complete','factory-released'].includes(e.type)){log.push({type:e.type,unit:e.unit,time:e.time});if(e.type==='factory-released')left.add(e.unit);}
  m.events=[];
  const outside=cars.filter(u=>!insideFactory(u));
  assert(outside.filter(u=>['gate','entering'].includes(u.factoryVisit?.phase)).length<=1,'One incoming vehicle');
  assert(outside.filter(u=>['leaving','departure'].includes(u.factoryVisit?.phase)).length<=1,'One outgoing vehicle');
  for(let a=0;a<outside.length;a++)for(let b=0;b<a;b++)assert(vehicleClearance(outside[a],outside[b],config.worldScale,field)>0,'No overlapping vehicles: '+JSON.stringify({time:m.state.time,a:outside[a].id,b:outside[b].id,ap:outside[a].factoryVisit?.phase,bp:outside[b].factoryVisit?.phase,ax:outside[a].x,ay:outside[a].y,bx:outside[b].x,by:outside[b].y}));
  if(cars.some(u=>insideFactory(u)&&u.hp===u.maxHp)&&!cars.some(u=>['gate','entering','leaving','departure'].includes(u.factoryVisit?.phase))){readyWithoutGate++;freeReadySteps++;}else freeReadySteps=0;
  maxFreeReadySteps=Math.max(maxFreeReadySteps,freeReadySteps);
  if(left.size===12)break;
 }
 const first=log.findIndex(e=>e.type==='factory-released'),admissionsBeforeFirstExit=log.slice(0,first<0?log.length:first).filter(e=>e.type==='factory-admitted').length;
 const report={rotation,admissionsBeforeFirstExit,released:left.size,seconds:m.state.time,readyWithoutGate,maxFreeReadyWait:maxFreeReadySteps*.1,log};reports.push(report);
 console.log(JSON.stringify({rotation,admissionsBeforeFirstExit,released:left.size,seconds:m.state.time,readyWithoutGate}));
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/factory-exit-'+(observe?'before':'after')+'.json',JSON.stringify(reports,null,2));
 assert.equal(left.size,12,'All 12 leave: '+JSON.stringify(cars.map(u=>({id:u.id,hp:u.hp,phase:u.factoryVisit?.phase,x:u.x,y:u.y,gate:f.garageGate,reason:u.navigation?.reason}))));
 if(!observe){assert(admissionsBeforeFirstExit<=2,'Release after the current entrant, not after the entire batch');assert(maxFreeReadySteps<=2,'A free gate must release a ready car within two simulation steps');}
}
if(!observe){
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127]});
 const f=m.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
 const ready=m.addUnit('bukhanka','rai',factoryPoint(m,f,0,-3)),waiting=m.addUnit('bukhanka','rai',factoryPoint(m,f,9,-23));
 ready.factoryVisit={factoryId:f.id,phase:'inside',arrived:0,slot:0};waiting.hp=100;waiting.factoryVisit={factoryId:f.id,phase:'waiting',queued:0,slot:1};f.garageGate=waiting.id;m.rebuildNavigation();
 const steps=updateFactoryVisit(m,ready,f,.1);while(!steps.next().done){}
 assert.equal(ready.factoryVisit.phase,'leaving','An incoming reservation does not prevent release');assert.equal(f.garageExit,ready.id);assert.equal(f.garageGate,waiting.id);
}
if(!observe){
 const m=new Mission(config,field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],time:30});
 const f=m.addStructure('factory','rai',{x:0,y:0},{completed:true,progress:1});
 const car=(x,y,queued,slot)=>{
  const point=factoryPoint(m,f,x,y),u=m.addUnit('bukhanka','rai',point);
  u.hp=100;
  u.factoryVisit={garageVersion:2,factoryId:f.id,phase:'waiting',queued,slot,waitingPoint:point};
  return u;
 };
 const older=car(9,-37,10,0),newer=car(-9,-23,20,1);
 const distant=car(70,-90,0,2);
 delete distant.factoryVisit.waitingPoint;
 m.rebuildNavigation();
 for(const _ of updateFactoryVisit(m,newer,f,.1)){}
 assert.equal(f.garageGate,older.id,'A closer arrival cannot overtake an older ready car, or reserve the gate from far away');
}
console.log(observe?'Observed current gate arbitration':'PASS: 12 vehicles repair and exit individually at three factory rotations, no entry-batch barrier or overlapping vehicles');
