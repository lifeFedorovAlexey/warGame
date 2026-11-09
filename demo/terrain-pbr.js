// CC0 source maps are packed once into two small GPU arrays. Alpha carries
// ambient occlusion in the colour array and roughness in the normal array.
export async function loadTerrainPbr(T,loader,base){
 const ids=['gravelly_sand','sandy_gravel','asphalt_03','quarry_wall_02'],size=512,stride=size*size*4;
 const maps=await Promise.all(ids.map(id=>Promise.all(['albedo','normal','orm'].map(channel=>loader.loadAsync(base+'materials/pbr/'+id+'/'+channel+'.jpg')))));
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const context=canvas.getContext('2d',{willReadFrequently:true}),colors=new Uint8Array(stride*ids.length),details=new Uint8Array(stride*ids.length),means=[],meanColors=[];
 maps.forEach((images,layer)=>{
  const channels=images.map(image=>{context.setTransform(1,0,0,-1,0,size);context.clearRect(0,0,size,size);context.drawImage(image.image,0,0,size,size);const data=context.getImageData(0,0,size,size).data.slice();image.dispose();return data;});let luminance=0;const mean=[0,0,0];
  for(let i=0;i<stride;i+=4){const [albedo,normal,orm]=channels;colors.set([albedo[i],albedo[i+1],albedo[i+2],orm[i]],layer*stride+i);details.set([normal[i],normal[i+1],normal[i+2],orm[i+1]],layer*stride+i);luminance+=(Math.pow(albedo[i]/255,2.2)*.3+Math.pow(albedo[i+1]/255,2.2)*.59+Math.pow(albedo[i+2]/255,2.2)*.11);for(let k=0;k<3;k++)mean[k]+=Math.pow(albedo[i+k]/255,2.2);}
  means.push(luminance/(size*size));meanColors.push(new T.Vector3(...mean.map(value=>value/(size*size))));
 });
 function array(bytes,srgb){const texture=new T.DataArrayTexture(bytes,size,size,ids.length);if(srgb)texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;return texture;}
 return {albedo:array(colors,true),detail:array(details,false),means,meanColors,statistics:{sets:ids,resolution:size,channels:'albedo/AO + OpenGL normal/roughness',gpuBytesBeforeMipmaps:colors.length+details.length,license:'CC0-1.0'}};
}

export const terrainPbrDeclarations=`
uniform highp sampler2DArray pbrAlbedo;uniform highp sampler2DArray pbrDetail;uniform float pbrMean[4];uniform vec3 pbrMeanColor[4];
float pbrKind(float layer){if(layer==6.)return 2.;if(layer==4.||layer==9.)return 3.;if(layer==0.||layer==1.||layer==8.||layer==11.)return 1.;return 0.;}
float pbrScale(float kind){return kind==2.?18.:(kind==3.?13.:(kind==1.?6.:10.));}
vec3 terrainProjectionWeights(vec3 n){vec3 w=pow(abs(normalize(n)),vec3(6.));return w/max(.00001,w.x+w.y+w.z);}
vec3 terrainProjectedNormal(vec2 uv,vec3 detail,vec3 base,vec3 view){
 vec3 dpX=dFdx(-view),dpY=dFdy(-view),perpY=cross(dpY,base),perpX=cross(base,dpX);vec2 uvX=dFdx(uv),uvY=dFdy(uv);
 vec3 tangent=perpY*uvX.x+perpX*uvY.x,bitangent=perpY*uvX.y+perpX*uvY.y;float invScale=inversesqrt(max(.000000000001,max(dot(tangent,tangent),dot(bitangent,bitangent))));
 return normalize(mat3(tangent*invScale,bitangent*invScale,base)*normalize(detail));
}
`;

