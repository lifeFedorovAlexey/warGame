// WebGL2 texture array: twelve surfaces share one sampler and independent mip chains.
import {terrainNoiseGLSL,roadSandGLSL} from './road-surface.js';
import {loadTerrainPbr,terrainPbrDeclarations,terrainPbrSurface,terrainPbrNormals} from './terrain-pbr.js';
export async function createTerrainMaterials(T,extent){
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
 float pavementRelief=0.;float pavementCoverage=0.;float pavementClean=0.;float pavementSand=0.;
 ${terrainPbrDeclarations}
 ${terrainNoiseGLSL}
 ${roadSandGLSL}
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
 vec3 roadSurface(vec3 ground,vec2 coverage){
  vec2 p=vTerrainPosition.xy;
  float inward=(coverage.g-.5)*24.;
  float sand=roadSandAmount(p,inward);
  vec3 asphalt=agedAsphalt(p);
  // Dust has the local ground colour, so shoulders inherit each valley's sand.
  vec3 dust=ground*mix(1.02,1.06,tnoise(p/12.));
  asphalt=mix(asphalt,dust,clamp(sand,0.,1.));
  float crumble=.12+(tnoise(p/2.7)-.5)*.18+(tnoise(p*1.4)-.5)*.05;
  float edgeAA=max(.06,fwidth(inward)*.65);
  float mask=smoothstep(crumble-edgeAA,crumble+edgeAA,inward);
  pavementCoverage=mask;pavementSand=sand*mask;pavementClean=mask*(1.-clamp(sand,0.,1.));
  return mix(ground,asphalt,mask*.97);
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
  vec3 baseColor=macroColor*mix(1.,grain,.55*(1.-pbrFade*.85));vec2 roadCoverage=texture2D(roadDetail,vMapUv).rg;if(roadCoverage.r>.005)baseColor=roadSurface(baseColor,roadCoverage);
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
 vec2 roadCoverage=texture2D(roadDetail,vMapUv).rg;if(roadCoverage.r>.005)result=roadSurface(result,roadCoverage);
 diffuseColor.rgb*=result*(.92+tnoise(p.xy/350.)*.13);
 }
 terrainRelief=mix(terrainRelief,pavementRelief,pavementCoverage);terrainRoughness=mix(terrainRoughness,.79,pavementCoverage);
 ${terrainPbrSurface}
 `;
 function configure(material,key,fast){material.onBeforeCompile=shader=>{shader.uniforms.terrainLayers={value:layers};shader.uniforms.sourceMean={value:sourceMeans};shader.uniforms.pbrAlbedo={value:pbr.albedo};shader.uniforms.pbrDetail={value:pbr.detail};shader.uniforms.pbrMean={value:pbr.means};shader.uniforms.pbrMeanColor={value:pbr.meanColors};shader.uniforms.roadDetail={value:roadDetail};shader.uniforms.macroAlbedo={value:macro};shader.uniforms.detailSelection={value:selection};shader.uniforms.fastTerrain={value:fast?1:0};for(let i=0;i<4;i++)shader.uniforms['control'+i]={value:controls[i]};shader.vertexShader='varying vec3 vTerrainPosition;\nvarying vec3 vTerrainNormal;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainPosition=(modelMatrix*vec4(position,1.0)).xyz;\nvTerrainNormal=normalize(mat3(modelMatrix)*normal);');shader.fragmentShader=declarations+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',splat).replace('#include <normal_fragment_maps>',terrainPbrNormals).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=terrainRoughness;');};material.customProgramCacheKey=()=>key;return material;}
 const markings=new T.MeshLambertMaterial({color:'#d1c8ad',transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide});markings.onBeforeCompile=shader=>{shader.uniforms.roadMask={value:roadDetail};shader.vertexShader='varying vec3 vMarkWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMarkWorld=(modelMatrix*vec4(position,1.)).xyz;');shader.fragmentShader='varying vec3 vMarkWorld;uniform sampler2D roadMask;\n'+terrainNoiseGLSL+roadSandGLSL+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 roadUv=(vMarkWorld.xy+${(extent/2).toFixed(1)})/${extent.toFixed(1)};float inward=(texture2D(roadMask,roadUv).g-.5)*24.;diffuseColor.a*=1.-roadSandAmount(vMarkWorld.xy,inward);`);};markings.customProgramCacheKey=()=> 'buried_road_paint_v1';
 // The distant continuation uses two regular samples, without the layer shader.
 const farTile=images[8];farTile.colorSpace=T.SRGBColorSpace;farTile.wrapS=farTile.wrapT=T.MirroredRepeatWrapping;farTile.repeat.set(extent/35,extent/35);
 const surround=new T.MeshLambertMaterial({map:farTile,vertexColors:true});surround.onBeforeCompile=shader=>{shader.uniforms.macroAlbedo={value:macro};shader.vertexShader='varying vec3 vSurroundPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSurroundPosition=(modelMatrix*vec4(position,1.)).xyz;');shader.fragmentShader='varying vec3 vSurroundPosition;\nuniform sampler2D macroAlbedo;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 vec2 mapUv=(vSurroundPosition.xy+${(extent/2).toFixed(1)})/${extent.toFixed(1)};float outside=max(max(abs(vSurroundPosition.x),abs(vSurroundPosition.y))-${(extent/2).toFixed(1)},0.);vec3 borderColor=texture2D(macroAlbedo,mapUv).rgb;float grain=clamp(dot(diffuseColor.rgb,vec3(.3,.59,.11))/.24,.94,1.06);diffuseColor.rgb=mix(borderColor*grain,diffuseColor.rgb*vec3(1.02,.74,.45),smoothstep(0.,220.,outside))*(.97+sin(vSurroundPosition.x/750.)*sin(vSurroundPosition.y/1000.)*.04);`);};surround.customProgramCacheKey=()=> 'desert_surround_v2';
 return {overview:configure(new T.MeshLambertMaterial({map:controls[0],vertexColors:true}),'mesa_array_v7',true),close:configure(new T.MeshStandardMaterial({map:controls[0],roughness:.96,metalness:0,vertexColors:true}),'mesa_array_pbr_v7',false),surround,markings,statistics:{style:'ochre desert terrain, layered rock and broken asphalt',albedoTiles:12,tileResolution:resolution,controlMaps:4,maskResolution:1024,blending:'height + smoothed slope + organic deposition + stochastic UVs + scanned PBR surfaces',pbr:pbr.statistics,normalDetail:'scanned OpenGL normal maps; fades from 220m to 800m',roughnessByMaterial:true,distantShaderSamples:2,textureArray:true,sourceSheetAsAlbedo:false}};
}
