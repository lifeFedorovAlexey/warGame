import {m03Source as source} from './mission03-terrain.js';
import {alphaMacroColor} from '../demo/terrain-palette.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),corners=[];
// Decode the original tile rotations/flips before blending the four grounds.
for(const tile of source.tiles){let uv=[[0,0],[1,0],[1,1],[0,1]];if(tile&0x8000){[uv[0],uv[1]]=[uv[1],uv[0]];[uv[2],uv[3]]=[uv[3],uv[2]];}if(tile&0x4000){[uv[0],uv[3]]=[uv[3],uv[0]];[uv[1],uv[2]]=[uv[2],uv[1]];}const r=(tile>>12)&3;uv=uv.map((_,i)=>uv[(i-r+4)%4]);const grounds=source.groundCorners[tile&511];corners.push(uv.map(([x,y])=>grounds[y?(x?2:3):(x?1:0)]));}
const vertices=Array.from({length:(source.width+1)*(source.height+1)},()=>new Float32Array(8)),counts=new Uint8Array(vertices.length);
for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)for(const [i,[dx,dy]] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]]){const index=(y+dy)*(source.width+1)+x+dx;vertices[index][corners[y*source.width+x][i]]++;counts[index]++;}
vertices.forEach((v,i)=>{for(let k=0;k<8;k++)v[k]/=counts[i]||1;});
export function m03GroundAt(gx,gy){const x=clamp(gx-source.offset[0],0,source.width-.00001),y=clamp(gy-source.offset[1],0,source.height-.00001),ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,result=Array(8).fill(0);for(const [dx,dy,w] of [[0,0,(1-u)*(1-v)],[1,0,u*(1-v)],[1,1,u*v],[0,1,(1-u)*v]]){const a=vertices[(iy+dy)*(source.width+1)+ix+dx];for(let i=0;i<8;i++)result[i]+=a[i]*w;}return result;}
export function m03TypeAt(gx,gy){const x=clamp(Math.floor(gx-source.offset[0]),0,source.width-1),y=clamp(Math.floor(gy-source.offset[1]),0,source.height-1);return source.terrainTypes[y*source.width+x];}
const fract=v=>v-Math.floor(v),hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
export function m03Noise(x,y){const ix=Math.floor(x),iy=Math.floor(y),a=fract(x),b=fract(y),u=a*a*(3-2*a),v=b*b*(3-2*b);return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;}
export function m03SurfaceAt(field,gx,gy){
 const wx=gx*32-field.half,wy=field.half-gy*32,g=field.gradientAt(wx,wy),slope=Math.hypot(g.x,g.y),ground=m03GroundAt(gx,gy),weights=Array(12).fill(0);
 // Original region masks, rendered with the existing game's scanned materials.
 const mixes=[[[5,.7],[3,.3]],[[9,.85],[10,.15]],[[3,.65],[8,.35]],[[0,.60],[3,.25],[8,.15]],[[0,.45],[3,.35],[5,.2]],[[2,.7],[0,.2],[3,.1]],[[0,.8],[8,.2]],[[0,.7],[1,.2],[8,.1]]];
 ground.forEach((w,i)=>mixes[i].forEach(([layer,f])=>weights[layer]+=w*f));
 const rock=clamp((slope-.12)*2,0,.95);for(let i=0;i<12;i++)weights[i]*=1-rock;weights[9]+=rock*.78;weights[10]+=rock*.22;
 const color=alphaMacroColor(weights);
 return {weights,color,type:m03TypeAt(gx,gy)};
}
