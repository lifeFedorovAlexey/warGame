import {campBaseLayout} from './scav-base-layout.js';

// Relocate existing entities only. A destroyed camp/module stays destroyed,
// player vehicles keep their positions/orders, and no garrison is respawned.
export function migrateScavLayout(mission){
 for(const camp of mission.state.camps){
  if((camp.baseVersion??0)>=2)continue;
  const data=mission.config.camps.find(c=>c.id===camp.id);if(!data)continue;
  const next=mission.field.gridToWorld(data.grid),dx=next.x-camp.x,dy=next.y-camp.y;
  Object.assign(camp,next,{grid:[...data.grid],baseVersion:camp.baseVersion?2:undefined,towerGrids:data.towerGrids});
  const layout=campBaseLayout(camp);if(!layout)continue;camp.gate={...layout.gate};camp.yard={...layout.centre};
  const structures=mission.state.buildings.filter(b=>b.campId===camp.id&&b.owner==='scavs');
  let fence=0,gate=0,tower=0;
  const obsolete=new Set();
  for(const b of structures){
   let p={x:b.x+dx,y:b.y+dy};
   if(b.kind==='scav-barracks'){
    p=layout.barracks;b.rotation=layout.barracksRotation;
    const [w,d]=mission.config.buildings[b.kind].footprintMetres.map(v=>v*mission.config.worldScale/2),swap=Math.abs(Math.sin(b.rotation))>.7;b.halfWidth=swap?d:w;b.halfDepth=swap?w:d;
   }
   else if(b.kind==='scav-store')p=layout.store;
   else if(b.kind==='mg-tower')p=b.scavVariant?.startsWith('watch-')?layout.towers[Number(b.scavVariant.slice(6))]:data.towerGrids?.[tower]?mission.field.gridToWorld(data.towerGrids[tower++]):p;
   else if(b.kind==='scav-fence'){
    p=layout.fences[fence++];if(!p){if(b.hp>0)obsolete.add(b.id);continue;}
    b.fenceSpan=p.length/mission.config.worldScale;b.rotation=p.rotation;
    const half=p.length/2,thin=.7*mission.config.worldScale/2;b.halfWidth=Math.abs(Math.sin(p.rotation))>.7?thin:half;b.halfDepth=Math.abs(Math.sin(p.rotation))>.7?half:thin;
   }else if(b.kind==='scav-gate'){p=layout.gatePosts[gate++];if(p)b.rotation=p.rotation;}
   if(!p||b.hp<=0)continue;
   Object.assign(b,{x:p.x,y:p.y});
   b.groundHeight=Math.min(...[-1,1].flatMap(x=>[-1,1].map(y=>mission.field.heightAt(b.x+x*b.halfWidth,b.y+y*b.halfDepth))));
   if(b.kind==='scav-fence'){
    b.groundHeight=mission.field.heightAt(b.x,b.y);b.fenceProfile=[-.5,0,.5].map(t=>(mission.field.heightAt(b.x+Math.cos(b.rotation)*p.length*t,b.y+Math.sin(b.rotation)*p.length*t)-b.groundHeight)/mission.config.worldScale);
   }
  }
  if(obsolete.size)mission.state.buildings=mission.state.buildings.filter(b=>!obsolete.has(b.id));
 }
}
