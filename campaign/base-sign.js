// Freestanding town sign: matte concrete and oxide-red paint from the base.
export function buildBaseSign(T,{box,mesh},{concrete,steel}) {
  const letters=new T.MeshStandardMaterial({color:'#c6b69b',roughness:.93,metalness:.03});
  const red=new T.MeshStandardMaterial({color:'#a35c3e',roughness:.78,metalness:.22});
  letters.name='sign_sand_letters';red.name='sign_oxide_heart';
  box([8.05,1.12,.20],[0,0,.45],concrete);
  const bottom=.62,height=2.35,depth=.40;
  const outline=points=>{const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));return shape.closePath();};
  function glyph(shape,x,scale=1,z=bottom){
    const geometry=new T.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:12,bevelEnabled:true,bevelThickness:.025,bevelSize:.024,bevelSegments:1});
    geometry.scale(scale,scale,1);geometry.rotateX(Math.PI/2);mesh(geometry,letters,[x,depth/2,z]);
  }
  // Own solid glyph outlines: one cap height, optical spacing and robust counters.
  // Each letter is a single extrusion, avoiding seams and overshooting bar ends.
  glyph(outline([[0,0],[.76,0],[.76,.25],[.54,.25],[.54,height-.25],[.76,height-.25],[.76,height],[0,height],[0,height-.25],[.22,height-.25],[.22,.25],[0,.25]]),-3.77);
  const heart=new T.Shape().moveTo(0,-1.04)
    .bezierCurveTo(-.20,-.76,-1.04,-.08,-1.04,.48)
    .bezierCurveTo(-1.04,1.12,-.32,1.26,0,.72)
    .bezierCurveTo(.32,1.26,1.04,1.12,1.04,.48)
    .bezierCurveTo(1.04,-.08,.20,-.76,0,-1.04).closePath();
  const geometry=new T.ExtrudeGeometry(heart,{depth:.40,steps:1,curveSegments:8,bevelEnabled:true,bevelThickness:.035,bevelSize:.035,bevelSegments:1});
  geometry.rotateX(Math.PI/2);
  mesh(geometry,red,[-1.77,.20,1.90]);
  box([.20,.27,.28],[-1.77,0,.67],steel);
  // Р: rounded shoulder and a clear enclosed counter, instead of a square loop.
  const er=new T.Shape().moveTo(0,0).lineTo(.34,0).lineTo(.34,1.01).lineTo(.91,1.01)
    .quadraticCurveTo(1.23,1.01,1.23,1.33).lineTo(1.23,2.02)
    .quadraticCurveTo(1.23,height,.90,height).lineTo(0,height).closePath();
  const counter=new T.Path().moveTo(.34,1.33).lineTo(.34,2.03).lineTo(.83,2.03)
    .quadraticCurveTo(.90,2.03,.90,1.95).lineTo(.90,1.42).quadraticCurveTo(.90,1.33,.82,1.33).closePath();
  er.holes.push(counter);glyph(er,-.46);
  const a=outline([[0,0],[.53,height],[.91,height],[1.44,0],[1.08,0],[.94,.63],[.50,.63],[.36,0]]);
  const triangle=new T.Path().moveTo(.56,.94).lineTo(.88,.94).lineTo(.72,1.76).closePath();a.holes.push(triangle);glyph(a,.95);
  glyph(outline([[0,0],[.34,0],[.99,1.56],[.99,0],[1.33,0],[1.33,height],[.99,height],[.34,.79],[.34,height],[0,height]]),2.56);
  const breve=new T.Shape().moveTo(.24,.39).lineTo(.45,.39)
    .bezierCurveTo(.46,.17,.87,.17,.89,.39).lineTo(1.10,.39)
    .bezierCurveTo(1.09,-.05,.26,-.05,.24,.39).closePath();
  glyph(breve,2.56,1,bottom+height+.14);
}
