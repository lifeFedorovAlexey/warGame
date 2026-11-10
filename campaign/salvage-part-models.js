// The same pressed sheet is used on donors and as side armour. A shallow crown,
// folded rim and centre crease make it read as a bonnet rather than a flat box.
export function hoodGeometry(T,width=1.36,length=1.24){
 const g=new T.BoxGeometry(width,length,.038,8,8,1),p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i)/(width/2),y=p.getY(i)/(length/2);
  p.setX(i,p.getX(i)*(1-.12*Math.max(0,(y-.45)/.55)));
  p.setZ(i,p.getZ(i)+.055*(1-x*x)+.018*(1-y*y)+.016*Math.max(0,1-Math.abs(x)*7));
 }
 g.computeVertexNormals();return g;
}
export function tagSalvagePart(T,node,id){
 node.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(node.geometry.attributes.position.count).fill(id),1));return node;
}
