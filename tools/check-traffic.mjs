import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TerrainNavigator} from '../campaign/navigation.js';
import {Mission} from '../campaign/mission.js';
import {sweepAvoidsFootprint,vehicleClearance,vehicleEnvelope,vehicleGroundSafe,vehicleSweep} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

const roadY=38, width=34;
const field={extent:1024,half:512,renderCell:4,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),
 gridToWorld:([x,y])=>({x:x*32-512,y:512-y*32}),worldToGrid:(x,y)=>[(x+512)/32,(512-y)/32],
 roadNetwork:{paths:[{width,points:[{x:-450,y:roadY},{x:450,y:roadY}]}]},
 roadBlendAt:(x,y)=>Math.abs(x)<=450?Math.max(0,Math.min(1,(width/2-Math.abs(y-roadY))/2.5)):0};
const nav=new TerrainNavigator(field,{bounds:[0,0,32,32]});
const from={x:-200,y:0},to={x:200,y:0};
const long=nav.findPath(from,to),short=nav.findPath({x:-50,y:0},{x:50,y:0});
let prior=from,total=0;
for(const p of long){total+=nav.travelCost(prior,p);prior=p;}
assert(long.some(p=>p.y>=24));
assert(total<nav.travelCost(from,to)*.98);
assert.equal(short.length,1);
assert.equal(nav.roads.factor(0,roadY),1.34);
assert.equal(nav.roads.factor(0,0),1);

const json=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const alphaConfig=json('assets/campaign/alpha/mission01/gameplay.json');
const cfg={...alphaConfig,initialUnits:[],initialMapBounds:[0,0,32,32],finalMapBounds:[0,0,32,32]};
const scale=cfg.worldScale;
const leftPose={x:0,y:0,heading:-1.15},rightPose={x:0,y:0,heading:1.15};
const post={x:0,y:11,halfWidth:.3,halfDepth:.6};
assert(sweepAvoidsFootprint(vehicleSweep(leftPose,leftPose,scale,field),post));
assert(sweepAvoidsFootprint(vehicleSweep(rightPose,rightPose,scale,field),post));
assert(!sweepAvoidsFootprint(vehicleSweep(leftPose,rightPose,scale,field),post));
const slope={...field,heightAt:(x,y)=>.37*x+.28*y};
const tilted=vehicleEnvelope({x:0,y:0,heading:0},scale,slope);
assert(Math.abs(Math.tan(tilted.pitch)-.28)<1e-7&&Math.abs(Math.tan(tilted.roll)+.37)<1e-7);
assert(vehicleGroundSafe(tilted,.52));
const steepSide={...slope,heightAt:(x,y)=>.81*x+.28*y};
assert(!vehicleGroundSafe(vehicleEnvelope({x:0,y:0,heading:0},scale,steepSide),.52));
function session(terrain=field,config=cfg){
 const mission=new Mission(config,terrain);mission.state.units=[];mission.state.buildings=[];mission.rebuildNavigation();return mission;
}
function create(m,x,y,h,goal){
 const unit=m.addUnit('bukhanka','rai',{x,y},{heading:h});
 const order=m.order([unit.id],'move',goal);
 assert(order.ok);return unit;
}
function sample(m,units,secs,walls=[]){
 let gap=Infinity,peak=0,wallContacts=0;
 const history=[];
 for(let i=0;i<secs*10;i++){
  m.state.time+=.1;
  for(const u of units){
   const from={x:u.x,y:u.y,heading:u.heading,kind:u.kind};
   m.move(u,.1);peak=Math.max(peak,u.driveSpeed);
   if(walls.length&&(from.x!==u.x||from.y!==u.y)){
    const sweep=vehicleSweep(from,u,scale,m.field);
    wallContacts+=walls.filter(wall=>!sweepAvoidsFootprint(sweep,wall,0)).length;
   }
  }
  for(let j=0;j<units.length;j++)for(let k=0;k<j;k++)gap=Math.min(gap,vehicleClearance(units[j],units[k],scale,m.field));
  if(i%5===0)history.push(units.map(({x,y,driveSpeed})=>({x,y,driveSpeed})));
  if(units.every(u=>!u.path.length))break;
 }
 return {gap,peak,history,wallContacts,seconds:m.state.time,complete:units.filter(u=>!u.path.length).length};
}
const opposite=session();
const east=create(opposite,-150,roadY,-Math.PI/2,{x:150,y:roadY});
const west=create(opposite,150,roadY,Math.PI/2,{x:-150,y:roadY});
const result=sample(opposite,[east,west],45);
assert.equal(result.complete,2);
assert(result.gap>0);
const passing=result.history.find(([a,b])=>Math.abs(a.x-b.x)<8);
assert(passing[0].y<roadY-5&&passing[1].y>roadY+5);

