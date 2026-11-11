import {createDesertAssets} from './desert-assets.js';
import {streetLampSites} from './street-furniture.js';
import southernLayout from '../assets/campaign/alpha/mission02/layout.js';
import {siteCourts} from '../assets/campaign/alpha/mission02/site-plan.js';
import {campBaseLayout} from './scav-base-layout.js';

// Visual-only vegetation and small stones; no entities, collision or picking.
export function createDesertDressing(T,field,config,roads,dam,addFog){
 const root=new T.Group();root.name='desert_dressing';root.userData.decorative=true;
 let seed=0x752a13;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const {batches,stones,scrub,bush,trunks,pine,birchTrunks,birches,birchGeometry}=createDesertAssets(T,random,addFog);
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
  const transport=field.korovnikGrading?.site;
  if(transport&&Math.abs(p.x-transport.x)<transport.halfWidth+r&&Math.abs(p.y-transport.y)<transport.halfDepth+r)return true;
  if(field.river?.within(p.x,p.y,r)&&field.river.sample(p.x,p.y).distance<field.river.outer+r)return true;
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
 // Add companions without changing the seed or positions of existing pines.
 // Camp interiors stay clear; this layer is scenery, never a combat obstacle.
 const treeSets=[{parts:[trunks,pine],poses:pine.poses,radius:2.13},{parts:[birchTrunks,birches],poses:birches.poses,radius:birchGeometry.radius}];
 // The shared scene outlives mission 1. Include the unlocked southern map now;
 // mission fog keeps its groves hidden until that territory is available.
 const sceneryBounds=field.m02Roads?southernLayout.bounds:bounds;
 const campBoxes=[...config.camps,...(config.m01LegacyLayout?.camps??[])].map(c=>campBaseLayout({...c,...field.gridToWorld(c.grid)})?.bounds).filter(Boolean);
 if(field.m02Roads){
  for(const site of siteCourts){const a=field.gridToWorld(site.rect.slice(0,2)),b=field.gridToWorld(site.rect.slice(2));campBoxes.push([a.x,b.y,b.x,a.y]);}
  for(const base of southernLayout.bases)for(const building of base.structures){const p=field.gridToWorld(building.grid);campBoxes.push([p.x-building.halfWidth,p.y-building.halfDepth,p.x+building.halfWidth,p.y+building.halfDepth]);}
 }
 function treeSpace(p,r){return treeSets.every(set=>set.poses.every(other=>Math.hypot(p.x-other.x,p.y-other.y)>r+set.radius*other.s[0]+2));}
 function treeSite(p,r){
  const grid=field.worldToGrid(p.x,p.y),gradient=field.gradientAt(p.x,p.y);
  return grid[0]>=sceneryBounds[0]+1&&grid[0]<=sceneryBounds[2]-1&&grid[1]>=sceneryBounds[1]+1&&grid[1]<=sceneryBounds[3]-1&&
   Math.hypot(gradient.x,gradient.y)<=.42&&!reserved(p,r)&&openingClear(p,r)&&
   !campBoxes.some(([l,b,right,t])=>p.x>l-r-20&&p.x<right+r+20&&p.y>b-r-20&&p.y<t+r+20);
 }
 pine.poses.forEach((p,i)=>{
  if(i%3===2)return;
  const s=2.65+(Math.sin(i*7.13)+1)*.45,r=birchGeometry.radius*s;
  for(let attempt=0;attempt<12;attempt++){
   const a=i*2.4+attempt*.67,distance=17+attempt*1.7,q={x:p.x+Math.cos(a)*distance,y:p.y+Math.sin(a)*distance};
   if(!treeSite(q,r)||!treeSpace(q,r))continue;
   for(const part of [birchTrunks,birches])add(part,q.x,q.y,s,i*1.71,[1,1,.94+(i%4)*.045]);
   break;
  }
 });
 // Sparse irregular mixed groves across all regions, including the far south.
 // Separate seed preserves the approved vegetation around the player base.
 let groveSeed=0x61b2c3;const groveRandom=()=>{groveSeed=(Math.imul(groveSeed,1664525)+1013904223)>>>0;return groveSeed/4294967296;};
 const columns=3,rows=Math.ceil((sceneryBounds[3]-sceneryBounds[1])/16);
 const cellWidth=(sceneryBounds[2]-sceneryBounds[0])/columns,cellHeight=(sceneryBounds[3]-sceneryBounds[1])/rows;
 for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
  const left=sceneryBounds[0]+column*cellWidth,top=sceneryBounds[1]+row*cellHeight;
  const existing=birches.poses.filter(p=>{const [x,y]=field.worldToGrid(p.x,p.y);return x>=left&&x<left+cellWidth&&y>=top&&y<top+cellHeight;}).length;
  if(existing>=2)continue;
  let centre=null;
  for(let attempt=0;attempt<80;attempt++){
   const p=field.gridToWorld([left+cellWidth*(.14+groveRandom()*.72),top+cellHeight*(.14+groveRandom()*.72)]);
   if(!treeSite(p,32)||treeSets.some(set=>set.poses.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<70)))continue;
   centre=p;break;
  }
  if(!centre)continue;
  const count=4+Math.floor(groveRandom()*3);let placed=0;
  for(let attempt=0;attempt<60&&placed<count;attempt++){
   const a=groveRandom()*Math.PI*2,d=placed?15+Math.sqrt(groveRandom())*32:0;
   const p={x:centre.x+Math.cos(a)*d,y:centre.y+Math.sin(a)*d},s=2.55+groveRandom()*.95,rotation=groveRandom()*Math.PI*2;
   const set=placed%3===2?treeSets[0]:treeSets[1],radius=set.radius*s;
   if(!treeSite(p,radius)||!treeSpace(p,radius))continue;
   for(const part of set.parts)add(part,p.x,p.y,s,rotation,[1,1,.95+(placed%3)*.04]);
   placed++;
  }
 }
 // Moisture follows the actual river. Keep a few dry groves, then add mixed
 // birch/pine groups outside the gorge rim, roads and both missions' yards.
 if(field.river){
  const river=field.river;
  for(const set of treeSets){
   const keep=set.poses.map((p,i)=>river.sample(p.x,p.y).distance<220||Math.hypot(p.x-dam.x,p.y-dam.y)<330||i%5===0);
   for(const item of set.parts)item.poses=item.poses.filter((p,i)=>keep[i]);
   set.poses=set.parts[0].poses;
  }
  let index=0;
  for(let i=2;i<river.points.length-2;i+=2){const p=river.points[i],q=river.sample(p.x,p.y);
   for(const side of [-1,1])for(let j=0;j<3;j++){
    const d=river.outer+20+j*21+Math.sin(i*2.7+j)*8,tangent=(j-1)*19;
    const point={x:p.x+q.nx*d*side-q.ny*tangent,y:p.y+q.ny*d*side+q.nx*tangent};
    const set=treeSets[index++%4===0?0:1],s=2.65+groveRandom()*.9,r=set.radius*s;
    if(!treeSite(point,r)||!treeSpace(point,r))continue;
    for(const part of set.parts)add(part,point.x,point.y,s,groveRandom()*6.28);
    // Trunk/crown must share a rotation as well as a location.
    set.parts[1].poses.at(-1).rotation=set.parts[0].poses.at(-1).rotation;
    const bx=point.x+12,by=point.y+6;if(!reserved({x:bx,y:by},4))shrubs(bx,by,2.8,groveRandom()*6.28);
   }
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
  for(const set of treeSets)set.poses.forEach((p,i)=>{
   const radius=set.radius*p.s[0];if(clear(p,radius))return;
   let destination=null;
   // Nearest clear ring first. Stable order prevents a new road from shuffling
   // unrelated vegetation, and removed roads do not make trees jump back.
   for(let distance=4;distance<=256&&!destination;distance+=4)for(let step=0;step<32;step++){
    const angle=step*Math.PI/16,q={x:p.x+Math.cos(angle)*distance,y:p.y+Math.sin(angle)*distance};
    const grid=field.worldToGrid(q.x,q.y);
    if(grid[0]<sceneryBounds[0]||grid[0]>sceneryBounds[2]||grid[1]<sceneryBounds[1]||grid[1]>sceneryBounds[3])continue;
    if(!clear(q,radius)||!treeSite(q,radius))continue;
    if(treeSets.some(otherSet=>otherSet.poses.some(other=>other!==p&&Math.hypot(q.x-other.x,q.y-other.y)<radius+otherSet.radius*other.s[0])))continue;
    destination=q;break;
   }
   if(!destination)return;
   for(const item of set.parts){
    const pose=item.poses[i];Object.assign(pose,destination,{z:field.heightAt(destination.x,destination.y)});
    dummy.position.set(pose.x,pose.y,pose.z);dummy.rotation.set(0,0,pose.rotation);dummy.scale.set(...pose.s);dummy.updateMatrix();item.mesh.setMatrixAt(i,dummy.matrix);
   }
   moved++;
  });
  if(moved)for(const set of treeSets)for(const item of set.parts){item.mesh.instanceMatrix.needsUpdate=true;item.mesh.computeBoundingSphere();}
  return moved;
 }
 return {root,setAccessRoads,statistics:{instances,triangles,drawCalls:batches.length}};
}
