import layout from '../assets/campaign/alpha/mission02/layout.js';
import {campBaseLayout} from './scav-base-layout.js';
import {M02} from './mission02-config.js';

// Old m01 saves placed Petrovich's headquarters on cam1b's western factory
// plateau. An empty footprint is still conquered territory after wreck cleanup.
export function clearedCampAtM02Site(mission,site){
 const p=mission.field.gridToWorld(site.grid);
 return mission.state.camps.find(camp=>{
  if(!camp.cleared)return false;
  const bounds=campBaseLayout(camp)?.bounds;
  return bounds&&p.x>=bounds[0]&&p.x<=bounds[2]&&p.y>=bounds[1]&&p.y<=bounds[3];
 });
}

export function inheritClearedM02Site(mission,base,site,camp){
 const s=mission.state,key=M02.technologies[site.id];
 const carrier=site.structures.find(b=>b.kind===(site.id==='energy_hub'?'generator':site.id==='sensor_outpost'?'scav-sensor':'scav-factory'));
 const point={...(camp.gate??camp)};
 base.inheritedFrom=camp.id;base.discovered=true;base.state='neutralized';base.neutralizedAt??=s.time;
 base.structureIds=[];base.garrisonIds=[];base.gate=point;base.rally=[];
 if(base.production){base.production.active=false;base.production.stopped=true;base.production.waiting=[];}
 base.productionObserved=false;
 base.artifact??={id:'m02.artifact.'+key.replaceAll('-','_'),key,carrierId:carrier.id,carrierPosition:mission.field.gridToWorld(carrier.grid),point,state:'sealed'};
 const artifact=base.artifact;
 if(artifact.state==='sealed'){
  artifact.point=point;artifact.state=s.research[key]||s.artifactKeys.includes(key)?'collected':'available';
 }
 if(artifact.state==='available'&&!s.artifacts.some(a=>a.id===artifact.id))s.artifacts.push({id:artifact.id,key:artifact.key,...artifact.point,collected:false,mission:'m02'});
}

// Repair already-started saves without combat, extra kills or moving the army.
// Only living hostile objects mistakenly created for this m02 site are removed;
// actual wrecks, captured resources and all player objects keep their history.
export function restoreM02Continuity(mission){
 const s=mission.state,m=s.m02;if(!m||m.version<2||m.continuityVersion===1)return false;
 const removed=new Set();let changed=false;
 for(const site of layout.bases){
  const base=m.bases[site.id],camp=clearedCampAtM02Site(mission,site);if(!base||!camp)continue;
  const ids=new Set([...base.structureIds,...base.garrisonIds]);
  for(const e of [...s.buildings,...s.units])if(e.owner==='scavs'&&e.hp>0&&(ids.has(e.id)||e.m02Base===site.id))removed.add(e.id);
  inheritClearedM02Site(mission,base,site,camp);changed=true;
 }
 if(removed.size){
  s.buildings=s.buildings.filter(e=>!removed.has(e.id));s.units=s.units.filter(e=>!removed.has(e.id));
  s.projectiles=(s.projectiles??[]).filter(p=>!removed.has(p.sourceId));
  for(const group of m.groups??[])group.units=group.units.filter(id=>!removed.has(id));
  m.groups=(m.groups??[]).filter(g=>g.units.length);
  for(const unit of s.units)if(removed.has(unit.task?.targetId)){unit.task=null;unit.path=[];delete unit.routeOrder;delete unit.combatDeployment;}
 }
 m.continuityVersion=1;return changed;
}