function merge(offset){
 const m=session();
 const left=create(m,-180,roadY+8,-Math.PI/2,{x:185,y:roadY+3});
 const right=create(m,-180+offset,roadY-8,-Math.PI/2,{x:230,y:roadY-3});
 const limits=[left,right].map(u=>{
  const lane=m.nav.roads.rightLane(u,u.path[0],scale);
  assert(lane);
  return m.trafficSpeed(u,{x:1,y:0},lane,scale);
 });
 assert.equal(limits.filter(limit=>limit===0).length,1);
 if(offset)assert.equal(limits[offset>0?0:1],0);
 const out=sample(m,[left,right],60);
 assert.equal(out.complete,2);
 assert(out.gap>0);
 return {leader:limits[0]===0?'right':'left',first:out.history[1],gap:out.gap,complete:out.complete};
}
const rightAhead=merge(8),leftAhead=merge(-8),tied=merge(0),replay=merge(0);
assert.deepEqual(tied,replay);
const shoulderGroup=session();
const onApproach=Array.from({length:5},(_,i)=>shoulderGroup.addUnit('bukhanka','rai',
 {x:-155-i*27,y:roadY+(i%2?21:-21)},{heading:-Math.PI/2}));
assert.equal(shoulderGroup.order(onApproach.map(u=>u.id),'move',{x:160,y:roadY}).assigned,onApproach.length);
assert(onApproach.every(u=>shoulderGroup.nav.roads.coverage(u.path.at(-1).x,u.path.at(-1).y)>=.58));
assert.equal(sample(shoulderGroup,onApproach,60).complete,onApproach.length);
function shoulder(separation){
 const curved={...field,roadBlendAt:null,roadNetwork:{paths:[{id:'curve',width:28,points:[
  {x:-450,y:38},{x:-180,y:38},{x:-135,y:45},{x:-95,y:61},{x:-45,y:65},{x:450,y:65}]}]}};
 const m=session(curved);
 const a=m.addUnit('bukhanka','rai',{x:-168,y:40+separation/2},{heading:-Math.PI/2});
 const b=m.addUnit('bukhanka','rai',{x:-168,y:40-separation/2},{heading:-Math.PI/2});
 for(const [u,end] of [[a,{x:140,y:61}],[b,{x:100,y:59}]]){
  u.path=[{x:-100,y:59},{x:-45,y:59},end];u.task={type:'move',...end};
 }
 const initial=vehicleClearance(a,b,scale,curved);
 const replay=session(curved);
 replay.load(m.save());
 const out=sample(replay,[replay.entity(a.id),replay.entity(b.id)],70);
 const bothFree=out.history.findIndex(pair=>pair.every(u=>u.x>-123))*.5;
 return {initial,min:out.gap,complete:out.complete,bothFree};
}
const touching=shoulder(10.8),oldSave=shoulder(10);
assert.equal(touching.complete,2);
assert(touching.min>0);
assert.equal(oldSave.complete,2);
assert(oldSave.min>=oldSave.initial-.00001);

const roads=json('assets/maps/alpha/roads.json');
const source=createHeightfield(json('assets/maps/alpha/heightfield.json'));
shapeMesaRims(source);
const alpha=refineRoadHeightfield(source);
applyRoadGrades(alpha,roads);

