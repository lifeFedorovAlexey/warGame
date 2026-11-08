// Concrete wall and painted steel letters, using the same geometry/materials as the base.
export function buildBaseSign(T,{box},{concrete,steel,paint}) {
  const sand=new T.MeshStandardMaterial({color:'#dbcca2',roughness:.95});
  const mortar=new T.MeshStandardMaterial({color:'#716b59',roughness:1});
  // Uneven precast slabs: the sign follows the wall's slight lean.
  for(let i=0;i<4;i++)box([1.96,.72,3.65],[i*2-3,0,2.15+(i%2)*.07],concrete,[0,.025*(i-1),0]);
  box([8.12,.80,.16],[0,0,4.06],mortar,[0,-.025,0]);
  const tilt=-.055,c=Math.cos(tilt),s=Math.sin(tilt);
  function boardBox(size,x,z,material,depth=.04,y=-.435){
    box([size[0],depth,size[1]],[x*c+z*s,y,2.65-x*s+z*c],material,[0,tilt,0]);
  }
  boardBox([6.8,2.35],0,0,paint,.10);
  for(const x of [-3.17,3.17])for(const z of [-.94,.94])boardBox([.07,.07],x,z,steel,.035,-.505);
  // Stencil lettering Р А Й, facing the initial camera. No font or image dependency.
  function stroke(x1,z1,x2,z2,width=.19){
    const length=Math.hypot(x2-x1,z2-z1),angle=Math.atan2(x2-x1,z2-z1)+tilt;
    const x=(x1+x2)/2,z=(z1+z2)/2;
    box([width,.025,length+width],[x*c+z*s,-.502,2.65-x*s+z*c],sand,[0,angle,0]);
  }
  stroke(-2.65,-.76,-2.65,.77);stroke(-2.65,.77,-1.48,.77);
  stroke(-1.48,.77,-1.48,.10);stroke(-2.65,.10,-1.48,.10);
  stroke(-.95,-.76,-.30,.77);stroke(-.30,.77,.35,-.76);stroke(-.69,-.16,.09,-.16);
  stroke(1.05,-.76,1.05,.66);stroke(2.50,-.76,2.50,.66);stroke(1.05,-.76,2.50,.66);
  stroke(1.47,.92,1.78,.84,.12);stroke(1.78,.84,2.10,.92,.12);
}
