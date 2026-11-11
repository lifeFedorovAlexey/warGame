import authored from '../assets/campaign/alpha/mission02/roads.js';
import {applyRoadGrades} from '../demo/road-grading.js';
import {gradeM02Courts} from './mission02-grading.js';
import {installRiverTerrain} from './river-terrain.js';

// Prepare the shared terrain mesh once. Roads and level openings are activated
// separately: the southern bases do not exist during the first mission.
export function installM02Terrain(field){
 if(!field.navigation||field.m02Roads)return field.m02Roads??[];
 field.m02Roads=authored.paths;
 const navigation=field.navigation,network=field.roadNetwork;
 gradeM02Courts(field);
 if(!field.m02Authoring&&authored.version>=3){
  field.m02Grading=applyRoadGrades(field,{paths:authored.paths,grading:{enabled:true,maxChangeMetres:authored.maxGradeChange??6}});
  field.roadNetwork=network;
 }
 // The source texture is cut by replaceAreas. Trim the corresponding route
 // too, so vehicle surface costs, paving and factory entrances agree with it.
 const southernNetwork=!field.m02Authoring?{...network,paths:network.paths.flatMap(road=>{
  const start=authored.sourceRoadStarts?.find(e=>e.id===road.id),end=authored.sourceRoadEnds?.find(e=>e.id===road.id);
  const span=authored.sourceRoadSpans?.find(e=>e.id===road.id);
  if(span)return [
   {...road,from:start?undefined:road.from,to:undefined,points:[...(start?[start.point]:[]),...road.points.slice(start?start.afterIndex+1:0,span.fromIndex+1)]},
   {...road,id:road.id+'-after-'+span.road,from:undefined,points:road.points.slice(span.toIndex)},
  ];
  if(start)return {...road,from:undefined,points:[start.point,...road.points.slice(start.afterIndex+1)]};
  return end?{...road,to:undefined,points:[...road.points.slice(0,end.afterIndex+1),end.point]}:road;
 })}:network;
 installRiverTerrain(field,southernNetwork.paths);
 field.missionTerrain={southern:false,navigation,network,southernNetwork,
  southernNavigation:{...navigation,version:navigation.version+'-m02-v2',transitions:[...navigation.transitions,...authored.transitions]}};
 return authored.paths;
}

// The renderer and pathfinder use exactly the same active road list.
export function missionRoads(field,southern,baseRoads=field.missionBaseRoads??field.localRoads??[]){
 const ids=new Set((field.m02Roads??[]).map(r=>r.id));
 const base=baseRoads.filter(r=>!ids.has(r.id)&&(!southern||r.campId!=='west-south'||r.m01LayoutVersion===3));
 return southern?[...base,...field.m02Roads]:base;
}

export function selectMissionTerrain(field,southern){
 const terrain=field.missionTerrain;
 if(!terrain||terrain.southern===southern)return false;
 field.missionBaseRoads??=missionRoads(field,false);
 terrain.southern=southern;
 field.navigation=southern?terrain.southernNavigation:terrain.navigation;
 field.roadNetwork=southern?terrain.southernNetwork:terrain.network;
 field.localRoads=missionRoads(field,southern);
 return true;
}
