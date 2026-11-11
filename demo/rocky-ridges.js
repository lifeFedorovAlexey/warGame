// A surface treatment of the existing heightfield, never a second collision
// landscape. Roads, flat yards and the authored level openings stay intact.
export const rockyRidgeDeclarations=`
float ridgeCoverage=0.;
float ridgeMask(vec3 p,vec3 n){
 float slope=length(n.xy)/max(.08,abs(n.z));
 float exposure=tnoise(p.xy/94.+vec2(17.,-9.));
 return smoothstep(.16,.48,slope+(exposure-.5)*.16)*smoothstep(3.,11.,p.z);
}
vec3 rockyRidgeSurface(vec3 ground,float viewDistance){
 vec3 p=vTerrainPosition,n=normalize(vTerrainNormal);
 ridgeCoverage=ridgeMask(p,n);
 if(ridgeCoverage<.002)return ground;
 vec3 weights=terrainProjectionWeights(n),sandstone=vec3(0.);
 for(int axis=0;axis<3;axis++){
  float weight=weights[axis];if(weight<.001)continue;
  vec2 uv=axis==0?p.yz:(axis==1?p.xz:p.xy);
  // Large sandstone layers, not quarry-tool scratches magnified across hills.
  uv.x+=(tnoise(p.xy/93.)-.5)*12.;
  sandstone+=texture(terrainLayers,vec3(uv/67.,9.)).rgb*weight;
 }
 // Broad warm sandstone masses and irregular bedding survive the overview
 // scale; fine scanned grain recedes without turning into a speckled carpet.
 float broad=tnoise(p.xy/73.);
 float strata=sin(p.z*.55+tnoise(p.xy/95.)*1.3);
 float seam=1.-smoothstep(.04,.25+fwidth(strata),abs(strata));
 float fracture=1.-smoothstep(.035,.14,abs(tnoise(p.xy/27.)-.5));
 float detail=1.-smoothstep(600.,1900.,viewDistance);
 vec3 stone=mix(ground*vec3(.93,.94,.96),sandstone*.59,.80);
 stone*= (.88+broad*.22)*(1.-seam*.19)*(1.-fracture*.11*detail);
 return mix(ground,stone,ridgeCoverage*.9);
}
`;

export const rockyRidgeNormals=`
// Use the real mesh's planar faces on exposed rock. No displacement means
// vehicle contact, foundations and navigation still share exactly one surface.
vec3 rockFace=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
if(dot(rockFace,normal)<0.)rockFace=-rockFace;
normal=normalize(mix(normal,rockFace,ridgeCoverage*(1.-pavementCoverage)*.58));
`;
