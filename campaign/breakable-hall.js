// Keep the authored silhouette, but build it from hollow walls and roof bays.
// IDs above 127 leave existing window/equipment IDs in saved games untouched.
export function breakableHall(T,{box,mesh,structuralPart},name,[w,d,h],[x,y,bottom],m){
 const t=.24,top=bottom+h;
 box([w-t*2,d-t*2,.12],[x,y,bottom+.06],m.dark);
 for(const side of [-1,1]){
  for(const axis of ['x','y'])for(let row=0;row<2;row++)for(let col=0;col<2;col++){
   if(name==='factory'&&axis==='y'){
    const left=x-w/2,right=x+w/2,doorLeft=-2.95,doorRight=2.95,doorH=3.48;
    const a=row===0?(col===0?left:doorRight):(col===0?left:x),b=row===0?(col===0?doorLeft:right):(col===0?x:right);
    const low=row===0?0:doorH,high=row===0?doorH:h;
    structuralPart(name+'_wall_'+axis+'_'+side+'_'+(row*2+col),{material:'concrete',strength:190},()=>box([b-a,t,high-low],[(a+b)/2,y+side*(d-t)/2,bottom+(low+high)/2],m.concrete));
    continue;
   }
   const width=axis==='y'?w:d-t*2;
   const at=(a,b)=>[width*(a/2-.5)+(a===1&&b===1?width*.07:0),h*b/2+(a===1&&b===1?h*.07:0)];
   const points=[at(col,row),at(col+1,row),at(col+1,row+1),at(col,row+1)],shape=new T.Shape();shape.moveTo(...points[0]);for(const p of points.slice(1))shape.lineTo(...p);shape.closePath();
   const g=new T.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false});
   g.applyMatrix4(new T.Matrix4().makeBasis(new T.Vector3(axis==='y'?1:0,axis==='x'?1:0,0),new T.Vector3(0,0,1),new T.Vector3(axis==='x'?1:0,axis==='y'?-1:0,0)));
   structuralPart(name+'_wall_'+axis+'_'+side+'_'+(row*2+col),{material:'concrete',strength:190},()=>mesh(g,m.concrete,[x+(axis==='x'?side*(w-t)/2-t/2:0),y+(axis==='y'?side*(d-t)/2+t/2:0),bottom]));
  }
  for(const xx of [-w*.46,w*.46])box([.16,.16,h],[x+xx,y+side*d*.46,bottom+h/2],m.steel);
 }
 const cols=name==='factory'?3:2,rows=name==='factory'?4:2;
 for(let a=0;a<cols;a++)for(let b=0;b<rows;b++)structuralPart(name+'_roof_'+a+'_'+b,{material:'metal',strength:145},()=>
  box([(w+.18)/cols,(d+.16)/rows,.22],[x-w/2+(a+.5)*(w+.18)/cols-.09,y-d/2+(b+.5)*(d+.16)/rows-.08,top+.07],m.roof));
 for(const xx of [-w*.25,w*.25])box([.14,d-.32,.19],[x+xx,y,top-.16],m.steel);
}
