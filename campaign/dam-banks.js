import {damWorld} from './dam-layout.js';

export function createDamBanks(T,field,layout,shore,terrainMaterial){
 const rim=[[-41,-20],[-42,-9],...shore,[42,-9],[41,-20]],points=[];
 for(let i=1;i<rim.length;i++)for(let j=0;j<5;j++){const t=j/5;points.push([rim[i-1][0]*(1-t)+rim[i][0]*t,rim[i-1][1]*(1-t)+rim[i][1]*t]);}points.push(rim.at(-1));
 const positions=[],uv=[],colors=[],indices=[],rows=10;
 const ground=(x,y)=>{const p=damWorld(layout,x,y);return(field.heightAt(p.x,p.y)-layout.z)/layout.scale;};
 const vertex=(x,y,z)=>{const p=damWorld(layout,x,y);positions.push(x,y,z);uv.push(p.x/field.extent+.5,p.y/field.extent+.5);colors.push(.97,.97,.97);};
 for(const [i,p] of points.entries()){
  const dx=p[0]/43,dy=Math.max(.02,p[1]/28),n=Math.hypot(dx,dy),ridge=[p[0]+dx/n*2,Math.min(30,p[1]+dy/n*1.5)],outer=[p[0]+dx/n*27,Math.min(32,p[1]+dy/n*15)];
  const end=Math.max(0,Math.min(1,(p[1]+20)/20)),blend=end*end*(3-2*end),innerZ=ground(...p)*(1-blend)+(layout.reservoir.level-.2)*blend;
  const crestZ=ground(...ridge)*(1-blend)+(20.25+Math.sin(i*.15)*.35)*blend;
  vertex(...p,innerZ);vertex(...ridge,crestZ);
  for(let row=2;row<rows;row++){
   const t=(row-1)/(rows-2),x=ridge[0]*(1-t)+outer[0]*t,y=ridge[1]*(1-t)+outer[1]*t,h=ground(x,y),ease=Math.cos(t*Math.PI/2)**2;
   vertex(x,y,h+Math.max(0,crestZ-h)*ease-.16*t);
  }
  if(i)for(let row=0;row<rows-1;row++){const a=(i-1)*rows+row,b=i*rows+row;indices.push(a,b,a+1,a+1,b,b+1);}
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 // Exactly the map's material, world UVs and scale: no second sand palette.
 const bank=new T.Mesh(geometry,terrainMaterial);bank.name='reservoir_earth_banks';bank.receiveShadow=true;return bank;
}
