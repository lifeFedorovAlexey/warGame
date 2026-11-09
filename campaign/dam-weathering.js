import {DAM_HEIGHT,damBow} from './dam-layout.js';

// Handwritten brush paths: no typeface, text label or camera-facing sign.
const letters={
 'ц':['M.19 .16 C.13 .51 -.01 1 .30 .9 C.49 .76 .66 .36 .72 .13 L.53 .79 Q.43 1.03 .86 .81','M.76 .84 L.7 1.27'],
 'о':['M.68 .19 C.28 -.02 -.03 .45 .13 .78 C.32 1.13 .76 .89 .81 .48 C.83 .24 .65 .16 .52 .25'],
 'и':['M.19 .16 C.13 .51 -.01 1 .30 .9 C.49 .76 .66 .36 .75 .13 L.56 .79 Q.49 1.03 .94 .76'],
 'й':['M.19 .16 C.13 .51 -.01 1 .30 .9 C.49 .76 .66 .36 .75 .13 L.56 .79 Q.49 1.03 .94 .76','M.32 -.1 Q.54 .14 .79 -.13'],
 'ж':['M.07 .11 C.51 .18 .44 .56 .02 .96','M.55 .07 L.38 1','M.96 .09 C.55 .3 .45 .66 .89 .98','M.26 .52 L.69 .47'],
 'в':['M.17 .86 C.43 .34 .88 -.39 .48 -.15 C.16 .08 .1 .6 .17 .88 C.29 1.14 .83 .88 .75 .62 C.69 .41 .33 .53 .21 .65'],
 'р':['M.27 .18 L.04 1.36','M.26 .38 C.77 -.2 1.03 .25 .72 .69 Q.51 .99 .21 .79'],
 'а':['M.68 .22 C.3 -.03 -.03 .46 .13 .78 C.3 1.09 .68 .61 .79 .13 L.58 .83 Q.57 1.03 .93 .75'],
 '?':['M.12 .12 C.27 -.12 .81 -.1 .75 .25 C.71 .47 .45 .45 .39 .68','M.32 .96 L.35 .98'],
};

