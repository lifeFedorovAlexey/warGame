import {startOpeningSalvage,advanceOpeningSalvage} from './opening-salvage.js';
// Real demonstration and construction jobs, saved before the player handoff.
function signPlacement(mission){
  const point=mission.field.gridToWorld(mission.config.openingSignGrid);
  const rotation=mission.config.openingSignRotationDegrees*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation);
  const [w,d]=mission.config.buildings['base-sign'].realSizeMetres,scale=mission.config.worldScale;
  const steps=Math.ceil(w/.25),heights=[];
  for(let i=0;i<=steps;i++)for(const y of [-d/2,0,d/2]){
    const x=-w/2+w*i/steps;
    heights.push(mission.field.heightAt(point.x+(x*c-y*s)*scale,point.y+(x*s+y*c)*scale));
  }
  // The footing extends into the hillside; its top stays above the highest corner.
  return {...point,rotation,groundHeight:Math.max(...heights)-.35*scale+.05*scale};
}

export function startOpeningConstruction(mission,{demonstrateSalvage=true}={}) {
  if (mission.state.openingScene) return mission.state.openingScene;
  const builder=mission.state.units.findLast(u=>u.owner==='rai'&&u.kind==='builder'&&u.hp>0);
  if(!builder)throw new Error('Для вступления нужен строитель');
  const point=signPlacement(mission);
  const sign=mission.addStructure('base-sign','rai',point,{rotation:point.rotation,groundHeight:point.groundHeight,cost:0});
  mission.rebuildNavigation();
  const scene=mission.state.openingScene={signId:sign.id,builderId:builder.id,handedOver:false,builderStarted:false};
  if(!demonstrateSalvage||!startOpeningSalvage(mission,scene))startBuilder(mission,scene);
  return scene;
}

function startBuilder(mission,scene){
  const result=mission.order([scene.builderId],'build',mission.entity(scene.signId));
  if(!result.ok)throw new Error('Строитель не может добраться до вывески: '+result.reason);
  scene.builderStarted=true;
}

// Called after the simulation tick has completed, outside its pending iterator.
export function updateOpeningConstruction(mission){
  const scene=mission.state.openingScene;
  if(!scene||scene.handedOver||scene.builderStarted!==false)return;
  if(advanceOpeningSalvage(mission,scene))startBuilder(mission,scene);
}

export function restoreOpeningConstruction(mission) {
  const scene=mission.state.openingScene;
  if(!scene){
    const story=mission.state.radioStory;
    if(story?.includeOpening&&!['done','skipped','cancelled'].includes(story.scenes?.p04?.status))startOpeningConstruction(mission,{demonstrateSalvage:false});
    return;
  }
  const sign=mission.entity(scene.signId);
  if(!sign)return;
  // Older saves already sent the builder; never replay a new demonstration.
  scene.builderStarted??=true;
  const point=signPlacement(mission);
  if(Math.hypot(sign.x-point.x,sign.y-point.y)<1&&Math.abs(sign.rotation-point.rotation)<.001&&Math.abs(sign.groundHeight-point.groundHeight)<.01)return;
  // Saved height can predate the hillside footing even at the same XY/rotation.
  // Re-seat it on load while preserving construction progress and dialogue.
  Object.assign(sign,point);
  mission.rebuildNavigation();
  if(!sign.completed&&scene.builderStarted)mission.order([scene.builderId],'build',sign);
}

export function openingConstructionReady(mission) {
  return mission.state.buildings.some(b=>b.kind==='base-sign'&&b.completed&&b.hp>0);
}

export function openingCanHandOver(mission,director,radioEnabled) {
  return openingConstructionReady(mission)&&(!radioEnabled||director.openingFinished);
}
