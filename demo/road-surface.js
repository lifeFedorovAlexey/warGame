export const terrainNoiseGLSL=`
float thash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(thash(i),thash(i+vec2(1.,0.)),f.x),mix(thash(i+vec2(0.,1.)),thash(i+vec2(1.)),f.x),f.y);}
`;

// The road and its painted markings share this mask: opaque sand buries paint.
export const roadSandGLSL=`
vec2 sandGradient(vec2 p){vec2 g=fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453)*2.-1.;return g*inversesqrt(max(.01,dot(g,g)));}
float sandNoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.);float a=dot(sandGradient(i),f),b=dot(sandGradient(i+vec2(1.,0.)),f-vec2(1.,0.)),c=dot(sandGradient(i+vec2(0.,1.)),f-vec2(0.,1.)),d=dot(sandGradient(i+vec2(1.)),f-vec2(1.));return .5+.7*mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float roadEdgeOffset(vec2 p){return (tnoise(p/13.)-.5)*1.2+(tnoise(p/2.9)-.5)*.4;}
float roadEdgeMask(float edge,float footprint){
 float aa=clamp(footprint*.38,.24,1.4);
 return smoothstep(-.65-aa,1.45+aa,edge);
}
float roadSandAmount(vec2 p,float edge,float footprint){
 float feather=clamp(footprint*.65,.58,1.65);
 const float dustLimit=5.2,reachLimit=4.25,grainLimit=.12;
 if(edge>max(dustLimit,reachLimit+feather)+grainLimit)return 0.;
 vec2 windUv=vec2(dot(p,vec2(.94,.34))/23.,dot(p,vec2(-.34,.94))/11.);
 float warp=tnoise(p/95.);windUv+=vec2(warp*.6,warp*.25);
 float drift=.68*sandNoise(windUv)+.32*sandNoise(mat2(.8,-.6,.6,.8)*windUv*2.2+17.);
 float reach=mix(-.55,reachLimit,smoothstep(.43,.76,drift));
 float grains=(tnoise(p*2.3)*2.-1.)*grainLimit;
 float deposits=1.-smoothstep(reach-feather,reach+feather,edge+grains);
 float veil=smoothstep(.26,.72,drift);
 float dust=mix(.49,.83,veil)*(1.-smoothstep(-.5,mix(3.4,dustLimit,veil),edge+grains));
 return max(dust,deposits);
}
`;
