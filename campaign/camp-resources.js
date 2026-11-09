// Oil rigs are capturable infrastructure, not combat objectives. Their damage
// and identity survive the transfer; a destroyed rig is never respawned.
export function installCampResources(mission){
 const {state,config,field}=mission;
 for(const camp of state.camps){
  const index=config.campOilFields?.[camp.id];if(index===undefined||camp.oilVersion)continue;
  camp.oilVersion=1;const point=field.gridToWorld(config.oilFields[index]);
  const former=(config.oilFieldRelocations??[]).filter(r=>r.to[0]===config.oilFields[index][0]&&r.to[1]===config.oilFields[index][1]).map(r=>field.gridToWorld(r.from));
  const existing=state.buildings.find(b=>b.kind==='derrick'&&[point,...former].some(p=>Math.hypot(b.x-p.x,b.y-p.y)<5));
  if(existing){existing.campId=camp.id;existing.campResource=true;continue;}
  // Older cleared saves already finished this encounter. Do not add enemies,
  // free resources or demolished buildings back into them.
  if(camp.cleared||!state.buildings.some(b=>b.campId===camp.id&&b.kind==='camp-core'&&b.hp>0))continue;
  const well=mission.addStructure('derrick','scavs',point,{campId:camp.id,campResource:true,completed:true,progress:1,powered:true,pumpTime:0,scavVariant:'scav-oil'});
  well.groundHeight=Math.max(...[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=>field.heightAt(well.x+dx*well.halfWidth,well.y+dy*well.halfDepth))));
 }
}

export function captureCampResources(mission,camp){
 let changed=false;
 for(const building of mission.state.buildings){
  if(building.campId!==camp.id||!building.campResource||building.owner!=='scavs'||building.hp<=0)continue;
  building.owner='rai';building.powered=false;building.aimTarget=null;building.cooldown=0;changed=true;
  mission.emit('building-captured',{building:building.id,camp:camp.id,kind:building.kind});
 }
 if(changed){mission.fogTimer=1;mission.linkOilWells(mission.state.buildings.filter(b=>b.owner==='rai'&&b.hp>0&&b.completed),0);}
}
