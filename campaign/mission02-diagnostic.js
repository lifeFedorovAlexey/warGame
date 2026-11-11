// Explicit developer preset. Never called by the campaign continuation or load.
export function prepareM02Diagnostic(mission){
 if(mission.state.time!==0||mission.state.m02)throw new Error('Диагностический пресет требует новую игру');
 const s=mission.state;
 s.units=s.units.filter(u=>u.owner==='rai');s.buildings=[];
 for(const c of s.camps){c.cleared=true;c.artifactSpawned=true;}
 for(const spec of mission.config.baseSites.slice(0,3))mission.addStructure(spec.kind,'rai',mission.field.gridToWorld(spec.grid),{completed:true,progress:1,rotation:(spec.rotationDegrees??0)*Math.PI/180});
 for(const grid of mission.config.oilFields.slice(0,2))mission.addStructure('derrick','rai',mission.field.gridToWorld(grid),{completed:true,progress:1});
 for(const grid of [[18,53],[19,51]])mission.addStructure('bunker','rai',mission.field.gridToWorld(grid),{completed:true,progress:1});
 for(const b of s.buildings)b.groundHeight=mission.field.heightAt(b.x,b.y);
 s.flags={...s.flags,raidWon:true,raidStarted:true,lastRevealed:true};
 s.research={flamethrower:true,'mg-ammo-1':true,'mg-tower':true};s.artifactKeys=Object.keys(s.research);s.statistics.produced=12;s.energy=1800;
 s.bounds=mission.config.finalMapBounds.slice();mission.rebuildNavigation();
 const start=mission.field.gridToWorld(mission.config.startGrid);
 let count=0;
 for(let row=0;row<6&&count<9;row++)for(let col=0;col<7&&count<9;col++){
  const pose={x:start.x-100+col*30,y:start.y-130-row*30,heading:0,kind:'bukhanka',owner:'rai'};
  if(!mission.vehicleMotionClear(pose,pose,pose)||s.units.some(u=>Math.hypot(u.x-pose.x,u.y-pose.y)<28))continue;
  mission.addUnit(count%3===0?'flamer':'bukhanka','rai',pose);count++;
 }
 s.status='victory';mission.enterM02();s.diagnostic='m02';return mission;
}
