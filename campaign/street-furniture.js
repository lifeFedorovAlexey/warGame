import {vehicleSweep,vehicleRadiusBound,sweepGap} from './vehicle-collision.js';
import {isInfantry} from './scav-unit-profiles.js';
import {angleDelta} from './builder-kinematics.js';
import {kickContactRock} from './vehicle-contact-rock.js';
import {ensureSalvage,SALVAGE_LIMITS} from './vehicle-salvage.js';

export const LAMP_FALL_SECONDS=1.1;
export function streetLampSites(field,config){
  if(!config.startGrid)return [];
  const start=field.gridToWorld(config.startGrid);
  // The east lamp leaves room for the builder's existing approach from camp.
  return [-210,-144,-78,-12,78,120].map((offset,i)=>({
    id:'street-lamp-'+i,x:start.x+offset,y:start.y+(i%2?1:-1)*22.3,angle:i%2?0:Math.PI,
  })).concat({id:'street-lamp-yard',...field.gridToWorld([14.35,50.9]),angle:0});
}
const caches=new WeakMap();
function layout(mission){
  let cache=caches.get(mission);if(cache)return cache;
  const sites=streetLampSites(mission.field,mission.config),cell=16*mission.config.worldScale,buckets=new Map();
  for(const site of sites){const key=Math.floor(site.x/cell)+','+Math.floor(site.y/cell);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(site);}
  cache={sites,cell,buckets};caches.set(mission,cache);return cache;
}
// Poles use the same swept oval as vehicle traffic.
export function vehicleHitsLamp(unit,lamp,field,scale){
  const from={...unit,x:unit.previousX??unit.x,y:unit.previousY??unit.y,heading:unit.previousHeading??unit.heading??0};
  const sweep=vehicleSweep(from,unit,scale,field);
  return sweepGap(sweep,{x:lamp.x,y:lamp.y,radius:.075*scale})<=0;
}
export function updateStreetFurniture(mission){
  const {sites,cell,buckets}=layout(mission);if(!sites.length)return;
  const broken=mission.state.streetFurniture??={},scale=mission.config.worldScale;
  for(const unit of mission.state.units){
    if(unit.hp<=0||isInfantry(unit))continue;
    const ax=unit.previousX??unit.x,ay=unit.previousY??unit.y,dx=unit.x-ax,dy=unit.y-ay,length=Math.hypot(dx,dy);
    if(length<.001)continue; // Parking nearby and loading a save are not impacts.
    const turn=angleDelta(unit.heading??0,unit.previousHeading??unit.heading??0);
    const radius=vehicleRadiusBound(unit.kind,scale)+.075*scale+.012+.5*length*Math.tan(Math.abs(turn)/4)+vehicleRadiusBound(unit.kind,scale)*(1-Math.cos(turn/4));
    for(let y=Math.floor((Math.min(ay,unit.y)-radius)/cell);y<=Math.floor((Math.max(ay,unit.y)+radius)/cell);y++){
      for(let x=Math.floor((Math.min(ax,unit.x)-radius)/cell);x<=Math.floor((Math.max(ax,unit.x)+radius)/cell);x++){
        for(const lamp of buckets.get(x+','+y)??[]){
          if(broken[lamp.id])continue;
          const t=Math.max(0,Math.min(1,((lamp.x-ax)*dx+(lamp.y-ay)*dy)/(length*length)));
          if((lamp.x-ax-dx*t)**2+(lamp.y-ay-dy*t)**2>radius*radius||!vehicleHitsLamp(unit,lamp,mission.field,scale))continue;
          const direction=[dx/length,dy/length],now=mission.state.time,salvage=ensureSalvage(mission),id='scrap-'+(++salvage.serial);
          // The pickup is the same fallen pole rendered by the yard layer.
          const item={id,stock:'tube-stock',sourceKind:'street-lamp',sourceProp:lamp.id,x:lamp.x+direction[0]*2.3*scale,y:lamp.y+direction[1]*2.3*scale,
            heading:Math.atan2(-direction[0],direction[1]),bornAt:now,readyAt:now+LAMP_FALL_SECONDS,expiresAt:now+SALVAGE_LIMITS.lifetime};
          if(salvage.items.length>=SALVAGE_LIMITS.items)salvage.items.shift();salvage.items.push(item);
          broken[lamp.id]={brokenAt:now,direction,salvageId:id};
          kickContactRock(unit,[-direction[0],-direction[1]],Math.min(2,length/(mission.config.simulationStep??.1)/scale),now);
          mission.emit?.('scenery-broken',{prop:lamp.id,unit:unit.id});
        }
      }
    }
  }
}
