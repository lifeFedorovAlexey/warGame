import {graveAppearance} from './memorial-graves.js';

const mix=(a,b,t)=>a+(b-a)*t;
const random=i=>{const x=Math.sin(i*127.1+13.7)*43758.5453;return x-Math.floor(x);};
export function memorialRidge(x){
 const points=[[0,.95],[.4,.72],[.58,.62],[.7,.51],[.8,.40],[.9,.34],[1,.36]];
 for(let i=1;i<points.length;i++)if(x<=points[i][0]){const [a,b]=points[i-1],[c,d]=points[i];return mix(b,d,(x-a)/(c-a));}
 return .36;
}

// Bounds include all opaque parts of the approved sprites, including the
// round mound. Size is the whole monument's height, with its foot at y.
export const graveBounds=g=>({left:g.x-g.size*.36,right:g.x+g.size*.36,top:g.y-g.size*1.01,bottom:g.y+g.size*.025});
const overlaps=(a,b,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;

function candidates({width,height,art},density){
 const {ox,oy,iw,ih}=art,hill=[],field=[];
 const add=(target,x,y,size,depth,seed)=>{
  const p={x:ox+x*iw,y:oy+y*ih,size:size*ih*density,depth,zone:target===field?'field':'hill',balance:.91+random(seed+29)*.18,
   yaw:(random(seed)-.5)*.30,rotation:(random(seed+7)-.5)*.026};
  const b=graveBounds(p);
  if(b.left>=8&&b.right<=width-8&&b.top>=4&&b.bottom<=height-8)target.push({...p,bounds:b});
 };
 // Cover the whole foreground slope, including the lower left bank and the
 // upper ridge. Point selection below distributes plots before assigning rank.
 const samples=Math.min(64000,Math.ceil(1800/(density*density)));
 for(let i=0;i<samples;i++){
  const x=.10+random(i*5+801)*.875,depth=.045+random(i*5+802)*.815;
  const size=(.022+.059*depth)*(.96+random(i*5+803)*.08);
  const y=mix(memorialRidge(x)+.025,.965,depth);
  add(hill,x,y,size,depth,i+1200);
 }
 // The distant valley is a separate burial field, below the city and behind
 // the near slope. Privates and NCOs never consume the foreground by default.
 for(let i=0;i<samples*2;i++){
  const x=.08+random(i*5+17001)*.60,v=random(i*5+17002);
  const size=(.009+.009*v)*(.96+random(i*5+17003)*.08);
  // Follow the actual valley floor rather than putting crosses into its sky
  // or into the ridge that occludes the valley on the right.
  const near=memorialRidge(x)-.024,far=x<.4?mix(.77,.565,(x-.08)/.32):mix(.565,.522,(x-.4)/.28);
  if(near-far<.015)continue;
  const y=mix(far,near,v);
  add(field,x,y,size,.08+.10*v,i+21000);
 }
 return {hill,field};
}

export function layoutMemorialGraves(graves,viewport){
 if(!graves.length)return [];
 const ordered=graves.map((soldier,index)=>({soldier,index,appearance:graveAppearance(soldier)})).sort((a,b)=>
  b.appearance.order-a.appearance.order||(a.soldier.death?.at??0)-(b.soldier.death?.at??0)||String(a.soldier.id??a.index).localeCompare(String(b.soldier.id??b.index)));
 const excluded=viewport.excluded??[];
 const senior=ordered.filter(p=>p.appearance.order>=6),enlisted=ordered.filter(p=>p.appearance.order<6);
 const initialDensity=Math.min(1,Math.sqrt(350/Math.max(1,enlisted.length)),Math.sqrt(110/Math.max(1,senior.length)));
 // Retry a denser plan for very large campaign cemeteries. Never drop a
 // casualty or reuse a plot. The archive/index stay independent of placement.
 for(let attempt=0;attempt<24;attempt++){
  const density=initialDensity*Math.pow(.82,attempt),pool=candidates(viewport,density),placed=[],cells=new Map(),cellSize=32;
  const keys=b=>{const out=[];for(let y=Math.floor(b.top/cellSize);y<=Math.floor(b.bottom/cellSize);y++)for(let x=Math.floor(b.left/cellSize);x<=Math.floor(b.right/cellSize);x++)out.push(x+':'+y);return out;};
  const occupied=(box,gap)=>{
   const padded={left:box.left-gap,right:box.right+gap,top:box.top-gap,bottom:box.bottom+gap};
   if(excluded.some(b=>overlaps(padded,b)))return true;
   const seen=new Set();for(const key of keys(padded))for(const b of cells.get(key)??[]){if(!seen.has(b)&&overlaps(padded,b))return true;seen.add(b);}return false;
  };
  const placeGroup=(people,list)=>{
   if(!people.length)return true;
   const available=list.filter(p=>!excluded.some(b=>overlaps(p.bounds,b,Math.max(.5,p.size*.13))));
   if(!available.length)return false;
   const nearest=new Float64Array(available.length).fill(Infinity),used=new Uint8Array(available.length),plots=[];
   const xs=Float64Array.from(available,p=>p.x),ys=Float64Array.from(available,p=>p.y),weights=Float64Array.from(available,p=>p.balance);
   const centre=available.reduce((s,p)=>({x:s.x+p.x/available.length,y:s.y+p.y/available.length}),{x:0,y:0});
   while(plots.length<people.length){
    let best=-1,score=-Infinity;
    for(let i=0;i<available.length;i++){
     if(used[i])continue;
     const candidateScore=plots.length?nearest[i]*weights[i]:-Math.hypot(xs[i]-centre.x,ys[i]-centre.y);
     if(candidateScore>score){best=i;score=candidateScore;}
    }
    if(best<0)return false;
    used[best]=1;const p=available[best],box=p.bounds;
    if(occupied(box,Math.max(.5,p.size*.13)))continue;
    plots.push(p);for(const key of keys(box)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box);}
    // Farthest-point sampling fills the largest remaining open patch. Small
    // deterministic variation avoids a regular lattice without creating clumps.
    for(let i=0;i<available.length;i++)if(!used[i]){const dx=xs[i]-p.x,dy=ys[i]-p.y,d=dx*dx+dy*dy;if(d<nearest[i])nearest[i]=d;}
   }
   // Rank affects who occupies the selected plots, not whether the back or
   // left side of the landscape remains empty. Preserve original archive indices.
   plots.sort((a,b)=>b.depth-a.depth||b.size-a.size);
   for(let i=0;i<people.length;i++)placed.push({...people[i],...plots[i]});
   return true;
  };
  if(!placeGroup(senior,pool.hill)||!placeGroup(enlisted,pool.field))continue;
  if(placed.length===graves.length)return placed.sort((a,b)=>a.y-b.y||a.x-b.x);
 }
 throw new Error('Недостаточно места для мемориала');
}
