import {TerrainNavigator} from './navigation.js';
import {BUILDER,angleDelta,createBuilderState,stepBuilderRig,desiredBuilderHeading,workContact,forwardBuilder,vehiclePose,builderClearOfGround,builderClearOfTarget} from './builder-kinematics.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Authoritative game state has no renderer objects, audio clocks or DOM references.
export class Mission{
 constructor(config,field){
  this.config=config;this.field=field;this.nav=new TerrainNavigator(field,{bounds:config.initialMapBounds.slice()});this.accumulator=0;this.serial=1;this.randomState=19452;this.events=[];this.effects=[];
  this.state={version:1,mission:config.id,time:0,status:'running',energy:config.initialEnergy,energyRate:0,powered:false,oilLinked:0,units:[],buildings:[],camps:[],artifacts:[],research:{},artifactKeys:[],seenCinematics:[],pendingCinematics:['intro','briefing','arrival'],flags:{},statistics:{produced:0,buildingsCompleted:0,enemiesDestroyed:0},bounds:config.initialMapBounds.slice()};
  this.visible=new Uint8Array(128*128);this.explored=new Uint8Array(128*128);this.fogTimer=1;
  const start=field.gridToWorld(config.startGrid);
  config.initialUnits.forEach((kind,index)=>this.addUnit(kind,'rai',{x:start.x+(index%3-1)*28,y:start.y-45-Math.floor(index/3)*30}));
  config.camps.forEach((data,index)=>{const point=field.gridToWorld(data.grid),gate=field.gridToWorld(data.gateGrid),camp={...data,index,x:point.x,y:point.y,gate,cleared:false,artifactSpawned:false};this.state.camps.push(camp);this.addStructure('camp-core','scavs',point,{campId:data.id,hp:750*data.strength,halfWidth:28,halfDepth:22});if(index>=2)for(let j=0;j<(index===3?2:1);j++)this.addStructure('mg-tower','scavs',{x:point.x+(j?48:-48),y:point.y-30},{campId:data.id,hp:850*data.strength});for(let i=0;i<data.units;i++)this.addUnit('raider','scavs',{x:gate.x+(i%3-1)*24,y:gate.y+30+Math.floor(i/3)*24},{campId:data.id,guard:{...gate}});});
  this.rebuildNavigation();this.updateFog();
 }
 id(prefix){return prefix+this.serial++;}
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
 rebuildNavigation(){this.nav.bounds=this.state.bounds.slice();this.nav.rebuild(this.state.buildings);}
 fail(reason){return {ok:false,reason};}
 canSpend(cost){return this.state.energy+1e-6>=cost;}
 inBounds(x,y){const [gx,gy]=this.field.worldToGrid(x,y),b=this.state.bounds;return gx>=b[0]&&gx<=b[2]&&gy>=b[1]&&gy<=b[3];}
 exploredAt(x,y){const [gx,gy]=this.field.worldToGrid(x,y),col=Math.round(gx),row=Math.round(gy);return col>=0&&row>=0&&col<128&&row<128&&!!this.explored[row*128+col];}
 visibleAt(x,y){const [gx,gy]=this.field.worldToGrid(x,y),col=Math.round(gx),row=Math.round(gy);return col>=0&&row>=0&&col<128&&row<128&&!!this.visible[row*128+col];}
 placement(kind,x,y,rotation=0,{checkMoney=true}={}){
  const spec=this.config.buildings[kind];if(!spec)return this.fail('Неизвестное здание');if(spec.requires&&!this.state.research[spec.requires])return this.fail('Требуется исследование: '+this.config.research[spec.requires].name);if(checkMoney&&!this.canSpend(spec.cost))return this.fail('Недостаточно энергии');if(!this.inBounds(x,y)||!this.exploredAt(x,y))return this.fail('Район ещё не разведан');
  if(spec.requiresOil){const oil=this.config.oilFields.map(grid=>this.field.gridToWorld(grid)).find(p=>Math.hypot(p.x-x,p.y-y)<25);if(!oil)return this.fail('Нужна нефтяная точка');x=oil.x;y=oil.y;}
  else{x=Math.round(x/this.config.buildingGridMetres)*this.config.buildingGridMetres;y=Math.round(y/this.config.buildingGridMetres)*this.config.buildingGridMetres;}
  const rotate=Math.abs(Math.round(rotation/(Math.PI/2)))%2,foot=rotate?[spec.footprintMetres[1],spec.footprintMetres[0]]:spec.footprintMetres,w=foot[0]*this.config.worldScale/2,d=foot[1]*this.config.worldScale/2,heights=[];
  for(const dx of [-w,0,w])for(const dy of [-d,0,d]){if(!this.inBounds(x+dx,y+dy)||!this.exploredAt(x+dx,y+dy))return this.fail('Пятно застройки выходит за разведанный район');const g=this.field.gradientAt(x+dx,y+dy);if(Math.hypot(g.x,g.y)>this.config.maxBuildingGrade)return this.fail('Слишком крутой склон');heights.push(this.field.heightAt(x+dx,y+dy));}
  if(Math.max(...heights)-Math.min(...heights)>2.5)return this.fail('Нужна ровная площадка');
  if(!spec.requiresOil)for(const grid of this.config.oilFields){const oil=this.field.gridToWorld(grid);if(Math.abs(x-oil.x)<w+this.config.worldScale*5+5&&Math.abs(y-oil.y)<d+this.config.worldScale*5+5)return this.fail('Нефтяной участок зарезервирован для вышки');}
  for(const building of this.state.buildings)if(building.hp>0&&Math.abs(x-building.x)<w+building.halfWidth+8&&Math.abs(y-building.y)<d+building.halfDepth+8)return this.fail('Пересечение с постройкой');
  const exitBox=(bx,by,angle,source)=>{const local=source.exitAnchor,c=Math.cos(angle),s=Math.sin(angle),scale=this.config.worldScale,px=bx+(local[0]*c-local[1]*s)*scale,py=by+(local[0]*s+local[1]*c)*scale;return{x:px,y:py,halfWidth:Math.abs(c)*14+Math.abs(s)*24,halfDepth:Math.abs(s)*14+Math.abs(c)*24};};
  for(const building of this.state.buildings){if(building.hp<=0)continue;const otherSpec=this.buildingSpec(building);if(otherSpec.exitAnchor){const exit=exitBox(building.x,building.y,building.rotation,otherSpec);if(Math.abs(x-exit.x)<w+exit.halfWidth&&Math.abs(y-exit.y)<d+exit.halfDepth)return this.fail('Нельзя перекрывать выезд завода');}if(spec.exitAnchor){const exit=exitBox(x,y,rotation,spec);if(Math.abs(building.x-exit.x)<building.halfWidth+exit.halfWidth&&Math.abs(building.y-exit.y)<building.halfDepth+exit.halfDepth)return this.fail('Для выезда завода нет места');}}
  for(const unit of this.state.units){if(unit.hp<=0)continue;const p=this.nav.position(...this.nav.grid(unit.x,unit.y));if((Math.abs(x-unit.x)<w+this.nav.clearance&&Math.abs(y-unit.y)<d+this.nav.clearance)||(Math.abs(x-p.x)<w+this.nav.clearance&&Math.abs(y-p.y)<d+this.nav.clearance))return this.fail('Площадка занята техникой');}
  const work=spec.workAnchor,c=Math.cos(rotation),s=Math.sin(rotation),wx=x+(work[0]*c-work[1]*s)*this.config.worldScale,wy=y+(work[0]*s+work[1]*c)*this.config.worldScale,[col,row]=this.nav.grid(wx,wy);let approach=false;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const p=this.nav.position(col+dx,row+dy);if(this.nav.allowed(col+dx,row+dy)&&Math.hypot(p.x-wx,p.y-wy)<=this.config.builderRangeMetres&&(Math.abs(p.x-x)>=w+this.nav.clearance||Math.abs(p.y-y)>=d+this.nav.clearance))approach=true;}
  if(!approach)return this.fail('Нет площадки для подъезда строителя');
  return {ok:true,x,y,rotation:Math.round(rotation/(Math.PI/2))*Math.PI/2,halfWidth:w,halfDepth:d,height:Math.max(...heights)};
 }
 workPoint(building,offset=0){if(this.config.units[building.kind])return{x:building.x+Math.sin(building.heading)*20+Math.cos(building.heading)*offset,y:building.y-Math.cos(building.heading)*20+Math.sin(building.heading)*offset};const spec=this.buildingSpec(building),local=spec.workAnchor??[0,-building.halfDepth/this.config.worldScale-4,0],c=Math.cos(building.rotation),s=Math.sin(building.rotation),scale=this.config.worldScale;return{x:building.x+(local[0]*c-local[1]*s)*scale+c*offset,y:building.y+(local[0]*s+local[1]*c)*scale+s*offset};}
 workPath(unit,target,offset=unit.task?.workOffset??0){
  const goal=this.workPoint(target,offset),heading=desiredBuilderHeading(target,!!this.config.units[target.kind]),[col,row]=this.nav.grid(goal.x,goal.y),candidates=[];
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){if(!this.nav.allowed(col+dx,row+dy))continue;const p=this.nav.position(col+dx,row+dy);if(distance(p,goal)<=this.config.builderRangeMetres-.5&&workContact({...unit,...p,heading},target,this.config,this.field))candidates.push(p);}
  candidates.sort((a,b)=>distance(a,goal)-distance(b,goal));
  for(const p of candidates){const path=this.nav.findPath(unit,p,{maxGoalDistance:.01});if(path)return path;}return null;
 }
 attackPath(unit,target){const spec=this.unitSpec(unit);if(distance(unit,target)<=spec.range&&this.lineOfSight(unit,target))return[];const angle=Math.atan2(unit.y-target.y,unit.x-target.x),radius=spec.range*.82;for(const offset of [0,.45,-.45,.9,-.9,1.4,-1.4,Math.PI]){const goal={x:target.x+Math.cos(angle+offset)*radius,y:target.y+Math.sin(angle+offset)*radius};if(!this.inBounds(goal.x,goal.y))continue;const path=this.nav.findPath(unit,goal),end=path?.at(-1);if(end&&distance(end,target)<=spec.range&&this.lineOfSight({...unit,...end},target))return path;}return null;}
 order(ids,action,target){
  if(!['move','attack','build','repair'].includes(action)||!target||!Number.isFinite(target.x)||!Number.isFinite(target.y))return this.fail('Недопустимый приказ');
  if(action==='attack'&&(target.owner==='rai'||!this.entity(target.id)||!this.visibleAt(target.x,target.y)))return this.fail('Цель не обнаружена');
  if(['build','repair'].includes(action)&&(target.owner!=='rai'||!this.entity(target.id)))return this.fail('Нужна своя техника или постройка');
  const units=this.state.units.filter(u=>ids.includes(u.id)&&u.owner==='rai'&&u.hp>0&&(!['build','repair'].includes(action)||this.unitSpec(u).role==='builder')&&(action!=='attack'||this.unitSpec(u).damage));if(!units.length)return this.fail('Не выбрана подходящая техника');let assigned=0;
  for(let index=0;index<units.length;index++){const unit=units[index],workOffset=(index-(units.length-1)/2)*18,goal=action==='build'||action==='repair'?this.workPoint(target,workOffset):target,columns=Math.min(3,units.length);
   let destination=action==='move'?{x:goal.x+(index%columns-(columns-1)/2)*20,y:goal.y-Math.floor(index/columns)*22}:goal,path=action==='attack'?this.attackPath(unit,target):['build','repair'].includes(action)?this.workPath(unit,target,workOffset):this.nav.findPath(unit,destination,{maxGoalDistance:24});
   if(!path&&action==='move'&&units.length>1){destination=goal;path=this.nav.findPath(unit,goal,{maxGoalDistance:24});}if(!path)continue;
   if(['build','repair'].includes(action)&&distance(path.at(-1)??unit,goal)>this.config.builderRangeMetres)continue;
   if(action==='move'&&distance(path.at(-1),goal)>24)continue;
   unit.path=path;unit.task={type:action,targetId:action==='move'?null:target.id??null,x:destination.x,y:destination.y,workOffset};if(unit.tool>.01)unit.foldTime=2.6;assigned++;
  }
  return assigned?{ok:true,assigned}:this.fail('Нет доступного пути или подходящего строителя');
 }
 build(ids,kind,x,y,rotation=0){
  const builders=this.state.units.filter(u=>ids.includes(u.id)&&u.owner==='rai'&&u.hp>0&&this.unitSpec(u).role==='builder');if(!builders.length)return this.fail('Выберите строителя');const place=this.placement(kind,x,y,rotation);if(!place.ok)return place;
  const building=this.addStructure(kind,'rai',place,{rotation:place.rotation,halfWidth:place.halfWidth,halfDepth:place.halfDepth,groundHeight:place.height,cost:this.config.buildings[kind].cost});this.rebuildNavigation();const result=this.order(builders.map(u=>u.id),'build',building);if(!result.ok){this.state.buildings.pop();this.rebuildNavigation();return result;}this.state.energy-=building.cost;this.emit('construction-start',{building:building.id});return {ok:true,id:building.id};
 }
 stop(ids){for(const unit of this.state.units)if(ids.includes(unit.id)&&unit.owner==='rai'&&unit.hp>0){unit.task=null;unit.path=[];if(unit.tool>.01)unit.foldTime=2.6;}return{ok:true};}
 setRally(id,point){const factory=this.entity(id);if(factory?.kind!=='factory'||factory.owner!=='rai'||!factory.completed)return this.fail('Выберите готовый завод');if(!this.inBounds(point.x,point.y)||!this.exploredAt(point.x,point.y))return this.fail('Точка сбора должна быть разведана');factory.rally={x:point.x,y:point.y};return{ok:true};}
 cancelBuilding(id){const building=this.entity(id);if(!building||building.owner!=='rai'||building.completed)return this.fail('Отменить можно только незавершённую стройку');this.state.energy=Math.min(this.config.energyCapacity,this.state.energy+building.cost*(1-building.progress));building.hp=0;for(const unit of this.state.units)if(unit.task?.targetId===id){unit.task=null;unit.path=[];unit.foldTime=2.6;}this.rebuildNavigation();this.emit('construction-cancelled',{building:id});return {ok:true};}
 produce(id,kind){const factory=this.entity(id),spec=this.config.units[kind];if(!factory||factory.owner!=='rai'||factory.kind!=='factory'||!factory.completed)return this.fail('Нужен построенный завод');if(!this.config.buildings.factory.production.includes(kind)||!spec)return this.fail('Этот образец недоступен');if(spec.requires&&!this.state.research[spec.requires])return this.fail('Требуется исследование');if(!this.canSpend(spec.cost))return this.fail('Недостаточно энергии');if(this.state.units.filter(u=>u.owner==='rai'&&u.hp>0).length+this.state.buildings.reduce((sum,b)=>sum+b.queue.length,0)>=48)return this.fail('Достигнут предел техники');this.state.energy-=spec.cost;factory.queue.push({kind,progress:0,cost:spec.cost});return {ok:true};}
 research(id,key){const lab=this.entity(id),spec=this.config.research[key];if(!lab||lab.kind!=='lab'||lab.owner!=='rai'||!lab.completed)return this.fail('Нужен исследовательский центр');if(!spec||!this.state.artifactKeys.includes(key))return this.fail('Сначала найдите артефакт');if(this.state.research[key]||this.state.buildings.some(b=>b.hp>0&&b.research?.key===key))return this.fail('Исследование уже выполнено или выполняется');if(lab.research)return this.fail('Лаборатория занята');if(!this.canSpend(spec.cost))return this.fail('Недостаточно энергии');this.state.energy-=spec.cost;lab.research={key,progress:0,cost:spec.cost};this.emit('research-start',{key});return {ok:true};}
 lineOfSight(from,to){const a=this.field.heightAt(from.x,from.y)+(from.kind==='mg-tower'?12:3.2)*this.config.worldScale,b=this.field.heightAt(to.x,to.y)+1.5*this.config.worldScale;for(let i=1;i<12;i++){const t=i/12;if(this.field.heightAt(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t)+.4>a+(b-a)*t)return false;}return true;}
 damage(target,amount,source){if(target.hp<=0)return;target.hp=Math.max(0,target.hp-amount);if(!target.hp){this.emit('destroyed',{target:target.id,owner:target.owner,kind:target.kind});if(target.owner==='scavs')this.state.statistics.enemiesDestroyed++;this.navigationDirty=true;}else if(target.owner==='rai'&&this.state.time-(target.lastDamageBark??-20)>12){target.lastDamageBark=this.state.time;this.emit('unit-damaged',{target:target.id});}}
 attack(attacker,target,spec){if(attacker.cooldown>0||distance(attacker,target)>spec.range||!this.lineOfSight(attacker,target))return false;attacker.cooldown=spec.cooldown;const multiplier=attacker.owner==='rai'&&this.state.research['mg-ammo-1']&&attacker.kind!=='flamer'?1.25:1;this.damage(target,spec.damage*multiplier,attacker);attacker.aimTarget={x:target.x,y:target.y};this.effects.push({type:'shot',from:attacker.id,to:{x:target.x,y:target.y},weapon:attacker.kind==='flamer'?'flame':'mg'});if(this.effects.length>128)this.effects.shift();return true;}
 enemyOf(item,other){return other.hp>0&&item.owner!==other.owner&&(!other.campId||this.inBounds(other.x,other.y));}
 nearestEnemy(item,range){let nearest=null,best=range;for(const target of [...this.state.units,...this.state.buildings]){if(!this.enemyOf(item,target))continue;const d=distance(item,target);if(d<best&&(item.owner!=='rai'||this.visibleAt(target.x,target.y))){best=d;nearest=target;}}return nearest;}
 move(unit,dt){
  if(!unit.path.length)return false;const point=unit.path[0],d=distance(unit,point),preciseEnd=!unit.path[1]&&['build','repair'].includes(unit.task?.type);if(d<.2||(!preciseEnd&&d<2&&(!unit.path[1]||this.nav.lineClear(unit,unit.path[1])))){unit.path.shift();return true;}const spec=this.unitSpec(unit),z0=this.field.heightAt(unit.x,unit.y),z1=this.field.heightAt(point.x,point.y),grade=(z1-z0)/Math.max(1,d),speed=spec.speed*clamp(1-grade*1.8,.5,1.22),step=Math.min(d,speed*dt),baseDx=(point.x-unit.x)/d*step,baseDy=(point.y-unit.y)/d*step;let dx=baseDx,dy=baseDy;
  for(const other of this.state.units){if(d<3||other===unit||other.hp<=0)continue;const gap=distance(unit,other);if(gap<12&&gap>.1){dx+=(unit.x-other.x)/gap*(12-gap)*dt*.65;dy+=(unit.y-other.y)/gap*(12-gap)*dt*.65;}}
  let destination={x:unit.x+dx,y:unit.y+dy};if(!this.nav.lineClear(unit,destination)||((dx!==baseDx||dy!==baseDy)&&!this.nav.lineClear(destination,point))){dx=baseDx;dy=baseDy;destination={x:unit.x+dx,y:unit.y+dy};}if(this.nav.lineClear(unit,destination)){unit.x+=dx;unit.y+=dy;unit.heading=Math.atan2(-dx,dy);return true;}unit.repath=(unit.repath??0)+dt;if(unit.repath>1){unit.repath=0;const target=unit.task?.targetId?this.entity(unit.task.targetId):null;unit.path=target&&['build','repair'].includes(unit.task.type)?this.workPath(unit,target)??[]:this.nav.findPath(unit,target??unit.task??point)??[];}return false;
 }
 updateBuilder(unit,dt){
  unit.rig??=createBuilderState();unit.rig.lastStepQ={...unit.rig.q};unit.builderWorking=false;unit.builderContact=null;
  let target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  if(unit.task?.targetId&&(!target||unit.task.type==='build'&&target.completed||unit.task.type==='repair'&&target.hp>=target.maxHp)){unit.task=null;unit.path=[];target=null;}
  const isWork=target&&['build','repair'].includes(unit.task?.type),parked=isWork&&!unit.path.length&&distance(unit,this.workPoint(target,unit.task.workOffset??0))<=this.config.builderRangeMetres;
  const heading=parked?desiredBuilderHeading(target,!!this.config.units[target.kind]):unit.heading,turn=angleDelta(heading,unit.heading),aligned=Math.abs(turn)<.01;
  const targetMoving=target&&this.config.units[target.kind]&&Math.hypot(target.x-target.previousX,target.y-target.previousY)>.05;
  const solution=parked&&aligned&&!targetMoving?workContact(unit,target,this.config,this.field):null;
  const pose=vehiclePose(unit,this.field,this.config.worldScale);stepBuilderRig(unit.rig,solution,dt,target?.id??null,q=>builderClearOfGround(q,pose,this.field)&&(!solution||builderClearOfTarget(q,pose,solution)));unit.tool=unit.rig.progress;unit.foldTime=!solution&&unit.rig.phase!=='stowed'?1:0;
  if(unit.rig.phase!=='stowed'&&!solution)return;
  if(parked&&!aligned){if(unit.rig.phase==='stowed')unit.heading+=Math.sign(turn)*Math.min(Math.abs(turn),BUILDER.rates.yaw*dt);return;}
  if(solution){
   unit.aimTarget={x:target.x,y:target.y};unit.builderContact=solution.world;
   if(!unit.rig.ready||!builderClearOfGround(unit.rig.q,vehiclePose(unit,this.field,this.config.worldScale),this.field))return;
   const tip=forwardBuilder(unit.rig.q).tip;if(Math.hypot(...tip.map((v,i)=>v-solution.local[i]))>.002)return;
   // Commit work after every unit has moved, so repair cannot depend on array order.
   unit.builderWorking=true;
   return;
  }
  if(isWork&&!unit.path.length&&this.state.time-(unit.lastRepath??-10)>1){unit.path=this.workPath(unit,target)??[];unit.lastRepath=this.state.time;}
  if(unit.rig.phase==='stowed'){this.move(unit,dt);if(unit.task?.type==='move'&&!unit.path.length){if(distance(unit,unit.task)<24)unit.task=null;else if(this.state.time-(unit.lastRepath??-10)>1){unit.path=this.nav.findPath(unit,unit.task)??[];unit.lastRepath=this.state.time;}}}
 }
 finalizeBuilderContacts(dt){
  for(const unit of this.state.units){if(unit.hp<=0||!unit.builderWorking)continue;const target=this.entity(unit.task?.targetId),contact=target?workContact(unit,target,this.config,this.field):null;if(!contact){unit.builderWorking=false;continue;}
   const previous=unit.rig.lastStepQ??unit.rig.q,withinRates=Object.keys(contact.q).every(key=>Math.abs(contact.q[key]-previous[key])<=BUILDER.rates[key]*dt+1e-6),moving=this.config.units[target.kind]&&Math.hypot(target.x-target.previousX,target.y-target.previousY)>.05;
   if(!withinRates||moving){unit.builderWorking=false;continue;}
   unit.rig.q=contact.q;unit.builderContact=contact.world;
   if(unit.task.type==='build'&&!target.completed){target.progress=Math.min(1,target.progress+dt/this.buildingSpec(target).seconds);if(target.progress>=1){target.completed=true;this.state.statistics.buildingsCompleted++;this.emit('construction-complete',{kind:target.kind,building:target.id});}}
   else if(unit.task.type==='repair'&&target.hp<target.maxHp&&this.state.energy>=dt*1.5){target.hp=Math.min(target.maxHp,target.hp+dt*40);this.state.energy-=dt*1.5;}
   else unit.builderWorking=false;
  }
 }
 updateUnit(unit,dt){
  if(unit.hp<=0)return;unit.previousX=unit.x;unit.previousY=unit.y;unit.cooldown=Math.max(0,unit.cooldown-dt);const spec=this.unitSpec(unit);
  if(spec.role==='builder'){this.updateBuilder(unit,dt);return;}
  if(unit.foldTime>0){unit.foldTime=Math.max(0,unit.foldTime-dt);unit.tool=Math.max(0,unit.tool-dt/2.6);return;}
  let target=unit.task?.targetId?this.entity(unit.task.targetId):null;
  if(unit.task?.targetId&&(!target||unit.task.type==='build'&&target.completed)){unit.task=null;unit.path=[];if(unit.tool>.01)unit.foldTime=2.6;target=null;}
  if(unit.owner==='scavs'){
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
 updateEconomy(dt){
  const structures=this.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed),generators=structures.filter(b=>b.kind==='generator'),wells=structures.filter(b=>b.kind==='derrick');this.state.oilLinked=Math.min(wells.length,generators.length*4);this.state.powered=this.state.oilLinked>0;let use=0;for(const b of structures)if(b.queue.length||b.research)use+=this.buildingSpec(b).power??0;this.state.energyRate=this.state.powered?this.state.oilLinked*5-use:0;this.state.energy=clamp(this.state.energy+this.state.energyRate*dt,0,this.config.energyCapacity);
  for(const building of structures){building.cooldown=Math.max(0,building.cooldown-dt);const spec=this.buildingSpec(building);if(spec.damage){const target=this.nearestEnemy(building,spec.range);if(target)this.attack(building,target,spec);}if(!this.state.powered)continue;
   if(building.queue.length){const item=building.queue[0],unitSpec=this.config.units[item.kind];item.progress=Math.min(1,item.progress+dt/unitSpec.seconds);if(item.progress>=1){const local=spec.exitAnchor,c=Math.cos(building.rotation),s=Math.sin(building.rotation),point={x:building.x+(local[0]*c-local[1]*s)*this.config.worldScale,y:building.y+(local[0]*s+local[1]*c)*this.config.worldScale},exit=this.nav.nearest(point.x,point.y,5);if(exit&&!this.state.units.some(u=>u.hp>0&&distance(u,exit)<14)){const unit=this.addUnit(item.kind,'rai',exit),slot=building.producedCount??0,side=(slot%3-1)*24,forward=-42-Math.floor(slot/3)%3*24,rally=building.rally??{x:point.x+side*c-forward*s,y:point.y+side*s+forward*c};unit.heading=building.rotation+Math.PI;unit.path=this.nav.findPath(unit,rally)??[];unit.task={type:'move',x:rally.x,y:rally.y};building.producedCount=slot+1;building.queue.shift();this.state.statistics.produced++;this.emit('unit-produced',{unit:unit.id,kind:unit.kind,first:this.state.statistics.produced===1});}}}
   if(building.research){const task=building.research;task.progress=Math.min(1,task.progress+dt/this.config.research[task.key].seconds);if(task.progress>=1){this.state.research[task.key]=true;this.emit('research-complete',{key:task.key});this.cinematic('research-'+task.key);building.research=null;}}
  }
 }
 updateFog(){
  this.visible.fill(0);const stamp=(item,vision)=>{const [gx,gy]=this.field.worldToGrid(item.x,item.y),r=vision/32,b=this.state.bounds;for(let row=Math.max(0,Math.floor(gy-r));row<=Math.min(127,Math.ceil(gy+r));row++)for(let col=Math.max(0,Math.floor(gx-r));col<=Math.min(127,Math.ceil(gx+r));col++)if(col>=b[0]&&col<=b[2]&&row>=b[1]&&row<=b[3]&&Math.hypot(col-gx,row-gy)<=r){this.visible[row*128+col]=255;this.explored[row*128+col]=255;}};
  for(const unit of this.state.units)if(unit.owner==='rai'&&unit.hp>0)stamp(unit,this.unitSpec(unit).vision);for(const b of this.state.buildings)if(b.owner==='rai'&&b.hp>0&&b.completed)stamp(b,this.buildingSpec(b).vision);
 }
 updateMission(){
  const s=this.state,captured=s.camps.filter(c=>c.cleared).length;
  for(const camp of s.camps){if(camp.cleared)continue;const hostile=[...s.units,...s.buildings].some(e=>e.campId===camp.id&&e.hp>0);if(!hostile){camp.cleared=true;this.emit('camp-cleared',{camp:camp.id});if(camp.artifact&&!camp.artifactSpawned){const point=this.nav.nearest(camp.x+35,camp.y,8)??camp;s.artifacts.push({id:this.id('a'),key:camp.artifact,x:point.x,y:point.y,collected:false});camp.artifactSpawned=true;}}}
  for(const artifact of s.artifacts)if(!artifact.collected&&s.units.some(u=>u.owner==='rai'&&u.hp>0&&distance(u,artifact)<24)){artifact.collected=true;if(!s.artifactKeys.includes(artifact.key))s.artifactKeys.push(artifact.key);this.emit('artifact-collected',{key:artifact.key});if(artifact.key!=='mg-tower')this.cinematic('artifact-'+artifact.key);}
  const enemyVisible=s.units.some(u=>u.owner==='scavs'&&u.hp>0&&this.visibleAt(u.x,u.y));const has=kind=>s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind===kind);
  if(!s.flags.contact&&(enemyVisible||(has('factory')&&has('lab')&&s.statistics.produced>0))){s.flags.contact=true;this.cinematic('first-contact');s.flags.raidAt=s.time+12;}
  if(s.flags.contact&&!s.flags.raidStarted&&s.time>=s.flags.raidAt){s.flags.raidStarted=true;const camp=s.camps[0],target=this.field.gridToWorld(this.config.startGrid);s.flags.raidIds=[];for(let i=0;i<4;i++){const point=this.nav.nearest(camp.gate.x+i*18,camp.gate.y-30,5);if(!point)continue;const unit=this.addUnit('raider','scavs',point,{raid:true});unit.path=this.nav.findPath(unit,target)??[];unit.task={type:'move',x:target.x,y:target.y};s.flags.raidIds.push(unit.id);}this.emit('raid-start');}
  if(s.flags.raidStarted&&!s.flags.raidWon&&s.flags.raidIds.length&&s.flags.raidIds.every(id=>!this.entity(id))){s.flags.raidWon=true;this.cinematic('raid-won');}
  const third=s.camps[2];if(!s.flags.thirdSighted&&this.visibleAt(third.x,third.y)){s.flags.thirdSighted=true;this.cinematic('camp3-sighted');}
  if(!s.flags.lastRevealed&&s.camps.filter(c=>c.cleared).length>=3){s.flags.lastRevealed=true;s.bounds=this.config.finalMapBounds.slice();this.rebuildNavigation();this.cinematic('last-camp');this.emit('map-expanded',{bounds:s.bounds});}
  if(s.camps.every(c=>c.cleared)&&has('generator')&&has('derrick')&&has('factory')&&has('lab')&&(has('bunker')||has('mg-tower'))&&s.statistics.produced>0&&Object.keys(this.config.research).every(key=>s.research[key])&&s.flags.raidWon){s.status='victory';this.cinematic('victory');this.cinematic('outro');this.emit('victory');}
  if(!s.units.some(u=>u.owner==='rai'&&u.hp>0&&this.unitSpec(u).role==='builder')&&!s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind==='factory')){s.status='defeat';this.emit('defeat',{reason:'Утрачены строители и производство'});}
 }
 tick(dt){if(this.state.status!=='running'||this.state.pendingCinematics.length)return;this.state.time+=dt;for(const unit of this.state.units)this.updateUnit(unit,dt);this.finalizeBuilderContacts(dt);this.updateEconomy(dt);for(const b of this.state.buildings)if(b.owner==='scavs'&&b.hp>0){b.cooldown=Math.max(0,b.cooldown-dt);const spec=this.buildingSpec(b);if(spec.damage){const enemy=this.nearestEnemy(b,spec.range);if(enemy)this.attack(b,enemy,spec);}}this.fogTimer+=dt;if(this.fogTimer>=.25){this.fogTimer=0;this.updateFog();}this.updateMission();if(this.navigationDirty){this.rebuildNavigation();this.navigationDirty=false;}}
 advance(seconds){this.accumulator+=Math.max(0,seconds);let ticks=0;while(this.accumulator+1e-8>=this.config.simulationStep){this.accumulator-=this.config.simulationStep;this.tick(this.config.simulationStep);ticks++;}return ticks;}
 objectives(){const s=this.state,has=kind=>s.buildings.some(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind===kind);return [{id:'base',name:'Развернуть передовую базу',done:has('generator')&&has('factory')&&has('lab')&&(has('bunker')||has('mg-tower'))},{id:'power',name:'Обеспечить энергоснабжение',done:s.powered},{id:'production',name:'Наладить производство техники',done:s.statistics.produced>0},{id:'research',name:'Организовать научные исследования',done:Object.keys(this.config.research).every(key=>s.research[key]),progress:Object.keys(s.research).length+'/3'},{id:'security',name:s.flags.contact?'Уничтожить четыре лагеря':'Обеспечить безопасность района',done:s.camps.every(c=>c.cleared)&&s.flags.raidWon,progress:s.camps.filter(c=>c.cleared).length+'/4'}];}
 save(){this.updateFog();return JSON.stringify({version:1,mission:this.config.id,serial:this.serial,randomState:this.randomState,accumulator:this.accumulator,fogTimer:this.fogTimer,state:this.state,explored:Array.from(this.explored)});}
 load(json){const data=typeof json==='string'?JSON.parse(json):json;if(data.version!==1||data.mission!==this.config.id||!Array.isArray(data.state?.units)||data.explored?.length!==16384)throw new Error('Несовместимое сохранение');this.state=data.state;this.serial=data.serial;this.randomState=data.randomState;this.explored.set(data.explored);this.events=[];this.effects=[];this.accumulator=data.accumulator??0;this.fogTimer=data.fogTimer??0;this.navigationDirty=false;this.rebuildNavigation();this.updateFog();}
}
