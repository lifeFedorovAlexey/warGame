import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Mission} from '../campaign/mission.js';
import {roadDrivingLane,deferRoadMerge} from '../campaign/road-merge.js';
import {holdRetreatYield} from '../campaign/retreat-contact.js';
fs.mkdirSync('campaign/previews/playtest-WG-057',{recursive:true});
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32],
 roadNetwork:{paths:[{id:'road',width:30,points:[{x:0,y:-1900},{x:0,y:1900}]}]},roadBlendAt:x=>Math.max(0,Math.min(1,(15-Math.abs(x))/2.5))};
function fixture(){const m=new Mission(structuredClone(config),field);Object.assign(m.state,{units:[],buildings:[],camps:[],artifacts:[],raidReserve:[],bounds:[0,0,127,127],pendingCinematics:[]});m.addUnit('builder','rai',{x:-1800,y:-1800});m.rebuildNavigation();m.explored.fill(255);m.visible.fill(255);return m;}
const lane=(m,u)=>roadDrivingLane(m,u,u.path[0],m.config.worldScale),results=[];
{
 const m=fixture(),r=m.addUnit('bukhanka','rai',{x:24,y:55},{heading:Math.PI});r.path=[{x:0,y:-450}];r.task={type:'move',x:0,y:-450};r.combatRetreat={status:'moving',phase:'home'};r.trafficOnScreen=true;
 const first=lane(m,r);assert(first.x>15,'A free nearby left shoulder must beat crossing the road to the default right one');
 deferRoadMerge(m,r,{roadLane:first,trafficLimit:Infinity},m.config.worldScale);
 const attacker=m.addUnit('bukhanka','rai',{x:0,y:-15},{heading:0});attacker.task={type:'attack-move'};attacker.path=[{x:0,y:450}];attacker.trafficOnScreen=true;
 for(const x of [-5,0,5,-3,4]){attacker.x=x;m.unitIndex.rebuild(m.state.units);assert(lane(m,r).x>15,'Oncoming steering cannot flip the remembered shoulder');}
 assert(Math.abs(lane(m,attacker).x)<.001,'Attack traffic uses the centre');attacker.hp=0;assert(Math.abs(lane(m,attacker).x)<.001,'Centre preference does not disappear with the opponent');
 const obstacle=m.addUnit('bukhanka','rai',{x:first.x,y:5},{heading:0});obstacle.trafficOnScreen=true;m.unitIndex.rebuild(m.state.units);r.navigation={waitSeconds:2};
 assert(lane(m,r).x<-15,'After a real blockage choose the free opposite shoulder');
 results.push({case:'nearest free edge, persistent side, blocked-side alternative and attack centre',first,alternative:lane(m,r)});
}
{
 const m=fixture();m.addStructure('factory','rai',{x:0,y:-600},{completed:true,progress:1});m.addStructure('generator','rai',{x:200,y:-650},{completed:true,progress:1});
 const retreaters=[-28,28].map(x=>m.addUnit('bukhanka','rai',{x,y:140},{heading:Math.PI})),attacker=m.addUnit('bukhanka','rai',{x:0,y:-150},{heading:0});
 for(const r of retreaters){r.hp=64;r.trafficOnScreen=true;assert(m.retreat([r.id]).ok);}attacker.trafficOnScreen=true;
 assert(m.submitOrder([attacker.id],'attack-move',{x:0,y:500}).ok);m.rebuildNavigation();const rows=[];
 for(let i=0;i<160;i++){m.advance(.1);m.drainEffects();rows.push({time:m.state.time,units:[...retreaters,attacker].map(u=>({id:u.id,x:u.x,y:u.y,speed:u.driveSpeed,side:u.combatRetreat?.shoulderSide,reason:u.navigation?.reason,lane:u.path.length?lane(m,u):null,intent:m.trafficCoordinator.intents.get(u.id),path:u.path.slice(0,2)}))});}
 fs.writeFileSync('campaign/previews/playtest-WG-057/head-on.json',JSON.stringify(rows));
 assert(retreaters[0].x<-15&&retreaters[1].x>15,JSON.stringify(rows.at(-1)));
 assert(retreaters.every(u=>u.y<-80)&&attacker.y>100,JSON.stringify(rows.at(-1)));
 assert(rows.filter(r=>r.time>2&&r.units[0].y>-400).every(r=>r.units[0].x<-15&&r.units[1].x>15),'Retreaters remain on their separate shoulders while advancing');
 assert(attacker.hp===attacker.maxHp&&retreaters.every(u=>u.hp===64),'Separated streams must not trade contact damage');
 fs.writeFileSync('campaign/previews/playtest-WG-057/head-on.json',JSON.stringify(rows));results.push({case:'public two-sided retreat and central advance, 16 simulation seconds',last:rows.at(-1)});
}
{
 const m=fixture(),driver=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),other=m.addUnit('bukhanka','rai',{x:5,y:15});driver.combatRetreat={status:'moving'};driver.path=[{x:0,y:100}];
 other.retreatYield={driver:driver.id,driverRevision:driver.commandRevision,revision:other.commandRevision,until:m.state.time+3};other.driveSpeed=20;
 assert(holdRetreatYield(m,other)&&other.driveSpeed===0);const save=m.save();m.load(save);m.state.bounds=[0,0,127,127];
 const d=m.entity(driver.id),o=m.entity(other.id);assert(holdRetreatYield(m,o),'The brief yield survives load');
 d.y=45;assert(!holdRetreatYield(m,o)&&!o.retreatYield,'Once the retreat has passed the original driver resumes');
 results.push({case:'contact opens a short right-of-way until passage; saved and released'});
}
fs.writeFileSync('campaign/previews/playtest-WG-057/lane-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
