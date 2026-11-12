import {sceneryBuilder} from './environment-geometry.js';
import {damWaterNormals} from './dam-water.js';
import {damWorld,DAM_DRAINAGE_OUTFALL} from './dam-layout.js';
import {bridgeWidthAt} from './river-terrain.js';

// The gorge and bridge support are authored terrain; small surface detail is
// visual only. There are no invisible prop colliders or new camp entities.
export function createRiverEnvironment(T,field,dam,addFog,terrain){
 const river=field.river,root=new T.Group();root.name='shared_river_gorge';root.userData.decorative=true;
 if(!river)return {root,update(){}};
 const concrete=new T.MeshStandardMaterial({color:'#897b64',roughness:1}),steel=new T.MeshStandardMaterial({color:'#67503a',roughness:.9,metalness:.35});
 const joint=new T.MeshStandardMaterial({color:'#393733',roughness:.95});
 const paint=new T.MeshLambertMaterial({color:'#d1c8ad',transparent:true,opacity:.38,depthWrite:false});
 const rock=new T.MeshStandardMaterial({color:'#69553f',roughness:1,flatShading:true});
 const normals=damWaterNormals(T),water=new T.MeshStandardMaterial({color:'#294547',roughness:.54,metalness:.07,normalMap:normals,normalScale:new T.Vector2(.065,.065),side:T.DoubleSide});
 const foam=new T.MeshBasicMaterial({color:'#afbbaa',transparent:true,opacity:.38,depthWrite:false});
 for(const m of [concrete,steel,joint,paint,rock,water,foam])addFog(m);
 const kit=sceneryBuilder(T,root),{box,rod,shape}=kit;
 const waterPositions=[],uv=[];
 const edge=(i,side)=>{const p=river.points[i],a=river.points[Math.max(0,i-1)],b=river.points[Math.min(river.points.length-1,i+1)],len=Math.hypot(b.x-a.x,b.y-a.y),width=43+2*Math.sin(i*.91);return[p.x-(b.y-a.y)/len*side*width,p.y+(b.x-a.x)/len*side*width,p.z];};
 for(let i=1;i<river.points.length;i++)for(const [j,side] of [[i-1,-1],[i,1],[i,-1],[i-1,-1],[i-1,1],[i,1]]){waterPositions.push(...edge(j,side));uv.push(side*2,river.points[j].along/12);}
 const wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(waterPositions,3));wg.setAttribute('uv',new T.Float32BufferAttribute(uv,2));wg.computeVertexNormals();
 const surface=new T.Mesh(wg,water);surface.name='river_water';root.add(surface);
 // Low shelf fragments stay on the gorge walls, never on construction pads.
 for(let i=2;i<river.points.length-2;i+=5){const p=river.points[i],q=river.sample(p.x,p.y);
  for(const side of [-1,1])for(let tier=0;tier<2;tier++){
   const distance=38+tier*13+Math.sin(i*1.73+side)*3,x=p.x+q.nx*distance*side,y=p.y+q.ny*distance*side;
   const z=river.terrainHeightAt(x,y);if(z<p.z-1||river.deckAt(x,y,9))continue;
   const g=new T.IcosahedronGeometry(1,0).scale(8+(i%3),11+(i%4)*2,1.4+tier*.8);
   shape(g,rock,[x,y,z-1.3],[.1,.05,Math.atan2(q.ny,q.nx)]);
  }
 }
 for(const bridge of river.bridges){
  const truss=bridge.road==='junction-3--junction-7-8',points=bridge.points;
  // One continuous ribbon avoids overlapping sloped slabs and z-fighting.
  const deckVertices=[],deckUvs=[],deckIndices=[];
  for(let i=0;i<points.length;i++){
   const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],len=Math.hypot(b.x-a.x,b.y-a.y),half=bridgeWidthAt(bridge,p.along)/2;
   for(const side of [-1,1]){const x=p.x-(b.y-a.y)/len*half*side,y=p.y+(b.x-a.x)/len*half*side;deckVertices.push(x,y,p.z);deckUvs.push((x+field.half)/field.extent,(y+field.half)/field.extent);}
   if(i){const j=(i-1)*2;deckIndices.push(j,j+2,j+1,j+1,j+2,j+3);}
  }
  const deckGeometry=new T.BufferGeometry();deckGeometry.setAttribute('position',new T.Float32BufferAttribute(deckVertices,3));deckGeometry.setAttribute('uv',new T.Float32BufferAttribute(deckUvs,2));deckGeometry.setIndex(deckIndices);deckGeometry.computeVertexNormals();
  const deckMesh=new T.Mesh(deckGeometry);terrain.registerPavement(deckMesh);deckMesh.name=bridge.id;deckMesh.receiveShadow=true;root.add(deckMesh);
  // Continuous top and sides follow the deck's exact pitch. Independent
  // rotated boxes used to poke through the asphalt on sloping approaches.
  const slabVertices=[],slabIndices=[],count=deckVertices.length/3;
  for(const drop of [.3,1.8])for(let i=0;i<count;i++)slabVertices.push(deckVertices[i*3],deckVertices[i*3+1],deckVertices[i*3+2]-drop);
  slabIndices.push(...deckIndices);
  for(let i=0;i<count-2;i+=2)for(const side of [0,1]){const a=i+side,b=i+2+side;slabIndices.push(a,b,a+count,b,b+count,a+count);}
  const slabGeometry=new T.BufferGeometry();slabGeometry.setAttribute('position',new T.Float32BufferAttribute(slabVertices,3));slabGeometry.setIndex(slabIndices);slabGeometry.computeVertexNormals();
  const slab=new T.Mesh(slabGeometry,concrete);slab.material.side=T.DoubleSide;slab.receiveShadow=true;root.add(slab);
  // Thin expansion joints mark the actual threshold. Wing walls sit beside
  // the carriageway: the bridge is legible without a different asphalt tile.
  for(const [index,adjacent] of [[0,1],[points.length-1,points.length-2]]){
   const p=points[index],q=points[adjacent],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,angle=Math.atan2(dy,dx),half=bridgeWidthAt(bridge,p.along)/2;
   box([.55,half*2,.06],[p.x+ux*.5,p.y+uy*.5,p.z+.09],joint,[0,0,angle]);
   for(const side of [-1,1]){
    const x=p.x-uy*(half+1.1)*side,y=p.y+ux*(half+1.1)*side;
    box([5.5,2.2,2.1],[x+ux*1.1,y+uy*1.1,p.z+.1],concrete,[0,0,angle]);
    box([6,2.6,.3],[x+ux*1.1,y+uy*1.1,p.z+1.3],concrete,[0,0,angle]);
   }
  }
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),z=(a.z+b.z)/2,halfA=bridgeWidthAt(bridge,a.along)/2,halfB=bridgeWidthAt(bridge,b.along)/2,half=(halfA+halfB)/2;
   const at=(side,above=0)=>[(a.x+b.x)/2-dy/length*side,(a.y+b.y)/2+dx/length*side,z+above];
   for(const side of [-1,1]){
    const edgeDx=dx-dy/length*(halfB-halfA)*side,edgeDy=dy+dx/length*(halfB-halfA)*side,edgeAngle=Math.atan2(edgeDy,edgeDx);
    box([Math.hypot(edgeDx,edgeDy)+.12,.7,1.1],at(side*(half+.7),.5),concrete,[0,0,edgeAngle]);
    if(i%4===0)box([length,.25,.035],at(side*(half-1.6),.18),paint,[0,0,angle]);
   }
   if(i%4<2)box([length,.4,.04],at(0,.18),paint,[0,0,angle]);
  }
  const stride=truss?6:8;
  for(let i=0;i<points.length;i+=stride){
   const p=points[i],next=points[Math.min(points.length-1,i+stride)],h=truss?12:3.2,half=bridgeWidthAt(bridge,p.along)/2,nextHalf=bridgeWidthAt(bridge,next.along)/2;
   const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],len=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;
   for(const side of [-1,1]){
    const x=p.x+nx*(half+1)*side,y=p.y+ny*(half+1)*side,xx=next.x+nx*(nextHalf+1)*side,yy=next.y+ny*(nextHalf+1)*side;
    rod([x,y,p.z+.7],[x,y,p.z+h],truss?.48:.28,steel);
    if(next!==p){rod([x,y,p.z+h],[xx,yy,next.z+h],truss?.42:.22,steel);if(truss){rod([x,y,p.z+1],[xx,yy,next.z+h],.28,steel);rod([x,y,p.z+h],[xx,yy,next.z+1],.28,steel);}}
   }
   if(truss&&i%12===0)rod([p.x-nx*(half+1),p.y-ny*(half+1),p.z+h],[p.x+nx*(half+1),p.y+ny*(half+1),p.z+h],.4,steel);
   if(i%16===0){const bottom=river.terrainHeightAt(p.x,p.y),height=p.z-bottom-1;
    if(height>2)box([6,half*2-4,height],[p.x,p.y,bottom+height/2],concrete,[0,0,Math.atan2(b.y-a.y,b.x-a.x)]);
   }
  }
 }
 // The visible open channel in dam-drainage ends here, directly in the river.
 const mouth=damWorld(dam,DAM_DRAINAGE_OUTFALL.x,DAM_DRAINAGE_OUTFALL.y,DAM_DRAINAGE_OUTFALL.z);
 box([10,10,.12],[mouth.x,mouth.y-3,mouth.z+.03],water);
 for(let i=0;i<5;i++)box([4+i*.8,.6,.05],[mouth.x+Math.sin(i)*1.5,mouth.y-4-i*3,mouth.z-.06*i],foam);
 kit.finish();
 return {root,update(time){normals.offset.set(time*.009,-time*.018);}};
}
