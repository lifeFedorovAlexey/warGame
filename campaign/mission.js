import {TerrainNavigator} from './navigation.js';
import {waterTower} from './threat-guidance.js';
import {driveStep,clearOfVehicles,vehicleClearance,planManeuver,maneuverStep,checkManeuver} from './vehicle-motion.js';
import {footprintSupport,vehicleEnvelope,vehicleSweep,vehicleGroundSafe} from './vehicle-collision.js';
import {passageStillOpen,preparePassageEgress} from './passage-egress.js';
import {vehicleRecipes,starterProjects,matchingRecipe,projectDesignation,designNameKey,projectAssemblyKey,latestVehicleProjects} from './vehicle-designs.js';
import {angleDelta} from './builder-kinematics.js';
import {workProjection,projectorHasSight} from './builder-optics.js';
import {combatContact} from './combat-contact.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const routeOrderRevision=1;
function halfFootprint(footprint,scale,rotation){
 const [w,d]=footprint.map(length=>length*scale/2);
 return Math.abs(Math.round(rotation/(Math.PI/2)))%2?[d,w]:[w,d];
}

// Authoritative game state has no renderer objects, audio clocks or DOM references.
export class Mission{
 constructor(config,field){
  this.config=config;this.field=field;this.nav=new TerrainNavigator(field,{bounds:config.initialMapBounds.slice()});this.accumulator=0;this.serial=1;this.randomState=19452;this.events=[];this.effects=[];
  this.state={version:1,mission:config.id,time:0,status:'running',energy:config.initialEnergy,energyRate:0,powered:false,oilLinked:0,units:[],buildings:[],camps:[],artifacts:[],research:{},artifactKeys:[],seenCinematics:[],pendingCinematics:['intro','briefing','arrival'],flags:{},statistics:{produced:0,buildingsCompleted:0,enemiesDestroyed:0},bounds:config.initialMapBounds.slice()};
  this.vehicleRecipes=vehicleRecipes(config);
  this.state.designs=starterProjects(this.vehicleRecipes);
  this.visible=new Uint8Array(128*128);this.explored=new Uint8Array(128*128);this.visionSources=[];this.fogTimer=1;this.fogRevision=0;
  const start=field.gridToWorld(config.startGrid);
  config.initialUnits.forEach((kind,index)=>this.addUnit(kind,'rai',{x:start.x+(index%3-1)*28,y:start.y-45-Math.floor(index/3)*30}));
  config.camps.forEach((data,index)=>{
   const point=field.gridToWorld(data.grid),gate=field.gridToWorld(data.gateGrid);
   const camp={...data,index,...point,gate,cleared:false,artifactSpawned:false};
   this.state.camps.push(camp);
   const rotation=(data.coreRotationDegrees??0)*Math.PI/180;
   this.addStructure('camp-core','scavs',point,{campId:data.id,hp:750*data.strength,halfWidth:28,halfDepth:22,rotation});
   for(const grid of data.towerGrids??[]){
    this.addStructure('mg-tower','scavs',field.gridToWorld(grid),{campId:data.id,hp:850*data.strength});
   }
   for(let i=0;i<data.units;i++)this.addUnit('raider','scavs',{x:gate.x+(i%3-1)*24,y:gate.y+30+Math.floor(i/3)*24},{campId:data.id,guard:{...gate}});
  });
  this.rebuildNavigation();this.updateFog();this.reserveRaid();
 }
 id(prefix){return prefix+this.serial++;}
 reserveRaid(unseen=false){
  const camp=this.state.camps[0],positions=[],target=this.field.gridToWorld(this.config.startGrid);
  this.state.raidReserve=[];
  const candidates=[];
  for(let row=-6;row<=6;row++)for(let col=-6;col<=6;col++){
   const x=camp.gate.x+col*20,y=camp.gate.y+row*20;
   if(Math.hypot(x-camp.x,y-camp.y)<54)continue;
   const point=this.nav.nearest(x,y,1);
   if(point&&(!unseen||!this.visibleAt(point.x,point.y)))candidates.push(point);
  }
  candidates.sort((a,b)=>distance(a,camp.gate)-distance(b,camp.gate));
  for(const point of candidates){
   if(positions.length===4)break;
   if(this.state.units.some(unit=>unit.hp>0&&distance(unit,point)<25))continue;
   if(!this.nav.findPath(point,target))continue;
   positions.push(point);
   const unit=this.addUnit('raider','scavs',point,{raidReserve:true,guard:{x:point.x,y:point.y}});
   this.state.raidReserve.push(unit.id);
  }
 }
 launchRaid(){
  const state=this.state,target=this.field.gridToWorld(this.config.startGrid);
  if(!state.raidReserve)this.reserveRaid(true);
  state.flags.raidStarted=true;
  state.flags.raidIds=state.raidReserve.slice();
  for(const [index,id] of state.flags.raidIds.entries()){
   const unit=this.entity(id);
   if(!unit)continue;
   unit.raidReserve=false;
   unit.raid=true;
   const goal={x:target.x+(index-1.5)*23,y:target.y+22};
   unit.path=this.vehiclePath(unit,goal)??this.nav.findPath(unit,target)??[];
   unit.task={type:'move',x:goal.x,y:goal.y};
  }
  this.emit('raid-start');
 }
 random(){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return this.randomState/4294967296;}
 emit(type,data={}){this.events.push({id:this.id('e'),type,time:this.state.time,...data});}
 drainEvents(){return this.events.splice(0);}
 drainEffects(){return this.effects.splice(0);}
 cinematic(id){if(!this.state.seenCinematics.includes(id)&&!this.state.pendingCinematics.includes(id)){this.state.pendingCinematics.push(id);this.emit('cinematic',{chapter:id});}}
 finishCinematic(id){const index=this.state.pendingCinematics.indexOf(id);if(index>=0)this.state.pendingCinematics.splice(index,1);if(!this.state.seenCinematics.includes(id))this.state.seenCinematics.push(id);}
 unitSpec(unit){return this.config.units[unit.kind];}
 buildingSpec(building){return this.config.buildings[building.kind]??{name:'Лагерь отбросов',seconds:1,hp:750,vision:180,power:0};}
 entity(id){return [...this.state.units,...this.state.buildings].find(item=>item.id===id&&item.hp>0);}
 addUnit(kind,owner,point,extra={}){const spec=this.config.units[kind],unit={id:this.id('u'),kind,owner,x:point.x,y:point.y,previousX:point.x,previousY:point.y,hp:spec.hp,maxHp:spec.hp,heading:0,path:[],task:null,cooldown:0,tool:0,foldTime:0,...extra};this.state.units.push(unit);return unit;}
 addStructure(kind,owner,point,extra={}){const spec=this.config.buildings[kind]??{},scale=this.config.worldScale,foot=spec.footprintMetres??[14,12],item={id:this.id('b'),kind,owner,x:point.x,y:point.y,rotation:0,hp:spec.hp??750,maxHp:spec.hp??750,halfWidth:foot[0]*scale/2,halfDepth:foot[1]*scale/2,progress:owner==='rai'?0:1,completed:owner!=='rai',queue:[],research:null,cooldown:0,...extra};item.maxHp=item.hp;this.state.buildings.push(item);return item;}
 rebuildNavigation(){this.nav.bounds=this.state.bounds.slice();this.nav.rebuild(this.state.buildings.filter(building=>!building.clearing));}
 fail(reason){return {ok:false,reason};}
 canSpend(cost){return this.state.energy+1e-6>=cost;}
 inBounds(x,y){const [gx,gy]=this.field.worldToGrid(x,y),b=this.state.bounds;return gx>=b[0]&&gx<=b[2]&&gy>=b[1]&&gy<=b[3];}
 exploredAt(x,y){const [gx,gy]=this.field.worldToGrid(x,y),col=Math.round(gx),row=Math.round(gy);return col>=0&&row>=0&&col<128&&row<128&&!!this.explored[row*128+col];}
 visibleAt(x,y){const [gx,gy]=this.field.worldToGrid(x,y),col=Math.round(gx),row=Math.round(gy);return col>=0&&row>=0&&col<128&&row<128&&!!this.visible[row*128+col];}
 placement(kind,x,y,rotation=0,{checkMoney=true}={}){
  const spec=this.config.buildings[kind];if(!spec)return this.fail('Неизвестное здание');if(spec.requires&&!this.state.research[spec.requires])return this.fail('Требуется исследование: '+this.config.research[spec.requires].name);if(checkMoney&&!this.canSpend(spec.cost))return this.fail('Недостаточно энергии');if(!this.inBounds(x,y)||!this.exploredAt(x,y))return this.fail('Район ещё не разведан');
  if(spec.requiresOil){const oil=this.config.oilFields.map(grid=>this.field.gridToWorld(grid)).find(p=>Math.hypot(p.x-x,p.y-y)<25);if(!oil)return this.fail('Нужна нефтяная точка');x=oil.x;y=oil.y;}
  else{x=Math.round(x/this.config.buildingGridMetres)*this.config.buildingGridMetres;y=Math.round(y/this.config.buildingGridMetres)*this.config.buildingGridMetres;}
  const [w,d]=halfFootprint(spec.footprintMetres,this.config.worldScale,rotation),heights=[];
  for(const dx of [-w,0,w])for(const dy of [-d,0,d]){if(!this.inBounds(x+dx,y+dy)||!this.exploredAt(x+dx,y+dy))return this.fail('Пятно застройки выходит за разведанный район');const g=this.field.gradientAt(x+dx,y+dy);if(Math.hypot(g.x,g.y)>this.config.maxBuildingGrade)return this.fail('Слишком крутой склон');heights.push(this.field.heightAt(x+dx,y+dy));}
  if(Math.max(...heights)-Math.min(...heights)>2.5)return this.fail('Нужна ровная площадка');
  if(!spec.requiresOil)for(const grid of this.config.oilFields){const oil=this.field.gridToWorld(grid);if(Math.abs(x-oil.x)<w+this.config.worldScale*5+5&&Math.abs(y-oil.y)<d+this.config.worldScale*5+5)return this.fail('Нефтяной участок зарезервирован для вышки');}
  for(const building of this.state.buildings)if(building.hp>0&&Math.abs(x-building.x)<w+building.halfWidth+8&&Math.abs(y-building.y)<d+building.halfDepth+8)return this.fail('Пересечение с постройкой');
  const exitBox=(bx,by,angle,source)=>{const local=source.exitAnchor,c=Math.cos(angle),s=Math.sin(angle),scale=this.config.worldScale,px=bx+(local[0]*c-local[1]*s)*scale,py=by+(local[0]*s+local[1]*c)*scale;return{x:px,y:py,halfWidth:Math.abs(c)*14+Math.abs(s)*24,halfDepth:Math.abs(s)*14+Math.abs(c)*24};};
  for(const building of this.state.buildings){if(building.hp<=0)continue;const otherSpec=this.buildingSpec(building);if(otherSpec.exitAnchor){const exit=exitBox(building.x,building.y,building.rotation,otherSpec);if(Math.abs(x-exit.x)<w+exit.halfWidth&&Math.abs(y-exit.y)<d+exit.halfDepth)return this.fail('Нельзя перекрывать выезд завода');}if(spec.exitAnchor){const exit=exitBox(x,y,rotation,spec);if(Math.abs(building.x-exit.x)<building.halfWidth+exit.halfWidth&&Math.abs(building.y-exit.y)<building.halfDepth+exit.halfDepth)return this.fail('Для выезда завода нет места');}}
  const blockers=this.siteUnits({kind,x,y,rotation,halfWidth:w,halfDepth:d});
  if(blockers.some(unit=>unit.owner!=='rai'))return this.fail('На площадке противник');
  const work=spec.workAnchor,c=Math.cos(rotation),s=Math.sin(rotation),wx=x+(work[0]*c-work[1]*s)*this.config.worldScale,wy=y+(work[0]*s+work[1]*c)*this.config.worldScale,[col,row]=this.nav.grid(wx,wy);let approach=false;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const p=this.nav.position(col+dx,row+dy);if(this.nav.allowed(col+dx,row+dy)&&Math.hypot(p.x-wx,p.y-wy)<=this.config.builderRangeMetres&&(Math.abs(p.x-x)>=w+this.nav.clearance||Math.abs(p.y-y)>=d+this.nav.clearance))approach=true;}
  if(!approach)return this.fail('Нет площадки для подъезда строителя');
  return {ok:true,x,y,rotation:Math.round(rotation/(Math.PI/2))*Math.PI/2,halfWidth:w,halfDepth:d,height:Math.max(...heights),blockers:blockers.map(unit=>unit.id)};
 }
 siteBounds(site){
  const margin=this.nav.clearance,work=this.workPoint(site),apron=this.config.builderRangeMetres+8;
  return {left:Math.min(site.x-site.halfWidth-margin,work.x-apron),right:Math.max(site.x+site.halfWidth+margin,work.x+apron),bottom:Math.min(site.y-site.halfDepth-margin,work.y-apron),top:Math.max(site.y+site.halfDepth+margin,work.y+apron)};
 }
 siteUnits(site){
  const {left,right,bottom,top}=this.siteBounds(site);
  const contains=point=>point.x>left&&point.x<right&&point.y>bottom&&point.y<top;
  return this.state.units.filter(unit=>unit.hp>0&&(contains(unit)||contains(this.nav.position(...this.nav.grid(unit.x,unit.y)))));
 }
 vehiclePath(unit,goal,{avoidMoving=false,avoidPoint=null,fallback=true,ignoreUnits=null,...options}={}){
  const occupied=this.nav.occupied,changed=[],radius=this.config.worldScale*(avoidMoving?3.1:2.18);
  for(const other of this.state.units){
   if(other===unit||ignoreUnits?.has(other)||other.hp<=0||other.owner!==unit.owner&&!this.visibleAt(other.x,other.y))continue;
   if(other.path.length&&(!avoidMoving||distance(unit,other)>56))continue;
   const [col,row]=this.nav.grid(other.x,other.y),r=Math.ceil(radius/this.nav.cell),size=this.nav.size;
   for(let y=Math.max(0,row-r);y<=Math.min(size-1,row+r);y++)for(let x=Math.max(0,col-r);x<=Math.min(size-1,col+r);x++){
    const i=y*size+x,p=this.nav.position(x,y);
    if(!occupied[i]&&distance(other,p)<radius&&distance(unit,p)>this.nav.cell*.78){occupied[i]=1;changed.push(i);}
   }
  }
  if(avoidPoint){
   const [col,row]=this.nav.grid(avoidPoint.x,avoidPoint.y),size=this.nav.size;
   for(let y=Math.max(0,row-1);y<=Math.min(size-1,row+1);y++)for(let x=Math.max(0,col-1);x<=Math.min(size-1,col+1);x++){
    const i=y*size+x,p=this.nav.position(x,y);
    if(!occupied[i]&&distance(p,unit)>this.nav.cell&&distance(p,goal)>this.nav.cell*2){occupied[i]=1;changed.push(i);}
   }
  }
  let path;
  try{path=this.nav.findPath(unit,goal,options);}
  finally{for(const i of changed)occupied[i]=0;}
  return path??(fallback&&changed.length?this.nav.findPath(unit,goal,options):null);
 }
 movePath(unit,goal,reserved=[],parkingRadius=0,roadOnly=false,parkingAllowed=()=>true){
  const spacing=this.config.worldScale*4.55;
  const escapeSteepStart=unit.owner==='rai'&&unit.path?.length===0;
  const occupied=point=>reserved.some(other=>distance(point,other)<spacing)
   ||this.state.units.some(other=>other!==unit&&other.hp>0&&!other.path.length
    &&(other.owner===unit.owner||this.visibleAt(other.x,other.y))&&distance(point,other)<spacing);
  const candidates=[goal];
  const searchRadius=Math.max(parkingRadius,occupied(goal)?spacing*2.35:0);
  for(let radius=spacing;radius<=searchRadius;radius+=spacing*.7){
   const sectors=Math.ceil(radius*Math.PI*2/(spacing*.85));
   for(let side=0;side<sectors;side++){
    const angle=side*Math.PI*2/sectors;
    candidates.push({x:goal.x+Math.cos(angle)*radius,y:goal.y+Math.sin(angle)*radius});
   }
  }
  for(const candidate of candidates){
   if(!parkingAllowed(candidate)||occupied(candidate)||roadOnly&&this.nav.roads.coverage(candidate.x,candidate.y)<.58)continue;
   const path=this.vehiclePath(unit,candidate,{maxGoalDistance:16,escapeSteepStart});
   const end=path?.at(-1);
   if(end&&parkingAllowed(end)&&!occupied(end)&&(!roadOnly||this.nav.roads.coverage(end.x,end.y)>=.58))return path;
  }
  return null;
 }
 siteExit(unit,site,occupied=[]){
  const {left,right,bottom,top}=this.siteBounds(site);
  const candidates=[];
  for(const n of [0,-16,16,-32,32]){
   for(const x of [left-10,right+10])candidates.push({x,y:clamp(unit.y+n,bottom-10,top+10)});
   for(const y of [bottom-10,top+10])candidates.push({x:clamp(unit.x+n,left-10,right+10),y});
  }
  const exitCost=point=>{
   const angle=Math.abs(angleDelta(Math.atan2(unit.x-point.x,point.y-unit.y),unit.heading));
   return distance(point,unit)+24*Math.min(angle,Math.PI-angle);
  };
  candidates.sort((a,b)=>exitCost(a)-exitCost(b));
  for(const point of candidates){
   const goal=this.nav.nearest(point.x,point.y,2);
   if(!goal||occupied.some(other=>distance(other,goal)<18))continue;
   if(unit.siteExit?.failed?.some(other=>distance(other,goal)<12))continue;
   if(goal.x>left-6&&goal.x<right+6&&goal.y>bottom-6&&goal.y<top+6)continue;
   if(this.state.units.some(other=>other!==unit&&other.hp>0&&distance(other,goal)<21))continue;
   const path=this.vehiclePath(unit,goal,{maxGoalDistance:.01});
   if(!path)continue;
   const obstacle=this.state.units.some(other=>{
    if(other===unit||other.hp<=0||other.task?.type==='clear-site')return false;
    const outside=other.x<=left||other.x>=right||other.y<=bottom||other.y>=top;
    if(!outside)return false;
    return path.some((end,index)=>{
     const start=path[index-1]??unit, dx=end.x-start.x,dy=end.y-start.y;
     const t=clamp(((other.x-start.x)*dx+(other.y-start.y)*dy)/Math.max(.01,dx*dx+dy*dy),0,1);
     return Math.hypot(other.x-start.x-dx*t,other.y-start.y-dy*t)<11;
    });
   });
   if(!obstacle)return{unit,goal,path};
  }
  return null;
 }
 evacuate(building,exit){
  const {unit,goal,path}=exit;
  const previous=unit.siteExit?.buildingId===building.id?unit.siteExit:null;
  unit.siteExit={buildingId:building.id,resume:previous?.resume??unit.task,failed:previous?.failed??[],origin:{x:unit.x,y:unit.y},elapsed:0};
  unit.task={type:'clear-site',targetId:building.id,x:goal.x,y:goal.y};
  unit.path=path;
 }
 releaseSite(building,assigned=[]){
  for(const unit of this.state.units){
   if(unit.siteExit?.buildingId!==building.id)continue;
   const resume=unit.siteExit.resume;
   delete unit.siteExit;
   if(assigned.includes(unit.id)||unit.task?.type!=='clear-site')continue;
   unit.task=null;unit.path=[];
   if(!resume||unit.hp<=0)continue;
   const target=resume.targetId?this.entity(resume.targetId):resume;
   const {left,right,bottom,top}=this.siteBounds(building);
   const inside=target&&target.x>left&&target.x<right&&target.y>bottom&&target.y<top;
   if(target&&!inside&&resume.type!=='clear-site')this.order([unit.id],resume.type,target);
  }
 }
 availableBuilders(building){
  const position=this.state.buildings.indexOf(building);
  const earlier=this.state.buildings.slice(0,position).filter(b=>b.hp>0&&(b.clearing||b.awaitingWorkers));
  return building.builderIds.filter(id=>{
   const unit=this.entity(id);
   if(!unit||earlier.some(b=>b.builderIds.includes(id)))return false;
   return !unit.task||unit.task.type==='move'||unit.task.type==='clear-site'&&unit.task.targetId===building.id;
  });
 }
 assignConstruction(building){
  const builders=this.availableBuilders(building);
  if(!builders.length){building.awaitingWorkers=true;return {ok:true,waiting:true};}
  const result=this.order(builders,'build',building);
  if(result.ok){
   building.awaitingWorkers=false;
   delete building.builderIds;
   this.emit('construction-start',{building:building.id});
  }
  return result;
 }
 updateConstructionSites(){
  for(const building of this.state.buildings){
   if(building.hp<=0)continue;
   if(!building.clearing){
    if(building.awaitingWorkers&&this.state.time-(building.lastAssignment??-2)>1){
     building.lastAssignment=this.state.time;
     const result=this.assignConstruction(building);
     if(!result.ok&&this.availableBuilders(building).length===building.builderIds.length){this.cancelBuilding(building.id);this.emit('construction-refused',{reason:result.reason});}
    }
    continue;
   }
   const blockers=this.siteUnits(building);
   if(blockers.length){
    const taken=[];
    for(const unit of blockers){
     if(unit.owner!=='rai')continue;
     if(unit.task?.type==='clear-site'&&unit.task.targetId===building.id&&unit.path.length){
      const exit=unit.siteExit;
      if(exit){
       exit.elapsed+=this.config.simulationStep;
       if(exit.elapsed>=3){
        if(distance(unit,exit.origin)<4){
         exit.failed.push({x:unit.task.x,y:unit.task.y});
         unit.path=[];
        }
        exit.origin={x:unit.x,y:unit.y};exit.elapsed=0;
       }
      }
      if(unit.path.length){taken.push(unit.task);continue;}
     }
     const exit=this.siteExit(unit,building,taken);
     if(exit){this.evacuate(building,exit);taken.push(exit.goal);}
     else if(unit.siteExit?.failed?.length)unit.siteExit.failed.shift();
    }
    continue;
   }
   building.clearing=false;
   this.rebuildNavigation();
   const result=this.assignConstruction(building);
   this.releaseSite(building);
   if(!result.ok){this.cancelBuilding(building.id);this.emit('construction-refused',{reason:result.reason});}
  }
 }
 workPoint(building,offset=0){if(this.config.units[building.kind])return{x:building.x+Math.sin(building.heading)*20+Math.cos(building.heading)*offset,y:building.y-Math.cos(building.heading)*20+Math.sin(building.heading)*offset};const spec=this.buildingSpec(building),local=spec.workAnchor??[0,-building.halfDepth/this.config.worldScale-4,0],c=Math.cos(building.rotation),s=Math.sin(building.rotation),scale=this.config.worldScale;return{x:building.x+(local[0]*c-local[1]*s)*scale+c*offset,y:building.y+(local[0]*s+local[1]*c)*scale+s*offset};}
 workPath(unit,target,offset=unit.task?.workOffset??0){
  const repair=!!this.config.units[target.kind],scale=this.config.worldScale;
  if(this.canWorkHere(unit,target))return [];
  const goal=this.workPoint(target,offset),[col,row]=this.nav.grid(goal.x,goal.y),candidates=[],seen=new Set();
  const reservations=this.state.units.filter(other=>other!==unit&&other.hp>0&&other.task?.targetId===target.id&&other.path.length&&['build','repair'].includes(other.task.type)).map(other=>({...other,...other.path.at(-1)}));
  const sample=(x,y)=>{
   const key=y*this.nav.size+x;
   if(seen.has(key)||!this.nav.allowed(x,y))return;
   seen.add(key);
   const p=this.nav.position(x,y),parked={...p,heading:Math.atan2(unit.x-p.x,p.y-unit.y)};
   if(!clearOfVehicles(unit,parked,this.state.units,scale,true)||!clearOfVehicles(unit,parked,reservations,scale,true))return;
   const at={...unit,...parked};
   const aim=this.projectorAim(at,target);
   if(!aim||!projectorHasSight(aim,at,target,reservations,this.field,scale))return;
   if(!repair&&!workProjection(at,{...target,progress:1},this.config,this.field))return;
   candidates.push(p);
  };
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)sample(col+dx,row+dy);
  if(repair){
   // The repair beam can reach around the nominal rear parking point.
   // Sample several rings, beginning on the approaching side.
   const approach=Math.atan2(unit.y-target.y,unit.x-target.x);
   for(const radius of [6,9,12,15,18].map(value=>value*scale)){
    for(let sector=0;sector<16;sector++){
     const angle=approach+sector*Math.PI/8;
     sample(...this.nav.grid(target.x+Math.cos(angle)*radius,target.y+Math.sin(angle)*radius));
    }
   }
  }else{
   const w=target.halfWidth+this.nav.clearance,d=target.halfDepth+this.nav.clearance;
   for(const gap of [6,14,24])for(const along of [0,-12,12,-24,24])for(const side of [-1,1]){
    sample(...this.nav.grid(target.x+side*(w+gap),target.y+along));
    sample(...this.nav.grid(target.x+along,target.y+side*(d+gap)));
   }
  }
  const cost=p=>distance(p,unit)+distance(p,goal)*(repair?.18:.31);
  candidates.sort((a,b)=>cost(a)-cost(b));
  for(const p of candidates.slice(0,24)){
   const path=this.vehiclePath(unit,p,{maxGoalDistance:.01});
   if(path)return path;
  }
  return null;
 }
 attackPath(unit,target,reserved=[]){
  const spec=this.unitSpec(unit);
  if(distance(unit,target)<=spec.range&&this.lineOfSight(unit,target))return[];
  const last=unit.task?.targetId===target.id&&unit.path.at(-1);
  if(unit.detour&&last&&distance(last,target)<=spec.range&&this.lineOfSight({...unit,...last},target))return unit.path;
  const angle=Math.atan2(unit.y-target.y,unit.x-target.x);
  for(const radius of [spec.range*.82,spec.range*.94,spec.range*.68]){
   for(const offset of [0,.28,-.28,.55,-.55,.9,-.9,1.4,-1.4,Math.PI]){
    const goal={x:target.x+Math.cos(angle+offset)*radius,y:target.y+Math.sin(angle+offset)*radius};
    if(!this.inBounds(goal.x,goal.y))continue;
    const path=this.vehiclePath(unit,goal,{maxGoalDistance:16}),end=path?.at(-1);
    if(!end||distance(end,target)>spec.range||!this.lineOfSight({...unit,...end},target))continue;
    if(reserved.some(point=>distance(end,point)<this.config.worldScale*4.55))continue;
    if(this.state.units.some(other=>other!==unit&&other.hp>0&&other.owner===unit.owner&&!other.path.length&&distance(end,other)<this.config.worldScale*4.55))continue;
    return path;
   }
  }
  return null;
 }
 order(ids,action,target){
  if(!['move','attack-move','attack','build','repair'].includes(action)||!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return this.fail('Недопустимый приказ');
  const travel=action==='move'||action==='attack-move',combat=action==='attack'||action==='attack-move';
  if(action==='attack'&&(target.owner==='rai'||!this.entity(target.id)||!this.visibleAt(target.x,target.y)))return this.fail('Цель не обнаружена');
  if(action==='build'&&target.clearing)return this.fail('Техника освобождает площадку');
  if(['build','repair'].includes(action)&&(target.owner!=='rai'||!this.entity(target.id)))return this.fail('Нужна своя техника или постройка');
  const units=this.state.units.filter(u=>ids.includes(u.id)&&u.owner==='rai'&&u.hp>0&&(!['build','repair'].includes(action)||this.unitSpec(u).role==='builder')&&(!combat||this.unitSpec(u).damage));if(!units.length)return this.fail('Не выбрана подходящая техника');const assigned=new Set();
  const repeat=new Map();
  for(const unit of units){
   const order=unit.routeOrder;
   if(travel&&order?.revision===routeOrderRevision&&(order.type??'move')===action&&distance(order.request,target)<3){
    if(unit.task?.type===action&&unit.path.length)repeat.set(unit.id,unit.path.at(-1));
    else if(!unit.task&&distance(unit,order.destination)<5)repeat.set(unit.id,unit);
   }
   const last=unit.task?.type==='attack'&&unit.task.targetId===target.id&&unit.path.at(-1);
   if(action==='attack'&&last&&distance(last,target)<=this.unitSpec(unit).range&&this.lineOfSight({...unit,...last},target))repeat.set(unit.id,last);
  }
  const reserved=[...repeat.values()];
  const groupCentre=units.reduce((centre,unit)=>({x:centre.x+unit.x/units.length,y:centre.y+unit.y/units.length}),{x:0,y:0});
  const roadCandidate=travel&&!target.id?this.nav.roads.formation(target,groupCentre,units.length,this.config.worldScale):null;
  const progress=new Map();
  if(roadCandidate)for(const unit of units){
   const position=this.nav.roads.formationProgress(unit,roadCandidate,this.config.worldScale);
   if(position!==null)progress.set(unit,position);
  }
  const roadFormation=progress.size>=Math.max(2,Math.ceil(units.length/2))?roadCandidate:null;
  const roadSlots=roadFormation?.slots;
  let nextRoadSlot=0;
  const passage=travel&&!roadFormation&&units.length>=3
   ?this.nav.passageBetween(groupCentre,target,this.config.worldScale):null;
  const egress=passage?preparePassageEgress(this,passage,units,target):null;
  if(egress?.blocked)return this.fail('Не удалось проложить безопасный выезд из прохода');
  const departure=egress?.end??passage?.exit;
  const convoy=egress?new Set(units):null;
  let preceding=null;
  const direction=Math.atan2(groupCentre.x-target.x,target.y-groupCentre.y);
  const forward={x:-Math.sin(direction),y:Math.cos(direction)},right={x:forward.y,y:-forward.x};
  const parkingClearance=egress?.parkingClearance??this.config.worldScale*3.6;
  const beyondPassage=point=>!passage||(point[passage.along]-departure[passage.along])*passage.direction>=parkingClearance;
  const tail=passage?Math.floor((units.length-1)/3)*24*Math.abs(forward[passage.along])+24*Math.abs(right[passage.along]):0;
  const passageShift=passage?Math.max(0,tail+parkingClearance-(target[passage.along]-departure[passage.along])*passage.direction):0;
  if(roadFormation){
   units.sort((a,b)=>(progress.get(b)??-Infinity)-(progress.get(a)??-Infinity)||distance(a,target)-distance(b,target));
  }else if(passage){
   units.sort((a,b)=>distance(a,passage.entrance)-distance(b,passage.entrance));
  }else if(travel){
   units.sort((a,b)=>(b.x-a.x)*forward.x+(b.y-a.y)*forward.y);
   for(let index=0;index<units.length;index+=3){
    const row=units.slice(index,index+3).sort((a,b)=>(a.x-b.x)*right.x+(a.y-b.y)*right.y);
    units.splice(index,row.length,...row);
   }
  }
  for(let index=0;index<units.length;index++){const unit=units[index],workOffset=(index-(units.length-1)/2)*18,goal=action==='build'||action==='repair'?this.workPoint(target,workOffset):target,columns=Math.min(3,units.length);
   if(repeat.has(unit.id)){assigned.add(unit.id);if(unit.passage)preceding=unit.id;continue;}
   const side=(index%columns-(columns-1)/2)*24, row=Math.floor(index/columns)*24;
   const formation={x:goal.x+right.x*side-forward.x*row,y:goal.y+right.y*side-forward.y*row};
   if(passage)formation[passage.along]+=passageShift*passage.direction;
   const parkingRadius=units.length>1?this.config.worldScale*11:0;
   let roadPath=null;
   while(roadSlots?.[nextRoadSlot]&&!roadPath){
    const slot=roadSlots[nextRoadSlot++];
    roadPath=this.movePath(unit,slot,reserved,0,true);
   }
   let viaPassage=null;
   if(passage){
    const approach=this.vehiclePath(unit,passage.entrance,{maxGoalDistance:10,ignoreUnits:convoy});
    const departureRadius=egress?this.config.worldScale*18:parkingRadius;
    const far=this.movePath(departure,formation,reserved,departureRadius,false,beyondPassage)
     ??this.movePath(departure,goal,reserved,departureRadius,false,beyondPassage);
    if(approach?.length&&far?.length&&distance(approach.at(-1),passage.entrance)<.1){
     viaPassage=[...approach,egress?.start??passage.exit,...far];
    }
   }
   if(egress&&!viaPassage)continue;
   const path=action==='attack'?this.attackPath(unit,target,reserved):['build','repair'].includes(action)?this.workPath(unit,target,workOffset):roadPath??viaPassage??this.movePath(unit,formation,reserved,parkingRadius)??this.movePath(unit,goal,reserved,parkingRadius);
   if(!path)continue;
   const destination=travel?path.at(-1)??goal:goal;
   if(travel||action==='attack')reserved.push(path.at(-1)??unit);
   const targetId=travel?null:target.id??null;
   if(unit.task?.type!==action||unit.task?.targetId!==targetId||travel&&(unit.routeOrder?.revision!==routeOrderRevision||distance(unit.task,destination)>5)){
    delete unit.detour;delete unit.traffic;delete unit.trafficHold;delete unit.driveWatch;delete unit.reverseDebt;delete unit.failedArcs;
   }
   delete unit.passage;
   if(viaPassage){
    unit.passage={preceding,along:passage.along,direction:passage.direction,admit:passage.admit};
    if(egress){
     unit.passage.egress={...egress,leader:preceding,phase:'approach'};
     unit.passage.parkingEdge=departure[passage.along]+passage.direction*parkingClearance;
    }
    preceding=unit.id;
   }
   if(travel){
    unit.routeOrder={revision:routeOrderRevision,request:{x:target.x,y:target.y},destination};
    if(action==='attack-move')unit.routeOrder.type=action;
   }
   else delete unit.routeOrder;
   unit.path=path;unit.task={type:action,targetId,x:destination.x,y:destination.y,workOffset};
   if(action==='build')unit.resumeConstructionId=target.id;
   assigned.add(unit.id);
  }
  if(action==='move'&&target.id&&this.state.artifacts.some(artifact=>artifact.id===target.id&&!artifact.collected)
   &&!units.some(unit=>distance(unit.path.at(-1)??unit,target)<22)){
   for(const unit of units.slice().sort((a,b)=>distance(a,target)-distance(b,target))){
    const original=unit.path.at(-1);
    const path=this.movePath(unit,target,reserved.filter(point=>point!==original));
    const end=path?.at(-1);
    if(!end||distance(end,target)>=22)continue;
    unit.path=path;unit.task={type:'move',x:end.x,y:end.y};
    unit.routeOrder={revision:routeOrderRevision,request:{x:target.x,y:target.y},destination:end};
    delete unit.passage;delete unit.detour;delete unit.traffic;delete unit.trafficHold;delete unit.driveWatch;delete unit.failedArcs;
    assigned.add(unit.id);
    break;
   }
  }
  if(action==='build'&&assigned.size){target.awaitingWorkers=false;delete target.builderIds;}
  return assigned.size?{ok:true,assigned:assigned.size,unassigned:units.filter(unit=>!assigned.has(unit.id)).map(unit=>unit.id)}:
   this.fail('Нет доступного пути или подходящего строителя');
 }
 build(ids,kind,x,y,rotation=0){
  const builders=this.state.units.filter(u=>ids.includes(u.id)&&u.owner==='rai'&&u.hp>0&&this.unitSpec(u).role==='builder');if(!builders.length)return this.fail('Выберите строителя');const place=this.placement(kind,x,y,rotation);if(!place.ok)return place;
  const exits=[];
  for(const id of place.blockers){
   const exit=this.siteExit(this.entity(id),{...place,kind},exits.map(item=>item.goal));
   if(!exit)return this.fail('Машинам некуда выехать с площадки');
   exits.push(exit);
  }
  const building=this.addStructure(kind,'rai',place,{rotation:place.rotation,halfWidth:place.halfWidth,halfDepth:place.halfDepth,groundHeight:place.height,cost:this.config.buildings[kind].cost});
  const builderIds=builders.map(unit=>unit.id);
  building.builderIds=builderIds;
  if(exits.length){
   building.clearing=true;building.builderIds=builderIds;
   this.state.energy-=building.cost;
   for(const exit of exits)this.evacuate(building,exit);
   return {ok:true,id:building.id,clearing:true};
  }
  this.rebuildNavigation();
  const result=this.assignConstruction(building);
  if(!result.ok){this.state.buildings.pop();this.rebuildNavigation();return result;}
  this.state.energy-=building.cost;return {ok:true,id:building.id,waiting:result.waiting};
 }
 stop(ids){for(const unit of this.state.units)if(ids.includes(unit.id)&&unit.owner==='rai'&&unit.hp>0){unit.task=null;unit.path=[];unit.builderWorking=false;delete unit.resumeConstructionId;}return{ok:true};}
 setRally(id,point){const factory=this.entity(id);if(factory?.kind!=='factory'||factory.owner!=='rai'||!factory.completed)return this.fail('Выберите готовый завод');if(!this.inBounds(point.x,point.y)||!this.exploredAt(point.x,point.y))return this.fail('Точка сбора должна быть разведана');factory.rally={x:point.x,y:point.y};return{ok:true};}
 cancelBuilding(id){const building=this.entity(id);if(!building||building.owner!=='rai'||building.completed)return this.fail('Отменить можно только незавершённую стройку');this.state.energy=Math.min(this.config.energyCapacity,this.state.energy+building.cost*(1-building.progress));building.hp=0;this.rebuildNavigation();this.releaseSite(building);for(const unit of this.state.units)if(unit.task?.targetId===id){unit.task=null;unit.path=[];unit.foldTime=2.6;}this.emit('construction-cancelled',{building:id});return {ok:true};}
 availableVehicleRecipes(){
  return this.vehicleRecipes.filter(({spec})=>!spec.requires||this.state.research[spec.requires]);
 }
 factoryProjects(){
  const recipes=this.availableVehicleRecipes();
  return this.state.designs.flatMap(project=>{
   const recipe=matchingRecipe(recipes,project.components);
   return recipe?[{...project,...recipe,components:project.components}]:[];
  });
 }
 saveDesign(name,components){
  const recipe=matchingRecipe(this.availableVehicleRecipes(),components);
  if(!recipe)return this.fail('Компоненты несовместимы или ещё не изучены');
  const custom=typeof name==='string'?name.trim().replace(/\s+/g,' '):'';
  const title=custom||projectDesignation(recipe.components,this.state.designs,this.config,this.state.research);
  if(title.length>36)return this.fail('Название должно содержать не больше 36 знаков');
  const key=projectAssemblyKey(recipe);
  const others=this.state.designs.filter(project=>projectAssemblyKey(project)!==key);
  if(others.some(project=>designNameKey(project.name)===designNameKey(title))){
   return this.fail('Проект с таким названием уже есть');
  }
  const id=this.id('p');
  this.state.designs=[...others,{id,name:title,components:[...recipe.components]}];
  return {ok:true,id};
 }
 produce(id,projectId){
  const factory=this.entity(id);
  if(!factory||factory.owner!=='rai'||factory.kind!=='factory'||!factory.completed)return this.fail('Нужен построенный завод');
  const project=this.factoryProjects().find(candidate=>candidate.id===projectId);
  if(!project)return this.fail('Сначала сохраните проект в конструкторе');
  const {kind,spec,components,name}=project;
  if(!this.canSpend(spec.cost))return this.fail('Недостаточно энергии');
  const deployed=this.state.units.filter(unit=>unit.owner==='rai'&&unit.hp>0).length;
  const queued=this.state.buildings.reduce((sum,building)=>sum+building.queue.length,0);
  if(deployed+queued>=48)return this.fail('Достигнут предел техники');
  this.state.energy-=spec.cost;
  factory.queue.push({kind,projectId,name,components:[...components],progress:0,cost:spec.cost});
  return {ok:true};
 }
 research(id,key){const lab=this.entity(id),spec=this.config.research[key];if(!lab||lab.kind!=='lab'||lab.owner!=='rai'||!lab.completed)return this.fail('Нужен исследовательский центр');if(!spec||!this.state.artifactKeys.includes(key))return this.fail('Сначала найдите артефакт');if(this.state.research[key]||this.state.buildings.some(b=>b.hp>0&&b.research?.key===key))return this.fail('Исследование уже выполнено или выполняется');if(lab.research)return this.fail('Лаборатория занята');if(!this.canSpend(spec.cost))return this.fail('Недостаточно энергии');this.state.energy-=spec.cost;lab.research={key,progress:0,cost:spec.cost};this.emit('research-start',{key});return {ok:true};}
 lineOfSight(from,to){const a=this.field.heightAt(from.x,from.y)+(from.kind==='mg-tower'?12:3.2)*this.config.worldScale,b=this.field.heightAt(to.x,to.y)+1.5*this.config.worldScale;for(let i=1;i<12;i++){const t=i/12;if(this.field.heightAt(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t)+.4>a+(b-a)*t)return false;}return true;}
 damage(target,amount,source){if(target.hp<=0)return;target.hp=Math.max(0,target.hp-amount);if(!target.hp){this.emit('destroyed',{target:target.id,owner:target.owner,kind:target.kind});if(target.owner==='scavs')this.state.statistics.enemiesDestroyed++;this.navigationDirty=true;}else if(target.owner==='rai'&&this.state.time-(target.lastDamageBark??-20)>12){target.lastDamageBark=this.state.time;this.emit('unit-damaged',{target:target.id});}}
 attack(attacker,target,spec){
  if(attacker.cooldown>0||distance(attacker,target)>spec.range||!this.lineOfSight(attacker,target))return false;
  attacker.cooldown=spec.cooldown;
  const multiplier=attacker.owner==='rai'&&this.state.research['mg-ammo-1']&&attacker.kind!=='flamer'?1.25:1;
  const {x,y,z,surface}=combatContact(attacker,target,this.config,this.field);
  this.damage(target,spec.damage*multiplier,attacker);
  attacker.aimTarget={x,y,z};
  this.effects.push({type:'shot',from:attacker.id,targetId:target.id,to:attacker.aimTarget,surface,destroyed:target.hp<=0,weapon:attacker.kind==='flamer'?'flame':'mg'});
  if(this.effects.length>128)this.effects.shift();
  return true;
 }
 enemyOf(item,other){return other.hp>0&&item.owner!==other.owner&&(!other.campId||this.inBounds(other.x,other.y));}
 nearestEnemy(item,range,canTarget=null){let nearest=null,best=range;for(const target of [...this.state.units,...this.state.buildings]){if(!this.enemyOf(item,target))continue;const d=distance(item,target);if(d<best&&(item.owner!=='rai'||this.visibleAt(target.x,target.y))&&(!canTarget||canTarget(target))){best=d;nearest=target;}}return nearest;}
 requestPassage(unit,blockers){
  if(unit.task?.type==='clear-site')return;
  const scale=this.config.worldScale;
  for(const other of blockers){
   if(other.owner!==unit.owner||other.path.length||other.task||other.detour||this.unitSpec(other).role==='builder'
    ||other.trafficRest>this.state.time||distance(unit,other)>scale*6)continue;
   if(!other.routeOrder&&(!['move','attack-move'].includes(unit.task?.type)||this.unitSpec(unit).role==='builder'))continue;
   other.trafficRest=this.state.time+5;
   const park=this.parkingManeuver(other,unit,(from,to)=>this.vehicleMotionClear(other,from,to));
   if(!park)continue;
   other.detour={legs:park.legs,parking:true,idleYield:true,blocked:0};
   return;
  }
  const course=vehicle=>Math.atan2(vehicle.path[0].y-vehicle.y,vehicle.path[0].x-vehicle.x);
  const direction=course(unit);
  const candidates=[...blockers].filter(other=>other.owner===unit.owner&&other.path.length
   &&other.task?.type!=='clear-site'&&distance(unit,other)<this.config.worldScale*6
   &&Math.cos(direction-course(other))<.55);
  if(!candidates.length)return;
  const serial=vehicle=>Number(vehicle.id.slice(1));
  candidates.sort((a,b)=>distance(unit,a)-distance(unit,b)||serial(a)-serial(b));
  const other=candidates[0],higher=serial(unit)<serial(other);
  const leader=higher?unit:other, follower=higher?other:unit;
  if(follower.traffic||follower.trafficRest>this.state.time)return;
  follower.traffic={leader:leader.id,since:this.state.time,phase:'seek'};
 }
 vehicleMotionClear(unit,from,to,grade=.52,blockers,obstacles=this.state.units){
  const field=this.field,scale=this.config.worldScale;
  if(!this.nav.lineClear(from,to,false,true,grade,true))return false;
  const envelope=vehicleEnvelope(to,scale,field);
  if(!vehicleGroundSafe(envelope,grade)){
   const previous=vehicleEnvelope(from,scale,field);
   const tilt=pose=>Math.max(Math.abs(Math.tan(pose.pitch)),Math.abs(Math.tan(pose.roll))*1.24);
   if(tilt(envelope)>=tilt(previous)-.00001)return false;
  }
  const solids=this.nav.nearbySolids(to,scale*4.8);
  const sweep=solids.length?vehicleSweep(from,to,scale,field):null;
  return (!sweep||this.nav.clearSolidSweep(sweep,solids))
   &&clearOfVehicles(unit,to,obstacles,scale,false,from,field,blockers,sweep);
 }
 passingLane(unit,point,course,scale){
  const look=22,range=112;
  if(distance(unit,point)<look+8||-Math.sin(unit.heading)*course.x+Math.cos(unit.heading)*course.y<.72){
   delete unit.passingLane;
   return null;
  }
  const opposite=this.state.units.some(other=>{
   if(other===unit||other.hp<=0||other.owner!==unit.owner||!other.path.length)return false;
   const dx=other.x-unit.x,dy=other.y-unit.y,forward=dx*course.x+dy*course.y;
   if(forward< -scale*4||forward>range||Math.abs(dx*course.y-dy*course.x)>scale*3.6)return false;
   const goal=other.path[0],length=distance(other,goal);
   return length>look+8&&(goal.x-other.x)*course.x+(goal.y-other.y)*course.y< -length*.75;
  });
  let lane=unit.passingLane;
  if(lane&&lane.ux*course.x+lane.uy*course.y<.83)lane=null;
  if(!lane&&!opposite)return null;
  if(!lane)lane={x:unit.x,y:unit.y,ux:course.x,uy:course.y,expires:0};
  if(opposite)lane.expires=this.state.time+2.2;
  if(lane.expires<this.state.time){delete unit.passingLane;return null;}
  const along=(unit.x-lane.x)*lane.ux+(unit.y-lane.y)*lane.uy+look;
  const offset=scale*1.5;
  const goal={x:lane.x+lane.ux*along+lane.uy*offset,y:lane.y+lane.uy*along-lane.ux*offset};
  const pose={...goal,heading:Math.atan2(-lane.ux,lane.uy),kind:unit.kind};
  if(!this.nav.lineClear(unit,goal,false,true,.52,true)||
   !this.nav.clearSolidSweep(vehicleSweep(pose,pose,scale,this.field),this.nav.nearbySolids(goal,scale*4)))return null;
  unit.passingLane=lane;
  return goal;
 }
 trafficSpeed(unit,course,lane,scale){
  const field=this.field,shape=vehicleEnvelope(unit,scale,field);
  const front=footprintSupport(shape,course.x,course.y);
  const width=footprintSupport(shape,course.y,-course.x);
  const priority=vehicle=>{
   let hash=19452;
   for(const char of vehicle.id)hash=Math.imul(hash^char.charCodeAt(0),0x45d9f3b);
   return (hash^(hash>>>16))>>>0;
  };
  for(const [id,merge] of Object.entries(unit.mergeTraffic??{})){
   if(merge.expires<this.state.time)delete unit.mergeTraffic[id];
  }
  let limit=Infinity;
  for(const other of this.state.units){
   if(other===unit||other.hp<=0||other.owner!==unit.owner||distance(unit,other)>scale*13)continue;
   const point=other.path[0];
   if(!point)continue;
   const goalDistance=distance(other,point);
   if(!goalDistance)continue;
   const otherCourse={x:(point.x-other.x)/goalDistance,y:(point.y-other.y)/goalDistance};
   const aligned=-Math.sin(other.heading)*otherCourse.x+Math.cos(other.heading)*otherCourse.y;
   if(aligned<.77)continue;
   const obstacle=vehicleEnvelope(other,scale,field);
   const dx=obstacle.x-shape.x,dy=obstacle.y-shape.y;
   const otherLane=lane?this.nav.roads.rightLane(other,point,scale):null;
   if(otherLane&&lane.path===otherLane.path&&lane.direction===otherLane.direction){
    const along=otherLane.progress-lane.progress;
    if(Math.abs(along)>scale*8)continue;
    let merge=unit.mergeTraffic?.[other.id];
    if(!merge||merge.path!==lane.path||merge.direction!==lane.direction||merge.expires<this.state.time){
     const tie=Math.abs(along)<scale*.24;
     const leader=(tie?priority(unit)<priority(other):along<0)?unit:other;
     merge={leader:leader.id,path:lane.path,direction:lane.direction,expires:this.state.time+1.8};
     (unit.mergeTraffic??={})[other.id]=merge;
     (other.mergeTraffic??={})[unit.id]={...merge};
    }
    merge.expires=this.state.time+1.8;
    (other.mergeTraffic??={})[unit.id]={...merge};
    if(merge.leader!==unit.id){
     const rear=footprintSupport(obstacle,lane.ux,lane.uy);
     const gap=along-footprintSupport(shape,lane.ux,lane.uy)-rear-scale*.72;
     const lead=other.driveSpeed??0;
     limit=Math.min(limit,gap<0?0:Math.sqrt(lead*lead+44*gap));
    }
    continue;
   }
   const dot=course.x*otherCourse.x+course.y*otherCourse.y;
   if(dot>-.53&&dot<.81){
    const cross=course.x*otherCourse.y-course.y*otherCourse.x;
    const own=(dx*otherCourse.y-dy*otherCourse.x)/cross;
    const theirs=(dx*course.y-dy*course.x)/cross;
    const priorityMargin=scale*.26;
    if(own>0&&theirs> -scale*2.6&&own<scale*12&&theirs<Math.min(goalDistance+scale*2,scale*10)
      &&(own>theirs+priorityMargin||Math.abs(own-theirs)<=priorityMargin&&priority(unit)>priority(other))){
     const rear=footprintSupport(obstacle,course.x,course.y);
     const gap=own-front-rear-scale*.58;
     limit=Math.min(limit,Math.sqrt(44*Math.max(0,gap)));
    }
    continue;
   }
   if(dot<.81)continue;
   const alignment=-Math.sin(other.heading)*course.x+Math.cos(other.heading)*course.y;
   if(alignment<.76)continue;
   const along=dx*course.x+dy*course.y;
   const rear=footprintSupport(obstacle,course.x,course.y);
   const across=Math.abs(dx*course.y-dy*course.x);
   const following=across<Math.min(scale*2.4,width+footprintSupport(obstacle,course.y,-course.x)+scale*.15);
   if(!following||along<=0)continue;
   const gap=along-front-rear-scale*.72;
   const lead=Math.max(0,(other.driveSpeed??0)*alignment);
   const limitHere=Math.sqrt(lead*lead+44*Math.max(0,gap));
   limit=Math.min(limit,limitHere);
  }
  return limit;
 }
 parkingManeuver(unit,leader,allowed){
  const point=leader.path[0];
  const angle=point?Math.atan2(point.y-leader.y,point.x-leader.x):leader.heading+Math.PI/2;
  const forward={x:Math.cos(angle),y:Math.sin(angle)},right={x:forward.y,y:-forward.x};
  const scale=this.config.worldScale;
  const lateral=p=>(p.x-leader.x)*right.x+(p.y-leader.y)*right.y;
  const side=Math.sign(lateral(unit))||1;
  const clearLane=pose=>{
   const end=leader.path[0],length=Math.min(distance(leader,end),scale*12);
   const heading=Math.atan2(-forward.x,forward.y);
   for(let d=0;d<=length;d+=scale){
    const passing={x:leader.x+forward.x*d,y:leader.y+forward.y*d,heading,kind:leader.kind};
    if(vehicleClearance(pose,passing,scale,this.field)<scale*.35)return false;
   }
   return true;
  };
  for(const sign of [side,-side]){
   const goal={x:unit.x+right.x*scale*5*sign,y:unit.y+right.y*scale*5*sign};
   const path=planManeuver(unit,goal,{scale,allowed,attempts:2,
    accept:pose=>lateral(pose)*sign>scale*3.4&&distance(pose,unit)>scale*2.6&&clearLane(pose)});
   if(path)return {legs:path,forward};
  }
  return null;
 }
 recoverTrafficCluster(unit,includeParked=false,blockers){
  const scale=this.config.worldScale;
  const idle=other=>!other.path.length&&!other.task&&!other.builderWorking&&!other.tool&&!other.foldTime;
  const neighbours=this.state.units.filter(other=>other.owner===unit.owner&&other.hp>0
   &&(other.path.length&&other.task?.type!=='clear-site'||includeParked&&idle(other)&&distance(unit,other)<scale*12));
  const cluster=[unit];
  for(let index=0;index<cluster.length;index++){
   const current=cluster[index];
   for(const other of neighbours){
    if(cluster.includes(other)||distance(current,other)>scale*6.5)continue;
    // A turning sweep can hit a vehicle even when both parked hulls are clear.
    const sweptBlocker=current===unit&&blockers?.has(other)&&other.path.length&&(other.driveSpeed??0)<scale*.18;
    if(sweptBlocker||vehicleClearance(current,other,scale,this.field)<scale*.52)cluster.push(other);
   }
  }
  if(cluster.length<2||cluster.some(other=>other.detour||other.trafficHold))return false;
  const yieldSpace=(vehicle,legs,rough=true)=>{
   vehicle.detour={legs,parking:true,rough,idleYield:true,blocked:0};
   vehicle.trafficRest=this.state.time+6;
   for(const other of cluster)if(other!==vehicle&&other.path.length)other.trafficHold=vehicle.id;
   return true;
  };
  if(includeParked&&cluster.length>=4
   &&cluster.every(other=>other===unit||vehicleClearance(unit,other,scale,this.field)>=0)
   &&this.clearParkedAisle(unit,neighbours.filter(idle),yieldSpace))return true;
  const centre=cluster.reduce((sum,other)=>({x:sum.x+other.x/cluster.length,y:sum.y+other.y/cluster.length}),{x:0,y:0});
  const outer=cluster.slice().sort((a,b)=>distance(b,centre)-distance(a,centre)||Number(b.id.slice(1))-Number(a.id.slice(1)));
  for(const vehicle of outer){
   if(includeParked&&!idle(vehicle))continue;
   if(vehicle.traffic||vehicle.trafficRest>this.state.time)continue;
   const offset={x:vehicle.x-centre.x,y:vehicle.y-centre.y};
   const radius=Math.max(1,distance(vehicle,centre));
   const goal={x:vehicle.x+offset.x/radius*scale*4.5,y:vehicle.y+offset.y/radius*scale*4.5};
   const others=cluster.filter(other=>other!==vehicle);
   const allowed=(from,to)=>this.vehicleMotionClear(vehicle,from,to,.60);
   const legs=planManeuver(vehicle,goal,{scale,allowed,attempts:2,maximumLegs:6,
    accept:pose=>distance(vehicle,pose)>scale*2.5&&distance(pose,centre)>radius+scale*1.3
     &&others.every(other=>vehicleClearance(pose,other,scale,this.field)>scale*.4)});
   if(!legs){
    if(includeParked)vehicle.trafficRest=this.state.time+4;
    continue;
   }
   if(includeParked)return yieldSpace(vehicle,legs);
   if(others.length===1&&(blockers?.has(vehicle)||blockers?.has(others[0]))
    &&vehicleClearance(vehicle,others[0],scale,this.field)>=scale*.52){
    // Once this manoeuvre clears a known blocker, both vans can resume.
    const normal=checkManeuver(vehicle,legs,scale,(from,to)=>this.vehicleMotionClear(vehicle,from,to));
    for(const other of cluster)other.trafficRecoveryUntil=this.state.time+32;
    return yieldSpace(vehicle,legs,!normal);
   }
   const leader=others.slice().sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)))[0];
   vehicle.detour={legs,parking:true,rough:true,blocked:0};
   vehicle.traffic={leader:leader.id,since:this.state.time,phase:'move'};
   for(const other of others)other.trafficHold=vehicle.id;
   return true;
  }
  return false;
 }
 clearParkedAisle(unit,parked,yieldSpace){
  // A boxed vehicle must drive along its row before it has room to turn.
  const scale=this.config.worldScale,fx=-Math.sin(unit.heading),fy=Math.cos(unit.heading);
  const along=other=>(other.x-unit.x)*fx+(other.y-unit.y)*fy;
  const lateral=other=>(other.x-unit.x)*fy-(other.y-unit.y)*fx;
  const allowed=(from,to)=>this.vehicleMotionClear(unit,from,to);
  const reverse=Math.max(0,scale*4-(unit.reverseDebt??0));
  const ignoreUnits=new Set([unit]);
  for(const [direction,lengths] of [[1,[10*scale,8*scale,6*scale]],[-1,[reverse]]]){
   for(const length of lengths){
    if(length<scale*3)continue;
    const legs=[{direction,curve:0,remaining:length}];
    const exit=checkManeuver(unit,legs,scale,allowed);
    if(!exit)continue;
    const path=this.vehiclePath(exit,unit.task,{ignoreUnits,maxGoalDistance:8,fallback:false});
    if(!path?.length)continue;
    const onward=planManeuver(exit,path[0],{scale,allowed,attempts:2,reverseBudget:0,maximumLegs:7});
    if(!onward)continue;
    unit.path=path;
    unit.detour={legs:[...legs,...onward],parking:false,blocked:0};
    return true;
   }
  }
  const row=parked.filter(other=>!other.detour&&!other.traffic&&Math.abs(lateral(other))<scale*1.2)
   .sort((a,b)=>along(b)-along(a));
  for(const other of row){
   const alignment=-Math.sin(other.heading)*fx+Math.cos(other.heading)*fy;
   if(Math.abs(alignment)<.72)continue;
   const advance=along(other),direction=Math.sign(alignment*advance);
   if(!direction)continue;
   const clearance=Math.max(scale*9,scale*20-Math.abs(advance));
   const canMove=(from,to)=>this.vehicleMotionClear(other,from,to);
   for(const remaining of [clearance,scale*10]){
    const legs=[{direction,curve:0,remaining}];
    if(checkManeuver(other,legs,scale,canMove))return yieldSpace(other,legs,false);
   }
  }
  return false;
 }
 move(unit,dt){
  const stop=()=>{unit.driveSpeed=0;unit.steering=(unit.steering??0)*.68;};
  const idleYield=!unit.path.length&&unit.detour?.idleYield;
  if(!unit.path.length&&!idleYield){stop();delete unit.detour;delete unit.traffic;delete unit.trafficHold;delete unit.passingLane;delete unit.passage;return false;}
  const gate=unit.passage;
  if(gate?.preceding){
   const leader=this.entity(gate.preceding);
   const leaderGate=leader?.passage;
   if(leader?.hp>0&&leader.path.length&&leaderGate?.along===gate.along&&leaderGate.admit===gate.admit
    &&(leader[gate.along]-gate.admit)*gate.direction<0){
    stop();return false;
   }
   gate.preceding=null;
  }
  if(unit.trafficHold){
   if(this.entity(unit.trafficHold)?.detour?.parking){stop();return false;}
   delete unit.trafficHold;
  }
  const egress=gate?.egress;
  const scale=this.config.worldScale;
  if(egress?.phase==='approach'&&!egress.admitted&&distance(unit,egress.entry)<scale*7){
   if(egress.admitAfter>this.state.time){stop();return false;}
   if(!passageStillOpen(this,egress)){egress.admitAfter=this.state.time+1.2;stop();return false;}
   egress.admitted=true;
  }
  const point=unit.path[0]??unit, next=unit.path[1], d=distance(unit,point);
  const atPivot=egress?.phase==='approach'&&point.x===egress.start.x&&point.y===egress.start.y;
  const precise=!next&&['build','repair'].includes(unit.task?.type);
  const tolerance=atPivot?.45:precise?.65:2;
  const blockers=new Set();
  const applyPose=pose=>{
   const travelled=distance(unit,pose),debt=unit.reverseDebt??0;
   unit.reverseDebt=Math.max(0,debt+(pose.reversing?travelled:-travelled*.33));
   Object.assign(unit,pose);
   if(unit.failedArcs&&distance(unit,unit.failedArcs.origin)>2)delete unit.failedArcs;
  };
  const canRoll=(from,to,grade)=>this.vehicleMotionClear(unit,from,to,grade,blockers);
  const allowed=(from,to)=>canRoll(from,to);
  const roughAllowed=(from,to)=>canRoll(from,to,.60);

  const advancingThroughExit=other=>{
   const otherExit=other?.passage?.egress;
   return egress&&other?.hp>0&&other.path.length&&otherExit?.phase==='turning'
    &&otherExit.start.x===egress.start.x&&otherExit.start.y===egress.start.y;
  };
  if(egress?.phase==='waiting'||atPivot&&d<tolerance){
   if(atPivot){unit.path.shift();egress.phase='waiting';}
   const leader=this.entity(egress.leader);
   const awaitingLeader=leader?.hp>0&&leader.path.length&&leader.passage?.egress
    &&(!advancingThroughExit(leader)||distance(unit,leader)<scale*8);
   if(awaitingLeader||egress.retryAt>this.state.time){
    stop();return false;
   }
   // Moving vehicles ahead can clear the planned arc before this unit gets
   // there. The actual step still sweeps against every vehicle.
   const obstacles=this.state.units.filter(other=>!advancingThroughExit(other));
   const exitClear=(from,to)=>this.vehicleMotionClear(unit,from,to,.52,undefined,obstacles);
   const end=checkManeuver(unit,egress.legs,scale,exitClear);
   const legs=end&&distance(end,egress.end)<scale*1.4?egress.legs:
    planManeuver(unit,egress.end,{scale,allowed:exitClear,attempts:3,maximumLegs:25,reverseBudget:0,
     accept:pose=>distance(pose,egress.end)<scale*.65&&Math.cos(pose.heading-egress.end.heading)>.94
      &&this.nav.lineClear(pose,egress.end,false,true)});
   if(!legs){egress.retryAt=this.state.time+1.8;stop();return false;}
   unit.detour={legs:legs.map(leg=>({...leg})),passageExit:true,blocked:0};
   egress.phase='turning';
  }

  const traffic=unit.traffic;
  if(traffic){
   const leader=this.entity(traffic.leader),age=this.state.time-traffic.since;
   const passed=traffic.forward&&leader
    &&(unit.x-leader.x)*traffic.forward.x+(unit.y-leader.y)*traffic.forward.y < -scale*2.5;
   if(!leader?.path.length||distance(unit,leader)>scale*10||age>9||passed){
    delete unit.traffic;unit.trafficRest=this.state.time+1.2;
    if(unit.detour?.parking)delete unit.detour;
   }else if(traffic.phase==='parked'){
    stop();return false;
   }else if(traffic.phase==='seek'&&!unit.detour){
    const park=this.parkingManeuver(unit,leader,allowed);
    if(park){
     unit.detour={legs:park.legs,parking:true,blocked:0};
     traffic.phase='move';traffic.forward=park.forward;
    }
    else{delete unit.traffic;unit.trafficRest=this.state.time+2;}
   }
  }
  if(unit.detour){
   const plan=unit.detour,leg=plan.legs[0];
   const throughSpeed=plan.passageExit&&plan.legs[1]?.direction===leg.direction?16:0;
   const step=maneuverStep(unit,leg,dt,{scale,allowed:plan.rough?roughAllowed:allowed,crawl:!!plan.rough,
    throughSpeed,forwardSpeed:plan.passageExit?18:13});
   if(step){
    applyPose(step.pose);
    leg.remaining-=step.length;
    plan.blocked=0;
    if(leg.remaining<1e-6){
     plan.legs.shift();
     if(plan.legs[0]?.direction!==leg.direction)unit.driveSpeed=0;
    }
    if(!plan.legs.length){
     if(plan.parking&&unit.traffic)unit.traffic.phase='parked';
     if(plan.passageExit&&gate)delete gate.egress;
     delete unit.detour;delete unit.driveWatch;
    }
    return true;
   }
   stop();
   if(plan.passageExit&&[...blockers].some(advancingThroughExit))return false;
   plan.blocked+=dt;
   if(plan.blocked<1)return false;
   if(plan.passageExit&&egress){
    egress.phase='waiting';egress.retryAt=this.state.time+.8;
    delete unit.detour;
    return false;
   }
   if(!blockers.size&&!plan.parking&&!plan.rough){
    const failed=unit.failedArcs??={origin:{x:unit.x,y:unit.y},legs:[]};
    failed.legs.push({direction:leg.direction,curve:leg.curve});
   }
   if(plan.parking&&unit.traffic)unit.traffic.phase='seek';
   delete unit.detour;
  }
  if(idleYield)return false;

  const repair=unit.task?.type==='repair';
  const workTarget=repair||precise&&d<4?this.entity(unit.task.targetId):null;
  const targetStopped=!repair||workTarget&&Math.hypot(workTarget.x-workTarget.previousX,workTarget.y-workTarget.previousY)<.05;
  const atWork=workTarget&&targetStopped&&this.canWorkHere(unit,workTarget);
  const canRoundCorner=!atPivot&&next&&d<Math.max(5,Math.min(10,(unit.driveSpeed??0)*.42))
   &&this.nav.lineClear(unit,next,false,true);
  if(atWork&&repair){
   unit.path.length=0;
   stop();
   return true;
  }
  if(atWork||d<tolerance||canRoundCorner){
   unit.path.shift();
   if(!unit.path.length)stop();
   return true;
  }
  const course={x:(point.x-unit.x)/d,y:(point.y-unit.y)/d};
  const cruising=!precise&&unit.task?.type!=='clear-site';
  const paved=cruising?this.nav.roads.rightLane(unit,point,scale):null;
  const roadLane=paved&&this.nav.lineClear(unit,paved,false,true,.52,true)?paved:null;
  const passing=cruising&&!roadLane?this.passingLane(unit,point,course,scale):null;
  const waypoint=roadLane??passing??point,remaining=distance(unit,waypoint);
  const slope=this.field.gradientAt(unit.x,unit.y);
  const slopeBlockers=Math.hypot(slope.x,slope.y)>=.42?blockers:undefined;
  const grade=(slope.x*(waypoint.x-unit.x)+slope.y*(waypoint.y-unit.y))/Math.max(1,remaining);
  const aligned=-Math.sin(unit.heading)*course.x+Math.cos(unit.heading)*course.y>.72;
  const trafficLimit=cruising&&aligned?this.trafficSpeed(unit,course,roadLane,scale):Infinity;
  const speed=this.unitSpec(unit).speed*this.nav.roads.factor(unit.x,unit.y);
  let pose=driveStep(unit,waypoint,dt,{speed,grade,scale,tolerance,trafficLimit,
   reverseLimit:unit.task?.type==='clear-site'?scale*4:precise?scale*1.5:0,allowed});
  if(!pose&&aligned&&cruising&&trafficLimit>speed*.25&&[...blockers].some(other=>
   other.owner===unit.owner&&Math.cos(unit.heading-other.heading)>.85)){
   const forward={x:unit.x-Math.sin(unit.heading)*scale*6,y:unit.y+Math.cos(unit.heading)*scale*6};
   pose=driveStep(unit,forward,dt,{speed:Math.min(9,speed),grade,scale,tolerance,allowed});
  }
  if(pose)applyPose(pose);else stop();

  let watch=unit.driveWatch;
  const resuming=unit.trafficRecoveryUntil>this.state.time;
  if(!watch||watch.x!==point.x||watch.y!==point.y){
   watch=unit.driveWatch={x:point.x,y:point.y,distance:d,elapsed:0,blocked:0,
    attempts:resuming?(watch?.attempts??0):0,stalledAt:resuming?watch?.stalledAt:undefined};
  }
  watch.elapsed+=dt;
  watch.blocked=pose?0:(watch.blocked??0)+dt;
  const stoppedPair=()=>!pose&&!gate&&!unit.traffic&&slopeBlockers?.size===1&&[...slopeBlockers].some(other=>other.owner===unit.owner
   &&other.path.length&&!other.traffic&&!other.passage&&(other.driveSpeed??0)<scale*.18
   &&vehicleClearance(unit,other,scale,this.field)>=scale*.52);
  const blockDelay=stoppedPair() ? .55 : .85;
  if(watch.elapsed<2.1&&watch.blocked<blockDelay)return !!pose;
  const waiting=trafficLimit<speed*.3&&!blockers.size&&(!pose||pose.driveSpeed<speed*.14);
  unit.queueSince=waiting?unit.queueSince??this.state.time:undefined;
  const queued=waiting&&this.state.time-unit.queueSince<2.4;
  const jammed=!queued&&(watch.distance-d<2.2||watch.blocked>=blockDelay);
  watch.distance=d;watch.elapsed=0;watch.blocked=0;
  if(!jammed){watch.attempts=0;delete watch.stalledAt;return !!pose;}
  if(resuming&&(!watch.stalledAt||distance(unit,watch.stalledAt)>=scale*.75)){
   watch.stalledAt={x:unit.x,y:unit.y};watch.attempts=0;
  }
  watch.attempts=(watch.attempts??0)+1;
  if(egress?.phase==='approach'){
   if(blockers.size||trafficLimit<speed*.4)return !!pose;
   const local=planManeuver(unit,point,{scale,allowed,tolerance,attempts:2,reverseBudget:scale*2,maximumLegs:5});
   if(local)unit.detour={legs:local,parking:false,blocked:0};
   return !!pose;
  }
  this.requestPassage(unit,blockers);

  const target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  const travel=['move','attack-move'].includes(unit.task?.type);
  if(travel&&stoppedPair()&&this.recoverTrafficCluster(unit,false,slopeBlockers))return !!pose;
  const destination=travel||unit.task?.type==='clear-site'?unit.task:unit.path.at(-1);
  const stalledNearParked=travel&&[...blockers].some(other=>!other.path.length);
  const routeStale=stalledNearParked&&unit.trafficReplan&&distance(unit,unit.trafficReplan)<scale*.7
   &&this.state.time-unit.trafficReplan.time<4;
  if(blockers.size&&watch.attempts%2===1&&!routeStale){
   const bypass=this.vehiclePath(unit,destination,{avoidMoving:true,fallback:false,maxGoalDistance:precise?.01:8});
   if(bypass?.length&&distance(bypass[0],point)>4&&distance(unit,bypass[0])>4){
    unit.path=bypass;
    if(stalledNearParked)unit.trafficReplan={x:unit.x,y:unit.y,time:this.state.time};
    return !!pose;
   }
  }
  const reverseBudget=Math.max(0,scale*4-(unit.reverseDebt??0));
  const maneuverOptions={scale,allowed,tolerance,attempts:watch.attempts,failedArcs:unit.failedArcs?.legs??[]};
  const legs=planManeuver(unit,point,{...maneuverOptions,reverseBudget:0})
   ??(reverseBudget>=scale*.6?planManeuver(unit,point,{...maneuverOptions,reverseBudget}):null);
  if(legs){unit.detour={legs,parking:false,blocked:0};return !!pose;}
  if(blockers.size&&(watch.attempts>=2||travel&&stoppedPair())&&unit.task?.type!=='clear-site'){
   if(this.recoverTrafficCluster(unit,false,slopeBlockers)
    ||travel&&unit.owner==='rai'&&this.recoverTrafficCluster(unit,true,slopeBlockers))return !!pose;
  }
  if(!blockers.size&&watch.attempts>=2){
   if(resuming&&travel&&next&&watch.attempts%4===2){
    // The cheapest grid waypoint can be behind a vehicle facing up a slope.
    // Find a reachable start pose and validate the turn onto its new route.
    for(const remaining of [scale*7,scale*5,scale*3]){
     const first={direction:1,curve:0,remaining};
     const exit=checkManeuver(unit,[first],scale,roughAllowed);
     if(!exit)continue;
     const path=this.vehiclePath(exit,destination,{ignoreUnits:new Set([unit]),avoidMoving:true,fallback:false,maxGoalDistance:8});
     if(!path?.length)continue;
     const onward=planManeuver(exit,path[0],{scale,allowed:roughAllowed,attempts:2,reverseBudget:0,maximumLegs:5});
     if(!onward)continue;
     unit.path=path;
     unit.detour={legs:[first,...onward],parking:false,rough:true,blocked:0};
     return !!pose;
    }
   }
   const rough=planManeuver(unit,point,{...maneuverOptions,allowed:roughAllowed,
    failedArcs:[],maximumLegs:5,reverseBudget});
   if(rough){unit.detour={legs:rough,parking:false,rough:true,blocked:0};return !!pose;}
  }
  if(next&&watch.attempts>=2){
   const alternative=this.vehiclePath(unit,destination,{avoidMoving:true,avoidPoint:point,fallback:false,maxGoalDistance:precise?.01:12});
   if(alternative?.length&&distance(alternative[0],point)>4){
    unit.path=alternative;return !!pose;
   }
   if(distance(unit,next)<scale*10){
    const around=planManeuver(unit,next,{...maneuverOptions,reverseBudget});
    if(around){unit.path.shift();unit.detour={legs:around,parking:false,blocked:0};return !!pose;}
   }
  }
  if(target&&['build','repair'].includes(unit.task.type))unit.path=this.workPath(unit,target)??unit.path;
  else if(target&&unit.task.type==='attack')unit.path=this.attackPath(unit,target)??unit.path;
  else if(travel&&watch.attempts>=3&&distance(unit,destination)<scale*12){
   const parkingAllowed=point=>gate?.parkingEdge===undefined||(point[gate.along]-gate.parkingEdge)*gate.direction>=0;
   if(!next&&d<scale*5.5&&watch.attempts%5===3){
    const parking=this.nearbyParking(unit,destination,allowed,reverseBudget,parkingAllowed);
    if(parking){
     unit.path=[parking.point];
     Object.assign(unit.task,parking.point);
     if(unit.routeOrder)unit.routeOrder.destination=parking.point;
     unit.detour={legs:parking.legs,parking:false,blocked:0};
     return !!pose;
    }
   }
   const parking=this.movePath(unit,destination,[],scale*14,false,parkingAllowed);
   if(parking?.length&&distance(parking.at(-1),destination)>2){
    unit.path=parking;
    Object.assign(unit.task,parking.at(-1));
    if(unit.routeOrder)unit.routeOrder.destination=parking.at(-1);
   }
  }else unit.path=this.vehiclePath(unit,destination,{avoidMoving:true,maxGoalDistance:precise?.01:16})??unit.path;
  return !!pose;
 }
 nearbyParking(unit,goal,allowed,reverseBudget,parkingAllowed){
  const scale=this.config.worldScale;
  const initialDistance=distance(unit,goal),candidates=[];
  for(const radius of [scale*1.5,scale*2.6,scale*3.7]){
   for(let index=0;index<8;index++){
    const angle=index*Math.PI/4;
    const point={x:goal.x+Math.cos(angle)*radius,y:goal.y+Math.sin(angle)*radius};
    if(!parkingAllowed(point))continue;
    const travel=distance(unit,point);
    if(travel<scale*.45||travel>Math.min(initialDistance+4,scale*4.7))continue;
    const heading=Math.atan2(unit.x-point.x,point.y-unit.y);
    const pose={...point,heading,kind:unit.kind};
    if(!this.vehicleMotionClear(unit,pose,pose))continue;
    const turn=Math.abs(angleDelta(heading,unit.heading));
    candidates.push({point,score:radius+turn*scale*.85+travel*.12});
   }
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const {point} of candidates.slice(0,7)){
   const legs=planManeuver(unit,point,{scale,allowed,attempts:2,maximumLegs:6,reverseBudget,
    accept:pose=>distance(pose,point)<1.8});
   if(legs)return {point,legs};
  }
  return null;
 }
 projectorAim(unit,target){
  const aim=workProjection(unit,target,this.config,this.field);
  return aim&&projectorHasSight(aim,unit,target,this.state.units,this.field,this.config.worldScale)?aim:null;
 }
 canWorkHere(unit,target){
  if(!target||!clearOfVehicles(unit,unit,this.state.units,this.config.worldScale,true))return false;
  if(!this.projectorAim(unit,target))return false;
  return !!this.config.units[target.kind]||!!workProjection(unit,{...target,progress:1},this.config,this.field);
 }
 updateBuilder(unit,dt){
  unit.builderWorking=false;
  unit.builderContact=null;
  unit.projector??={yaw:0,pitch:0};
  let target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  const job=unit.task?.type;
  if(unit.task?.targetId&&(!target||job==='build'&&target.completed||job==='repair'&&target.hp>=target.maxHp)){
   unit.task=null;unit.path=[];target=null;
  }
  const working=target&&['build','repair'].includes(job)&&!target.clearing;
  const parked=working&&!unit.path.length&&this.canWorkHere(unit,target);
  const moving=working&&this.config.units[target.kind]&&Math.hypot(target.x-target.previousX,target.y-target.previousY)>.05;
  const aim=parked&&!moving?this.projectorAim(unit,target):null;
  const requested=aim??{yaw:0,pitch:0};
  const yawError=angleDelta(requested.yaw,unit.projector.yaw), pitchError=requested.pitch-unit.projector.pitch;
  unit.projector.yaw=angleDelta(unit.projector.yaw+clamp(yawError,-2*dt,2*dt),0);
  unit.projector.pitch+=clamp(pitchError,-1.4*dt,1.4*dt);
  if(aim){
   unit.driveSpeed=0;
   if(Math.abs(yawError)<.06&&Math.abs(pitchError)<.06){
    unit.projector.yaw=aim.yaw;unit.projector.pitch=aim.pitch;
    unit.builderWorking=true;unit.builderContact=aim.world;
   }
   return;
  }
  if(working&&!unit.path.length&&this.state.time-(unit.lastRepath??-10)>1){
   unit.path=this.workPath(unit,target)??[];unit.lastRepath=this.state.time;
  }
  this.move(unit,dt);
  if(unit.task?.type==='move'&&!unit.path.length){
   if(distance(unit,unit.task)<24){
    unit.task=null;
    const building=unit.resumeConstructionId&&this.entity(unit.resumeConstructionId);
    if(building&&!building.completed&&!building.clearing&&this.canWorkHere(unit,building))this.order([unit.id],'build',building);
   }
   else if(this.state.time-(unit.lastRepath??-10)>1){unit.path=this.vehiclePath(unit,unit.task)??[];unit.lastRepath=this.state.time;}
  }
 }
 finalizeBuilderContacts(dt){
  for(const unit of this.state.units){
   if(unit.hp<=0||!unit.builderWorking)continue;
   const target=this.entity(unit.task?.targetId);
   const moving=target&&this.config.units[target.kind]&&Math.hypot(target.x-target.previousX,target.y-target.previousY)>.05;
   if(!target||moving||!this.projectorAim(unit,target)){unit.builderWorking=false;unit.builderContact=null;continue;}
   if(unit.task.type==='build'&&!target.completed){
    target.progress=Math.min(1,target.progress+dt/this.buildingSpec(target).seconds);
    if(target.progress>=1){target.completed=true;this.state.statistics.buildingsCompleted++;this.emit('construction-complete',{kind:target.kind,building:target.id});}
   }else if(unit.task.type==='repair'&&target.hp<target.maxHp&&this.state.energy>=dt*1.5){
    target.hp=Math.min(target.maxHp,target.hp+dt*40);this.state.energy-=dt*1.5;
   }else unit.builderWorking=false;
  }
 }
 updateUnit(unit,dt){
  if(unit.hp<=0)return;unit.previousX=unit.x;unit.previousY=unit.y;unit.previousHeading=unit.heading;unit.previousWheelDistance=unit.wheelDistance??0;unit.previousSteering=unit.steering??0;unit.cooldown=Math.max(0,unit.cooldown-dt);const spec=this.unitSpec(unit);
  if(spec.role==='builder'){this.updateBuilder(unit,dt);return;}
  if(unit.foldTime>0){unit.foldTime=Math.max(0,unit.foldTime-dt);unit.tool=Math.max(0,unit.tool-dt/2.6);return;}
  if(unit.task?.type==='attack-move'){
   const enemy=this.nearestEnemy(unit,spec.range,target=>this.lineOfSight(unit,target));
   if(enemy){
    unit.driveSpeed=0;unit.steering=(unit.steering??0)*.68;
    this.attack(unit,enemy,spec);
    return;
   }
   if(!unit.path.length){
    if(distance(unit,unit.task)<24)unit.task=null;
    else if(this.state.time-(unit.lastRepath??-10)>1){
     unit.path=this.vehiclePath(unit,unit.task)??[];unit.lastRepath=this.state.time;
    }
   }
   this.move(unit,dt);
   return;
  }
  let target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  if(unit.task?.targetId&&(!target||unit.task.type==='build'&&target.completed)){unit.task=null;unit.path=[];if(unit.tool>.01)unit.foldTime=2.6;target=null;}
  if(unit.owner==='scavs'){
   if(unit.raidReserve)return;
   if(!this.inBounds(unit.x,unit.y))return;const enemy=this.nearestEnemy(unit,spec.range*1.7);if(enemy){unit.task={type:'attack',targetId:enemy.id};target=enemy;if(distance(unit,enemy)>spec.range*.9&&(!unit.path.length||this.state.time-(unit.lastRepath??0)>2)){unit.path=this.attackPath(unit,enemy)??[];unit.lastRepath=this.state.time;}}
  }
  if(unit.task?.type==='attack'&&target&&spec.damage){if(distance(unit,target)<=spec.range&&this.lineOfSight(unit,target)){unit.path=[];this.attack(unit,target,spec);}else if((!unit.path.length||this.state.time-(unit.lastRepath??0)>3)&&this.state.time-(unit.lastRepath??-10)>1){unit.path=this.attackPath(unit,target)??[];unit.lastRepath=this.state.time;}}
  else if(spec.damage){const enemy=this.nearestEnemy(unit,spec.range);if(enemy)this.attack(unit,enemy,spec);}
  const working=target&&['build','repair'].includes(unit.task?.type)&&!unit.path.length&&distance(unit,this.workPoint(target,unit.task.workOffset??0))<=this.config.builderRangeMetres;
  if(working){unit.path=[];unit.tool=Math.min(1,unit.tool+dt/2.6);unit.aimTarget={x:target.x,y:target.y};if(unit.tool<.99)return;
   if(unit.task.type==='build'&&!target.completed){target.progress=Math.min(1,target.progress+dt/this.buildingSpec(target).seconds);if(target.progress>=1){target.completed=true;this.state.statistics.buildingsCompleted++;this.emit('construction-complete',{kind:target.kind,building:target.id});}}
   else if(unit.task.type==='repair'&&target.hp<target.maxHp&&this.state.energy>dt*1.5){target.hp=Math.min(target.maxHp,target.hp+dt*40);this.state.energy-=dt*1.5;}
   if((unit.task.type==='build'&&target.completed)||(unit.task.type==='repair'&&target.hp>=target.maxHp)){unit.task=null;unit.foldTime=2.6;}
  }else{if(unit.tool>0){unit.foldTime=2.6;return;}if(target&&['build','repair'].includes(unit.task?.type)&&!unit.path.length&&this.state.time-(unit.lastRepath??-10)>1){unit.path=this.workPath(unit,target);unit.lastRepath=this.state.time;}if(unit.task?.type==='move'&&!unit.path.length){if(distance(unit,unit.task)<24)unit.task=null;else if(this.state.time-(unit.lastRepath??-10)>1){unit.path=this.nav.findPath(unit,unit.task)??[];unit.lastRepath=this.state.time;}}this.move(unit,dt);}
 }
 clearFactoryApron(building,departure,blockers){
  const idle=other=>other.owner===building.owner&&!other.task&&!other.path.length&&!other.detour
   &&this.unitSpec(other).role!=='builder';
  if(![...blockers].every(idle))return;
  const scale=this.config.worldScale;
  const leader={...departure,path:[{
   x:departure.x-Math.sin(departure.heading)*scale*9,
   y:departure.y+Math.cos(departure.heading)*scale*9
  }]};
  for(const other of blockers){
   if(other.trafficRest>this.state.time)continue;
   other.trafficRest=this.state.time+4;
   const parking=this.parkingManeuver(other,leader,(from,to)=>this.vehicleMotionClear(other,from,to));
   if(!parking)continue;
   other.detour={legs:parking.legs,parking:true,idleYield:true,blocked:0,factoryExit:building.id};
   building.exitYield=other.id;
   return;
  }
 }
 spawnProducedVehicle(building,item,spec){
  if(building.exitYield){
   const yielding=this.entity(building.exitYield);
   if(yielding?.hp>0&&yielding.detour?.factoryExit===building.id)return false;
   delete building.exitYield;
  }
  const [x,y]=spec.exitAnchor,c=Math.cos(building.rotation),s=Math.sin(building.rotation),scale=this.config.worldScale;
  const point={x:building.x+(x*c-y*s)*scale,y:building.y+(x*s+y*c)*scale};
  const exit=this.nav.nearest(point.x,point.y,2);
  if(!exit)return false;
  const heading=angleDelta(building.rotation+Math.PI,0);
  const departure={...exit,heading,owner:'rai',kind:item.kind};
  const door={...departure,...point};
  const solids=this.nav.nearbySolids(door,scale*4.8+distance(door,departure));
  const apron=vehicleSweep(door,departure,scale,this.field);
  if(!this.nav.lineClear(door,departure,false,true,.52,true)
   ||!vehicleGroundSafe(apron.end,.52)
   ||!this.nav.clearSolidSweep(vehicleSweep(door,door,scale,this.field),solids)
   ||!this.nav.clearSolidSweep(apron,solids))return false;
  const blockers=new Set();
  const doorClear=clearOfVehicles(null,door,this.state.units,scale,true,null,this.field,blockers);
  const apronClear=clearOfVehicles(null,departure,this.state.units,scale,false,door,this.field,blockers,apron);
  if(!doorClear||!apronClear){
   this.clearFactoryApron(building,door,blockers);
   return false;
  }

  const slot=building.producedCount??0;
  const side=(slot%3-1)*24,forward=-42-Math.floor(slot/3)%3*24;
  const rally=building.rally??{x:point.x+side*c-forward*s,y:point.y+side*s+forward*c};
  const reservations=[exit];
  for(const other of this.state.units){
   const end=other.path.at(-1);
   if(other.hp>0&&other.owner==='rai'&&end&&distance(end,rally)<scale*25)reservations.push(end);
  }
  const path=this.movePath(departure,rally,reservations,scale*27);
  if(!path)return false;
  const design=item.projectId?{projectId:item.projectId,designName:item.name,components:[...item.components]}:{};
  const unit=this.addUnit(item.kind,'rai',exit,design),destination=path.at(-1);
  unit.heading=heading;
  unit.path=path;
  unit.task={type:'move',x:destination.x,y:destination.y};
  building.producedCount=slot+1;
  building.queue.shift();
  this.state.statistics.produced++;
  this.emit('unit-produced',{unit:unit.id,kind:unit.kind,name:item.name??this.config.units[item.kind].name,first:this.state.statistics.produced===1});
  return true;
 }
 linkOilWells(structures,dt){
  const slots=structures.reduce((sum,b)=>sum+(b.kind==='generator'?(this.buildingSpec(b).oilSlots??0):0),0);
  let linked=0,generation=0;
  for(const well of structures){
   if(well.kind!=='derrick')continue;
   well.powered=linked<slots;
   if(!well.powered)continue;
   linked++;
   generation+=this.buildingSpec(well).energyPerSecond??0;
   if(dt>0)well.pumpTime=(well.pumpTime??0)+dt;
  }
  this.state.oilLinked=linked;
  this.state.powered=linked>0;
  return generation;
 }
 updateEconomy(dt){
  const structures=this.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed);
  const generation=this.linkOilWells(structures,dt);
  let use=0;
  for(const b of structures)if(b.queue.length||b.research)use+=this.buildingSpec(b).power??0;
  this.state.energyRate=this.state.powered?generation-use:0;
  this.state.energy=clamp(this.state.energy+this.state.energyRate*dt,0,this.config.energyCapacity);
  for(const building of structures){building.cooldown=Math.max(0,building.cooldown-dt);const spec=this.buildingSpec(building);if(spec.damage){const target=this.nearestEnemy(building,spec.range);if(target)this.attack(building,target,spec);}if(!this.state.powered)continue;
   if(building.queue.length){
    const item=building.queue[0],unitSpec=this.config.units[item.kind];
    item.progress=Math.min(1,item.progress+dt/unitSpec.seconds);
    if(item.progress>=1&&!(building.exitRetryAt>this.state.time)){
     if(this.spawnProducedVehicle(building,item,spec)){
      delete building.exitBlocked;
      delete building.exitRetryAt;
     }else{
      building.exitBlocked=true;
      building.exitRetryAt=this.state.time+.8;
     }
    }
   }
   if(building.research){const task=building.research;task.progress=Math.min(1,task.progress+dt/this.config.research[task.key].seconds);if(task.progress>=1){this.state.research[task.key]=true;this.emit('research-complete',{key:task.key});this.cinematic('research-'+task.key);building.research=null;}}
  }
 }
 updateFog(){
  this.fogRevision++;
  this.visible.fill(0);this.visionSources.length=0;
  const stamp=(item,vision)=>{
   const [x,y]=this.field.worldToGrid(item.x,item.y),radius=vision/(this.field.cellMetres??32),b=this.state.bounds;
   if(!radius)return;
   this.visionSources.push({x,y,radius});
   for(let row=Math.max(0,b[1],Math.ceil(y-radius));row<=Math.min(127,b[3],Math.floor(y+radius));row++)
    for(let col=Math.max(0,b[0],Math.ceil(x-radius));col<=Math.min(127,b[2],Math.floor(x+radius));col++)
     if(Math.hypot(col-x,row-y)<=radius){this.visible[row*128+col]=255;this.explored[row*128+col]=255;}
  };
  for(const unit of this.state.units)if(unit.owner==='rai'&&unit.hp>0)stamp(unit,this.unitSpec(unit).vision);for(const b of this.state.buildings)if(b.owner==='rai'&&b.hp>0&&b.completed)stamp(b,this.buildingSpec(b).vision);
 }
 updateMission(){
  const s=this.state,captured=s.camps.filter(c=>c.cleared).length;
  for(const camp of s.camps){if(camp.cleared)continue;const hostile=[...s.units,...s.buildings].some(e=>e.campId===camp.id&&e.hp>0);if(!hostile){camp.cleared=true;this.emit('camp-cleared',{camp:camp.id});if(camp.artifact&&!camp.artifactSpawned){const point=this.nav.nearest(camp.x+35,camp.y,8)??camp;s.artifacts.push({id:this.id('a'),key:camp.artifact,x:point.x,y:point.y,collected:false});camp.artifactSpawned=true;}}}
  for(const artifact of s.artifacts)if(!artifact.collected&&s.units.some(u=>u.owner==='rai'&&u.hp>0&&distance(u,artifact)<24)){artifact.collected=true;if(!s.artifactKeys.includes(artifact.key))s.artifactKeys.push(artifact.key);this.emit('artifact-collected',{key:artifact.key});if(artifact.key!=='mg-tower')this.cinematic('artifact-'+artifact.key);}
  const enemyVisible=s.units.some(u=>u.owner==='scavs'&&u.hp>0&&this.visibleAt(u.x,u.y));const has=kind=>s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind===kind);
  if(!s.flags.contact&&(enemyVisible||(has('factory')&&has('lab')&&s.statistics.produced>0))){s.flags.contact=true;this.cinematic('first-contact');s.flags.raidAt=s.time+12;}
  if(s.flags.contact&&!s.flags.raidStarted&&s.time>=s.flags.raidAt)this.launchRaid();
  if(s.flags.raidStarted&&!s.flags.raidWon&&s.flags.raidIds.every(id=>!this.entity(id))){s.flags.raidWon=true;this.cinematic('raid-won');}
  if(!s.flags.thirdSighted){
   const tower=waterTower(this);
   if(tower&&this.visibleAt(tower.x,tower.y)){s.flags.thirdSighted=true;this.cinematic('camp3-sighted');}
  }
  if(!s.flags.lastRevealed&&s.camps.filter(c=>c.cleared).length>=3){s.flags.lastRevealed=true;s.bounds=this.config.finalMapBounds.slice();this.rebuildNavigation();this.cinematic('last-camp');this.emit('map-expanded',{bounds:s.bounds});}
  if(s.camps.every(c=>c.cleared)&&has('generator')&&has('derrick')&&has('factory')&&has('lab')&&(has('bunker')||has('mg-tower'))&&s.statistics.produced>0&&Object.keys(this.config.research).every(key=>s.research[key])&&s.flags.raidWon){s.status='victory';this.cinematic('victory');this.cinematic('outro');this.emit('victory');}
  if(!s.units.some(u=>u.owner==='rai'&&u.hp>0&&this.unitSpec(u).role==='builder')&&!s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind==='factory')){s.status='defeat';this.emit('defeat',{reason:'Утрачены строители и производство'});}
 }
 tick(dt){if(this.state.status!=='running')return;this.state.time+=dt;for(const unit of this.state.units)this.updateUnit(unit,dt);this.finalizeBuilderContacts(dt);this.updateConstructionSites();this.updateEconomy(dt);for(const b of this.state.buildings)if(b.owner==='scavs'&&b.hp>0){b.cooldown=Math.max(0,b.cooldown-dt);const spec=this.buildingSpec(b);if(spec.damage){const enemy=this.nearestEnemy(b,spec.range);if(enemy)this.attack(b,enemy,spec);}}this.fogTimer+=dt;if(this.fogTimer>=.25){this.fogTimer=0;this.updateFog();}this.updateMission();if(this.navigationDirty){this.rebuildNavigation();this.navigationDirty=false;}}
 advance(seconds){this.accumulator+=Math.max(0,seconds);let ticks=0;while(this.accumulator+1e-8>=this.config.simulationStep){this.accumulator-=this.config.simulationStep;this.tick(this.config.simulationStep);ticks++;}return ticks;}
 objectives(){const s=this.state,has=kind=>s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind===kind);return [{id:'base',name:'Развернуть передовую базу',done:has('generator')&&has('factory')&&has('lab')&&(has('bunker')||has('mg-tower'))},{id:'power',name:'Обеспечить энергоснабжение',done:s.powered},{id:'production',name:'Наладить производство техники',done:s.statistics.produced>0},{id:'research',name:'Организовать научные исследования',done:Object.keys(this.config.research).every(key=>s.research[key]),progress:Object.keys(s.research).length+'/3'},{id:'security',name:s.flags.contact?'Уничтожить четыре лагеря':'Обеспечить безопасность района',done:s.camps.every(c=>c.cleared)&&s.flags.raidWon,progress:s.camps.filter(c=>c.cleared).length+'/4'}];}
 save(){this.updateFog();return JSON.stringify({version:1,mission:this.config.id,serial:this.serial,randomState:this.randomState,accumulator:this.accumulator,fogTimer:this.fogTimer,state:this.state,explored:Array.from(this.explored)});}
 updateUnrevealedCampLayout(){
  // Revealed camps keep their saved positions so ongoing battles can resume.
  if(this.state.flags.lastRevealed)return;
  for(const data of this.config.camps){
   if(!data.requiresCamps||!data.towerGrids)continue;
   const camp=this.state.camps.find(item=>item.id===data.id);
   if(!camp||camp.towerGrids)continue;
   const buildings=this.state.buildings.filter(b=>b.campId===data.id);
   const core=buildings.find(b=>b.kind==='camp-core');
   const point=this.field.gridToWorld(data.grid);
   Object.assign(camp,{...point,grid:data.grid,towerGrids:data.towerGrids,coreRotationDegrees:data.coreRotationDegrees});
   if(core)Object.assign(core,point,{rotation:(data.coreRotationDegrees??0)*Math.PI/180});
   buildings.filter(b=>b.kind==='mg-tower').forEach((tower,index)=>{
    const grid=data.towerGrids[index];
    if(grid)Object.assign(tower,this.field.gridToWorld(grid));
   });
  }
 }
 load(json){const data=typeof json==='string'?JSON.parse(json):json;if(data.version!==1||data.mission!==this.config.id||!Array.isArray(data.state?.units)||data.explored?.length!==16384)throw new Error('Несовместимое сохранение');this.state=data.state;
  this.updateUnrevealedCampLayout();
  const bunker=this.config.buildings.bunker;
  if(bunker)for(const building of this.state.buildings){
   if(building.kind!=='bunker'||building.owner!=='rai')continue;
   const [halfWidth,halfDepth]=halfFootprint(bunker.footprintMetres,this.config.worldScale,building.rotation);
   building.halfWidth=Math.min(building.halfWidth,halfWidth);
   building.halfDepth=Math.min(building.halfDepth,halfDepth);
  }
  this.state.bounds=(this.state.flags.lastRevealed?this.config.finalMapBounds:this.config.initialMapBounds).slice();this.state.designs=Array.isArray(this.state.designs)?latestVehicleProjects(this.state.designs):starterProjects(this.vehicleRecipes);this.serial=data.serial;this.randomState=data.randomState;this.explored.set(data.explored);this.events=[];this.effects=[];this.accumulator=data.accumulator??0;this.fogTimer=data.fogTimer??0;this.navigationDirty=false;this.linkOilWells(this.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed),0);this.rebuildNavigation();this.updateFog();}
}
