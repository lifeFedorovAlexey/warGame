import {RoadTraffic} from './road-traffic.js';

// The map authoring route builder uses the steepest of the two ORIGINAL
// 32 m cell triangles (limit .30). Visual rim smoothing must not open a pass
// through a cliff. Explicit vector roads remain legal engineered corridors;
// the navigator still checks their final, graded physical surface separately.
export function buildTerrainPassability(field,roads=new RoadTraffic(field)){
  const {samples,size,cellMetres:cell,heightUnitMetres:unit,half}=field;
  if(!samples||!size||!cell||!Number.isFinite(unit))return ()=>true;
  const count=size-1,allowed=new Uint8Array(count*count);
  for(let y=0;y<count;y++)for(let x=0;x<count;x++){
    const i=y*size+x,a=samples[i]*unit,b=samples[i+1]*unit,c=samples[i+size]*unit,d=samples[i+size+1]*unit;
    allowed[y*count+x]=Math.max(Math.hypot(b-a,c-a),Math.hypot(d-c,d-b))/cell<=.30?1:0;
  }
  return (x,y)=>{
    const col=Math.floor((x+half)/cell),row=Math.floor((half-y)/cell);
    if(col<0||row<0||col>=count||row>=count)return false;
    if(field.preparedPads?.some(({rect:[left,bottom,right,top]})=>x>=left&&x<=right&&y>=bottom&&y<=top))return true;
    return !!allowed[row*count+col]||!!roads.nearest({x,y});
  };
}
