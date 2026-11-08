import {streetLampSites} from './street-furniture.js';
import {canInstallRecipe,FIELD_RECIPES,modificationInstalled} from './vehicle-salvage.js';

// Uses normal orders, swept prop contacts and the existing optional auto-pickup.
// Stored with openingScene so saving during the fall never creates a second pole.
export function startOpeningSalvage(mission,scene){
  const lamp=streetLampSites(mission.field,mission.config).find(p=>p.id===mission.config.openingSalvageLamp);
  const recipe=FIELD_RECIPES['tube-bumper'];
  const vehicle=mission.state.units.find(u=>u.owner==='rai'&&u.hp>0&&canInstallRecipe(mission,u,recipe));
  if(!lamp||!vehicle||mission.state.streetFurniture?.[lamp.id])return false;
  const goal={x:lamp.x,y:lamp.y+2.3*mission.config.worldScale};
  const result=mission.order([vehicle.id],'move',goal);if(!result.ok)return false;
  scene.salvageDemo={vehicleId:vehicle.id,lampId:lamp.id,goal,status:'approach',startedAt:mission.state.time};
  return true;
}

export function advanceOpeningSalvage(mission,scene){
  const demo=scene.salvageDemo;if(!demo||demo.status==='done')return true;
  const vehicle=mission.entity(demo.vehicleId),now=mission.state.time;
  if(!vehicle){demo.status='done';demo.skipped='vehicle-lost';return true;}
  if(demo.status==='approach'){
    if(modificationInstalled(vehicle,26)){demo.status='show';demo.installedAt=now;}
    else if(!vehicle.task&&(!mission.state.salvage.enabled||!mission.state.salvage.wanted.includes('tube-bumper')||!mission.state.salvage.recipes.includes('tube-bumper'))){
      demo.status='show';demo.installedAt=now;demo.skipped='pickup-disabled';
    }
    return false;
  }
  if(now-demo.installedAt<1.2)return false;
  // Leave the crossing clear. The builder can start while the car parks beyond it.
  const start=mission.field.gridToWorld(mission.config.startGrid),park={x:demo.goal.x,y:start.y+42};
  const result=mission.order([vehicle.id],'move',park);
  if(!result.ok)return false;
  demo.status='done';demo.park=park;return true;
}
