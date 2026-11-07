// Exact terrain breakpoints along the sight line avoid a camera entering a hill.
// Returning from a raised view is damped; user orbit and zoom remain available.
export function createTerrainCameraResolver({camera,controls,field,state}){
 let lift=0,revision=-1;
 return dt=>{
  const active=state.mode==='arena'&&state.cameraMode==='follow';
  if(!active||revision!==state.cameraPoseRevision)lift=0;
  revision=state.cameraPoseRevision;
  if(active)camera.position.z-=lift;
  controls.update(dt);
  if(!active){state.cameraTerrainClearanceMetres=null;return;}
  const a=controls.target,b=camera.position,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,breaks=[0,1],cell=field.renderCell;
  const gx=(a.x+field.half)/cell,gy=(field.half-a.y)/cell,sx=dx/cell,sy=-dy/cell;
  function crossings(start,delta){if(Math.abs(delta)<1e-8)return;for(let k=Math.ceil(Math.min(start,start+delta));k<=Math.floor(Math.max(start,start+delta));k++){const t=(k-start)/delta;if(t>0&&t<1)breaks.push(t);}}
  crossings(gx,sx);crossings(gy,sy);crossings(gx+gy,sx+sy);
  let needed=0;
  for(const t of breaks)if(t>1e-5){const ground=field.heightAt(a.x+dx*t,a.y+dy*t),clearance=t===1?3:.9;needed=Math.max(needed,(ground+clearance-a.z-dz*t)/t);}
  lift=Math.max(needed,needed+(lift-needed)*Math.exp(-3*dt));b.z+=lift;camera.lookAt(a);
  state.cameraLiftMetres=lift;
  state.cameraTerrainClearanceMetres=Math.min(...breaks.map(t=>a.z+(b.z-a.z)*t-field.heightAt(a.x+dx*t,a.y+dy*t)));
  state.cameraResolvedRevision=revision;
 };
}
