// One camera, in metres, calibrated to the painted background. The ridge is
// an occluding silhouette, not the horizon or a measure of camera distance.
export const memorialCamera=Object.freeze({aspect:1672/941,focal:1.05,horizon:.49,height:12});
const surfaces={hill:{xSlope:.50/memorialCamera.aspect,zSlope:.01/memorialCamera.focal,elevation:0},field:{xSlope:0,zSlope:0,elevation:-20}};
export function projectMemorialPoint(point){
 const c=memorialCamera;
 return {x:.5+c.focal*point.x/(c.aspect*point.z),y:c.horizon+c.focal*(c.height-point.y)/point.z};
}
export function memorialPerspective(x,y,zone,density=1){
 const c=memorialCamera,p=surfaces[zone],vanishingY=c.horizon-c.focal*p.zSlope-p.xSlope*c.aspect*(x-.5);
 const z=c.focal*(c.height-p.elevation)/(y-vanishingY);
 if(!Number.isFinite(z)||z<=1)return null;
 const wx=(x-.5)*c.aspect*z/c.focal,wy=p.xSlope*wx+p.zSlope*z+p.elevation;
 const world={x:wx,y:wy,z},size=c.focal*2.4*density/z;
 const ground=(dx,dz)=>projectMemorialPoint({x:wx+dx,y:p.xSlope*(wx+dx)+p.zSlope*(z+dz)+p.elevation,z:z+dz});
 // The source alpha supplies the round earth outline inside this rectangular
 // texture footprint. Its four corners are real points on the ground surface.
 const radiusX=.95*density,radiusZ=.95*density;
 const groundQuad=[ground(-radiusX,radiusZ),ground(radiusX,radiusZ),ground(radiusX,-radiusZ),ground(-radiusX,-radiusZ)];
 const groundCenter=projectMemorialPoint({x:wx,y:wy+.12*density,z});
 return {world,size,groundQuad,groundCenter,depth:Math.max(0,Math.min(1,22/z))};
}
