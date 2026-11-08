// A real construction job, saved with the mission and finished before handoff.
function signPlacement(mission){
  const point=mission.field.gridToWorld(mission.config.openingSignGrid);
  const rotation=mission.config.openingSignRotationDegrees*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation);
  const [w,d]=mission.config.buildings['base-sign'].realSizeMetres,scale=mission.config.worldScale;
  const heights=[-w/2,0,w/2].flatMap(x=>[-d/2,d/2].map(y=>mission.field.heightAt(point.x+(x*c-y*s)*scale,point.y+(x*s+y*c)*scale)));
  // The footing extends into the hillside; its top stays above the highest corner.
  return {...point,rotation,groundHeight:Math.max(...heights)-.35*scale+.05};
}

export function startOpeningConstruction(mission) {
  if (mission.state.openingScene) return mission.state.openingScene;
  const builder=mission.state.units.findLast(u=>u.owner==='rai'&&u.kind==='builder'&&u.hp>0);
  if(!builder)throw new Error('Для вступления нужен строитель');
  const point=signPlacement(mission);
  const sign=mission.addStructure('base-sign','rai',point,{rotation:point.rotation,groundHeight:point.groundHeight,cost:0});
  mission.rebuildNavigation();
  const result=mission.order([builder.id],'build',sign);
  if(!result.ok)throw new Error('Строитель не может добраться до вывески: '+result.reason);
  return mission.state.openingScene={signId:sign.id,builderId:builder.id,handedOver:false};
}

export function restoreOpeningConstruction(mission) {
  const scene=mission.state.openingScene;
  if(!scene){
    const story=mission.state.radioStory;
    if(story?.includeOpening&&!['done','skipped','cancelled'].includes(story.scenes?.p04?.status))startOpeningConstruction(mission);
    return;
  }
  const sign=mission.entity(scene.signId);
  if(!sign)return;
  const point=signPlacement(mission);
  if(Math.hypot(sign.x-point.x,sign.y-point.y)<1&&Math.abs(sign.rotation-point.rotation)<.001)return;
  // Existing saves from the first placement keep their progress and dialogue.
  Object.assign(sign,point);
  mission.rebuildNavigation();
  if(!sign.completed)mission.order([scene.builderId],'build',sign);
}

export function openingConstructionReady(mission) {
  return mission.state.buildings.some(b=>b.kind==='base-sign'&&b.completed&&b.hp>0);
}

export function openingCanHandOver(mission,director,radioEnabled) {
  return openingConstructionReady(mission)&&(!radioEnabled||director.openingFinished);
}
