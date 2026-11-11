// A surface treatment of the existing heightfield, never a second collision
// landscape. Roads, flat yards and the authored level openings stay intact.
export const rockyRidgeDeclarations=`
float ridgeCoverage=0.;
float ridgeMask(vec3 p,vec3 n){
 float slope=length(n.xy)/max(.08,abs(n.z));
 float exposure=tnoise(p.xy/94.+vec2(17.,-9.));
 return smoothstep(.24,.68,slope+(exposure-.5)*.24)*smoothstep(3.,11.,p.z);
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
 float strata=sin(p.z*.35+tnoise(p.xy/55.)*2.);
 float seam=1.-smoothstep(.02,.16+fwidth(strata),abs(strata));
 float detail=1.-smoothstep(600.,1900.,viewDistance);
 vec3 stone=mix(ground*vec3(1.12,1.23,1.36),sandstone*.63,.72);
 stone*= (.92+broad*.16)*(1.-seam*.07*detail);
 return mix(ground,stone,ridgeCoverage*.9);
}
`;

export const rockyRidgeNormals=`
// Use the real mesh's planar faces on exposed rock. No displacement means
// vehicle contact, foundations and navigation still share exactly one surface.
vec3 rockFace=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
if(dot(rockFace,normal)<0.)rockFace=-rockFace;
normal=normalize(mix(normal,rockFace,ridgeCoverage*(1.-pavementCoverage)*.20));
`;
