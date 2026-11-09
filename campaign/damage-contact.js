import {vehiclePose,worldToVehicle,worldDirectionToVehicle} from './builder-kinematics.js';
import {combatContact} from './combat-contact.js';
import {createDamageState,applyDamageHit,normalize} from './damage-state.js';
import {salvageFromImpact} from './vehicle-salvage.js';
import {isInfantry} from './scav-unit-profiles.js';
import {kickWeaponRock} from './vehicle-contact-rock.js';
import {ignite} from './burning.js';

export function recordDamage(mission,target,amount,source,contact){
  if(mission.damageEnabled===false)return null; // reproducible benchmark baseline only
  const type=contact?.type??(source?.kind==='flamer'||mission.config.units[source?.kind]?.weapon==='flame'?'fire':'bullet');
  // Collision energy drives local plastic deformation; hull HP is a separate
  // gameplay scale. Ordinary weapon damage retains its existing amount.
  const power=type==='collision'&&Number.isFinite(contact?.kineticPower)?contact.kineticPower:amount;
  let hit=contact??mission.resolveDamageContact?.(source,target,{power:amount,type});
  const mobile=!!mission.config.units[target.kind];
  if(!hit){
    const from=source??{x:target.x,y:target.y-100};
    const p=combatContact(from,target,mission.config,mission.field),worldPoint=[p.x,p.y,p.z];
    const worldDirection=normalize([p.x-from.x,p.y-from.y,0]);
    let point,direction;
    if(mobile){const pose=vehiclePose(target,mission.field,mission.config.worldScale);point=worldToVehicle(worldPoint,pose);direction=worldDirectionToVehicle(worldDirection,pose);}
    else{const a=target.rotation??0,c=Math.cos(a),s=Math.sin(a),scale=mission.config.worldScale;point=[((p.x-target.x)*c+(p.y-target.y)*s)/scale,(-(p.x-target.x)*s+(p.y-target.y)*c)/scale,(p.z-(target.groundHeight??mission.field.heightAt(target.x,target.y)))/scale];direction=[worldDirection[0]*c+worldDirection[1]*s,-worldDirection[0]*s+worldDirection[1]*c,worldDirection[2]];}
    hit={point,normal:direction.map(x=>-x),direction,worldPoint,worldDirection,worldNormal:worldDirection.map(x=>-x),partId:0,partSpec:isInfantry(target)?{material:'equipment',strength:10000}:{material:mobile?'metal':'concrete'}};
  }
  const start=performance.now(),state=target.damage??=createDamageState(hit.binding?.cageBounds);
  const result=applyDamageHit(state,{...hit,type,power},hit.partSpec,{deform:mobile&&!isInfantry(target)&&hit.binding?.deform!==false});
  if(!contact?.burningTick){
    if(type==='fire')ignite(target,{...hit,power},mission.state?.time??0,source?.id);
    else if(mobile&&!isInfantry(target))kickWeaponRock(target,{...hit,type,power},mission.state?.time??0,mission.config.units[source?.kind]?.weapon??'mg');
  }
  state.lastImpact={direction:hit.worldDirection??hit.direction,point:hit.point,power,partId:hit.partId};
  result.secondaryFailures=mission.onDamageImpact?.(target,{...hit,type,power})??[];
  salvageFromImpact(mission,target,{...hit,type,power},result);
  mission.onDamageMeasured?.(performance.now()-start,result.deformationMs);
  return {...hit,type,power,result};
}
