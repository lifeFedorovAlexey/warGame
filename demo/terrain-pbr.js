// CC0 source maps are packed once into two small GPU arrays. Alpha carries
// ambient occlusion in the colour array and roughness in the normal array.
export async function loadTerrainPbr(T,loader,base){
 const ids=['gravelly_sand','sandy_gravel','asphalt_03','quarry_wall_02'],size=512,stride=size*size*4;
 const maps=await Promise.all(ids.map(id=>Promise.all(['albedo','normal','orm'].map(channel=>loader.loadAsync(base+'materials/pbr/'+id+'/'+channel+'.jpg')))));
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const context=canvas.getContext('2d',{willReadFrequently:true}),colors=new Uint8Array(stride*ids.length),details=new Uint8Array(stride*ids.length),means=[];
 maps.forEach((images,layer)=>{
  const channels=images.map(image=>{context.setTransform(1,0,0,-1,0,size);context.clearRect(0,0,size,size);context.drawImage(image.image,0,0,size,size);const data=context.getImageData(0,0,size,size).data.slice();image.dispose();return data;});let luminance=0;
  for(let i=0;i<stride;i+=4){const [albedo,normal,orm]=channels;colors.set([albedo[i],albedo[i+1],albedo[i+2],orm[i]],layer*stride+i);details.set([normal[i],normal[i+1],normal[i+2],orm[i+1]],layer*stride+i);luminance+=(Math.pow(albedo[i]/255,2.2)*.3+Math.pow(albedo[i+1]/255,2.2)*.59+Math.pow(albedo[i+2]/255,2.2)*.11);}
  means.push(luminance/(size*size));
 });
 function array(bytes,srgb){const texture=new T.DataArrayTexture(bytes,size,size,ids.length);if(srgb)texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;return texture;}
 return {albedo:array(colors,true),detail:array(details,false),means,statistics:{sets:ids,resolution:size,channels:'albedo/AO + OpenGL normal/roughness',gpuBytesBeforeMipmaps:colors.length+details.length,license:'CC0-1.0'}};
}

export const terrainPbrDeclarations=`
uniform highp sampler2DArray pbrAlbedo;uniform highp sampler2DArray pbrDetail;uniform float pbrMean[4];
float pbrKind(float layer){if(layer==6.)return 2.;if(layer==4.||layer==9.)return 3.;if(layer==3.||layer==10.||layer==7.||layer==11.)return 1.;return 0.;}
float pbrScale(float kind){return kind==2.?18.:(kind==3.?13.:10.);}
`;

export const terrainPbrSurface=`
vec2 surfacePbrUv=vTerrainPosition.xy;vec3 surfacePbrNormal=vec3(0.,0.,1.);
if(abs(vTerrainNormal.z)<.55||(pbrKinds.x==3.&&pbrMix<.6)||(pbrKinds.y==3.&&pbrMix>.4))surfacePbrUv=abs(vTerrainNormal.x)>abs(vTerrainNormal.y)?vTerrainPosition.yz:vTerrainPosition.xz;
if(pbrFade>.002){
 if(pavementCoverage>.5){pbrKinds=vec2(2.);pbrMix=0.;}
 vec3 uvA=vec3(surfacePbrUv/pbrScale(pbrKinds.x),pbrKinds.x),uvB=vec3(surfacePbrUv/pbrScale(pbrKinds.y),pbrKinds.y);
 vec4 ca=texture(pbrAlbedo,uvA),na=texture(pbrDetail,uvA),cb=ca,nb=na;
 if(pbrKinds.x!=pbrKinds.y&&pbrMix>.005){cb=texture(pbrAlbedo,uvB);nb=texture(pbrDetail,uvB);}
 vec4 color=mix(ca,cb,pbrMix),detail=mix(na,nb,pbrMix);
 float reference=mix(pbrMean[int(pbrKinds.x)],pbrMean[int(pbrKinds.y)],pbrMix),grain=clamp(dot(color.rgb,vec3(.3,.59,.11))/max(.02,reference),.48,1.65);
 diffuseColor.rgb*=mix(1.,grain,.58*pbrFade)*mix(1.,.78+.22*color.a,pbrFade);
 if(pavementCoverage>.5)diffuseColor.rgb=mix(diffuseColor.rgb,harmonize(color.rgb,.15)*vec3(1.05,1.07,1.09),pavementClean*.3*pbrFade);
 surfacePbrNormal=normalize(detail.rgb*2.-1.);surfacePbrNormal.xy*=pbrKinds.x==3.?.6:.42;
 terrainRoughness=mix(terrainRoughness,clamp(detail.a,.64,.99),pbrFade);
}
diffuseColor.rgb*=mix(vec3(1.14,.99,.83),vec3(1.),pavementCoverage);
`;

export const terrainPbrNormals=`
#include <normal_fragment_maps>
if(pbrFade>.002){
 vec3 dpX=dFdx(-vViewPosition),dpY=dFdy(-vViewPosition),perpY=cross(dpY,normal),perpX=cross(normal,dpX);vec2 uvX=dFdx(surfacePbrUv),uvY=dFdy(surfacePbrUv);
 vec3 tangent=perpY*uvX.x+perpX*uvY.x,bitangent=perpY*uvX.y+perpX*uvY.y;float invScale=inversesqrt(max(.000000000001,max(dot(tangent,tangent),dot(bitangent,bitangent))));
 vec3 mapped=normalize(mat3(tangent*invScale,bitangent*invScale,normal)*normalize(surfacePbrNormal));normal=normalize(mix(normal,mapped,pbrFade));
}
`;
