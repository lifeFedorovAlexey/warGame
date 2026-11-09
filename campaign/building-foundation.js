// Expand only the existing concrete footing down into the terrain. Its top,
// the building, service rail and construction anchors stay level and fixed.
export function fitBuildingFoundation(root,site,field,config){
 const spec=config.buildings[site.kind??root.userData.kind];
 if(!spec?.realSizeMetres||(site.kind??root.userData.kind)==='base-sign')return;
 const scale=config.worldScale,z=site.groundHeight??site.height??field.heightAt(site.x,site.y),angle=site.rotation??0;
 const key=[site.x,site.y,z,angle].join('/');
 if(root.userData.foundationFit===key)return;
 root.userData.foundationFit=key;
 const [w,d]=spec.realSizeMetres,c=Math.cos(angle),s=Math.sin(angle);
 let minimum=z;
 for(let row=0;row<=4;row++)for(let col=0;col<=4;col++){
  const x=(col/4-.5)*w*scale,y=(row/4-.5)*d*scale;
  minimum=Math.min(minimum,field.heightAt(site.x+x*c-y*s,site.y+x*s+y*c));
 }
 const depth=Math.max(0,(z-minimum)/scale)+.025;
 root.getObjectByName('building_foundation')?.traverse(mesh=>{
  if(!mesh.isMesh||mesh.material.name!=='foundation_concrete')return;
  mesh.geometry.computeBoundingBox();const {min,max}=mesh.geometry.boundingBox;
  mesh.scale.z=1+depth/Math.max(.01,max.z-min.z);
  mesh.position.z=max.z*(1-mesh.scale.z);
 });
}
