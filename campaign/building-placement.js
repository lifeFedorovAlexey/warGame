import {planFactoryAccess,roadIntersectsSite} from './factory-access.js';
const quarter=Math.PI/2,epsilon=1e-6;
export const buildingGridStep=config=>Math.max(.1,config.buildingGridMetres??8);
export const buildingRotation=angle=>((Math.round(angle/quarter)%4+4)%4)*quarter;
export function buildingHalfSize(spec,scale,angle){
 const [w,d]=spec.footprintMetres.map(n=>n*scale/2);
 return Math.round(buildingRotation(angle)/quarter)%2?[d,w]:[w,d];
}
export function rectanglesOverlap(a,b,padding=0){
 return Math.abs(a.x-b.x)<a.halfWidth+b.halfWidth+padding-epsilon
  &&Math.abs(a.y-b.y)<a.halfDepth+b.halfDepth+padding-epsilon;
}
export function buildingExit(building,spec,scale){
 if(!spec?.exitAnchor)return null;
 const [x,y]=spec.exitAnchor,c=Math.cos(building.rotation),s=Math.sin(building.rotation);
 return {x:building.x+(x*c-y*s)*scale,y:building.y+(x*s+y*c)*scale,
  halfWidth:(Math.abs(c)*14+Math.abs(s)*24)*scale/4.5,halfDepth:(Math.abs(s)*14+Math.abs(c)*24)*scale/4.5};
}
export function snapBuilding(point,nearby,step){
 const result={...point,x:Math.round(point.x/step)*step,y:Math.round(point.y/step)*step};
 const candidates={x:[],y:[]},reach=step*.7;
 for(const b of nearby){
  if(Math.abs(point.y-b.y)<=point.halfDepth+b.halfDepth+reach){
   candidates.x.push(b.x-b.halfWidth-point.halfWidth,b.x+b.halfWidth+point.halfWidth);
  }
  if(Math.abs(point.x-b.x)<=point.halfWidth+b.halfWidth+reach){
   candidates.y.push(b.y-b.halfDepth-point.halfDepth,b.y+b.halfDepth+point.halfDepth);
  }
 }
 for(const axis of ['x','y']){
  const closest=candidates[axis].filter(v=>Math.abs(v-point[axis])<=reach).sort((a,b)=>Math.abs(a-point[axis])-Math.abs(b-point[axis]))[0];
  if(closest!==undefined){result[axis]=closest;result.edgeSnapped=true;}
 }
 // Once beside a building, align matching facade ends as well as its centre.
 if(result.edgeSnapped)for(const b of nearby){
  for(const [axis,other,size,otherSize] of [['x','y','halfWidth','halfDepth'],['y','x','halfDepth','halfWidth']]){
   if(Math.abs(Math.abs(result[other]-b[other])-(point[otherSize]+b[otherSize]))>epsilon)continue;
   const align=[b[axis],b[axis]-b[size]+point[size],b[axis]+b[size]-point[size]];
   const match=align.filter(v=>Math.abs(v-point[axis])<=reach).sort((a,b)=>Math.abs(a-point[axis])-Math.abs(b-point[axis]))[0];
   if(match!==undefined)result[axis]=match;
  }
 }
 return result;
}

