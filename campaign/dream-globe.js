// Stylised geography for the dream, deliberately without borders or target labels.
const outlines=[
 [[-168,66],[-141,71],[-128,71],[-117,76],[-87,75],[-54,52],[-65,46],[-81,25],[-88,16],[-100,17],[-112,29],[-126,48],[-151,58]],
 [[-81,12],[-66,10],[-50,1],[-35,-7],[-43,-23],[-53,-34],[-70,-55],[-76,-42],[-80,-15]],
 [[-54,60],[-22,70],[-23,82],[-48,84],[-63,73]],
 [[-17,36],[10,37],[34,30],[44,12],[51,12],[40,-12],[32,-29],[18,-35],[10,-19],[-8,4],[-17,16]],
 [[-10,36],[-10,44],[4,49],[-5,58],[8,59],[18,71],[40,69],[55,73],[95,78],[140,72],[180,65],[170,51],[142,46],[131,33],[122,22],[110,19],[106,7],[99,6],[91,23],[79,7],[69,25],[55,24],[45,13],[33,30],[25,35],[17,40],[8,40]],
 [[113,-22],[130,-11],[141,-13],[154,-25],[146,-39],[130,-34],[115,-35]],
 [[48,-13],[51,-16],[46,-26],[44,-23]],[[130,31],[141,43],[145,42],[137,34]],
 [[96,5],[108,-7],[120,-9],[132,-5],[143,-7],[150,-10],[147,-3],[118,1],[108,9]],
 [[-8,50],[-1,51],[0,58],[-5,59]],[[166,-34],[178,-38],[169,-46],[165,-45]]
];
const cities=[[139,36],[116,40],[121,31],[127,38],[103,1],[77,29],[73,19],[90,24],[37,56],[29,41],[31,30],[2,49],[0,52],[13,52],[-3,40],[28,-26],[3,6],[-74,41],[-118,34],[-87,42],[-99,19],[-46,-24],[-58,-35],[-77,-12],[151,-34],[145,-38]];
const inPolygon=(x,y,points)=>{
 let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const [xi,yi]=points[i],[xj,yj]=points[j];
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }return inside;
};
const rad=Math.PI/180;
const sphere=(lon,lat)=>{const y=Math.sin(lat*rad),r=Math.cos(lat*rad);return [r*Math.sin(lon*rad),y,r*Math.cos(lon*rad)];};
const faces=[];
for(let lat=-85;lat<85;lat+=5)for(let lon=-180;lon<180;lon+=5){
 const a=sphere(lon,lat),b=sphere(lon+5,lat),c=sphere(lon+5,lat+5),d=sphere(lon,lat+5);
 faces.push({points:[a,b,c],normal:sphere(lon+3.3,lat+1.7),land:outlines.some(p=>inPolygon(lon+3.3,lat+1.7,p))},
  {points:[a,c,d],normal:sphere(lon+1.7,lat+3.3),land:outlines.some(p=>inPolygon(lon+1.7,lat+3.3,p))});
}
const sites=cities.map(([lon,lat])=>sphere(lon,lat));
const project=(p,s,c)=>[p[0]*c+p[2]*s,p[1],p[2]*c-p[0]*s];

export function drawDreamGlobe(ctx,w,h,age,{reducedMotion=false}={}) {
 const enter=Math.min(1,age/.9),exit=Math.min(1,Math.max(0,(age-5.5)/1.1));
 const spin=(-80+Math.min(5.5,age)*30)*rad,s=Math.sin(spin),c=Math.cos(spin);
 const radius=Math.min(w*.38,h*.36)*(1.04-Math.min(1,age/6)*.1),cx=w*.5,cy=h*.48;
 ctx.save();ctx.globalAlpha=enter;
 ctx.fillStyle='#030605';ctx.fillRect(0,0,w,h);
 // Faceted globe uses the same matte olive / sand palette as the vehicle models.
 for(const face of faces){
  const n=project(face.normal,s,c);if(n[2]<.035)continue;
  const brightness=.35+Math.max(0,-n[0]*.42+n[1]*.45+n[2]*.64)*.65;
  const rgb=face.land?[114,120,78]:[34,55,45];
  ctx.fillStyle=`rgb(${rgb.map(v=>Math.round(v*brightness)).join(',')})`;
  ctx.beginPath();face.points.forEach((p,i)=>{const q=project(p,s,c),x=cx+q[0]*radius,y=cy-q[1]*radius;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fill();
  // Cover canvas antialias cracks between adjoining triangles, not a wire grid.
  ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.7;ctx.stroke();
 }
 for(let i=0;i<sites.length;i++){
  const p=project(sites[i],s,c);if(p[2]<.1)continue;
  const t=age-(i<17?i*.13:(i-17)*.16+2.6);if(t<0||t>4.8)continue;
  const x=cx+p[0]*radius,y=cy-p[1]*radius,flare=Math.exp(-t*2),r=(2+Math.min(t,1.6)*8)*radius/190;
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(p[1],-p[0]));
  ctx.globalAlpha=enter*Math.max(.1,1-t/5)*.55;ctx.fillStyle='#b67d38';
  ctx.beginPath();ctx.ellipse(0,0,r,r*(.3+p[2]*.7),0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=enter*(reducedMotion?.35:.85)*flare;ctx.fillStyle='#ede0b0';
  ctx.beginPath();ctx.ellipse(0,0,r*.7+1,r*.7*p[2]+1,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=enter*Math.max(0,1-t/4)*.5;ctx.strokeStyle='#b4a17a';ctx.lineWidth=.6;
  ctx.beginPath();ctx.ellipse(0,0,r*1.8,r*1.8*(.3+p[2]*.7),0,0,Math.PI*2);ctx.stroke();ctx.restore();
  ctx.save();ctx.globalAlpha=enter*Math.min(1,t)*Math.max(0,1-t/4.8)*.45;ctx.fillStyle='#9c9576';
  for(let j=0;j<5;j++){
   const angle=j*2.4+i,cloud=r*(.48+j*.035),dx=Math.cos(angle)*r*.55,dy=Math.sin(angle)*r*.35;
   ctx.beginPath();ctx.ellipse(x+p[0]*r*.65+dx,y-p[1]*r*.65+dy,cloud,cloud*.8,0,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
 }
 ctx.restore();
 ctx.fillStyle=`rgba(2,4,3,${exit})`;ctx.fillRect(0,0,w,h);
}
