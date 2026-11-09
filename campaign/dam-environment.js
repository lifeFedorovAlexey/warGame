import {damLayout,damWorld,damState,damDischarge,damBow,DAM_OUTLETS} from './dam-layout.js';
import {createDamModel} from './dam-model.js';
import {createDamAudio} from './dam-audio.js';
import {addDamDetails} from './dam-details.js';
import {createDamBanks} from './dam-banks.js';
import {addDamWeathering} from './dam-weathering.js';
import {createDamYardProps} from './dam-yard-props.js';
import {createDamDrainage} from './dam-drainage.js';
import {damWaterNormals} from './dam-water.js';

export function createDamEnvironment(T,field,config,addFog,sound,terrain){
 const layout=damLayout(field,config),root=new T.Group();root.name='western_dam';root.userData.decorative=true;
 root.position.set(layout.x,layout.y,layout.z);root.rotation.z=layout.rotation;root.scale.setScalar(layout.scale);
 const structure=createDamModel(T,addFog);root.add(structure);
 addDamWeathering(T,structure,addFog);
 const details=addDamDetails(T,root,addFog);
 const yard=createDamYardProps(T,field,layout,addFog);root.add(yard.root);
 const drainage=createDamDrainage(T,addFog);root.add(drainage.root);
 const timeUniform={value:0};
 const reservoirNormals=damWaterNormals(T),water=new T.MeshStandardMaterial({color:'#304d4e',roughness:.40,metalness:.18,normalMap:reservoirNormals,normalScale:new T.Vector2(.1,.1),side:T.DoubleSide});
 water.customProgramCacheKey=()=> 'dam_water_v1';
 water.onBeforeCompile=shader=>{
  shader.uniforms.damTime=timeUniform;shader.fragmentShader='uniform float damTime;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float ripple=sin(vMapUv.x*1.1+vMapUv.y*.7+damTime*1.4)*sin(vMapUv.y*2.3-damTime*1.9);
   diffuseColor.rgb*=.97+.02*ripple;
  `);
 };
 // A tiny repeatable texture supplies UVs without fetching or generating art.
 const pixels=new Uint8Array([235,242,232,255]);water.map=new T.DataTexture(pixels,1,1);water.map.needsUpdate=true;
 addFog(water);
 const shore=[[-42,1],[-43,8],[-39,20],[-30,26],[-12,27],[8,28],[28,26],[39,20],[43,8],[42,1]];
 const outline=[...shore];for(let x=39;x>=-42;x-=3)outline.push([x,damBow(x)+2.5]);
 const shape=new T.Shape();outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const reservoir=new T.Mesh(new T.ShapeGeometry(shape),water);reservoir.name='reservoir_surface';reservoir.position.z=layout.reservoir.level;root.add(reservoir);
 const banks=createDamBanks(T,field,layout,shore,terrain.terrainMaterials[1]);root.add(banks);terrain.registerSurface(banks,banks.userData.materialForTerrain);
 const streamMaterial=new T.MeshStandardMaterial({color:'#8daaa0',transparent:true,opacity:.53,roughness:.26,metalness:.12,side:T.DoubleSide,depthWrite:false});
 streamMaterial.customProgramCacheKey=()=> 'dam_discharge_v2';streamMaterial.onBeforeCompile=s=>{s.uniforms.damTime=timeUniform;s.vertexShader='varying vec2 vFlowUv;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFlowUv=uv;');s.fragmentShader='varying vec2 vFlowUv;uniform float damTime;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float streak=.5+.5*sin(vFlowUv.y*65.-damTime*21.+sin(vFlowUv.x*19.));diffuseColor.rgb*=.89+.11*streak;diffuseColor.a*=.65+.35*streak;
 `);};addFog(streamMaterial);
 const foamMaterial=new T.MeshBasicMaterial({color:'#cad6bb',transparent:true,opacity:.36,depthWrite:false,side:T.DoubleSide});
 const prepareFoam=material=>{material.customProgramCacheKey=()=> 'dam_foam_v2';material.onBeforeCompile=s=>{
  s.uniforms.damTime=timeUniform;s.vertexShader='varying vec2 vFoamXY;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFoamXY=position.xy;');
  s.fragmentShader=`varying vec2 vFoamXY;uniform float damTime;
   float foamHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float foamNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(foamHash(i),foamHash(i+vec2(1.,0.)),f.x),mix(foamHash(i+vec2(0.,1.)),foamHash(i+1.),f.x),f.y);}
  `+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 q=vFoamXY*vec2(1.,.77);float r=length(q);float bubbles=smoothstep(.3,.8,foamNoise(q*19.+vec2(damTime*.7,-damTime*1.3)));diffuseColor.a*= (1.-smoothstep(.2,.76,r))*(.2+.8*bubbles);
  `);};addFog(material);};
 const streams=DAM_OUTLETS.map((p,index)=>{
  const geometry=new T.BufferGeometry(),vertices=[],uv=[];
  for(let j=0;j<16;j++)for(let side=0;side<8;side++)for(const [q,k] of [[j,side],[j+1,side],[j,side+1],[j,side+1],[j+1,side],[j+1,side+1]]){
   const t=q/16,a=k/8*Math.PI*2,r=.27+t*.045,fall=t*t*1.98;vertices.push(p.x+Math.cos(a)*r,p.y-t*3.3,p.z+.2-fall+Math.sin(a)*r*(1-t*.7));uv.push(k/8,t);
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const stream=new T.Mesh(geometry,streamMaterial);stream.name='water_discharge_'+index;root.add(stream);
  const patch=new T.Shape();for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=.7+Math.sin(i*7.1)*.16;const x=Math.cos(a)*r,y=Math.sin(a)*r*1.3;i?patch.lineTo(x,y):patch.moveTo(x,y);}patch.closePath();
  const foam=new T.Mesh(new T.ShapeGeometry(patch),foamMaterial.clone());prepareFoam(foam.material);foam.position.set(p.x,p.y-3.3,.225);root.add(foam);return {stream,foam};
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
  const state=damState(mission);timeUniform.value=time;reservoirNormals.offset.set(time*.008,-time*.011);reservoir.position.z=state.reservoirLevel;details.update(time);yard.update(mission,camera,time);drainage.update(time);
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
