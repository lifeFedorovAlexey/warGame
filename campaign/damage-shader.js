import {CAGE_COUNT,MAX_MARKS,MAX_PARTS} from './damage-state.js';
export const ATLAS_WIDTH=512,PART_OFFSET=CAGE_COUNT,MARK_OFFSET=PART_OFFSET+MAX_PARTS,META_OFFSET=MARK_OFFSET+MAX_MARKS*3;

const common=`
uniform sampler2D damageAtlas;
uniform float damageEnabled;
uniform float damageTime;
// Interpolated instance IDs can be 0.99999994 instead of 1. Truncating read
// the previous vehicle's row on scattered pixels, shredding the damage mask.
vec4 damageTex(float row,int column){return texelFetch(damageAtlas,ivec2(column,int(row+.5)),0);}
`;
const cage=`
uniform vec3 damageCageMin;
uniform vec3 damageCageScale;
vec3 damageCage(vec3 point,float row,out mat3 jac){
  vec3 q=clamp((point-damageCageMin)*damageCageScale,vec3(0.),vec3(4.,8.,4.));
  ivec3 b=ivec3(min(floor(q),vec3(3.,7.,3.)));vec3 f=q-vec3(b);
  vec3 offset=vec3(0.);jac=mat3(1.);
  for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec3 w=mix(1.-f,f,vec3(float(x),float(y),float(z)));
    vec3 d=damageTex(row,(b.z+z)*45+(b.y+y)*5+b.x+x).xyz;
    offset+=d*w.x*w.y*w.z;
    jac[0]+=d*((x==0?-1.:1.)*w.y*w.z*damageCageScale.x);
    jac[1]+=d*((y==0?-1.:1.)*w.x*w.z*damageCageScale.y);
    jac[2]+=d*((z==0?-1.:1.)*w.x*w.y*damageCageScale.z);
  }
  return offset;
}
`;
const vertexHeader=`
attribute vec3 damagePosition;
attribute vec3 damageNormal;
attribute float damagePart;
#ifdef DAMAGE_INSTANCED
attribute vec2 instanceDamage;
#else
uniform vec2 objectDamage;
#endif
uniform mat3 damageToPart;
uniform mat3 normalToDamage;
uniform mat3 normalFromDamage;
varying vec3 vDamagePosition;
varying vec3 vDamageNormal;
varying vec4 vDamageState;
varying vec4 vDamageMeta;
varying float vDamagePartId;
varying float vWreckFade;
`;
const vertexSetup=`
#ifdef DAMAGE_INSTANCED
vec2 ds=instanceDamage;
#else
vec2 ds=objectDamage;
#endif
if(damageEnabled<.5)ds.x=0.;
vec4 damageMeta=vec4(0.),damagePartState=vec4(0.);
if(ds.x>.5){damageMeta=damageTex(ds.x,${META_OFFSET});damagePartState=damageTex(ds.x,${PART_OFFSET}+int(damagePart));}
vDamageState=vec4(ds,damagePartState.xy);
vDamageMeta=damageMeta;
vDamagePartId=damagePart;
vWreckFade=0.;
if(ds.x>.5&&damageMeta.w>.5){vec4 life=damageTex(ds.x,${META_OFFSET+1});if(life.y>0.)vWreckFade=smoothstep(life.y-2.,life.y,damageTime);}
vDamagePosition=damagePosition;
vDamageNormal=damageNormal;
mat3 damageJac=mat3(1.);vec3 damageOffset=vec3(0.);
#ifdef DAMAGE_DEFORM
if(ds.x>.5&&ds.y<1.5&&damageMeta.z>.5)damageOffset=damageCage(damagePosition,ds.x,damageJac);
#endif
#ifdef DAMAGE_COLLAPSE
if(ds.x>.5&&damageMeta.w>.5){
  vec4 life=damageTex(ds.x,${META_OFFSET+1});
  float fall=smoothstep(life.x+.12,life.x+1.65,damageTime);
  damageOffset.z-=max(0.,damagePosition.z-.35)*fall*.92;
}
#endif
`;
const fragmentHeader=common+`
void damageLayer(inout vec3 ink,inout float coverage,vec3 colour,float alpha){
  alpha=clamp(alpha,0.,1.);ink=ink*(1.-alpha)+colour*alpha;coverage+=alpha*(1.-coverage);
}
varying vec3 vDamagePosition;
varying vec3 vDamageNormal;
varying vec4 vDamageState;
varying vec4 vDamageMeta;
varying float vDamagePartId;
varying float vWreckFade;
`;
const fragmentEffect=`
if(vWreckFade>0.&&fract(sin(dot(floor(vDamagePosition*32.),vec3(12.9898,78.233,37.719)))*43758.5453)<vWreckFade)discard;
#ifndef DAMAGE_GLAZING
if(vDamageState.z>.5)discard;
#endif
vec3 damageTint=vec3(1.),damageInk=vec3(0.);float damageCoverage=0.,damageRoughness=0.,damageHeight=0.,damageMetal=0.;
#ifdef DAMAGE_GLAZING
// Existing models have glazing over a closed wall/body. Keep a dark fractured
// remnant at the opening until the asset has a real window cavity/interior.
if(vDamageState.z>.5){damageTint=vec3(.38,.43,.46);damageRoughness=.65;}
#endif
if(vDamageState.x>.5){
  damageTint*=1.-min(.58,vDamageMeta.y*.38+vDamageState.w*.025);
  float charPatch=smoothstep(.15,.8,.48+sin(vDamagePosition.y*2.1+vDamagePosition.z*3.7)*.22+sin(vDamagePosition.x*3.3-vDamagePosition.y*1.7)*.16);
  damageLayer(damageInk,damageCoverage,vec3(.035,.038,.033),vDamageMeta.y*charPatch*.55);
  if(vDamageState.y<1.5){
    int markLimit=vDamageState.y<.5?${MAX_MARKS}:6;
    for(int m=0;m<${MAX_MARKS};m++){
      if(m>=int(vDamageMeta.x+.5)||m>=markLimit)break;
      vec4 hit=damageTex(vDamageState.x,${MARK_OFFSET}+m*3);
      vec4 orient=damageTex(vDamageState.x,${MARK_OFFSET}+m*3+1);
      vec4 info=damageTex(vDamageState.x,${MARK_OFFSET}+m*3+2);
      if(abs(info.y-vDamagePartId)>.25)continue;
      vec3 delta=vDamagePosition-hit.xyz;
      float plane=dot(delta,orient.xyz);
      float facing=dot(normalize(vDamageNormal),orient.xyz);
      if(abs(plane)>max(.055,hit.w*.25)||facing<.28)continue;
      vec3 tangent=delta-orient.xyz*plane;
      vec3 axis=normalize(cross(orient.xyz,abs(orient.z)<.9?vec3(0.,0.,1.):vec3(0.,1.,0.)));
      vec2 uv=vec2(dot(tangent,axis),dot(tangent,cross(orient.xyz,axis)))/hit.w;
      float radius=length(uv),aa=max(.008,fwidth(radius)*.8);
#ifdef DAMAGE_GLAZING
      if(abs(info.y-vDamagePartId)<.25&&vDamageState.w>.25){
        float angle=atan(uv.y,uv.x),spoke=abs(sin(angle*3.5+sin(radius*1.6)*.07));
        float crack=(1.-smoothstep(.018,.018+max(.025,fwidth(spoke)),spoke))*(1.-smoothstep(2.,7.,radius));
        float ring=abs(radius-(1.8+.18*sin(angle*5.)));
        crack=max(crack,(1.-smoothstep(.025,.025+aa,ring))*.6);
        damageLayer(damageInk,damageCoverage,vec3(.24,.29,.29),crack*.76);
      }
#endif
      if(radius>1.8)continue;
      // Stable material-space variation: each impact has its own chipped rim,
      // which follows the same deformed surface and survives camera changes.
      float seed=dot(hit.xyz,vec3(17.13,31.71,11.93));
      float edgeNoise=sin(uv.x*8.+sin(uv.y*7.)+seed)*sin(uv.y*11.+seed*.7),r=radius*(1.+edgeNoise*.14);
      if(info.x>2.5){
        // A contact rubs paint off a dent; it is not a large black bullet hole.
        float envelope=1.-smoothstep(.7,1.15,length(uv*vec2(.78,1.8)));
        float stripe=abs(sin(uv.y*27.+sin(uv.x*5.)*.7));
        float scrape=(1.-smoothstep(.16,.4+max(.03,fwidth(stripe)),stripe))*envelope;
        scrape*=smoothstep(-.2,.45,sin(uv.x*9.+uv.y*3.)+sin(uv.x*17.)*.25);
        damageLayer(damageInk,damageCoverage,vec3(.07,.085,.075),envelope*.16);
        damageLayer(damageInk,damageCoverage,vec3(.24,.26,.245),scrape*.85);
        damageMetal=max(damageMetal,scrape*.8);damageRoughness=max(damageRoughness,envelope*.22);
      }else if(info.x>1.5){
        float soot=1.-smoothstep(.45,1.65,r);
        damageLayer(damageInk,damageCoverage,vec3(.025,.026,.022),soot*.78);damageRoughness=max(damageRoughness,soot*.5);
      }else{
        // The wide support is a painted dent. Only the narrow torn lip exposes
        // metal: filling the whole support silver looked like painted symbols.
        float chip=1.-smoothstep(.40-aa,.40+aa,r),core=1.-smoothstep(.25-aa,.25+aa,r);
        float concrete=step(.5,info.z)*step(info.z,1.5);
        vec3 exposed=mix(vec3(.20,.225,.21),vec3(.43,.38,.30),concrete);
        damageLayer(damageInk,damageCoverage,vec3(.045,.05,.037),(1.-smoothstep(.34,1.15,r))*.52);
        damageLayer(damageInk,damageCoverage,exposed,chip*.9);
        damageLayer(damageInk,damageCoverage,vec3(.012,.014,.013),core*.98);
        damageHeight-=hit.w*.24*(1.-smoothstep(0.,1.15,r));
        damageMetal=max(damageMetal,chip*(1.-core)*(1.-concrete)*.85);
        damageRoughness=max(damageRoughness,chip*.25);
        if(info.x>.5&&r<.25)discard; // visual perforation, no Boolean mesh edit
      }
    }
  }
}
`;

