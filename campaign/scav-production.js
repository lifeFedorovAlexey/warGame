import {campBaseLayout} from './scav-base-layout.js';
import {vehicleClearance} from './vehicle-motion.js';
export const SCAV_PRODUCTION={seconds:30,vehicles:{size:3,cap:9},infantry:{size:4,cap:12}};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const vehicles={
 'nw-pocket':['scav-zaporozhets','raider','scav-zaporozhets'],
 'nw-west':['raider','scav-zaporozhets','raider'],
 'nw-east':['scav-zaporozhets','scav-firetruck','raider'],
 'west-south':['raider','scav-bus','scav-firetruck'],
};
const roster=(camp,type)=>type==='vehicles'?vehicles[camp.id]:['scav-rifleman','scav-rifleman','scav-grenadier'];
function free(mission,pose){
 return mission.vehicleMotionClear(pose,pose,pose)&&!mission.state.units.some(u=>u.hp>0&&u.id!==pose.id&&vehicleClearance(pose,u,mission.config.worldScale,mission.field)<1);
}
function rallyPoints(layout,type,index,building){
 if(type==='infantry'){
  const angle=building.rotation??0,f={x:Math.sin(angle),y:-Math.cos(angle)},side=(index-1.5)*9;
  return [40,51,62].map(depth=>({x:building.x+f.x*depth-f.y*side,y:building.y+f.y*depth+f.x*side}));
 }
 const {normal:n,gate}=layout.departure,depth=45+index*36;
 // Stage on a shoulder beyond the gate, leaving the garage apron and the
 // middle of the entrance empty for the next vehicle and the infantry.
 return [34,-34,48,-48,62,-62].map(side=>({x:gate.x+n.x*depth-n.y*side,y:gate.y+n.y*depth+n.x*side}));
}
function* produce(mission,building,camp){
 const production=building.scavProduction,layout=campBaseLayout(camp),scale=mission.config.worldScale;
 const types=roster(camp,production.type),kind=types[production.count%types.length];
 const rotation=building.rotation??0,forward={x:Math.sin(rotation),y:-Math.cos(rotation)},heading=rotation+Math.PI;
 const exit=building.kind==='camp-core'?8.6:5.7;
 for(const along of [0,1.5,3])for(const side of [0,-1.2,1.2]){
  const pose={kind,owner:'scavs',heading,x:building.x+(forward.x*(exit+along)-forward.y*side)*scale,y:building.y+(forward.y*(exit+along)+forward.x*side)*scale};
  if(!free(mission,pose))continue;
  for(const target of rallyPoints(layout,production.type,production.waiting.length,building)){
   if(!free(mission,{...pose,...target}))continue;
   const path=yield* mission.vehiclePathSteps(pose,target,{maxGoalDistance:4});
   if(!path?.length)continue;
   if(building.hp<=0||!free(mission,pose))return;
   const destination=path.at(-1);
   const unit=mission.addUnit(kind,'scavs',pose,{heading,path,campId:camp.id,reinforcement:true,producerId:building.id,scavAssembly:building.id,guard:{...layout.gate},task:{type:'move',...destination},routeOrder:{revision:2,request:{...destination},destination:{...destination}}});
   production.waiting.push(unit.id);production.count++;production.nextAt=mission.state.time+SCAV_PRODUCTION.seconds;
   mission.emit('scav-produced',{camp:camp.id,building:building.id,unit:unit.id,kind});return;
  }
  yield;
 }
 // An occupied doorway holds one finished unit; it never spawns through another.
 production.retryAt=mission.state.time+.25;
}
function* dispatch(mission,building,camp){
 const production=building.scavProduction,units=production.waiting.map(id=>mission.entity(id)).filter(Boolean);
 const target=mission.field.gridToWorld(mission.config.startGrid),paths=[];
 // Shared navigator caches the common long route; the footprint-safe connectors
 // and gate are checked for each member. Planning yields within the frame budget.
 for(const unit of units){
  const last=yield* mission.vehiclePathSteps(unit,target,{maxGoalDistance:80});
  if(!last?.length){production.retryAt=mission.state.time+.25;return;}
  paths.push(last);yield;
 }
 if(building.hp<=0)return;
 const group=mission.id('scav-wave');
 units.forEach((unit,index)=>{if(unit.hp<=0)return;unit.path=paths[index];unit.task={type:'move',...target};unit.raid=true;unit.scavWave=group;delete unit.scavAssembly;delete unit.scavHome;delete unit.scavResumeTask;delete unit.routeOrder;});
 production.waiting=[];production.waves=(production.waves??0)+1;
 mission.emit('scav-sortie',{camp:camp.id,building:building.id,group,count:units.length,productionType:production.type});
}
export function updateScavProduction(mission){
 if(mission.state.openingScene&&!mission.state.openingScene.handedOver)return;
 const now=mission.state.time,deadline=performance.now()+1.5,baseNav=mission.nav;
 const step=job=>{
  // A suspended search must own its heap, parents and temporary occupancy.
  // Unit movement continues using the main navigator between these slices.
  mission.nav=job.nav;job.nav.workDeadline=deadline;
  try{return job.steps.next();}finally{mission.nav=baseNav;}
 };
 try{
  if(mission.scavJob){
   if(!mission.entity(mission.scavJob.id)||mission.scavJob.revision!==baseNav.topologyRevision)mission.scavJob=null;
   else{while(performance.now()<deadline){if(step(mission.scavJob).done){mission.scavJob=null;break;}}if(mission.scavJob)return;}
  }
  const producers=mission.state.buildings.filter(b=>b.scavProduction&&b.hp>0),start=(mission.scavProducerCursor??0)%Math.max(1,producers.length);
  for(let index=0;index<producers.length;index++){
   const building=producers[(start+index)%producers.length];
   const p=building.scavProduction;if(!p||building.hp<=0)continue;
   const camp=mission.state.camps.find(c=>c.id===building.campId);
   if(!camp||camp.cleared||!mission.inBounds(camp.x,camp.y))continue;
   p.nextAt??=now+SCAV_PRODUCTION.seconds;
   p.waiting=p.waiting.filter(id=>mission.entity(id)?.scavAssembly===building.id);
   if(p.retryAt>now)continue;
   const limits=SCAV_PRODUCTION[p.type];
   let steps;
   if(p.waiting.length>=limits.size){
    const members=p.waiting.map(id=>mission.entity(id)),centre=members.reduce((c,u)=>({x:c.x+u.x/members.length,y:c.y+u.y/members.length}),{x:0,y:0});
    // A group is assembled when its members are together, not when every
    // wheel reaches an exact parking point. This also releases the front cars
    // if the last member is approaching behind them on a narrow shoulder.
    if(members.some(u=>u.scavContact||distance(u,centre)>(p.type==='vehicles'?60:28)))continue;
    steps=dispatch(mission,building,camp);
   }else if(now>=p.nextAt&&mission.state.units.filter(u=>u.hp>0&&u.producerId===building.id).length<limits.cap){
    steps=produce(mission,building,camp);
   }
   if(!steps)continue;
   mission.scavProducerCursor=(start+index+1)%producers.length;
   mission.scavJob={id:building.id,steps,nav:baseNav.createSearchContext(),revision:baseNav.topologyRevision};
   while(performance.now()<deadline){if(step(mission.scavJob).done){mission.scavJob=null;break;}}
   if(mission.scavJob||performance.now()>=deadline)break;
  }
 }finally{mission.nav=baseNav;}
}
