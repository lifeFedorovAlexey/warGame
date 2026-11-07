export const terrainNoiseGLSL=`
float thash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(thash(i),thash(i+vec2(1.,0.)),f.x),mix(thash(i+vec2(0.,1.)),thash(i+vec2(1.)),f.x),f.y);}
`;

// The road and its painted markings share this mask: opaque sand buries paint.
export const roadSandGLSL=`
float roadSandAmount(vec2 p,float inward){
 float edge=1.-smoothstep(.15,2.4,inward);
 vec2 windUv=vec2(dot(p,vec2(.94,.34))/27.,dot(p,vec2(-.34,.94))/7.);
 float wind=tnoise(windUv+vec2(tnoise(p/75.),0.));
 float sand=edge*smoothstep(.50,.64,wind)*.98;
 sand=max(sand,(1.-smoothstep(1.1,5.2,inward))*smoothstep(.77,.85,tnoise(p/31.)));
 return clamp(sand,0.,1.);
}
`;
