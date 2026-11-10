import {graveAppearance} from './memorial-graves.js';
import {memorialPerspective} from './memorial-perspective.js';

const mix=(a,b,t)=>a+(b-a)*t;
const random=i=>{const x=Math.sin(i*127.1+13.7)*43758.5453;return x-Math.floor(x);};
const halton=(n,b)=>{let value=0,f=1;for(;n;n=Math.floor(n/b)){f/=b;value+=f*(n%b);}return value;};
export function memorialRidge(x){
 const points=[[0,.95],[.4,.72],[.58,.62],[.7,.51],[.8,.40],[.9,.34],[1,.36]];
 for(let i=1;i<points.length;i++)if(x<=points[i][0]){const [a,b]=points[i-1],[c,d]=points[i];return mix(b,d,(x-a)/(c-a));}
 return .36;
}

// Bounds cover the upright sprite and the entire projected soil footprint.
// x/y is the world-space ground contact, not the bottom of a flat PNG.
export const graveBounds=g=>({left:Math.min(g.x-g.size*.46,...g.groundQuad.map(p=>p.x)),right:Math.max(g.x+g.size*.46,...g.groundQuad.map(p=>p.x)),top:Math.min(g.y-g.size*.91,...g.groundQuad.map(p=>p.y)),bottom:Math.max(g.y+g.size*.16,...g.groundQuad.map(p=>p.y))});
const overlaps=(a,b,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;

function candidates({width,height,art},density){
 const {ox,oy,iw,ih}=art,hill=[],field=[];
 const add=(target,x,y,seed,anchor=-1)=>{
  const zone=target===field?'field':'hill',perspective=memorialPerspective(x,y,zone,density);if(!perspective)return;
  const p={...perspective,x:ox+x*iw,y:oy+y*ih,size:perspective.size*ih,zone,anchor,
   groundQuad:perspective.groundQuad.map(v=>({x:ox+v.x*iw,y:oy+v.y*ih})),groundCenter:{x:ox+perspective.groundCenter.x*iw,y:oy+perspective.groundCenter.y*ih},yaw:0,rotation:0};
  const b=graveBounds(p);
  if(b.left>=8&&b.right<=width-8&&b.top>=4&&b.bottom<=height-8)target.push({...p,bounds:b});
 };
 // Ground positions are composed first. Every monument has the same physical
 // height; size and depth come exclusively from the shared camera projection.
 const samples=Math.min(64000,Math.ceil(1800/(density*density)));
 for(let i=0;i<samples;i++){
  const x=.10+random(i*5+801)*.875,depth=.045+random(i*5+802)*.815;
  const y=mix(memorialRidge(x)+.025,.965,depth);
  add(hill,x,y,i+1200);
 }
 // Asymmetric foreground triangle, with one principal memorial and two
 // supporting ones. Small alternate positions let the layout avoid UI/cropping.
 const accents=[[.78,.93],[.66,.87],[.91,.88]];
 for(let anchor=0;anchor<accents.length;anchor++)for(let i=0;i<48;i++){
  const [ax,ay]=accents[anchor],radius=i?Math.sqrt(i/47):0,angle=i*2.399963;
  add(hill,ax+Math.cos(angle)*radius*.055,ay+Math.sin(angle)*radius*.035,9000+anchor*80+i,anchor);
 }
 // The distant valley is a separate burial field, below the city and behind
 // the near slope. Privates and NCOs never consume the foreground by default.
 for(let i=0;i<samples*2;i++){
  const x=.08+random(i*5+17001)*.60,v=random(i*5+17002);
  // Follow the actual valley floor rather than putting crosses into its sky
  // or into the ridge that occludes the valley on the right.
  const near=memorialRidge(x)-.024,far=x<.4?mix(.77,.565,(x-.08)/.32):mix(.565,.522,(x-.4)/.28);
  if(near-far<.015)continue;
  const y=mix(far,near,v);
  add(field,x,y,i+21000);
 }
 return {hill,field};
}

// Loose burial groups follow the ground rather than forming an evenly spaced
// screen ornament. Their centres cover both banks, the ridge and the middle
// slope; an irregular cadence leaves breathing room between neighbouring groups.
const hillGroups=[[.20,.66],[.39,.66],[.55,.49],[.65,.24],[.73,.63],[.84,.41],[.93,.14],[.95,.66],[.57,.83]];
function compositionTarget(index,zone,{art}){
 const {ox,oy,iw,ih}=art;
 let x,y;
 if(zone==='hill'){
  const [cx,cd]=hillGroups[(index*5)%hillGroups.length],pass=Math.floor(index/hillGroups.length);
  x=Math.max(.105,Math.min(.97,cx+(random(index*13+42)-.5)*(.055+Math.min(3,pass)*.018)));
  const depth=Math.max(.055,Math.min(.85,cd+(random(index*17+78)-.5)*(.12+Math.min(3,pass)*.045)));
  y=mix(memorialRidge(x)+.025,.965,depth);
 }else{
  // Low-discrepancy targets fill the entire valley without the quasi-hexagonal
  // spacing produced by repeatedly taking the largest empty circle.
  x=.08+halton(index+5,2)*.60;
  const near=memorialRidge(x)-.024,far=x<.4?mix(.77,.565,(x-.08)/.32):mix(.565,.522,(x-.4)/.28);
  y=mix(far,Math.max(far+.005,near),.06+halton(index+7,3)*.88);
 }
 return {x:ox+x*iw,y:oy+y*ih};
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
  const occupied=(box,gap,stagger=false)=>{
   const padded={left:box.left-gap,right:box.right+gap,top:box.top-gap,bottom:box.bottom+gap};
   if(excluded.some(b=>overlaps(padded,b)))return true;
   const height=(box.bottom-box.top)/1.035,reach=stagger?height*.65:0;
   const search={...padded,left:padded.left-reach,right:padded.right+reach};
   const seen=new Set();for(const key of keys(search))for(const b of cells.get(key)??[]){
    if(seen.has(b))continue;seen.add(b);
    if(overlaps(padded,b))return true;
    // Closely neighbouring feet on one horizontal baseline read as a row of
    // icons. Stagger their depth while keeping the broader burial group intact.
    const otherHeight=(b.bottom-b.top)/1.035;
    if(stagger&&Math.abs(box.bottom-b.bottom)<Math.min(height,otherHeight)*.30&&Math.abs((box.left+box.right-b.left-b.right)*.5)<Math.max(height,otherHeight)*1.45)return true;
   }
   return false;
  };
  const placeGroup=(people,list,zone)=>{
   if(!people.length)return true;
   const available=list.filter(p=>!excluded.some(b=>overlaps(p.bounds,b,Math.max(.5,p.size*.13))));
   if(!available.length)return false;
   const used=new Uint8Array(available.length),plots=[];
   const xs=Float64Array.from(available,p=>p.x),ys=Float64Array.from(available,p=>p.y);
   const accents=zone==='hill'?Math.min(3,Math.ceil(people.length/10)):0;
   for(let accent=0;accent<accents;accent++){
    const idx=available.findIndex((p,i)=>p.anchor===accent&&!used[i]&&!occupied(p.bounds,Math.max(.5,p.size*.18)));
    if(idx<0)continue;
    const p=available[idx];used[idx]=1;plots.push(p);for(const key of keys(p.bounds)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p.bounds);}
   }
   let targetIndex=0;
   while(plots.length<people.length){
    const target=compositionTarget(targetIndex,zone,viewport);
    let best=-1,score=-Infinity;
    for(let i=0;i<available.length;i++){
     if(used[i]||available[i].anchor>=0)continue;
     const dx=xs[i]-target.x,dy=ys[i]-target.y,candidateScore=-(dx*dx+dy*dy*1.3);
     if(candidateScore>score){best=i;score=candidateScore;}
    }
    if(best<0)return false;
    used[best]=1;const p=available[best],box=p.bounds;
    if(occupied(box,Math.max(.5,p.size*.20),zone==='hill'))continue;
    plots.push(p);for(const key of keys(box)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box);}
    targetIndex++;
   }
   // Rank affects who occupies the selected plots, not whether the back or
   // left side of the landscape remains empty. Preserve original archive indices.
   plots.sort((a,b)=>a.world.z-b.world.z||b.size-a.size);
   for(let i=0;i<people.length;i++)placed.push({...people[i],...plots[i]});
   return true;
  };
  if(!placeGroup(senior,pool.hill,'hill')||!placeGroup(enlisted,pool.field,'field'))continue;
  if(placed.length===graves.length)return placed.sort((a,b)=>a.y-b.y||a.x-b.x);
 }
 throw new Error('Недостаточно места для мемориала');
}
