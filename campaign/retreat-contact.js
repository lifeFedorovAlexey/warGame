import {vehicleDynamics,steeringManeuverReady} from './vehicle-dynamics.js';
import {damageMobility,createDamageState,applyDamageHit} from './damage-state.js';
import {vehicleSweep,sweepClearsVehicle,trafficCollisionRequired,vehicleRadiusBound} from './vehicle-collision.js';
import {bodyEnvelope,bodyContact} from './vehicle-overlap.js';
import {fallbackVehicleImpact,vehicleContact} from './vehicle-impact.js';
import {kickContactRock} from './vehicle-contact-rock.js';
import {invalidateTrafficCorridors} from './traffic-corridor.js';
import {navigationDecision} from './navigation-state.js';
import {isInfantry} from './scav-unit-profiles.js';
import {roadDrivingLane} from './road-merge.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const transfer=u=>['entering','inside','leaving','departure'].includes(u.factoryVisit?.phase);
export const retreatUrgency=u=>u.combatRetreat?clamp(1-u.hp/Math.max(1,u.maxHp),0,1):0;
export const retreatSpeed=(u,speed)=>u.hp>0&&u.combatRetreat&&!transfer(u)?speed*(1+.18*retreatUrgency(u)**2):speed;
export const retreatPushDelay=u=>.15+1.25*(1-retreatUrgency(u))**2;
// Relative speed is in m/s. Gentle contact up to 9 km/h is harmless;
// the quadratic ramp reaches the owner's 30 HP limit at 100 km/h.
export const retreatContactDamage=speed=>30*Math.min(1,Math.max(0,speed*3.6-9)/91)**2;
const active=u=>u.hp>0&&!!u.combatRetreat&&u.path?.length&&!u.pendingOrder&&!u.proposedOrder
 &&!u.jointTraffic&&!u.yieldReturn&&!transfer(u)&&!isInfantry(u);
const bodySweep=vehicleSweep;
export function holdRetreatYield(m,unit){
 const lease=unit.retreatYield;if(!lease)return false;
 const driver=m.entity(lease.driver),scale=m.config.worldScale;
 const ahead=driver?(unit.x-driver.x)*-Math.sin(driver.heading)+(unit.y-driver.y)*Math.cos(driver.heading):0;
 if(!driver?.combatRetreat||!driver.path?.length||driver.pendingOrder||driver.commandRevision!==lease.driverRevision
  ||unit.commandRevision!==lease.revision||unit.pendingOrder||transfer(unit)||m.state.time>=lease.until
  ||ahead<-scale*4.5||Math.hypot(driver.x-unit.x,driver.y-unit.y)>scale*8){delete unit.retreatYield;return false;}
 unit.driveSpeed=0;navigationDecision(unit,'YIELDING','retreat-contact-yield',driver.id,'let-retreat-pass');return true;
}
function clear(m,unit,from,to,ignored){
 if(!m.inBounds(to.x,to.y)||m.vehicleTerrainSweep(unit,from,to)===false)return false;
 const scale=m.config.worldScale,range=Math.hypot(to.x-from.x,to.y-from.y)+vehicleRadiusBound(unit.kind,scale)*Math.SQRT2+scale*15;
 const sweep=bodySweep(from,to,scale,m.field);
 if(!m.nav.clearSolidSweep(sweep,m.nav.nearbySolids(from,range)))return false;
 for(const other of m.nearbyUnits(from,range)){
  if(other===unit||ignored.has(other.id)||other.hp<=0||!trafficCollisionRequired(unit,other))continue;
  if(!sweepClearsVehicle(sweep,bodyEnvelope(other,scale,m.field),scale*.055))return false;
 }
 return true;
}

