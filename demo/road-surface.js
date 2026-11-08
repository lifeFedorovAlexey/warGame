export const terrainNoiseGLSL=`
float thash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(thash(i),thash(i+vec2(1.,0.)),f.x),mix(thash(i+vec2(0.,1.)),thash(i+vec2(1.)),f.x),f.y);}
`;

// Asphalt and painted markings share the geometric road edge, with only
// pixel-sized antialiasing. Sand stays outside the pavement.
export const roadEdgeGLSL=`
float roadEdgeMask(float edge,float footprint){
 float aa=clamp(footprint*.5,.12,.8);
 return smoothstep(-aa,aa,edge);
}
`;
