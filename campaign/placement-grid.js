import {transportReservation} from './transport-site.js';
import {buildingGridStep,buildingExit,rectanglesOverlap} from './building-placement.js';

export function createPlacementGrid(T,scene,field,config){
 const root=new T.Group();root.name='building_placement_grid';root.visible=false;scene.add(root);
 const lines=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#c5bb91',transparent:true,opacity:.28,depthWrite:false}));
 const cells=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.16,depthWrite:false,side:T.DoubleSide}));
 const access=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#e7ac60',transparent:true,opacity:.85,depthWrite:false}));
 lines.name='placement_grid_lines';cells.name='placement_grid_cells';access.name='placement_access';
 for(const item of [cells,lines,access]){item.frustumCulled=false;item.renderOrder=5;root.add(item);}
 const green=new T.Color('#9cb97a'),red=new T.Color('#c75e4e'),amber=new T.Color('#c28f53');
 let previous='';
 function geometry(object,positions,colors){
  let buffer=object.geometry.getAttribute('position');
  if(!buffer||buffer.array.length<positions.length){
   const capacity=Math.max(positions.length,buffer?.array.length*2||96);
   object.geometry.dispose();object.geometry=new T.BufferGeometry();
   buffer=new T.Float32BufferAttribute(new Float32Array(capacity),3).setUsage(T.DynamicDrawUsage);
   object.geometry.setAttribute('position',buffer);
   if(colors)object.geometry.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(capacity),3).setUsage(T.DynamicDrawUsage));
  }
  buffer.array.set(positions);buffer.needsUpdate=true;object.geometry.setDrawRange(0,positions.length/3);
  if(colors){const color=object.geometry.getAttribute('color');color.array.set(colors);color.needsUpdate=true;}
 }
 function update(kind,place,mission){
  root.visible=!!(kind&&place&&mission);
  if(!root.visible){previous='';return;}
  lines.visible=cells.visible=place.snap!==false;
  const key=[kind,place.x,place.y,place.rotation,place.ok,place.snap,mission.nav.topologyRevision,mission.fogRevision,mission.state.buildings.length].join('/');
  if(key===previous)return;previous=key;
  const step=buildingGridStep(config),margin=step*4;
  const left=Math.floor((place.x-place.halfWidth-margin)/step),right=Math.ceil((place.x+place.halfWidth+margin)/step);
  const bottom=Math.floor((place.y-place.halfDepth-margin)/step),top=Math.ceil((place.y+place.halfDepth+margin)/step);
  const bounds={x:(left+right)*step/2,y:(bottom+top)*step/2,halfWidth:(right-left)*step/2,halfDepth:(top-bottom)*step/2};
  const nearby=mission.state.buildings.filter(b=>(b.hp>0||b.damage?.wreck)&&mission.exploredAt(b.x,b.y)&&rectanglesOverlap(bounds,b,step*4));
  const exits=nearby.filter(b=>b.hp>0).map(b=>buildingExit(b,mission.buildingSpec(b),config.worldScale)).filter(Boolean);
  const ownExit=buildingExit(place,config.buildings[kind],config.worldScale);if(ownExit)exits.push(ownExit);
  const oil=config.buildings[kind].requiresOil?[]:config.oilFields.map(g=>({...field.gridToWorld(g),halfWidth:config.worldScale*5+5,halfDepth:config.worldScale*5+5}));
  const maxGrade=config.buildings[kind].maxBuildingGrade??config.maxBuildingGrade;
  const vertices=[],colors=[],segments=[],guides=[],edges=new Set();
  const point=(x,y)=>[x,y,field.heightAt(x,y)+1.1];
  function edge(a,b){const key=[...a,...b].join(',');if(edges.has(key))return;edges.add(key);segments.push(...point(...a),...point(...b));}
  function segment(a,b){guides.push(...point(...a),...point(...b));}
  for(let row=bottom;row<top;row++)for(let col=left;col<right;col++){
   const x=col*step,y=row*step,tile={x:x+step/2,y:y+step/2,halfWidth:step/2,halfDepth:step/2};
   if(!mission.inBounds(tile.x,tile.y)||!mission.exploredAt(tile.x,tile.y))continue;
   edge([x,y],[x+step,y]);edge([x,y+step],[x+step,y+step]);edge([x,y],[x,y+step]);edge([x+step,y],[x+step,y+step]);
   const slope=field.gradientAt(tile.x,tile.y),blocked=Math.hypot(slope.x,slope.y)>maxGrade
    ||nearby.some(b=>rectanglesOverlap(tile,b))||oil.some(b=>rectanglesOverlap(tile,b))||transportReservation(field,config,tile);
   const under=rectanglesOverlap(tile,place),reserved=exits.some(b=>rectanglesOverlap(tile,b));
   const color=under?(place.ok?green:red):blocked?red:reserved?amber:null;
   if(!color)continue;
   for(const [dx,dy] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){vertices.push(...point(x+dx*step,y+dy*step));colors.push(color.r,color.g,color.b);}
  }
  for(const exit of exits){
   const {x,y,halfWidth:w,halfDepth:d}=exit,corners=[[x-w,y-d],[x+w,y-d],[x+w,y+d],[x-w,y+d]];
   for(let i=0;i<4;i++)segment(corners[i],corners[(i+1)%4]);
  }
  const c=Math.cos(place.rotation),s=Math.sin(place.rotation),local=config.buildings[kind].workAnchor;
  const at=(x,y)=>[place.x+(x*c-y*s)*config.worldScale,place.y+(x*s+y*c)*config.worldScale];
  // The short open chevron indicates the service/front side without a map icon.
  segment(at(local[0]-1,local[1]+1),at(local[0],local[1]));segment(at(local[0],local[1]),at(local[0]+1,local[1]+1));
  geometry(lines,segments);geometry(cells,vertices,colors);geometry(access,guides);
  root.userData={kind,x:place.x,y:place.y,rotation:place.rotation,valid:place.ok,step,visibleCells:vertices.length/18};
 }
 return {update};
}