export const terrainPbrSurface=`
if(pavementCoverage>.5){
 pbrKinds=vec2(2.);pbrMix=0.;
 pbrFade*=smoothstep(.55,.96,pavementCoverage);
}else{
 pbrFade*=1.-smoothstep(.15,.45,pavementCoverage);
}
vec2 surfacePbrUv[3];vec3 surfacePbrNormal[3];vec3 surfacePbrWeights=vec3(0.,0.,1.);
if(pbrFade>.002){
if(pavementCoverage<.5&&max(pbrKinds.x,pbrKinds.y)<1.5){pbrKinds=vec2(1.,0.);pbrMix=smoothstep(.34,.72,tnoise(vTerrainPosition.xy/37.+vec2(tnoise(vTerrainPosition.xy/93.),0.)))*.85;diffuseColor.rgb*=mix(vec3(1.),vec3(.88,.92,.96),pbrMix*pbrFade);}
bool layeredRock=(pbrKinds.x==3.&&pbrMix<.6)||(pbrKinds.y==3.&&pbrMix>.4);
// Blend samples, not UV coordinates: the old slope threshold cut a hard stripe
// across the terrain and stretched the normal map along that boundary.
if(pavementCoverage<.5)surfacePbrWeights=terrainProjectionWeights(vTerrainNormal);
surfacePbrUv[0]=vTerrainPosition.yz;surfacePbrUv[1]=vTerrainPosition.xz;surfacePbrUv[2]=vTerrainPosition.xy;
vec3 meanColor=mix(pbrMeanColor[int(pbrKinds.x)],pbrMeanColor[int(pbrKinds.y)],pbrMix),grain=vec3(0.),pbrRoadColor=vec3(0.);float pbrOcclusion=0.,pbrRoughness=0.;
for(int axis=0;axis<3;axis++){
 surfacePbrNormal[axis]=vec3(0.,0.,1.);float weight=surfacePbrWeights[axis];if(weight<.001)continue;
 surfacePbrUv[axis].x+=(tnoise(surfacePbrUv[axis]/19.)-.5)*3.2;
 if(!layeredRock)surfacePbrUv[axis].y+=(tnoise(surfacePbrUv[axis].yx/23.+17.)-.5)*3.2;
 vec3 uvA=vec3(surfacePbrUv[axis]/pbrScale(pbrKinds.x),pbrKinds.x),uvB=vec3(surfacePbrUv[axis]/pbrScale(pbrKinds.y),pbrKinds.y);
 vec4 ca=texture(pbrAlbedo,uvA),na=texture(pbrDetail,uvA),cb=ca,nb=na;
 if(pbrKinds.x!=pbrKinds.y&&pbrMix>.005){cb=texture(pbrAlbedo,uvB);nb=texture(pbrDetail,uvB);}
 vec4 color=mix(ca,cb,pbrMix),detail=mix(na,nb,pbrMix);
 grain+=clamp(color.rgb/max(vec3(.015),meanColor),vec3(.40),vec3(1.9))*weight;pbrRoadColor+=color.rgb*weight;pbrOcclusion+=color.a*weight;pbrRoughness+=detail.a*weight;
 surfacePbrNormal[axis]=normalize(detail.rgb*2.-1.);surfacePbrNormal[axis].xy*=pbrKinds.x==3.?.6:.62;
}
 diffuseColor.rgb*=mix(vec3(1.),grain,.78*pbrFade)*mix(1.,.78+.22*pbrOcclusion,pbrFade);
 if(pavementCoverage>.5)diffuseColor.rgb=mix(diffuseColor.rgb,harmonize(pbrRoadColor,.15)*vec3(1.05,1.07,1.09),pavementCoverage*.3*pbrFade);
 terrainRoughness=mix(terrainRoughness,clamp(pbrRoughness,.64,.99),pbrFade);
}
diffuseColor.rgb*=mix(vec3(1.04,1.,.95),vec3(1.),pavementCoverage);
`;

export const terrainPbrNormals=`
#include <normal_fragment_maps>
if(pbrFade>.002){
 vec3 mapped=vec3(0.);for(int axis=0;axis<3;axis++)if(surfacePbrWeights[axis]>=.001)mapped+=terrainProjectedNormal(surfacePbrUv[axis],surfacePbrNormal[axis],normal,vViewPosition)*surfacePbrWeights[axis];
 normal=normalize(mix(normal,normalize(mapped),pbrFade));
}
`;