const row=new Mission(alphaConfig,alpha);
for(const [kind,x,y] of [['generator',-1648,248],['derrick',-1696,368]]){
 row.addStructure(kind,'rai',{x,y},{completed:true,progress:1});
}
Object.assign(row.entity('u4'),{x:-1669.28,y:319.99,heading:1.57});
Object.assign(row.entity('u5'),{x:-1647.76,y:343.93,heading:1.29});
row.rebuildNavigation();
const first=row.entity('u1');
assert(row.order([first.id],'move',{x:-1532,y:275}).ok);
const parkedRow=sample(row,row.state.units.filter(u=>u.owner==='rai'),26);
assert(!first.path.length&&first.x>-1540);
assert(parkedRow.gap>0);

const bend=session(alpha,{...alphaConfig,initialUnits:[],initialMapBounds:alphaConfig.finalMapBounds});
const path=roads.paths.find(road=>road.id==='junction-1--junction-7-2').points;
const point=path[35],lo=path[31],hi=path[39],inside=path[47];
const dx=hi.x-lo.x,dy=hi.y-lo.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
const side=Math.sign(ux*(inside.y-point.y)-uy*(inside.x-point.x));
const pair=[9,19.8].map(offset=>bend.addUnit('bukhanka','rai',
 {x:point.x-uy*side*offset,y:point.y+ux*side*offset},{heading:Math.atan2(-ux,uy)}));
for(let i=0;i<pair.length;i++)assert(bend.order([pair[i].id],'move',path[80+i*12]).ok);
const initialBendGap=vehicleClearance(...pair,scale,alpha);
assert(initialBendGap<0);
const actualBend=sample(bend,pair,45);
assert.equal(actualBend.complete,2);
assert(actualBend.gap>=initialBendGap-.002);

const convoy=session(alpha,{...alphaConfig,initialUnits:[],initialMapBounds:alphaConfig.finalMapBounds});
const mesaRoad=roads.paths.find(road=>road.id==='nw-east--nw-west-13').points;
const vans=Array.from({length:7},(_,index)=>{
 const p=mesaRoad[234-index*9],next=mesaRoad[235-index*9];
 return convoy.addUnit('bukhanka','rai',p,{heading:Math.atan2(p.x-next.x,next.y-p.y)});
});
assert.equal(convoy.order(vans.map(u=>u.id),'move',mesaRoad[330]).assigned,vans.length);
assert(vans.every(u=>convoy.nav.roads.coverage(u.path.at(-1).x,u.path.at(-1).y)>=.58),'Shared road click keeps group parking on asphalt');
const roadConvoy=sample(convoy,vans,75);
assert.equal(roadConvoy.complete,vans.length);
assert(roadConvoy.gap>0);
assert(roadConvoy.history.every(frame=>frame.every(p=>convoy.nav.roads.coverage(p.x,p.y)>=.4)),
 'Convoy follows the asphalt around the mesa');

function funnel(opening, count){
 const m=session();
 const walls=[-1,1].map(side=>m.addStructure('factory','rai',
  {x:0,y:side*(512+opening/2)/2},{halfWidth:56,halfDepth:(512-opening/2)/2}));
 const fleet=Array.from({length:count},(_,index)=>m.addUnit('bukhanka','rai',
  {x:-105-Math.floor(index/3)*24,y:(index%3-1)*21},{heading:-Math.PI/2}));
 m.rebuildNavigation();
 assert.equal(m.order(fleet.map(u=>u.id),'move',{x:180,y:0}).assigned,count);
 const out=sample(m,fleet,150,walls);
 assert.equal(out.complete,count);
 assert.equal(out.wallContacts,0);
 assert(out.gap>0);
 assert(fleet.every(u=>u.x>85),'Arrivals keep the exit clear for following units');
 return {completed:out.complete,seconds:Math.round(out.seconds*10)/10,gap:out.gap};
}
const singleFile=funnel(24,12),wideFunnel=funnel(34,18);

console.log(JSON.stringify({
 tripCost:total,directCost:nav.travelCost(from,to),asphaltPeak:result.peak,
 opposite:{gap:result.gap,complete:result.complete},
 merge:{leftAhead:leftAhead.leader,rightAhead:rightAhead.leader,tied:tied.leader},touching,oldSave,
 alpha:{parkedRowGap:parkedRow.gap,bendGap:actualBend.gap,roadConvoy:{completed:roadConvoy.complete,gap:roadConvoy.gap}},
 singleFile,wideFunnel
},null,2));