// One hit per contact incident, not damage on every frame of a sustained push.
// HP and visual crumpling deliberately use different scales. Bump damage never
// detaches wheels/weapons, ignites a vehicle, or converts a living hull to a wreck.
export function applyRetreatContact(m,driver,other,closing,contact){
 const pairs=m.state.retreatContactPairs??=[],ids=[driver.id,other.id].sort(),key=ids.join('|'),now=m.state.time;
 const prior=pairs.find(p=>p.key===key);
 if(prior&&now-prior.at<3)return null;
 if(prior)prior.at=now;else pairs.push({key,at:now});if(pairs.length>128)pairs.shift();
 const scale=m.config.worldScale,losses=[];
 for(const [target,sign] of [[driver,-1],[other,1]]){
  const direction=contact.normal.map(n=>n*sign),point=[...contact.point];
  point[2]=m.field.heightAt(point[0],point[1])+1.2*scale;
  kickContactRock(target,direction,closing,now);
  const hp=target.hp,loss=Math.min(Math.max(0,hp-1),retreatContactDamage(closing));
  target.hp=hp-loss;losses.push(loss);
  if(closing>1&&m.damageEnabled!==false){
   const hit=m.resolveVehicleImpact?.(target,point,direction)??fallbackVehicleImpact(target,point,direction,m.field,scale);
   // A contact marks the actual surface, while the shared body cage supplies
   // the local dent. Cosmetic impacts cannot destroy a detachable component.
   const power=Math.min(80,16+(closing-1)*7),state=target.damage??=createDamageState();
   applyDamageHit(state,{...hit,partId:0,type:'collision',power},{material:'metal'},{deform:true});
   state.lastImpact={direction,point:hit.point,power,partId:0};
  }
 }
 const result={unit:driver.id,target:other.id,units:[driver.id,other.id],closingSpeed:closing,losses,urgency:retreatUrgency(driver)};
 m.emit('retreat-contact',result);return result;
}

