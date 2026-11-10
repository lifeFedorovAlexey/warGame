import {mergeGeometries} from '../demo/vendor/utils/BufferGeometryUtils.js';
import {streetLampSites} from './street-furniture.js';

// Visual-only vegetation and small stones; no entities, collision or picking.
export function createDesertDressing(T,field,config,roads,dam,addFog){
 const root=new T.Group();root.name='desert_dressing';root.userData.decorative=true;
 let seed=0x752a13;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const pebble=new T.MeshStandardMaterial({color:'#99886a',roughness:1,flatShading:true});
 const bark=new T.MeshStandardMaterial({color:'#61543b',roughness:1});
 const leaves=new T.MeshStandardMaterial({color:'#4e5840',roughness:1,flatShading:true});
 const brush=new T.MeshStandardMaterial({color:'#7d7950',roughness:1,flatShading:true});
 for(const m of [pebble,bark,leaves,brush])addFog(m);
 const batches=[];
 function batch(name,geometry,material){const item={name,geometry,material,poses:[]};batches.push(item);return item;}
 const stones=batch('small_stones',new T.IcosahedronGeometry(1,0),pebble);
 function merged(parts){const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return g;}
 const twigs=[],clumps=[];
 for(let i=0;i<7;i++){
  const a=i*2.4,r=i?.25+random()*.24:0,h=.42+random()*.4,x=Math.cos(a)*r,y=Math.sin(a)*r;
  twigs.push(new T.CylinderGeometry(.017,.04,h,4).rotateX(Math.PI/2).translate(x,y,h*.5).toNonIndexed());
  clumps.push(new T.IcosahedronGeometry(.24+random()*.16,0).scale(1,.8,.6).translate(x,y,h*.72).toNonIndexed());
 }
 const scrub=batch('scrub_branches',merged(twigs),bark),bush=batch('low_bushes',merged(clumps),brush);
 const trunks=batch('pine_trunks',new T.CylinderGeometry(.075,.19,6.3,6).rotateX(Math.PI/2).translate(0,0,3.15),bark);
 // Uneven, drooping branch skirts rather than stacked perfect cones.
 const pinePositions=[];
 for(let tier=0;tier<7;tier++){
  const z=1.5+tier*.77,r=1.85-tier*.235,n=11,apex=[.05*Math.sin(tier),0,z+1.8];
  for(let j=0;j<n;j++){
   const a=j/n*Math.PI*2+tier*.41,b=(j+1)/n*Math.PI*2+tier*.41,mid=(a+b)/2;
   const p=[Math.cos(a)*r*(.74+random()*.25),Math.sin(a)*r*(.74+random()*.25),z+random()*.14],
    q=[Math.cos(b)*r*(.74+random()*.25),Math.sin(b)*r*(.74+random()*.25),z+random()*.14],
    tip=[Math.cos(mid)*r*1.15,Math.sin(mid)*r*1.15,z-.24-random()*.18];
   for(const v of [apex,p,tip,apex,tip,q,[0,0,z+.13],tip,p,[0,0,z+.13],q,tip])pinePositions.push(...v);
  }
 }
 const pineGeometry=new T.BufferGeometry();pineGeometry.setAttribute('position',new T.Float32BufferAttribute(pinePositions,3));pineGeometry.computeVertexNormals();
 const pine=batch('small_pines',pineGeometry,leaves);
 const sites=(config.baseSites??[]).map(s=>({...field.gridToWorld(s.grid),size:config.buildings[s.kind].realSizeMetres}));
 const oil=config.oilFields.map(field.gridToWorld),camps=config.camps.map(c=>field.gridToWorld(c.grid)),sign=field.gridToWorld(config.openingSignGrid);
 const segments=[];for(const road of roads)for(let i=1;i<road.points.length;i++)segments.push({a:road.points[i-1],b:road.points[i],width:road.width??24});
 function roadDistance(p,{a,b,width}){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)-width/2;}
 const start=field.gridToWorld(config.startGrid),row=config.initialRow??{offset:[-(config.initialUnits.length-1)*14,-60],spacing:28};
 const first={x:start.x+row.offset[0],y:start.y+row.offset[1]},last={x:first.x+(config.initialUnits.length-1)*row.spacing,y:first.y};
 const openingLamp=streetLampSites(field,config).find(p=>p.id===config.openingSalvageLamp);
 // Keep both the starting formation and the builder's hillside approach clear.
 const openingCorridors=[{a:first,b:last,width:44},{a:last,b:sign,width:44}];
 if(openingLamp){const goal={x:openingLamp.x,y:openingLamp.y+2.3*config.worldScale};openingCorridors.push({a:first,b:goal,width:44},{a:goal,b:{x:goal.x,y:start.y+42},width:44});}
 const openingClear=(p,r)=>openingCorridors.every(segment=>roadDistance(p,segment)>=r);
 function reserved(p,r){
  if(field.preparedPads?.some(({rect:[left,bottom,right,top]})=>p.x>left-r&&p.x<right+r&&p.y>bottom-r&&p.y<top+r))return true;
  if(Math.hypot(p.x-sign.x,p.y-sign.y)<30+r)return true;
  if(sites.some(s=>Math.abs(s.x-p.x)<s.size[0]*config.worldScale/2+25+r&&Math.abs(s.y-p.y)<s.size[1]*config.worldScale/2+36+r))return true;
  if(oil.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<32+r)||camps.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<95+r))return true;
  if(segments.some(s=>roadDistance(p,s)<12+r))return true;
  return p.x<dam.x+120&&Math.abs(p.y-dam.y)<250;
 }
 function add(target,x,y,size,rotation=0,stretch=[1,1,1]){target.poses.push({x,y,z:field.heightAt(x,y),s:stretch.map(v=>v*size),rotation});}
 function shrubs(x,y,size,a){add(scrub,x,y,size,a);add(bush,x,y,size,a);}
 function tree(x,y){const s=2.5+random()*1.5,a=random()*6.28;if(!openingClear({x,y},2.13*s))return;add(trunks,x,y,s,a);add(pine,x,y,s,a);}
 const bounds=config.finalMapBounds;
 for(let cluster=0;cluster<180;cluster++){
  const center=field.gridToWorld([bounds[0]+1+random()*(bounds[2]-bounds[0]-2),bounds[1]+1+random()*(bounds[3]-bounds[1]-2)]);
  for(let i=0;i<8;i++){
   const a=random()*6.28,r=Math.sqrt(random())*27,x=center.x+Math.cos(a)*r,y=center.y+Math.sin(a)*r;
   if(reserved({x,y},3))continue;
   add(stones,x,y,.4+random()*1.25,random()*6.28,[1.15,.8,.45]);
   if(i%3===0)shrubs(x+2,y+1,1.8+random()*1.5,a);
  }
  if(cluster%3===0&&field.heightAt(center.x,center.y)>14&&!reserved(center,9))tree(center.x,center.y);
 }
 // Small groups of pines on the flanks of the base; the centre stays open.
 for(const side of [-1,1])for(let group=0;group<9;group++){
  const cx=start.x-130+group*43,cy=start.y+side*(165+random()*55);
  for(let i=0;i<3;i++){
   const x=cx+(random()-.5)*38,y=cy+(random()-.5)*38;
   if(reserved({x,y},10))continue;tree(x,y);
   for(let j=0;j<3;j++){const px=x+7+random()*12,py=y+(random()-.5)*17;if(!reserved({x:px,y:py},3)){shrubs(px,py,2+random(),random()*6.28);add(stones,px+2,py,1.2,random()*6.28,[1,.8,.4]);}}
  }
 }
 const dummy=new T.Object3D(),color=new T.Color();let instances=0,triangles=0;
 for(const item of batches){
  const mesh=new T.InstancedMesh(item.geometry,item.material,item.poses.length);mesh.name=item.name;mesh.castShadow=mesh.receiveShadow=true;
  item.mesh=mesh;
  item.poses.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,p.rotation);dummy.scale.set(...p.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);const v=.84+random()*.16;color.setRGB(v,v,v*.97);mesh.setColorAt(i,color);});
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);instances+=item.poses.length;triangles+=item.poses.length*(item.geometry.index?.count??item.geometry.attributes.position.count)/3;
 }
 // Road layout changes are rare. Move only affected trees, keeping their paired
 // trunk/crown instances, colours and scale; no geometry or per-frame work.
 function setAccessRoads(accessRoads){
  const access=[];for(const road of accessRoads)for(let i=1;i<road.points.length;i++)access.push({a:road.points[i-1],b:road.points[i],width:road.width});
  const clear=(p,r)=>openingClear(p,r)&&access.every(s=>roadDistance(p,s)>=r+3);
  let moved=0;
  pine.poses.forEach((p,i)=>{
   const radius=2.13*p.s[0];if(clear(p,radius))return;
   let destination=null;
   // Nearest clear ring first. Stable order prevents a new road from shuffling
   // unrelated vegetation, and removed roads do not make trees jump back.
   for(let distance=4;distance<=256&&!destination;distance+=4)for(let step=0;step<32;step++){
    const angle=step*Math.PI/16,q={x:p.x+Math.cos(angle)*distance,y:p.y+Math.sin(angle)*distance};
    const grid=field.worldToGrid(q.x,q.y);
    if(grid[0]<bounds[0]||grid[0]>bounds[2]||grid[1]<bounds[1]||grid[1]>bounds[3])continue;
    if(!clear(q,radius)||reserved(q,radius))continue;
    if(pine.poses.some((other,j)=>i!==j&&Math.hypot(q.x-other.x,q.y-other.y)<radius+2.13*other.s[0]))continue;
    destination=q;break;
   }
   if(!destination)return;
   for(const item of [trunks,pine]){
    const pose=item.poses[i];Object.assign(pose,destination,{z:field.heightAt(destination.x,destination.y)});
    dummy.position.set(pose.x,pose.y,pose.z);dummy.rotation.set(0,0,pose.rotation);dummy.scale.set(...pose.s);dummy.updateMatrix();item.mesh.setMatrixAt(i,dummy.matrix);
   }
   moved++;
  });
  if(moved)for(const item of [trunks,pine]){item.mesh.instanceMatrix.needsUpdate=true;item.mesh.computeBoundingSphere();}
  return moved;
 }
 return {root,setAccessRoads,statistics:{instances,triangles,drawCalls:batches.length}};
}
