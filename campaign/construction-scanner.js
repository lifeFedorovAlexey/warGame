import {worldToVehicle,vehicleToWorld} from './builder-kinematics.js';

// Render-only scanning: the simulation keeps its verified stationary work pose.
// Contacts are raycast against the actual visible model, including sloping roofs.
export function createConstructionScanner(T){
 const ray=new T.Raycaster(),origin=new T.Vector3(),aim=new T.Vector3(),direction=new T.Vector3(),bounds=new T.Box3(),hits=[];
 const cache=new WeakMap(),prepared=new WeakMap();
 const phase=id=>{let n=0;for(const c of String(id))n=(n*31+c.charCodeAt(0))>>>0;return((Math.imul(n^(n>>>16),2246822507)>>>0)%997)/997;};
 const triangle=t=>1-4*Math.abs((t-Math.floor(t))-.5);
 function visible(hit,ground){
  if(hit.point.z<ground+.025)return false;
  for(let node=hit.object;node;node=node.parent)if(!node.visible)return false;
  const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
  return !(material.clippingPlanes??[]).some(p=>p.distanceToPoint(hit.point)<0);
 }
 function scan(unit,target,object,pose,time){
  if(!object||target.clearing)return null;
  // Thirty surface queries per second; pause/repeated renders return exactly
  // the same contact. Separate units have different deterministic scan phases.
  const frame=Math.floor(time*30),previous=cache.get(unit);
  if(previous?.frame===frame&&previous.target===target&&previous.progress===target.progress)return previous.result;
  const structure=object.getObjectByName('building_structure');if(!structure)return null;
  let surface=prepared.get(object);
  if(!surface||surface.frame!==frame||surface.progress!==target.progress){
   object.updateWorldMatrix(true,true);bounds.setFromObject(object);
   surface={frame,progress:target.progress,min:bounds.min.clone(),max:bounds.max.clone()};prepared.set(object,surface);
  }
  const pivot=vehicleToWorld([0,-.65,3.377],pose);origin.set(...pivot);
  const dx=target.x-origin.x,dy=target.y-origin.y,span=Math.hypot(dx,dy)||1,rx=-dy/span,ry=dx/span;
  const ground=target.groundHeight,top=Math.max(ground+.3,surface.max.z),height=top-ground;
  const width=(Math.abs(rx)*(surface.max.x-surface.min.x)+Math.abs(ry)*(surface.max.y-surface.min.y))*.5;
  const seed=phase(unit.id),u=triangle(time*1.25+seed)*.81,v=.48+.35*Math.sin(time*1.9+seed*7.);
  let contact=null;
  // A sparse structure may have empty sky between its parts. Continue the
  // sweep lower down rather than ending the beam in an invisible bounding box.
  for(const [across,level] of [[u,v],[u,v*.52],[u*.5,.25],[u*.7,0],[0,0]]){
   aim.set(target.x+rx*width*across,target.y+ry*width*across,ground+Math.max(.12,height*level));
   direction.copy(aim).sub(origin).normalize();ray.set(origin,direction);hits.length=0;ray.intersectObject(object,true,hits);
   const hit=hits.find(h=>visible(h,ground));if(hit){contact=hit.point.clone();break;}
  }
  if(!contact)return null;
  const [x,y,z]=worldToVehicle(contact.toArray(),pose),yaw=Math.atan2(-x,y+.65),pitch=Math.atan2(z-3.377,Math.hypot(x,y+.65)-.21);
  if(pitch<-.87||pitch>1.13)return null;
  const result={world:contact.toArray(),yaw,pitch};cache.set(unit,{frame,target,progress:target.progress,result});return result;
 }
 return {scan};
}