export function addDamWeathering(T,structure,addFog){
 let seed=47623;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=1024;const ctx=canvas.getContext('2d');
 ctx.setTransform(canvas.width/84,0,0,-canvas.height/20,canvas.width/2,canvas.height);
 function path(points,fill){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
 function crack(x,z,length,width){
  const points=[[x,z]];for(let n=1;n<8;n++)points.push([x+(random()-.5)*.55,z-n*length/7]);
  ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.strokeStyle='rgba(49,46,37,.43)';ctx.lineWidth=width;ctx.stroke();
  if(length>2){const p=points[4];ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(p[0]+.7,p[1]-.25);ctx.lineTo(p[0]+1.1,p[1]-.9);ctx.lineWidth=width*.55;ctx.stroke();}
 }
 // Uneven mineral staining and damp lower concrete; nothing repeats per panel.
 for(let i=0;i<240;i++){
  const x=-42+random()*84,z=random()*20,r=.3+random()*2.1;
  const gradient=ctx.createRadialGradient(x,z,0,x,z,r);gradient.addColorStop(0,`rgba(80,70,48,${.025+random()*.055})`);gradient.addColorStop(1,'rgba(80,70,48,0)');ctx.fillStyle=gradient;ctx.fillRect(x-r,z-r,r*2,r*2);
 }
 for(let i=0;i<105;i++){
  const x=-42+random()*84,length=1+random()*14,width=.045+random()*.36,drift=(random()-.5)*.22;
  // A continuous, soft-edged stain, with a broken taper rather than triangles.
  const samples=Array.from({length:15},(_,j)=>{const t=j/14;return {z:20-t*length,x:x+drift*t+Math.sin(t*13+i)*width*.24,w:width*(.15+.85*(1-t))*(.7+random()*.6)};});
  for(let pass=0;pass<5;pass++){
   const spread=.55+pass*.42,g=ctx.createLinearGradient(0,20,0,20-length);g.addColorStop(0,'rgba(75,63,43,.038)');g.addColorStop(.6,'rgba(75,63,43,.021)');g.addColorStop(1,'rgba(75,63,43,0)');
   const points=[...samples.map(p=>[p.x-p.w*spread,p.z]),...samples.slice().reverse().map(p=>[p.x+p.w*spread,p.z])];path(points,g);
  }
 }
 for(let i=0;i<90;i++){
  const x=-42+random()*84,h=.3+random()*3.9,w=.12+random()*.8;
  const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'rgba(61,64,43,.38)');gradient.addColorStop(1,'rgba(66,64,43,0)');ctx.fillStyle=gradient;ctx.fillRect(x,0,w,h);
 }
 for(const z of [4.8,9.7,14.7])for(let x=-41;x<42;x+=1+random()*3){ctx.strokeStyle='rgba(65,61,49,.10)';ctx.lineWidth=.018;ctx.beginPath();ctx.moveTo(x,z);ctx.lineTo(x+.6+random()*2,z+(random()-.5)*.035);ctx.stroke();}
 for(let i=0;i<30;i++){
  const x=-40+random()*80,z=1+random()*18,w=.25+random()*1.5,h=.18+random()*.65,points=[];
  for(let n=0;n<11;n++){const a=n/11*Math.PI*2,r=.6+random()*.4;points.push([x+Math.cos(a)*w*r,z+Math.sin(a)*h*r]);}
  path(points,'rgba(54,53,44,.20)');path(points.map(([a,b])=>[a+.045,b-.06]),'rgba(167,159,134,.28)');
  for(let n=0;n<18;n++){ctx.fillStyle=n%3?'rgba(79,76,61,.17)':'rgba(201,191,157,.23)';ctx.fillRect(x+(random()-.5)*w,z+(random()-.5)*h,.025+random()*.05,.03+random()*.04);}
  if(i%3===0)crack(x,z,1.2+random()*3.1,.018+random()*.014);
 }
 for(const x of [-35.4,-18.5,8.9,28.8])crack(x,18.8,3.2+random()*4.5,.027);
 function brushText(text,x,z,height,color,opacity){
  ctx.save();ctx.translate(x,z);ctx.scale(height*.72,-height);ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';
  for(const letter of text){
   if(letter===' '){ctx.translate(.55,0);continue;}
   ctx.save();ctx.translate(0,(random()-.5)*.07);ctx.rotate((random()-.5)*.10);
   for(const stroke of letters[letter]){
    const p=new Path2D(stroke);ctx.globalAlpha=opacity;ctx.lineWidth=.085+random()*.045;ctx.stroke(p);
    // Individual bristles leave dry streaks and torn edges inside the paint.
    for(let bristle=0;bristle<6;bristle++){ctx.save();ctx.translate((random()-.5)*.10,(random()-.5)*.045);ctx.globalAlpha=opacity*.16;ctx.lineWidth=.006+random()*.006;ctx.stroke(p);ctx.restore();}
   }
   if(random()>.45){ctx.globalAlpha=opacity*.42;ctx.lineWidth=.009;ctx.beginPath();ctx.moveTo(.2,.81);ctx.lineTo(.18,1.03+random()*.24);ctx.stroke();}
   ctx.restore();ctx.translate(.92+random()*.07,0);
  }ctx.restore();
 }
 brushText('цой жив',-29,9.1,2.45,'#30382c',.76);
 brushText('рай?',8.2,10.4,1.65,'#7a422f',.52);
 // Old chalk tally marks and worn maintenance marks, kept secondary.
 ctx.strokeStyle='rgba(213,202,168,.38)';ctx.lineWidth=.04;
 for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-34+i*.35,7.1);ctx.lineTo(-34.1+i*.35,5.6);ctx.stroke();}
 ctx.beginPath();ctx.moveTo(-34.3,5.9);ctx.lineTo(-32.6,6.8);ctx.stroke();
 ctx.strokeStyle='rgba(93,82,58,.3)';ctx.lineWidth=.07;for(let z=8;z<17;z++){ctx.beginPath();ctx.moveTo(36.7,z);ctx.lineTo(z%2?37.4:37.8,z);ctx.stroke();}
 // Dry paint and chipped edges, not a blur over the whole wall.
 ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='destination-out';ctx.fillStyle='rgba(0,0,0,.3)';
 for(let i=0;i<22000;i++)ctx.fillRect(random()*canvas.width,random()*canvas.height,.4+random()*2,.4+random()*2);
 ctx.fillStyle='rgba(0,0,0,.65)';
 for(let i=0;i<4700;i++){const x=(13+random()*13)/84*canvas.width,y=(10.4+random()*3.6)/20*canvas.height;ctx.fillRect(x,y,.7+random()*2.3,.5+random()*1.5);}
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
 const material=new T.MeshStandardMaterial({map:texture,transparent:true,roughness:1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});addFog(material);
 for(let i=0;i<14;i++){
  const parent=structure.getObjectByName('monolith_'+String(i).padStart(2,'0')),a=-42+i*6,b=a+6,header=i===6||i===7,bottom=header?15.23:.04,top=DAM_HEIGHT-.04;
  const positions=[],uv=[];
  for(const [x,z] of [[a,bottom],[b,bottom],[b,top],[a,bottom],[b,top],[a,top]]){
   const y=header?damBow((a+b)/2)-.945:damBow(x)-3+z*.15-.045;positions.push(x,y,z);uv.push((x+42)/84,z/20);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,material);mesh.name=i===3?'tsoi_graffiti':'dam_patina_'+i;mesh.userData.handPainted=true;mesh.receiveShadow=true;parent.add(mesh);
 }
 return {texture};
}
