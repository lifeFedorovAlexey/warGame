export const terrainNoiseGLSL=`
float thash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(thash(i),thash(i+vec2(1.,0.)),f.x),mix(thash(i+vec2(0.,1.)),thash(i+vec2(1.)),f.x),f.y);}
`;

// The road and its painted markings share this mask: opaque sand buries paint.
export const roadSandGLSL=`
vec2 sandGradient(vec2 p){vec2 g=fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453)*2.-1.;return g*inversesqrt(max(.01,dot(g,g)));}
float sandNoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.);float a=dot(sandGradient(i),f),b=dot(sandGradient(i+vec2(1.,0.)),f-vec2(1.,0.)),c=dot(sandGradient(i+vec2(0.,1.)),f-vec2(0.,1.)),d=dot(sandGradient(i+vec2(1.)),f-vec2(1.));return .5+.7*mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float roadSandAmount(vec2 p,float inward){
 vec2 windUv=vec2(dot(p,vec2(.94,.34))/23.,dot(p,vec2(-.34,.94))/11.);
 float warp=tnoise(p/95.);windUv+=vec2(warp*.6,warp*.25);
 float drift=.68*sandNoise(windUv)+.32*sandNoise(mat2(.8,-.6,.6,.8)*windUv*2.2+17.);
 // A continuous depth field produces rounded wind deposits, with bare gaps.
 // Negative reach leaves asphalt exposed; sparse tongues extend to 2.4m.
 float reach=-1.4+smoothstep(.43,.76,drift)*3.8;
 float grains=(tnoise(p*2.3)-.5)*.12;
 float feather=max(.35,fwidth(inward-reach)*.65);
 return 1.-smoothstep(reach-feather,reach+feather,inward+grains);
}
`;
