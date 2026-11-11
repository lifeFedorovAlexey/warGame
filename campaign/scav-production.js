import {campBaseLayout} from './scav-base-layout.js';
import {vehicleClearance} from './vehicle-motion.js';
import {M02} from './mission02-config.js';
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
 if(mission.state.m02)return; // m02 production is resumed inside the fixed logical tick.
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
   // The old southern boundary implicitly kept the chief's production asleep.
   // Its original northern site is now in bounds from the start; preserve the
   // campaign progression, while still responding to an early player assault.
   if(camp.layoutVersion===3&&camp.requiresCamps&&!camp.productionActivated){
    const ready=mission.state.camps.filter(c=>c!==camp&&c.cleared).length>=camp.requiresCamps;
    const contacted=mission.state.units.some(u=>u.owner==='rai'&&u.hp>0&&distance(u,camp.gate)<300);
    if(!ready&&!contacted)continue;
    camp.productionActivated=true;
   }
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

// Campaign producers share the player's checked factory exit, swept hulls,
// route planner and move executor. Only enemy funding and batch policy differ.
export function* updateCampaignProductionSteps(mission){
 const s=mission.state,m=s.m02,now=s.time;
 if(now+1e-7<(m.nextProductionCheckAt??0))return;
 m.nextProductionCheckAt=now+.5;
 const live=new Map(s.units.filter(u=>u.hp>0).map(u=>[u.id,u]));
 m.groups=m.groups.filter(g=>g.units.some(id=>live.has(id)));
 let population=[...live.values()].filter(u=>u.m02Produced).length;
 for(const [id,base] of Object.entries(m.bases)){
  const p=base.production,cfg=M02.factories[id],building=mission.entity(base.factoryId);
  if(!p||!building||!p.active||p.stopped||now<(p.retryAt??0))continue;
  p.waiting=p.waiting.filter(id=>live.has(id));
  const patrol=!!cfg.patrolSize&&!p.alarmed,size=patrol?cfg.patrolSize:cfg.size;
  if(p.waiting.length>=size){
   if(!patrol&&m.groups.filter(g=>g.type==='raid').length>=M02.maxRaids)continue;
   const members=p.waiting.map(id=>live.get(id));
   if(members.some(u=>distance(u,u.assemblyPoint)>30||u.scavContact))continue;
   const target=patrol?mission.field.gridToWorld([39.5,94]):mission.field.gridToWorld(mission.config.startGrid),paths=[];
   for(const [i,unit] of members.entries()){
    const goal={x:target.x+(i%3-1)*32,y:target.y+Math.floor(i/3)*32};
    paths.push(yield* mission.vehiclePathSteps(unit,goal,{maxGoalDistance:48}));
   }
   if(paths.some(path=>!path?.length)){p.retryAt=now+2;continue;}
   const group={id:'m02.group.'+id+'.'+p.waves++,type:patrol?'patrol':'raid',units:[...p.waiting],target};m.groups.push(group);
   members.forEach((u,i)=>{u.path=paths[i];u.task={type:'move',...paths[i].at(-1)};u.raid=!patrol;u.guard=patrol?{...target}:undefined;u.scavWave=group.id;delete u.scavAssembly;delete u.routeOrder;delete u.scavResumeTask;});
   p.waiting=[];mission.emit('scav-sortie',{building:building.id,group:group.id,count:members.length});
  }
  const local=[...live.values()].filter(u=>u.producerId===building.id).length;
  if(now+1e-7<p.nextAt||population>=M02.globalCap||local>=cfg.cap||p.waiting.length>=size)continue;
  const item=building.queue[0]??={kind:cfg.roster[p.count%cfg.roster.length],progress:1,cost:0};
  const slot=base.rally[p.waiting.length];building.rally={...slot};
  const count=s.units.length;
  if(yield* mission.spawnProducedVehicleSteps(building,item,mission.buildingSpec(building))){
   const unit=s.units[count];unit.producerId=building.id;unit.m02Produced=true;unit.m02Base=id;unit.scavAssembly=building.id;unit.assemblyPoint={...slot};unit.guard={...slot};
   p.waiting.push(unit.id);p.count++;p.nextAt=now+cfg.seconds;population++;live.set(unit.id,unit);
   if(mission.visibleAt(building.x,building.y)||mission.visibleAt(unit.x,unit.y))base.productionObserved=true;
  }else p.retryAt=now+.5;
 }
}