// A bounded two-body translation owns just this tick. Terrain, third vehicles
// and the common vehicle sweep remain solid; no pass-through flag is granted.
export function stepRetreatContact(m,unit,dt,integrate){
 if(!(dt>0))return false;
 if(!active(unit)||!steeringManeuverReady(unit,dt)){delete unit.retreatPush;return false;}
 const scale=m.config.worldScale,dynamics=vehicleDynamics(unit),routeGoal=unit.path.find(p=>Math.hypot(p.x-unit.x,p.y-unit.y)>scale*3)??unit.path.at(-1);
 const lane=roadDrivingLane(m,unit,routeGoal,scale),goal=lane??routeGoal;
 const gx=goal.x-unit.x,gy=goal.y-unit.y,remaining=Math.hypot(gx,gy),turn=wrap(Math.atan2(-gx,gy)-unit.heading);
 if(remaining<scale*4||Math.abs(turn)>.6||unit.reversing){delete unit.retreatPush;return false;}
 const fx=-Math.sin(unit.heading),fy=Math.cos(unit.heading),rx=fy,ry=-fx;
 const speed=retreatSpeed(unit,m.unitSpec(unit).speed*m.nav.roads.factor(unit.x,unit.y)*damageMobility(unit.damage));
 const reach=speed*speed/(2*dynamics.braking)+scale*9,shape=bodyEnvelope(unit,scale,m.field);
 let other,best=Infinity;
 for(const body of m.nearbyUnits(unit,reach)){
  if(body===unit||body.hp<=0||isInfantry(body)||transfer(body)||!trafficCollisionRequired(unit,body))continue;
  if(active(body)&&(retreatUrgency(body)>retreatUrgency(unit)+.01||Math.abs(retreatUrgency(body)-retreatUrgency(unit))<=.01&&body.id<unit.id))continue;
  const dx=body.x-unit.x,dy=body.y-unit.y,along=dx*fx+dy*fy,side=dx*rx+dy*ry;
  const bodyShape=bodyEnvelope(body,scale,m.field),width=Math.hypot(bodyShape.width*bodyShape.c*rx+bodyShape.width*bodyShape.s*ry,bodyShape.depth*(bodyShape.c*ry-bodyShape.s*rx));
  if(along<=0||along>remaining+scale||Math.abs(side)>shape.width+width+scale*.1)continue;
  const forward=(body.driveSpeed??0)*(body.reversing?-1:1)*(-Math.sin(body.heading)*fx+Math.cos(body.heading)*fy);
  if(forward>=speed*.85||along>=best)continue;
  other=body;best=along;
 }
 if(!other){delete unit.retreatPush;return false;}
 let plan=unit.retreatPush;
 if(!plan||plan.target!==other.id||plan.revision!==unit.commandRevision){
  plan=unit.retreatPush={target:other.id,revision:unit.commandRevision,since:m.state.time,side:Math.sign((other.x-unit.x)*rx+(other.y-unit.y)*ry)||1,contact:false};
 }
 if(m.state.time-plan.since<retreatPushDelay(unit))return false;
 const steering=clamp(Math.atan(2*dynamics.wheelbase*scale*Math.sin(turn)/Math.max(scale*3,speed)),-dynamics.steeringLimit,dynamics.steeringLimit);
 const requested=Math.min(speed,Math.sqrt(2*dynamics.braking*Math.max(0,remaining-.5)));
 const next=integrate(unit,{speed:requested,steering,time:m.state.time,fault:unit.steeringFault},dt,scale);
 const ignored=new Set([unit.id,other.id]);
 if(!clear(m,unit,unit,next,ignored))return false;
 const sweep=bodySweep(unit,next,scale,m.field),obstacle=bodyEnvelope(other,scale,m.field),skin=scale*.055;
 const touching=!sweepClearsVehicle(sweep,obstacle,skin);
 let displaced;
 if(touching){
  const distance=Math.hypot(next.x-unit.x,next.y-unit.y);
  if(distance<.001||bodyContact(shape,obstacle).gap<-.01)return false;
  // Keep the forward separation while shoving toward the nearest free side.
  // Translation is bounded by this tick's actual travel, not a teleport to a slot.
  for(const side of plan.contact?[plan.side]:[plan.side,-plan.side]){
   const target={...other,x:other.x+(fx+rx*side*.9)*distance,y:other.y+(fy+ry*side*.9)*distance};
   if(plan.pushStart&&Math.hypot(target.x-plan.pushStart.x,target.y-plan.pushStart.y)>scale*5)continue;
   const relative={...next,x:next.x-(target.x-other.x),y:next.y-(target.y-other.y)};
   if(!clear(m,other,other,target,ignored)||!sweepClearsVehicle(bodySweep(unit,relative,scale,m.field),obstacle,skin))continue;
   displaced=target;plan.side=side;break;
  }
  if(!displaced)return false;
 }
 if(displaced){
  const contact=vehicleContact(unit,other,scale,m.field),v=(other.driveSpeed??0)*(other.reversing?-1:1);
  const closing=Math.max(0,((next.x-unit.x)/dt+Math.sin(other.heading)*v)*contact.normal[0]+((next.y-unit.y)/dt-Math.cos(other.heading)*v)*contact.normal[1])/scale;
  if(!plan.contact){applyRetreatContact(m,unit,other,closing,contact);plan.contact=true;plan.pushStart={x:other.x,y:other.y};}
  const travelled=Math.hypot(displaced.x-other.x,displaced.y-other.y);
  other.x=displaced.x;other.y=displaced.y;other.driveSpeed=0;other.retreatPushedAt=m.state.time;
  // The displaced driver must not immediately steer back into the opened
  // passage. Retain its order and yield briefly until the retreat has passed.
  other.retreatYield={driver:unit.id,driverRevision:unit.commandRevision,revision:other.commandRevision,until:m.state.time+3};
  // Relative manoeuvre proofs cannot survive an external physical impulse.
  if(!other.jointTraffic){delete other.detour;delete other.traffic;delete other.trafficHold;}
  if(other.yieldReturn){other.yieldReturn.failedReturn=true;other.yieldReturn.phase='waiting';other.yieldReturn.legs=[];}
  m.unitIndex.update(other);invalidateTrafficCorridors(m);
  m.emit('retreat-push-step',{unit:unit.id,target:other.id,distance:travelled});
 }
 Object.assign(unit,next);delete unit.detour;delete unit.traffic;delete unit.trafficHold;
 m.trafficCoordinator.routes?.delete(unit.id);m.trafficCoordinator.controls?.delete(unit.id);
 navigationDecision(unit,'MOVING',displaced?'retreat-pushing':'retreat-contact-approach',other.id,'clear-retreat-passage',speed);
 return true;
}