// Compose with existing projector emission and fog hooks. Depth uses the same
// deformation and perforation, so the silhouette also matches in shadow maps.
export function attachDamageShader(T,mesh,binding,atlas,enabled,{instanced=false,row=0,lod=0,clock={value:0}}={}){
  const source=mesh.material,material=source.clone(),objectDamage={value:new T.Vector2(row,lod)};
  const oldCompile=source.onBeforeCompile,oldKey=source.customProgramCacheKey.bind(source);
  function patch(shader,depth=false){
    if(!depth)oldCompile.call(source,shader);
    Object.assign(shader.uniforms,{damageAtlas:{value:atlas},damageEnabled:enabled,damageTime:clock,objectDamage,
      damageCageMin:{value:new T.Vector3(...binding.cageBounds.min)},damageCageScale:{value:new T.Vector3(...[4,8,4].map((v,i)=>v/(binding.cageBounds.max[i]-binding.cageBounds.min[i])))},
      damageToPart:{value:binding.inverseLinear},normalToDamage:{value:new T.Matrix3().getNormalMatrix(binding.bind)},normalFromDamage:{value:new T.Matrix3().getNormalMatrix(binding.bind).invert()}});
    const glazing=/window_glass|building_window/.test(binding.material.name??'');
    const defines=(instanced?'#define DAMAGE_INSTANCED\n':'')+(binding.deform?'#define DAMAGE_DEFORM\n':'')+(glazing?'#define DAMAGE_GLAZING\n':'')+(binding.category==='building'&&binding.constructionClipped?'#define DAMAGE_COLLAPSE\n':'');
    shader.vertexShader=defines+common+vertexHeader+cage+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace(/void main\(\)\s*\{/,match=>match+'\n'+vertexSetup);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=damageToPart*damageOffset;');
    // Reuse the eight lattice samples and Jacobian for position AND normal.
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      #ifdef DAMAGE_DEFORM
      if(ds.x>.5&&ds.y<1.5&&damageMeta.z>.5){
        objectNormal=normalize(normalFromDamage*transpose(inverse(damageJac))*normalToDamage*objectNormal);
      }
      #endif`);
    shader.fragmentShader=defines+fragmentHeader+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+fragmentEffect);
    if(!depth){
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=diffuseColor.rgb*damageTint*(1.-damageCoverage)+damageInk;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=min(1.,roughnessFactor+damageRoughness);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.7,damageMetal);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        if(vDamageState.x>.5&&vDamageState.y<.5){
          vec3 px=dFdx(-vViewPosition),py=dFdy(-vViewPosition),r1=cross(py,normal),r2=cross(normal,px);
          float det=dot(px,r1),modelScale=length(px)/max(length(dFdx(vDamagePosition)),.00001);
          vec3 gradient=(dFdx(damageHeight)*r1+dFdy(damageHeight)*r2)*modelScale;
          if(abs(det)>.00000001)normal=normalize(abs(det)*normal-sign(det)*gradient);
        }`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=(1.-vDamageMeta.y)*(1.-vDamageMeta.w);');
    }
  }
  material.onBeforeCompile=shader=>patch(shader);
  material.customProgramCacheKey=()=>oldKey()+'_damage_v5_'+instanced+'_'+binding.deform+'_'+binding.constructionClipped+'_'+/window_glass|building_window/.test(binding.material.name??'');
  mesh.material=material;
  const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:source.side});
  depth.onBeforeCompile=shader=>patch(shader,true);depth.customProgramCacheKey=()=> 'damage_depth_v5_'+instanced+'_'+binding.deform+'_'+binding.constructionClipped+'_'+/window_glass|building_window/.test(binding.material.name??'');
  mesh.customDepthMaterial=depth;
  return {objectDamage,dispose(){material.dispose();depth.dispose();}};
}
