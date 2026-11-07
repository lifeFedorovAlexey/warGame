const layouts=new WeakMap();
const coolingOuter=[[1.60,.96],[1.44,1.24],[1.23,1.74],[1.04,2.61],[.96,3.41],[1.01,4.13],[1.14,4.81]];
const coolingInner=[[1.055,4.81],[.93,4.13],[.87,3.41],[.95,2.61],[1.14,1.74],[1.35,1.24],[1.50,.96],[1.60,.96]];

export function generatorLayout(size){
  if(layouts.has(size))return layouts.get(size);
  const [w,d,h]=size;
  const hall={x:-w*.223,y:.68,width:w*.46,depth:d*.59,bottom:.35,top:h*.671};
  const towers=[-1,1].map(side=>{
    const lift=side>0?1:.9;
    const liftRing=([radius,z])=>[radius,.96+(z-.96)*lift];
    const outer=coolingOuter.map(liftRing);
    return {x:w*.289,y:side*d*.245,lift,outer,rings:[...outer,...coolingInner.map(liftRing)]};
  });
  const layout={hall,towers};
  layouts.set(size,layout);
  return layout;
}

function faceOfBox(x,y,z,hall,width,depth){
  const halfW=width/2,halfD=depth/2;
  const u=x-hall.x,v=y-hall.y;
  let dx=Math.max(-halfW,Math.min(halfW,u)),dy=Math.max(-halfD,Math.min(halfD,v));
  if(Math.abs(u)<halfW&&Math.abs(v)<halfD){
    if(halfW-Math.abs(u)<halfD-Math.abs(v))dx=Math.sign(u||1)*halfW;
    else dy=Math.sign(v||1)*halfD;
  }
  return [hall.x+dx,hall.y+dy,z];
}

export function generatorWorkPoints(size,x,y,layer){
  const {hall,towers}=generatorLayout(size),height=layer-.025,points=[];
  if(height>=hall.bottom){
    points.push(faceOfBox(x,y,Math.min(height,hall.top-.01),hall,hall.width,hall.depth));
    if(height>=hall.top-.03)points.push(faceOfBox(x,y,Math.min(height,hall.top+.13),hall,hall.width+.15,hall.depth+.15));
  }
  for(const tower of towers){
    if(height<.38)continue;
    const z=Math.min(height,tower.outer.at(-1)[1]-.012);
    let angle=Math.atan2(y-tower.y,x-tower.x),radius;
    if(z<.96){
      const leg=Math.PI/5;
      angle=Math.round(angle/leg)*leg;
      radius=1.52+(1.57-1.52)*(z-.38)/(.96-.38);
    }else{
      const upper=tower.outer.findIndex(([,ringZ])=>ringZ>z);
      const [r0,z0]=tower.outer[upper-1],[r1,z1]=tower.outer[upper];
      radius=r0+(r1-r0)*(z-z0)/(z1-z0);
      const sector=Math.PI/12;
      const normal=(Math.floor(angle/sector)+.5)*sector;
      radius*=Math.cos(sector/2)/Math.cos(angle-normal);
    }
    points.push([tower.x+Math.cos(angle)*radius,tower.y+Math.sin(angle)*radius,z]);
  }
  const score=([px,py,z])=>Math.hypot(x-px,y-py)+Math.max(0,layer-z)*2;
  return points.sort((a,b)=>score(a)-score(b));
}
