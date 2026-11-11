export const campaignCameraLimits=Object.freeze({near:65,far:1600});

// Lift over terrain along the same orbit, rather than increasing the radius
// beyond maxDistance after OrbitControls has already clamped the zoom.
export function keepCameraAboveTerrain(camera,controls,field,clearance){
 const p=camera.position,t=controls.target,max=controls.maxDistance;
 for(let attempt=0;attempt<8;attempt++){
  const floor=field.heightAt(p.x,p.y)+clearance;
  if(p.z>=floor-.001)break;
  p.z=floor;
  const dx=p.x-t.x,dy=p.y-t.y,dz=p.z-t.z,flat=Math.hypot(dx,dy);
  if(Number.isFinite(max)&&Math.hypot(flat,dz)>max){
   const height=Math.min(max,Math.max(-max,dz)),radius=Math.sqrt(Math.max(0,max*max-height*height));
   p.x=t.x+(flat?dx/flat*radius:0);p.y=t.y+(flat?dy/flat*radius:0);p.z=t.z+height;
  }
 }
 camera.lookAt(t);
}