export function checkBuildingPlacement(mission,kind,x,y,angle=0,{checkMoney=true,snap=true}={}){
 const {config,field}=mission,spec=config.buildings[kind],rotation=buildingRotation(angle);
 if(!spec)return {ok:false,reason:'Неизвестное здание',x,y,rotation};
 const [halfWidth,halfDepth]=buildingHalfSize(spec,config.worldScale,rotation);
 const structures=[...mission.state.buildings.filter(b=>b.hp>0||b.damage?.wreck),...mission.nav.solids.filter(b=>b.environment)];
 let site={kind,x,y,rotation,halfWidth,halfDepth,blockers:[]};
 if(snap&&!spec.requiresOil)site=snapBuilding(site,structures.filter(b=>mission.exploredAt(b.x,b.y)),buildingGridStep(config));
 if(spec.requiresOil){
  const oil=config.oilFields.map(grid=>field.gridToWorld(grid)).find(p=>Math.hypot(p.x-x,p.y-y)<25);
  if(oil)Object.assign(site,oil);else return {...site,ok:false,reason:'Нужна нефтяная точка'};
 }
 ({x,y}=site);
 const fail=reason=>({...site,ok:false,reason});
 if(!mission.constructionUnlocked(kind))return fail('Строительство ещё не открыто');
 if(spec.requires&&!mission.state.research[spec.requires])return fail('Требуется исследование: '+config.research[spec.requires].name);
 if(checkMoney&&!mission.canSpend(spec.cost))return fail('Недостаточно нефти');
 if(!mission.inBounds(x,y)||!mission.exploredAt(x,y))return fail('Район ещё не разведан');
 const maxGrade=spec.maxBuildingGrade??config.maxBuildingGrade;
 const samples=kind==='factory'?[-1,-.5,0,.5,1]:[-1,0,1];
 let low=Infinity,high=-Infinity;
 for(const dx of samples)for(const dy of samples){
  const px=x+dx*halfWidth,py=y+dy*halfDepth;
  if(!mission.inBounds(px,py)||!mission.exploredAt(px,py))return fail('Пятно застройки выходит за разведанный район');
  const slope=field.gradientAt(px,py);
  if(Math.hypot(slope.x,slope.y)>maxGrade)return fail('Слишком крутой склон');
  const height=field.heightAt(px,py);
  low=Math.min(low,height);high=Math.max(high,height);
 }
 site.height=high;
 // Dimensions are authored in model metres, while terrain heights use the
 // scaled world. The concrete footing takes up the difference under the hall.
 if(high-low>(spec.maxBuildingReliefMetres??config.maxBuildingReliefMetres??1.5)*config.worldScale)return fail('Слишком большой перепад высоты');
 if(!spec.requiresOil)for(const grid of config.oilFields){
  const oil={...field.gridToWorld(grid),halfWidth:config.worldScale*5+5,halfDepth:config.worldScale*5+5};
  if(rectanglesOverlap(site,oil))return fail('Нефтяной участок зарезервирован для вышки');
 }
 if(structures.some(b=>rectanglesOverlap(site,b)))return fail('Пересечение с постройкой');
 const exit=buildingExit(site,spec,config.worldScale);
 for(const b of structures){
  if(b.hp>0&&(b.accessRoads??[]).some(road=>roadIntersectsSite(road,site)))return fail('Нельзя перекрывать подъездную дорогу завода');
  const otherExit=b.hp>0&&buildingExit(b,mission.buildingSpec(b),config.worldScale);
  if(otherExit&&rectanglesOverlap(site,otherExit))return fail('Нельзя перекрывать выезд завода');
  if(exit&&rectanglesOverlap(exit,b))return fail('Для выезда завода нет места');
  const entrySpec=mission.buildingSpec(b),otherEntry=b.hp>0&&entrySpec.entryAnchor&&buildingExit(b,{exitAnchor:entrySpec.entryAnchor},config.worldScale);
  if(otherEntry&&rectanglesOverlap(site,otherEntry))return fail('Нельзя перекрывать въезд завода');
  const entry=spec.entryAnchor&&buildingExit(site,{exitAnchor:spec.entryAnchor},config.worldScale);
  if(entry&&rectanglesOverlap(entry,b))return fail('Для въезда завода нет места');
 }
 const blockers=mission.siteUnits({...site,kind});
 site.blockers=blockers.map(u=>u.id);
 if(blockers.some(u=>u.damage?.wreck))return fail('Площадку занимает остов машины');
 if(blockers.some(u=>u.owner!=='rai'))return fail('На площадке противник');
 const work=spec.workAnchor,c=Math.cos(rotation),s=Math.sin(rotation);
 const wx=x+(work[0]*c-work[1]*s)*config.worldScale,wy=y+(work[0]*s+work[1]*c)*config.worldScale;
 const [col,row]=mission.nav.grid(wx,wy);let approach=false;
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const p=mission.nav.position(col+dx,row+dy);
  if(mission.nav.allowed(col+dx,row+dy)&&Math.hypot(p.x-wx,p.y-wy)<=config.builderRangeMetres
   &&(Math.abs(p.x-x)>=halfWidth+mission.nav.clearance||Math.abs(p.y-y)>=halfDepth+mission.nav.clearance))approach=true;
 }
 if(!approach)return fail('Нет площадки для подъезда строителя');
 if(kind==='factory'){
  const access=planFactoryAccess(mission,site);site.accessRoads=access.roads;
  if(!access.ok)return fail(access.reason);
  // A deeper footing can support the hall on a cross slope. Both thresholds
  // still need to be close to the ground across the full driveway width.
  const maxGateRelief=(spec.maxGateReliefMetres??Infinity)*config.worldScale;
  for(const road of access.roads){
   const door=road.points[0];
   for(const side of [-.5,0,.5]){
    const ground=field.heightAt(door.x+side*road.width*c,door.y+side*road.width*s);
    if(Math.abs(high-ground)>maxGateRelief)return fail('Слишком большой перепад высоты у ворот завода');
   }
  }
 }
 return {...site,ok:true};
}
