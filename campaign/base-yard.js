import {baseApproachRoads} from './base-roads.js';
// Physical scenery only. Nothing here is registered as an entity or navigation obstacle.
export function createBaseYard(T,field,config,addFog){
  const root=new T.Group();root.name='base_yard';root.userData.decorative=true;
  const scale=config.worldScale,loader=new T.TextureLoader(),lights=[];
  const texture=name=>{const map=loader.load(new URL('../assets/maps/alpha/materials/'+name,import.meta.url).href);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;return map;};
  const concrete=new T.MeshStandardMaterial({color:'#d4ccae',map:texture('weathered-concrete.jpg'),vertexColors:true,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const steel=new T.MeshStandardMaterial({color:'#454b40',roughness:.85,metalness:.35});
  const olive=new T.MeshStandardMaterial({color:'#65674b',roughness:.94});
  const wood=new T.MeshStandardMaterial({color:'#857459',roughness:1});
  const rust=new T.MeshStandardMaterial({color:'#865638',roughness:1});
  const lens=new T.MeshStandardMaterial({color:'#c3b79a',emissive:'#edc17a',emissiveIntensity:0,roughness:.7});
  const paint=new T.MeshStandardMaterial({color:'#ddd2b9',roughness:1,vertexColors:true,transparent:true,opacity:.84,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  for(const material of [concrete,steel,olive,wood,rust,lens,paint])addFog(material);
  const positions=[],colors=[],uvs=[];
  const random=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  const sites=(config.baseSites??[]).map(site=>({...site,...field.gridToWorld(site.grid)}));
  function tile(x,y,w,d,tint){
    const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
    for(const i of [0,1,2,0,2,3]){
      const [dx,dy]=corners[i],px=x+dx,py=y+dy;
      positions.push(px,py,field.heightAt(px,py)+.13);uvs.push(px/31,py/31);
      colors.push(tint,tint*.985,tint*.955);
    }
  }
  for(const site of sites){
    const [w,d]=config.buildings[site.kind].realSizeMetres;
    const cols=site.kind==='factory'?3:2,rows=site.kind==='factory'?3:2;
    const direction=site.rotationDegrees===180?-1:1;
    const tw=2.5*scale,td=1.7*scale,front=site.y-direction*d*scale/2;
    // Only the entrance is paved. The future building plot remains sand.
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const seed=random(col+site.x,row+site.y);
      tile(site.x+(col-(cols-1)/2)*tw,front-direction*(row+.5)*td,tw-.14,td-.14,.87+seed*.10);
    }
  }
  const start=field.gridToWorld(config.startGrid),roads=baseApproachRoads(field,config),street=roads[0];
  const west=street.points[0].x,east=street.points[1].x;
  // Regular pavement slabs, with gaps for driveways. The construction plots stay bare.
  for(const side of [-1,1])for(let x=west+9;x<east-3;x+=6){
    const driveway=roads.slice(1).some(r=>Math.sign(r.points[1].y-start.y)===side&&Math.abs(x-r.points[0].x)<r.width/2+5);
    if(!driveway)tile(x,start.y+side*19.5,5.92,6.4,.94+random(x,side)*.04);
  }
  for(const road of roads.slice(1).filter(r=>r.points[1].y>start.y)){
    const end=road.points[1];
    for(const side of [-1,1])for(let y=start.y+25;y<end.y;y+=6)tile(end.x+side*(road.width/2+5),y,6.4,5.92,.94);
  }
  const markings=[],markColors=[],markUvs=[];
  function marking(x,y,w,d){
    for(const [dx,dy] of [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,-d/2],[w/2,d/2],[-w/2,d/2]]){
      const px=x+dx,py=y+dy,tint=.86+random(px,py)*.12;
      markings.push(px,py,field.heightAt(px,py)+.19);markUvs.push(0,0);markColors.push(tint,tint,tint);
    }
  }
  const crossings=[start.x-205,start.x-28];
  const nearCrossing=x=>crossings.some(c=>Math.abs(x-c)<15);
  for(let x=west+12;x<east-12;x+=14)if(!nearCrossing(x))marking(x,start.y,7.5,.50);
  for(const side of [-1,1])for(let x=west+10;x<east-4;x+=6){
    const junction=roads.slice(1).some(r=>Math.sign(r.points[1].y-start.y)===side&&Math.abs(x-r.points[0].x)<r.width/2+3);
    if(!junction&&!nearCrossing(x))marking(x,start.y+side*12.6,5.96,.42);
  }
  for(const crossing of crossings)for(let i=-2;i<=2;i++)marking(crossing+i*4.2,start.y,2.1,26);
  for(const road of roads.slice(1).filter(r=>r.points[1].y>start.y)){
    const x=road.points[0].x;
    // Zebra crossings continue the pavement across the entrances.
    for(let i=-2;i<=2;i++)marking(x,start.y+20+i*2.6,road.width-3,1.35);
    marking(x,start.y+31,road.width-3,.65);
    for(let y=start.y+46;y<road.points[1].y-7;y+=14)marking(x,y,.42,7);
  }
  function surface(name,vertices,uv,material,attributes){
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    for(const [key,[values,size]] of Object.entries(attributes))geo.setAttribute(key,new T.Float32BufferAttribute(values,size));
    geo.computeVertexNormals();const mesh=new T.Mesh(geo,material);mesh.name=name;mesh.receiveShadow=true;root.add(mesh);
  }
  surface('old_concrete_sites',positions,uvs,concrete,{color:[colors,3]});
  surface('street_markings',markings,markUvs,paint,{color:[markColors,3]});
  const parts=new Map();
  function shape(geometry,material,position,rotation){
    const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);if(rotation)mesh.rotation.set(...rotation);mesh.updateMatrix();geometry.applyMatrix4(mesh.matrix);
    if(!parts.has(material))parts.set(material,[]);parts.get(material).push(geometry.index?geometry.toNonIndexed():geometry);
  }
  const box=(size,pos,mat=olive,rot)=>shape(new T.BoxGeometry(...size),mat,pos,rot);
  function rod(a,b,r,mat=steel){const start=new T.Vector3(...a),end=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,start.distanceTo(end),6);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize()));shape(g,mat,start.add(end).multiplyScalar(.5).toArray());}
  function lamp(grid,angle){
    const p=field.gridToWorld(grid),z=field.heightAt(p.x,p.y),c=Math.cos(angle),s=Math.sin(angle);
    const point=(x,y,h)=>[p.x+(x*c-y*s)*scale,p.y+(x*s+y*c)*scale,z+h*scale];
    box([.45*scale,.45*scale,.17*scale],point(0,0,.085),steel);
    rod(point(0,0,.14),point(0,0,4.8),.075*scale);
    rod(point(0,0,4.8),point(0,-1.0,5.05),.055*scale);
    box([.46*scale,.76*scale,.20*scale],point(0,-1.12,5.04),olive,[0,0,angle]);
    box([.37*scale,.60*scale,.035*scale],point(0,-1.12,4.92),lens,[0,0,angle]);
    box([.18*scale,.16*scale,.44*scale],point(.04,.08,1.15),steel);
    const light=new T.PointLight('#ffdc9c',0,scale*11,2);
    light.position.set(...point(0,-1.12,4.83));root.add(light);lights.push(light);
  }
  for(const [i,offset] of [-210,-144,-78,-12,54,120].entries()){
    const side=i%2?1:-1;
    lamp(field.worldToGrid(start.x+offset,start.y+side*22.3),side>0?0:Math.PI);
  }
  lamp([14.35,50.9],0);
  // A few street furnishings, all decorative and outside the carriageway.
  for(const offset of [-110,32]){
    const x=start.x+offset,y=start.y+21,z=field.heightAt(x,y);
    for(let row=0;row<3;row++)box([8,.55,.34],[x,y+row*.75,z+1.7],wood);
    for(const dx of [-3,3])box([.4,2.3,1.7],[x+dx,y+.7,z+.85],steel);
    for(const dx of [-3,3])box([.3,.3,2],[x+dx,y+2.0,z+2.0],steel);
    box([8,.4,.65],[x,y+2,z+2.7],wood);
    const binX=x+7,binY=y+.4,binZ=field.heightAt(binX,binY),bin=new T.CylinderGeometry(1.1,1.1,2.5,10);
    bin.rotateX(Math.PI/2);shape(bin,olive,[binX,binY,binZ+1.25]);
  }
  // Stores and spare materials sit outside building footprints and their exits.
  for(const [grid,count] of [[[9.7,48.7],3],[[20.2,49.7],2]]){
    const p=field.gridToWorld(grid);
    for(let i=0;i<count;i++){
      const x=p.x+i*5.6,y=p.y+(i%2)*2,z=field.heightAt(x,y);
      box([4.7,3.8,3.4],[x,y,z+1.7],i%2?olive:wood);
      for(const dx of [-1.5,1.5])box([.3,3.9,3.5],[x+dx,y,z+1.75],steel);
    }
  }
  const spare=field.gridToWorld([8.15,55.5]),z=field.heightAt(spare.x,spare.y);
  for(let i=0;i<3;i++)box([8,3,.75],[spare.x+i*.4,spare.y-i*.3,z+.5+i*.82],wood,[0,0,.12]);
  const drum=field.gridToWorld([20.2,49.1]);
  for(let i=0;i<2;i++){
    const x=drum.x+i*3.1,y=drum.y,h=field.heightAt(x,y);
    const g=new T.CylinderGeometry(1.15,1.15,3.8,10);g.rotateX(Math.PI/2);shape(g,i?olive:rust,[x,y,h+1.9]);
  }
  for(const [mat,geometries] of parts){
    const geometry=new T.BufferGeometry();
    for(const key of ['position','normal','uv']){
      const arrays=geometries.map(g=>g.getAttribute(key)),size=arrays.reduce((sum,a)=>sum+a.array.length,0),merged=new Float32Array(size);let offset=0;
      for(const a of arrays){merged.set(a.array,offset);offset+=a.array.length;}geometry.setAttribute(key,new T.BufferAttribute(merged,key==='uv'?2:3));
    }
    const mesh=new T.Mesh(geometry,mat);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);for(const g of geometries)g.dispose();
  }
  return {root,sites,roads,update(powered){lens.emissiveIntensity=powered?3:0;for(const light of lights)light.intensity=powered?1800:0;}};
}
