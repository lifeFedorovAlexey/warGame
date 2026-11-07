import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';

const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){
 const m=new Mission({...config,startGrid:[64,56],initialMapBounds:[0,0,127,127],finalMapBounds:[0,0,127,127]},field);
 Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],bounds:[0,0,127,127],pendingCinematics:[]});
 m.state.salvage.items=[];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;
}
function damaged(m,x=0,y=0){
 const u=m.addUnit('bukhanka','rai',{x,y},{heading:0});m.damage(u,u.maxHp*.3,null);
 assert(u.hp/u.maxHp<.8&&u.hp>0,'Fixture contains a real damaged living vehicle');return u;
}
const results=[];
function check(name,test){
 try{test();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}
}
check('enable light retreat on an already damaged idle car without any enemy',()=>{
 const m=fixture(),u=damaged(m);m.setCombatPolicy([u.id],{retreat:'light'});m.advance(.1);
 assert(u.combatRetreat&&u.path.length,JSON.stringify({hp:u.hp,maxHp:u.maxHp,retreat:u.combatRetreat,task:u.task}));
 const initial={x:u.x,y:u.y};for(let i=0;i<400&&u.combatRetreat.status!=='arrived';i++)m.advance(.1);
 assert.equal(u.combatRetreat.status,'arrived');assert.equal(u.combatRetreat.phase,'home');
 assert(Math.hypot(u.x-initial.x,u.y-initial.y)>30,'The car actually drives home');
 assert(Math.hypot(u.x,u.y-256)<100);
});
check('a stale hit older than ten seconds does not prevent an explicit policy change',()=>{
 const m=fixture(),u=damaged(m);u.lastHostileHit={id:'expired-enemy',x:0,y:-100,time:-120,range:100};
 m.setCombatPolicy([u.id],{retreat:'light'});m.advance(.1);
 assert(u.combatRetreat&&u.path.length,'Existing damage must work after the threat timer expires');
});
check('nine selected cars: only the three damaged cars retreat',()=>{
 const m=fixture(),cars=Array.from({length:9},(_,i)=>[0,4,8].includes(i)?damaged(m,(i%3-1)*80,-Math.floor(i/3)*64)
  :m.addUnit('bukhanka','rai',{x:(i%3-1)*80,y:-Math.floor(i/3)*64},{heading:0}));
 m.setCombatPolicy(cars.map(u=>u.id),{retreat:'light'});m.advance(.1);
 assert.deepEqual(cars.map(u=>!!u.combatRetreat),cars.map((_,i)=>[0,4,8].includes(i)));
 assert(cars.every((u,i)=>[0,4,8].includes(i)?u.path.length>0:!u.task&&!u.path.length));
});
check('saved enabled policy applies to existing damage after loading',()=>{
 const m=fixture(),u=damaged(m);m.setCombatPolicy([u.id],{retreat:'light'});
 const copy=fixture();copy.load(m.save());copy.advance(.1);
 const restored=copy.entity(u.id);assert.equal(restored.combatPolicy.retreat,'light');
 assert(restored.combatRetreat&&restored.path.length,'Saved existing damage needs no new enemy hit');
});
check('Stop overrides auto-retreat; explicitly selecting the policy again reenables it',()=>{
 const m=fixture(),u=damaged(m);m.setCombatPolicy([u.id],{retreat:'light'});m.stop([u.id]);m.advance(.1);
 assert(!u.combatRetreat&&!u.path.length,'Stop remains authoritative');
 m.setCombatPolicy([u.id],{retreat:'light'});m.advance(.1);
 assert(u.combatRetreat&&u.path.length,'Explicit policy selection cancels the Stop suppression');
});
check('healthy, heavy-only and never policies do not evacuate light damage',()=>{
 const m=fixture(),healthy=m.addUnit('bukhanka','rai',{x:-100,y:0}),heavy=damaged(m),never=damaged(m,100,0);
 m.setCombatPolicy([healthy.id],{retreat:'light'});m.setCombatPolicy([heavy.id],{retreat:'heavy'});m.advance(.1);
 assert([healthy,heavy,never].every(u=>!u.combatRetreat&&!u.path.length));
});
check('an enabled damage policy supersedes an unfinished attack command',()=>{
 const m=fixture(),u=damaged(m);m.submitOrder([u.id],'attack-move',{x:500,y:0});
 assert(u.pendingOrder);m.setCombatPolicy([u.id],{retreat:'light'});m.advance(.1);
 assert(!u.pendingOrder&&u.combatRetreat?.phase==='home');
 assert.equal(u.combatRetreat.threat,null,'No enemy is fabricated to enable retreat');
});
check('thirty damaged vehicles reserve different reachable home slots',()=>{
 const m=fixture(),cars=Array.from({length:30},(_,i)=>damaged(m,(i%6-2.5)*80,-180-Math.floor(i/6)*64));
 const healthy=m.addUnit('bukhanka','rai',{x:350,y:-180},{heading:0});
 m.order([healthy.id],'move',{x:350,y:300});
 m.setCombatPolicy([...cars,healthy].map(u=>u.id),{retreat:'light'});m.advance(.1);
 assert(cars.every(u=>u.combatRetreat?.phase==='home'&&u.path.length));
 for(let i=0;i<cars.length;i++)for(let j=0;j<i;j++)assert(Math.hypot(
  cars[i].combatRetreat.destination.x-cars[j].combatRetreat.destination.x,
  cars[i].combatRetreat.destination.y-cars[j].combatRetreat.destination.y)>config.worldScale*5.3);
 const before=healthy.y;for(let i=0;i<30;i++)m.advance(.1);
 assert(!healthy.combatRetreat&&healthy.y>before+20,'Healthy traffic remains independent');
 if(process.argv.includes('--complete')){
  for(let i=0;i<1200&&!cars.every(u=>u.combatRetreat.status==='arrived');i++)m.advance(.1);
  const summary={seconds:m.state.time,arrived:cars.filter(u=>u.combatRetreat.status==='arrived').length,
   hp:cars.map(u=>u.hp),remaining:cars.filter(u=>u.combatRetreat.status!=='arrived').map(u=>({id:u.id,x:u.x,y:u.y,retreat:u.combatRetreat,task:u.task,path:u.path,watch:u.driveWatch}))};
  fs.writeFileSync('campaign/reports/retreat-thirty-complete.json',JSON.stringify(summary,null,2));
  assert.equal(summary.arrived,cars.length,JSON.stringify(summary));
  assert(cars.every(u=>u.hp===u.maxHp*.7),'Auto-retreat must not add friendly collision damage');
 }
});
check('blocked retreat retries on changed conditions without a timer or repeated searches',()=>{
 const m=fixture(),u=damaged(m),inBounds=m.inBounds.bind(m);let checks=0;
 m.inBounds=()=>{checks++;return false;};m.setCombatPolicy([u.id],{retreat:'light'});m.advance(.1);
 assert.equal(u.combatRetreat.status,'blocked');const before=checks;
 for(let i=0;i<5;i++)m.advance(.1);
 assert.equal(checks-before,5,'Only the cheap condition signature is checked while unchanged');
 m.inBounds=inBounds;m.advance(.1);
 assert(u.path.length&&u.combatRetreat.status==='moving','The next tick sees a now-available route');
});
check('explicit Retreat returns thirty healthy cars without changing their standing policy',()=>{
 const m=fixture(),cars=Array.from({length:30},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%6-2.5)*80,y:-180-Math.floor(i/6)*64},{heading:0}));
 const policies=cars.map(u=>JSON.stringify(u.combatPolicy));
 assert.equal(m.submitOrder(cars.map(u=>u.id),'retreat').assigned,30);
 for(let i=0;i<1200&&!cars.every(u=>u.combatRetreat.status==='arrived');i++)m.advance(.1);
 assert(cars.every(u=>u.combatRetreat.forced&&u.combatRetreat.status==='arrived'));
 assert(cars.every((u,i)=>JSON.stringify(u.combatPolicy)===policies[i]&&u.hp===u.maxHp));
 const copy=fixture();copy.load(m.save());copy.advance(.1);
 assert(copy.entity(cars[0].id).combatRetreat.forced);
 m.stop([cars[0].id]);m.advance(.1);assert(!cars[0].combatRetreat);
});
const report={passed:results.filter(r=>r.passed).length,total:results.length,results};
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/retreat-existing-damage.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!process.argv.includes('--diagnose'))assert.equal(report.passed,report.total,'Existing damage must trigger the selected persistent retreat policy');
