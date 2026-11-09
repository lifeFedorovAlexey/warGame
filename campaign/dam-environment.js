import {damLayout,damWorld,damState,damDischarge,damBow,DAM_OUTLETS} from './dam-layout.js';
import {createDamModel} from './dam-model.js';
import {createDamAudio} from './dam-audio.js';
import {addDamDetails} from './dam-details.js';
import {createDamBanks} from './dam-banks.js';

export function createDamEnvironment(T,field,config,addFog,sound,terrainMaterial){
 const layout=damLayout(field,config),root=new T.Group();root.name='western_dam';root.userData.decorative=true;
 root.position.set(layout.x,layout.y,layout.z);root.rotation.z=layout.rotation;root.scale.setScalar(layout.scale);
 const structure=createDamModel(T,addFog);root.add(structure);
 const details=addDamDetails(T,root,addFog);
 const timeUniform={value:0};
 const water=new T.MeshStandardMaterial({color:'#304d4e',roughness:.44,metalness:.23,side:T.DoubleSide});
 water.customProgramCacheKey=()=> 'dam_water_v1';
 water.onBeforeCompile=shader=>{
  shader.uniforms.damTime=timeUniform;shader.fragmentShader='uniform float damTime;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float ripple=sin(vMapUv.x*1.1+vMapUv.y*.7+damTime*1.4)*sin(vMapUv.y*2.3-damTime*1.9);
   diffuseColor.rgb*=.88+.08*ripple;
  `);
 };
 // A tiny repeatable texture supplies UVs without fetching or generating art.
 const pixels=new Uint8Array([235,242,232,255]);water.map=new T.DataTexture(pixels,1,1);water.map.needsUpdate=true;
 addFog(water);
 const shore=[[-42,1],[-43,8],[-39,20],[-30,26],[-12,27],[8,28],[28,26],[39,20],[43,8],[42,1]];
 const outline=[...shore];for(let x=39;x>=-42;x-=3)outline.push([x,damBow(x)+2.5]);
 const shape=new T.Shape();outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const reservoir=new T.Mesh(new T.ShapeGeometry(shape),water);reservoir.name='reservoir_surface';reservoir.position.z=layout.reservoir.level;root.add(reservoir);
 root.add(createDamBanks(T,field,layout,shore,terrainMaterial));
 const streamMaterial=new T.MeshStandardMaterial({color:'#8daaa0',transparent:true,opacity:.58,roughness:.34,metalness:.08,side:T.DoubleSide,depthWrite:false});addFog(streamMaterial);
 const foamMaterial=new T.MeshBasicMaterial({color:'#cad6bb',transparent:true,opacity:.36,depthWrite:false,side:T.DoubleSide});addFog(foamMaterial);
 const streams=DAM_OUTLETS.map((p,index)=>{
  const geometry=new T.BufferGeometry(),vertices=[],uv=[];
  for(let j=0;j<12;j++)for(const [q,side] of [[j,-1],[j,1],[j+1,-1],[j+1,-1],[j,1],[j+1,1]]){const t=q/12;vertices.push(p.x+side*.43,p.y-t*3.3,p.z+.2-t*t*2.05);uv.push(side/2+.5,t);}
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const stream=new T.Mesh(geometry,streamMaterial);stream.name='water_discharge_'+index;root.add(stream);
  const patch=new T.Shape();for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=.7+Math.sin(i*7.1)*.16;const x=Math.cos(a)*r,y=Math.sin(a)*r*1.3;i?patch.lineTo(x,y):patch.moveTo(x,y);}patch.closePath();
  const foam=new T.Mesh(new T.ShapeGeometry(patch),foamMaterial.clone());addFog(foam.material);foam.position.set(p.x,p.y-3.3,.2);root.add(foam);return {stream,foam};
 });
 const particleGeometry=new T.BufferGeometry(),particles=new T.Float32BufferAttribute(new Float32Array(288*3),3).setUsage(T.DynamicDrawUsage);particleGeometry.setAttribute('position',particles);particleGeometry.setDrawRange(0,0);
 const particleMaterial=new T.PointsMaterial({color:'#d2e1d2',size:.65,transparent:true,opacity:.65,depthWrite:false});addFog(particleMaterial);
 const spray=new T.Points(particleGeometry,particleMaterial);spray.name='dam_spray';spray.frustumCulled=false;root.add(spray);
 // The next mission can remove the named gate/monoliths and lower this same
 // reservoir; the surge outlet uses the retained opening, not a second model.
 const breach=new T.Mesh(new T.BoxGeometry(10,10,.45),streamMaterial);breach.name='breach_outflow';breach.position.set(0,-11,.45);breach.visible=false;root.add(breach);
 const audio=createDamAudio(sound),projected=new T.Vector3(),stats={particles:0,discharging:0};
 let previousDamage='';
 function update(mission,camera,time,live){
  const state=damState(mission);timeUniform.value=time;reservoir.position.z=state.reservoirLevel;details.update(time);
  const signature=JSON.stringify(state.sections),changed=signature!==previousDamage;
  if(changed){for(const node of structure.children)node.visible=(state.sections[node.name]??0)<1;previousDamage=signature;}
  breach.visible=(state.sections.spillway_gate??0)>=1&&state.reservoirLevel>1;
  let count=0,total=0,active=0;
  for(const [index,p] of DAM_OUTLETS.entries()){
   const power=state.reservoirLevel>p.z?damDischarge(time,index):0,{stream,foam}=streams[index];stream.visible=foam.visible=power>.025;
   if(!stream.visible)continue;active++;total+=power;
   stream.scale.x=1;foam.scale.setScalar(.65+((time*.7+index*.3)%1)*1.2);foam.material.opacity=.26*power;
   for(let i=0;i<96;i++){
    const age=((time*1.6+i*.618)%1),angle=i*2.399,spread=age*.9;
    particles.setXYZ(count++,p.x+Math.cos(angle)*spread,p.y-age*3.8+Math.sin(i*13)*.10,p.z+.2-age*age*2.0+Math.sin(angle)*spread*.6);
   }
  }
  particleGeometry.setDrawRange(0,count);if(count)particles.needsUpdate=true;stats.particles=count;stats.discharging=active;
  const focus=damWorld(layout,18,-20,2),distance=Math.hypot(camera.position.x-focus.x,camera.position.y-focus.y,camera.position.z-focus.z);
  projected.set(focus.x,focus.y,focus.z).project(camera);
  const visible=mission.visibleAt(focus.x,focus.y),attenuation=Math.max(0,1-distance/1100)**2;
  audio.update(visible?Math.min(1,total)*attenuation:0,projected.x*.8,live);
  return changed;
 }
 return {root,layout,road:layout.road,update,stats,structure,reservoir};
}
