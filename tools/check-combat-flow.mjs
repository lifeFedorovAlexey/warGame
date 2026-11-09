import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
function fixture(){const m=new Mission(config,field);m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.bounds=[0,0,127,127];m.state.pendingCinematics=[];m.updateMission=()=>{};m.rebuildNavigation();m.visible.fill(1);m.explored.fill(1);return m;}
const results=[];
{
 const m=fixture(),unit=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:Math.PI});
 const parked=m.addUnit('bukhanka','rai',{x:0,y:24});
 unit.combatGroup=parked.combatGroup='parking';unit.task={type:'attack-move',x:0,y:24};unit.path=[{x:0,y:24}];
 unit.combatParking={anchor:{x:0,y:24},goal:{x:0,y:24},best:24,progressAt:-8,retryAt:0,failed:[]};
 m.advance(.1);
 assert(unit.detour?.arrival&&unit.task,'A blocked slot must produce a physical manoeuvre, not instant completion');
 const end={...unit.combatParking.goal};
 assert(Math.hypot(end.x,end.y)>=config.worldScale*2.5,'The new endpoint requires real movement');
 const copy=fixture();copy.load(m.save());
 // Production load restores campaign sector bounds; this synthetic flat
 // fixture intentionally uses the whole map, including the origin.
 copy.state.bounds=m.state.bounds.slice();copy.rebuildNavigation();
 for(let i=0;i<100&&unit.task;i++)m.advance(.1);
 const saved=copy.entity(unit.id);for(let i=0;i<100&&saved.task;i++)copy.advance(.1);
 assert(!unit.task&&!unit.detour&&Math.hypot(unit.x-end.x,unit.y-end.y)<.01,'Drive the whole checked manoeuvre before finishing');
 assert(!saved.task&&Math.hypot(saved.x-unit.x,saved.y-unit.y)<.01,'Saving during the manoeuvre preserves its endpoint and motion');
 assert(vehicleClearance(unit,parked,config.worldScale,field)>=0,'Keep the occupied slot solid');
}
{
 const m=fixture(),unit=m.addUnit('bukhanka','rai',{x:0,y:0}),enemy=m.addUnit('raider','scavs',{x:0,y:70});
 unit.task={type:'attack-move',x:0,y:370};unit.combatGroup='waiting';unit.combatResume={group:'waiting',retryAt:1};
 m.updateUnit(unit,.1);assert(enemy.hp<enemy.maxHp,'Waiting for a parking route must not disable fire');
 const hp=enemy.hp;unit.cooldown=0;m.setCombatPolicy([unit.id],{response:'ignore'});m.updateUnit(unit,.1);
 assert.equal(enemy.hp,hp,'Waiting for a route still obeys hold-fire policy');
}
{
 const create=()=>{
  const m=fixture(),units=Array.from({length:9},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%3-1)*28,y:-Math.floor(i/3)*30},{heading:Math.PI}));
  m.addStructure('generator','scavs',{x:0,y:190},{hp:100000,completed:true,progress:1});m.rebuildNavigation();
  m.order(units.map(u=>u.id),'attack-move',{x:0,y:370});return m;
 };
 const full=create(),sliced=create();full.advance(.1);assert.equal(full.pendingTick,null,'Unlimited advance finishes all yielded work');
 sliced.advance(.1,{budgetMs:0});assert(sliced.pendingTick,'Small groups obey the frame budget too');
 const saved=sliced.save();assert.equal(sliced.pendingTick,null,'Save completely flushes a suspended deployment');
 assert.deepEqual(JSON.parse(saved).state,JSON.parse(full.save()).state,'Slicing preserves the same battle state');
}
for(const mode of ['dense','side-contact','rear-contact','near-contact','obstacle']){
 const m=fixture(),count=9,units=Array.from({length:count},(_,i)=>m.addUnit('bukhanka','rai',{x:(i%3-1)*28,y:-Math.floor(i/3)*30},{heading:mode==='rear-contact'?Math.PI:0}));
 const target=m.addStructure('generator','scavs',mode==='side-contact'?{x:170,y:30}:mode==='near-contact'?{x:0,y:100}:{x:0,y:190},{hp:100000,maxHp:100000,completed:true,progress:1});m.rebuildNavigation();
 if(mode==='obstacle'){m.addStructure('generator','rai',{x:65,y:40},{completed:true,progress:1});m.rebuildNavigation();}
 const goal={x:target.x,y:target.y+180};assert(m.order(units.map(u=>u.id),'attack-move',goal).ok);
 const collisions=[],collision=m.vehicleCollision.bind(m);m.vehicleCollision=(unit,speed,blockers)=>{collisions.push({time:m.state.time,id:unit.id,task:unit.task?.type,position:{x:unit.x,y:unit.y,heading:unit.heading},speed,blockers:[...blockers].map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,speed:u.driveSpeed,reversing:u.reversing,detour:u.detour}))});return collision(unit,speed,blockers);};
 const shotCounts=new Map(),lastShot=new Map(),timings=[],turns=Array(count).fill(0),history=units.map(()=>[]),loops=Array(count).fill(0);
 const march=units.map(()=>({distance:0,stops:0,turn:0,accepted:null}));let minimum=Infinity,frames=0,marching=false;
 const run=seconds=>{
  const until=m.state.time+seconds;
  while(m.state.time<until-1e-5||m.pendingTick){
   const headings=units.map(u=>u.heading),positions=units.map(u=>({x:u.x,y:u.y,speed:u.driveSpeed??0})),before=performance.now();
   m.advance(m.pendingTick?0:.1,{budgetMs:process.argv.includes('--budget')?2:Infinity});timings.push(performance.now()-before);frames++;
   for(const [i,u] of units.entries())turns[i]+=Math.abs(Math.atan2(Math.sin(u.heading-headings[i]),Math.cos(u.heading-headings[i])));
   if(marching)for(const [i,u] of units.entries()){
    const from=positions[i],entry=march[i];entry.distance+=Math.hypot(u.x-from.x,u.y-from.y);
    entry.turn+=Math.abs(Math.atan2(Math.sin(u.heading-headings[i]),Math.cos(u.heading-headings[i])));
    if(from.speed>1&&(u.driveSpeed??0)<.1)entry.stops++;
    if(!entry.accepted&&!u.combatResume&&u.task?.type==='attack-move')entry.accepted={x:u.task.x,y:u.task.y};
    if(!entry.completion&&!u.task&&u.combatParking)entry.completion={time:m.state.time,x:u.x,y:u.y,goal:{...u.combatParking.goal},distance:Math.hypot(u.x-u.combatParking.goal.x,u.y-u.combatParking.goal.y)};
   }
   if(!m.pendingTick)for(const [i,u] of units.entries()){
    const samples=history[i];samples.push({time:m.state.time,x:u.x,y:u.y,turn:turns[i]});
    while(samples.length>1&&m.state.time-samples[1].time>=8)samples.shift();
    const first=samples[0];
    if(m.state.time-first.time>=7.9&&u.path.length&&turns[i]-first.turn>Math.PI*1.7&&Math.hypot(u.x-first.x,u.y-first.y)<config.worldScale*3)loops[i]++;
   }
   for(const e of m.effects)if(e.type==='shot'&&units.some(u=>u.id===e.from)){shotCounts.set(e.from,(shotCounts.get(e.from)??0)+1);lastShot.set(e.from,m.state.time);}m.effects=[];
   for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)minimum=Math.min(minimum,vehicleClearance(units[i],units[j],config.worldScale,field));
   assert(frames<20000,'Simulation must make progress');
  }
 };
 run(30);
 const fight=units.map((u,i)=>({id:u.id,x:u.x,y:u.y,turns:turns[i]/(Math.PI*2),loops:loops[i],shots:shotCounts.get(u.id)??0,lastShot:lastShot.get(u.id),status:u.combatDeployment?.status,path:u.path.length,hp:u.hp}));
 m.damage(target,100001,units[0]);marching=true;run(30);
 while(units.some(u=>u.task)&&m.state.time<90-1e-6)run(Math.min(1,90-m.state.time));
 timings.sort((a,b)=>a-b);
 const result={mode,minimum,frames,cpuP99:timings[Math.floor(timings.length*.99)],cpuMax:timings.at(-1),fight,collisions,march:march.map((entry,i)=>({...entry,turns:entry.turn/(Math.PI*2),finalSlotDistance:entry.accepted?Math.hypot(units[i].x-entry.accepted.x,units[i].y-entry.accepted.y):null})),after:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,task:u.task,path:u.path,status:u.combatDeployment?.status,watch:u.driveWatch,detour:u.detour,traffic:u.traffic,hold:u.trafficHold,parking:u.combatParking}))};results.push(result);
 console.log(JSON.stringify(process.argv.includes('--verbose')?result:{mode,minimum,cpuP99:result.cpuP99,cpuMax:result.cpuMax,frames,simulationTime:m.state.time,firing:fight.filter(u=>u.shots>=10&&u.lastShot>27).length,largestTurn:Math.max(...fight.map(u=>u.turns)),arrived:units.filter(u=>!u.task).length,hp:units.map(u=>u.hp)}));
 if(!process.argv.includes('--diagnose')){
  assert(fight.every(u=>u.shots>=10&&u.lastShot>27),'Every machine must sustain fire, not only shoot once');
  assert(fight.every(u=>u.loops===0),'Do not circle back to the same spot without progress');
  assert(loops.every(value=>value===0),'Do not circle in place during the post-combat march either');
  assert(m.state.time<=90+1e-6,'The completion deadline is 90 seconds including the fight');
  assert(units.every(u=>!u.task&&!u.combatDeployment&&Math.hypot(u.x-goal.x,u.y-goal.y)<100),'Finish the march after destruction');
  assert(march.every(entry=>entry.completion&&entry.completion.distance<=config.worldScale*4),'Reach the latest committed parking slot when completing the order; later yielding is a separate manoeuvre');
  assert(units.every(u=>Math.hypot(u.combatParking.goal.x-u.combatParking.anchor.x,u.combatParking.goal.y-u.combatParking.anchor.y)<=config.worldScale*14),'Parking retries remain bounded by the original arrival area');
  assert(minimum>=0,'Never overlap hulls');assert(units.every(u=>u.hp===u.maxHp),'No collision damage from friendly manoeuvres');
 }
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/combat-flow'+(process.argv.includes('--budget')?'-budget':'')+(process.argv.includes('--diagnose')?'-diagnose':'')+'.json',JSON.stringify(results,null,2));
