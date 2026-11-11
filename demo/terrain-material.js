// WebGL2 texture array: twelve surfaces share one sampler and independent mip chains.
import {terrainNoiseGLSL,roadEdgeGLSL} from './road-surface.js';
import {loadTerrainPbr,terrainPbrDeclarations,terrainPbrSurface,terrainPbrNormals} from './terrain-pbr.js';
import {createLocalRoadMask,localRoadGLSL} from './local-road-mask.js';
import {rockyRidgeDeclarations,rockyRidgeNormals} from './rocky-ridges.js';
export async function createTerrainMaterials(T,extent,{lightweightOverview=false}={}){
 const localRoads=createLocalRoadMask(T);
 const loader=new T.TextureLoader(),base='../assets/maps/alpha/',names=['dune-sand','bleached-sand','rust-clay','desert-gravel','scorched-rock','ash-earth','ruined-asphalt','weathered-concrete','transition-sand','dusty-sandstone','sandy-talus','weathered-limestone'];
 const [controls,images,macro,selection,roadDetail,pbr]=await Promise.all([Promise.all([0,1,2,3].map(i=>loader.loadAsync(base+'surface-control-'+i+'.png'))),Promise.all(names.map(name=>loader.loadAsync(base+'materials/'+name+'.jpg'))),loader.loadAsync(base+'macro-albedo.jpg'),loader.loadAsync(base+'detail-selection.png'),loader.loadAsync(base+'road-detail.png'),loadTerrainPbr(T,loader,base)]);macro.colorSpace=T.SRGBColorSpace;selection.minFilter=selection.magFilter=T.NearestFilter;selection.generateMipmaps=false;
 const resolution=768,bytes=new Uint8Array(resolution*resolution*4*names.length),sourceMeans=[],canvas=document.createElement('canvas');canvas.width=canvas.height=resolution;const context=canvas.getContext('2d',{willReadFrequently:true});
 images.forEach((texture,i)=>{context.clearRect(0,0,resolution,resolution);context.drawImage(texture.image,0,0,resolution,resolution);const pixels=context.getImageData(0,0,resolution,resolution).data;bytes.set(pixels,i*resolution*resolution*4);const mean=[0,0,0];let count=0;for(let p=0;p<pixels.length;p+=64){for(let k=0;k<3;k++)mean[k]+=Math.pow(pixels[p+k]/255,2.2);count++;}for(let k=0;k<3;k++)mean[k]/=count;const l=mean[0]*.3+mean[1]*.59+mean[2]*.11;if(i===0||i===2)for(let k=0;k<3;k++)mean[k]=l+(mean[k]-l)*(i===0?.45:.5);if(i===0){mean[0]*=.85;mean[1]*=.96;mean[2]*=1.02;}else if(i===2)for(let k=0;k<3;k++)mean[k]*=.94;if(i===1)for(let k=0;k<3;k++)mean[k]*=.83;sourceMeans.push(mean[0]*.3+mean[1]*.59+mean[2]*.11);if(i!==8)texture.dispose();});
 const layers=new T.DataArrayTexture(bytes,resolution,resolution,names.length);layers.colorSpace=T.SRGBColorSpace;layers.wrapS=layers.wrapT=T.MirroredRepeatWrapping;layers.minFilter=T.LinearMipmapLinearFilter;layers.magFilter=T.LinearFilter;layers.generateMipmaps=true;layers.anisotropy=4;layers.needsUpdate=true;
 const declarations=`
 uniform sampler2D roadDetail;uniform sampler2D macroAlbedo;uniform sampler2D detailSelection;
 uniform highp sampler2DArray terrainLayers; uniform float fastTerrain;
 uniform float sourceMean[12];
 uniform sampler2D control0; uniform sampler2D control1; uniform sampler2D control2; uniform sampler2D control3;
 varying vec3 vTerrainPosition; varying vec3 vTerrainNormal;
 float pavementRelief=0.;float pavementCoverage=0.;
 ${terrainPbrDeclarations}
 ${terrainNoiseGLSL}
 ${roadEdgeGLSL}
 ${localRoadGLSL}
 ${rockyRidgeDeclarations}
 vec3 terrainSample(float layer,vec2 uv){if(fastTerrain>.5){vec2 flow=vec2(tnoise(vTerrainPosition.xy/100.+layer),tnoise(vTerrainPosition.yx/137.-layer));return texture(terrainLayers,vec3(uv+(flow-.5)*1.8,layer)).rgb;}float k=tnoise(vTerrainPosition.xy/103.+layer)*7.,a=floor(k),f=fract(k);vec2 oa=sin(vec2(3.,7.)*(a+layer)),ob=sin(vec2(3.,7.)*(a+1.+layer));vec3 ca=texture(terrainLayers,vec3(uv+oa,layer)).rgb,cb=texture(terrainLayers,vec3(mat2(0.,-1.,1.,0.)*uv+ob,layer)).rgb;return mix(ca,cb,smoothstep(.15,.85,f));}
 vec3 harmonize(vec3 color,float saturation){float l=dot(color,vec3(.3,.59,.11));return mix(vec3(l),color,saturation);}
 vec3 agedAsphalt(vec2 p){
  vec3 fine=terrainSample(6.,p/8.0);float grey=dot(fine,vec3(.3,.59,.11));vec3 c=mix(fine,vec3(grey),.86)*vec3(1.06,1.08,1.10)+vec3(.01);
  vec3 macro=terrainSample(6.,p/29.0);float crack=1.-smoothstep(.035,.065,dot(macro,vec3(.3,.59,.11)));c*=1.-crack*.65;pavementRelief=grey*.12-crack*.025;
  vec2 q=mat2(.94,-.34,.34,.94)*p/32.,cell=floor(q),f=fract(q);float repair=smoothstep(.79,.83,thash(cell))*smoothstep(.11,.15,f.x)*(1.-smoothstep(.68,.72,f.x))*smoothstep(.22,.26,f.y)*(1.-smoothstep(.56,.60,f.y));c*=1.-repair*.20;
  vec2 hc=floor(p/43.),hl=fract(p/43.),center=.20+.6*vec2(thash(hc+3.),thash(hc+7.));float radius=.025+thash(hc+11.)*.025,d=length((hl-center)*vec2(1.,1.35))-(radius*(.9+.15*tnoise(p*.6))),hole=(1.-smoothstep(-.003,.008,d))*smoothstep(.71,.75,thash(hc+19.));
  if(hole>.01)c=mix(c,terrainSample(3.,p/8.)*.48,hole*.9);
  return c;
 }
 vec3 roadSurface(vec3 ground,float inward){
  inward=withLocalRoad(vTerrainPosition.xy,inward);
  float footprint=fwidth(inward);
  vec2 p=vTerrainPosition.xy,gritUv=p/13.;
  vec2 gritDx=dFdx(gritUv),gritDy=dFdy(gritUv);
  if(inward < -8.5)return ground;
  float shoulder=smoothstep(-6.5,-1.4,inward)*(1.-smoothstep(-.6,0.,inward));
  if(shoulder>.001){
   float grit=dot(textureGrad(terrainLayers,vec3(gritUv,3.),gritDx,gritDy).rgb,vec3(.3,.59,.11))/max(.02,sourceMean[3]);
   vec3 gravel=ground*clamp(.74+.14*grit,.79,1.02);
   ground=mix(ground,gravel,.55*shoulder);
  }
  float mask=roadEdgeMask(inward,footprint);
  if(mask<=0.)return ground;
  vec3 asphalt=agedAsphalt(p);
  pavementCoverage=mask;
  return mix(ground,asphalt,mask);
 }

 `;
 const splat=`
 float terrainRelief=0.,terrainRoughness=.95;
 vec2 pbrKinds=vec2(0.);float pbrMix=0.,pbrFade=1.-smoothstep(220.,800.,length(vViewPosition));
 if(fastTerrain>.5){
  vec3 macroColor=texture2D(macroAlbedo,vMapUv).rgb,chosen=texture2D(detailSelection,vMapUv).rgb;
  float first=floor(chosen.r*255.+.5),second=floor(chosen.g*255.+.5);
  pbrKinds=vec2(pbrKind(first),pbrKind(second));pbrMix=chosen.b;
  vec3 a=terrainSample(first,vTerrainPosition.xy/28.),b=terrainSample(second,vTerrainPosition.xy/28.);
  float la=dot(a,vec3(.3,.59,.11)),lb=dot(b,vec3(.3,.59,.11));
  float rockDetail=(first==4.||first==9.||first==10.||first==11.)?.65:.16;terrainRelief=(mix(la,lb,chosen.b)-.14)*rockDetail;
  float grain=clamp(mix(la,lb,chosen.b)/max(.02,mix(sourceMean[int(first)],sourceMean[int(second)],chosen.b)),.76,1.25);
  vec3 baseColor=macroColor*mix(1.,grain,.55*(1.-pbrFade*.85));
  baseColor=roadSurface(rockyRidgeSurface(baseColor,length(vViewPosition)),(texture2D(roadDetail,vMapUv).g-.5)*24.);
  diffuseColor.rgb*=baseColor;
 }else{
 vec3 m0=texture2D(control0,vMapUv).rgb,m1=texture2D(control1,vMapUv).rgb,m2=texture2D(control2,vMapUv).rgb,m3=texture2D(control3,vMapUv).rgb;
 float weights[12]=float[12](m0.r,m0.g,m0.b,m1.r,m1.g,m1.b,0.,0.,m2.b,m3.r,m3.g,m3.b);
 float scales[12]=float[12](30.,38.,25.,20.,22.,26.,32.,38.,30.,26.,24.,30.);
 vec3 p=vTerrainPosition,tn=normalize(vTerrainNormal),result=vec3(0.);float total=0.,relief=0.,surfaceRoughness=0.,meanLum=0.;
 int chosen[3]=int[3](0,0,0);
 for(int pick=0;pick<3;pick++){float highest=-1.;int index=0;for(int i=0;i<12;i++){if(weights[i]>highest){highest=weights[i];index=i;}}chosen[pick]=index;weights[index]=-max(.0001,weights[index]);}
 pbrKinds=vec2(pbrKind(float(chosen[0])),pbrKind(float(chosen[1])));pbrMix=-weights[chosen[1]]/max(.001,-weights[chosen[0]]-weights[chosen[1]]);
 for(int pick=0;pick<3;pick++){int i=chosen[pick];float weight=-weights[i];if(weight>.008){vec2 uv=p.xy/scales[i];if(i==4||i==9){uv=abs(tn.z)>.7?p.xy/scales[i]:(abs(tn.x)>abs(tn.y)?p.yz/scales[i]:p.xz/scales[i]);}vec3 c=terrainSample(float(i),uv);float detail=dot(c,vec3(.3,.59,.11));if(i==0)c=harmonize(c,.45)*vec3(.85,.96,1.02);else if(i==2)c=harmonize(c,.50)*.94;else if(i==1)c*=.83;float w=weight*(.91+tnoise(p.xy/15.+float(i))*.18)*(.76+smoothstep(.035,.24,detail)*.48);result+=c*w;relief+=(detail-.14)*(i==4||i>=9?.65:.16)*w;surfaceRoughness+=(i==4||i>=9?.87:.97)*w;meanLum+=sourceMean[i]*w;total+=w;}}
 result/=max(total,.001);
 // Near the camera, scanned detail supplies the grain while the macro map
 // keeps each region's colour. This suppresses the old broad painted streaks.
 float textureGrain=clamp(dot(result,vec3(.3,.59,.11))/max(.02,meanLum/max(total,.001)),.76,1.30);
 result=texture2D(macroAlbedo,vMapUv).rgb*mix(1.,textureGrain,.55*(1.-pbrFade*.85));
 terrainRelief=relief/max(total,.001);terrainRoughness=surfaceRoughness/max(total,.001);
 if(m2.g>.006){vec3 concrete=terrainSample(7.,p.xy/38.)*.87;result=mix(result,concrete,min(1.,m2.g));}
 result=roadSurface(rockyRidgeSurface(result,length(vViewPosition)),(texture2D(roadDetail,vMapUv).g-.5)*24.);
 diffuseColor.rgb*=result*(.92+tnoise(p.xy/350.)*.13);
 }
 terrainRelief=mix(terrainRelief,pavementRelief,pavementCoverage);terrainRoughness=mix(terrainRoughness,.79,pavementCoverage);
 ${terrainPbrSurface}
 `;
 // The painted map supplies regional colour. Keep the scanned texture layers
 // in the foreground and skip the extra procedural warps in software WebGL.
 const lightSplat=`
 vec3 ground=texture2D(macroAlbedo,vMapUv).rgb;
 float detailFade=1.-smoothstep(520.,1500.,length(vViewPosition));
 if(detailFade>.002){
  vec3 selected=texture2D(detailSelection,vMapUv).rgb;
  float first=pbrKind(floor(selected.r*255.+.5)),second=pbrKind(floor(selected.g*255.+.5));
  vec3 p=vTerrainPosition,weights=terrainProjectionWeights(vTerrainNormal);
  float scaleA=first==1.?10.:pbrScale(first),scaleB=second==1.?10.:pbrScale(second);
  vec3 average=mix(pbrMeanColor[int(first)],pbrMeanColor[int(second)],selected.b);
  vec3 grain=vec3(0.);
  for(int axis=0;axis<3;axis++){float weight=weights[axis];if(weight<.001)continue;vec2 uv=axis==0?p.yz:(axis==1?p.xz:p.xy);
   vec3 a=texture(pbrAlbedo,vec3(uv/scaleA,first)).rgb,b=a;
   if(first!=second&&selected.b>.005)b=texture(pbrAlbedo,vec3(uv/scaleB,second)).rgb;
   grain+=clamp(mix(a,b,selected.b)/max(vec3(.015),average),vec3(.48),vec3(1.72))*weight;
  }
  ground*=mix(vec3(1.),grain,.63*detailFade);
 }
 ground=roadSurface(rockyRidgeSurface(ground,length(vViewPosition)),(texture2D(roadDetail,vMapUv).g-.5)*24.);
 diffuseColor.rgb*=ground*mix(vec3(1.04,1.,.95),vec3(1.),pavementCoverage);
 `;
 function configure(material,key,mode,paved=false){
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{
    ...localRoads.uniforms,
    terrainLayers:{value:layers},sourceMean:{value:sourceMeans},pbrAlbedo:{value:pbr.albedo},
    pbrDetail:{value:pbr.detail},pbrMean:{value:pbr.means},pbrMeanColor:{value:pbr.meanColors},
    roadDetail:{value:roadDetail},macroAlbedo:{value:macro},detailSelection:{value:selection},
    fastTerrain:{value:mode==='close'?0:1},
   });
   for(let i=0;i<controls.length;i++)shader.uniforms['control'+i]={value:controls[i]};
   shader.vertexShader=('varying vec3 vTerrainPosition;\nvarying vec3 vTerrainNormal;\n'+shader.vertexShader)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
     vTerrainPosition=(modelMatrix*vec4(position,1.0)).xyz;
     vTerrainNormal=normalize(mat3(modelMatrix)*normal);`);
   const surfaceDeclarations=paved?declarations.replace('inward=withLocalRoad(vTerrainPosition.xy,inward);','inward=24.;'):declarations;
   shader.fragmentShader=(surfaceDeclarations+shader.fragmentShader).replace('#include <map_fragment>',mode==='light'?lightSplat:splat);
   if(mode!=='light')shader.fragmentShader=shader.fragmentShader
    .replace('#include <normal_fragment_maps>',terrainPbrNormals)
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=terrainRoughness;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n'+rockyRidgeNormals);
  };
  material.customProgramCacheKey=()=>key+'_rocky_ridges_v2'+(paved?'_bridge':'');
  return material;
 }
 const markings=new T.MeshLambertMaterial({color:'#d1c8ad',transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide});markings.onBeforeCompile=shader=>{Object.assign(shader.uniforms,localRoads.uniforms);shader.uniforms.roadMask={value:roadDetail};shader.vertexShader='varying vec3 vMarkWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMarkWorld=(modelMatrix*vec4(position,1.)).xyz;');shader.fragmentShader='varying vec3 vMarkWorld;uniform sampler2D roadMask;\n'+roadEdgeGLSL+localRoadGLSL+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 roadUv=(vMarkWorld.xy+${(extent/2).toFixed(1)})/${extent.toFixed(1)};
 float inward=(texture2D(roadMask,roadUv).g-.5)*24.,footprint=fwidth(inward);
 diffuseColor.a*=(1.-localRoadPaintReplacement(vMarkWorld.xy))*roadEdgeMask(inward,footprint);`);};markings.customProgramCacheKey=()=> 'road_paint_v4';
 // The distant continuation uses two regular samples, without the layer shader.
 const farTile=images[8];farTile.colorSpace=T.SRGBColorSpace;farTile.wrapS=farTile.wrapT=T.MirroredRepeatWrapping;farTile.repeat.set(extent/35,extent/35);
 const surround=new T.MeshLambertMaterial({map:farTile,vertexColors:true});surround.onBeforeCompile=shader=>{shader.uniforms.macroAlbedo={value:macro};shader.vertexShader='varying vec3 vSurroundPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSurroundPosition=(modelMatrix*vec4(position,1.)).xyz;');shader.fragmentShader='varying vec3 vSurroundPosition;\nuniform sampler2D macroAlbedo;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 vec2 mapUv=(vSurroundPosition.xy+${(extent/2).toFixed(1)})/${extent.toFixed(1)};float outside=max(max(abs(vSurroundPosition.x),abs(vSurroundPosition.y))-${(extent/2).toFixed(1)},0.);vec3 borderColor=texture2D(macroAlbedo,mapUv).rgb;float grain=clamp(dot(diffuseColor.rgb,vec3(.3,.59,.11))/.24,.94,1.06);diffuseColor.rgb=mix(borderColor*grain,diffuseColor.rgb*vec3(1.02,.74,.45),smoothstep(0.,220.,outside))*(.97+sin(vSurroundPosition.x/750.)*sin(vSurroundPosition.y/1000.)*.04);`);};surround.customProgramCacheKey=()=> 'desert_surround_v2';
 let roadPixels;
 function roadBlendAt(x,y){
  const size=512;
  if(!roadPixels){
   canvas.width=canvas.height=size;
   context.drawImage(roadDetail.image,0,0,size,size);
   roadPixels=context.getImageData(0,0,size,size).data;
  }
  const u=Math.max(0,Math.min(size-1,Math.round((.5+x/extent)*(size-1))));
  const v=Math.max(0,Math.min(size-1,Math.round((.5-y/extent)*(size-1))));
  return localRoads.blendAt(x,y,roadPixels[(v*size+u)*4]/255);
 }
 const overview=configure(new T.MeshLambertMaterial({map:controls[0],vertexColors:true}),lightweightOverview?'mesa_software_v3':'mesa_array_v9',lightweightOverview?'light':'overview');
 const close=configure(new T.MeshStandardMaterial({map:controls[0],roughness:.96,metalness:0,vertexColors:true}),'mesa_array_pbr_v9','close');
 const bridgeOverview=configure(new T.MeshLambertMaterial({map:controls[0]}),'bridge_surface',lightweightOverview?'light':'overview',true);
 const bridgeClose=configure(new T.MeshStandardMaterial({map:controls[0],roughness:.96,metalness:0}),'bridge_surface_pbr','close',true);
 return {setLocalRoads:localRoads.setRoads,roadBlendAt,overview,close,bridgeOverview,bridgeClose,surround,markings,statistics:{style:'ochre desert terrain, layered rock and broken asphalt',albedoTiles:12,tileResolution:resolution,controlMaps:4,maskResolution:1024,blending:'height + smoothed slope + organic deposition + stochastic UVs + scanned PBR surfaces',pbr:pbr.statistics,normalDetail:'scanned OpenGL normal maps; fades from 220m to 800m',roughnessByMaterial:true,distantShaderSamples:2,textureArray:true,sourceSheetAsAlbedo:false,lightweightOverview}};
}
