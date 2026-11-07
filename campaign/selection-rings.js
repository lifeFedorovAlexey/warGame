// Each ring follows the ground under its entire circumference, including roads.
export function placeSelectionRing(ring,field,x,y,radius){
  const key=[x,y,radius];
  if(ring.userData.groundPose?.every((v,i)=>v===key[i]))return;
  ring.userData.groundPose=key;
  const positions=ring.geometry.attributes.position;
  const circle=ring.userData.circle??=positions.array.slice();
  const base=field.heightAt(x,y),clearance=1.1;
  ring.position.set(x,y,base);
  for(let i=0;i<positions.count;i++){
    const dx=circle[i*3]*radius,dy=circle[i*3+1]*radius;
    positions.setXYZ(i,dx,dy,field.heightAt(x+dx,y+dy)-base+clearance);
  }
  positions.needsUpdate=true;ring.geometry.computeBoundingSphere();
}
