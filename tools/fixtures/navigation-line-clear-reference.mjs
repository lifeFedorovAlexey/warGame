// Frozen before the canonical grid-edge fast path; keep this independent.
const climbableGrade=.52;
export function referenceLineClear(a,b,terrainOnly=false,leaveGridEdge=false,maximumGrade=climbableGrade,physical=false,checkOccupancy=false,terrainEscape=null){
  const length=Math.hypot(b.x-a.x,b.y-a.y),times=[0,1],half=this.field.half,cell=this.field.renderCell??this.cell;
  if([a,b].some(point=>Math.abs(point.x)>half||Math.abs(point.y)>half))return false;
  // Height is affine within each heightfield triangle. Split exactly at its X,
  // Y and diagonal boundaries: fixed-distance samples can miss a thin slope.
  const cross=(q0,q1)=>{if(Math.abs(q1-q0)<1e-10)return;for(let k=Math.ceil(Math.min(q0,q1));k<Math.max(q0,q1);k++){const t=(k-q0)/(q1-q0);if(t>1e-9&&t<1-1e-9)times.push(t);}};
  cross((a.x+half)/cell,(b.x+half)/cell);cross((half-a.y)/cell,(half-b.y)/cell);cross((a.x-a.y+half*2)/cell,(b.x-b.y+half*2)/cell);
  cross((a.x+half)/this.cell+.5,(b.x+half)/this.cell+.5);cross((half-a.y)/this.cell+.5,(half-b.y)/this.cell+.5);times.sort((x,y)=>x-y);
  const [startCol,startRow]=this.grid(a.x,a.y),startId=startRow*this.size+startCol;
  const gx=(a.x+half)/32,gy=(half-a.y)/32,bounds=this.bounds;
  const mayLeave=leaveGridEdge&&(physical||!this.occupied[startId])&&gx>=bounds[0]&&gx<=bounds[2]&&gy>=bounds[1]&&gy<=bounds[3];
  const allowed=t=>{
   const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,[col,row]=this.grid(x,y);
   // Applies to smoothing, road lanes, parking and physical recovery alike.
   if(!this.terrainAllowed(x,y)){
    // Explicit evacuation of an already-invalid saved pose. It cannot be
    // started from legal ground or renewed along a ridge. A small fixed rise
    // permits reversing to turn before descending from the old saved pose.
    if(!terrainEscape||this.terrainAllowed(a.x,a.y)||Math.hypot(x-terrainEscape.x,y-terrainEscape.y)>terrainEscape.radius
      ||this.field.heightAt(x,y)>terrainEscape.height+(terrainEscape.maxRise??.5))return false;
   }
   if(terrainOnly)return this.walkable[row*this.size+col];
   if(physical){
    if(checkOccupancy&&this.occupied[row*this.size+col])return false;
    const xg=(x+half)/32,yg=(half-y)/32;
    if(xg<bounds[0]||xg>bounds[2]||yg<bounds[1]||yg>bounds[3])return false;
    const gradient=this.field.gradientAt(x,y);
    return Math.hypot(gradient.x,gradient.y)<Math.max(.76,maximumGrade*1.38);
   }
   if(this.allowed(col,row))return true;
   if(!mayLeave||col!==startCol||row!==startRow)return false;
   // A rounded grid sample can fall just outside drivable terrain even when the
   // exact continuous position is flat. Let an existing vehicle leave that cell.
   const gradient=this.field.gradientAt(x,y);
   return Math.hypot(gradient.x,gradient.y)<Math.max(.60,maximumGrade*1.32);
  };
  if(!allowed(0)||!allowed(1))return false;
  let previous=0,height=this.field.heightAt(a.x,a.y);for(const t of times){if(t-previous<1e-8)continue;if(!allowed((previous+t)/2))return false;const h=this.field.heightAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);if(Math.abs(h-height)/Math.max(1e-7,length*(t-previous))>maximumGrade+.00001)return false;previous=t;height=h;}return true;
 }
