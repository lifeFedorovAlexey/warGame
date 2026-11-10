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
 const add=(target,x,y,size,depth,seed,priority)=>{
  const p={x:ox+x*iw,y:oy+y*ih,size:size*ih*density,depth,zone:target===field?'field':'hill',priority,
   yaw:(random(seed)-.5)*.30,rotation:(random(seed+7)-.5)*.026};
  const b=graveBounds(p);
  if(b.left>=8&&b.right<=width-8&&b.top>=4&&b.bottom<=height-8)target.push(p);
 };
 // Scatter in continuous terrain coordinates, not rows or grid cells. A
 // noisy depth preference keeps senior ranks near without forming a parade.
 const samples=Math.ceil(1800/(density*density));
 for(let i=0;i<samples;i++){
  const x=.64+random(i*5+801)*.325,depth=.045+random(i*5+802)*.815;
  const size=(.022+.059*depth)*(.96+random(i*5+803)*.08);
  const y=mix(memorialRidge(x)+.035,.935,depth);
  add(hill,x,y,size,depth,i+1200,depth+random(i*5+804)*.34);
 }
 // The distant valley is a separate burial field, below the city and behind
 // the near slope. Privates and NCOs never consume the foreground by default.
 for(let i=0;i<samples*2;i++){
  const x=.24+random(i*5+17001)*.40,v=random(i*5+17002);
  const size=(.009+.009*v)*(.96+random(i*5+17003)*.08);
  const near=memorialRidge(x)-.024,far=.635-(x-.24)*.22;
  const y=mix(far,near,v);
  add(field,x,y,size,.08+.10*v,i+21000,v*.45+random(i*5+17004)*.85);
 }
 for(const list of [hill,field])list.sort((a,b)=>b.priority-a.priority);
 return {hill,field};
}

export function layoutMemorialGraves(graves,viewport){
 if(!graves.length)return [];
 const ordered=graves.map((soldier,index)=>({soldier,index,appearance:graveAppearance(soldier)})).sort((a,b)=>
  b.appearance.order-a.appearance.order||(a.soldier.death?.at??0)-(b.soldier.death?.at??0)||String(a.soldier.id??a.index).localeCompare(String(b.soldier.id??b.index)));
 const excluded=viewport.excluded??[];
 // Retry a denser plan for very large campaign cemeteries. Never drop a
 // casualty or reuse a plot. The archive/index stay independent of placement.
 for(let attempt=0;attempt<24;attempt++){
  const density=Math.pow(.82,attempt),pool=candidates(viewport,density),placed=[],cells=new Map(),cellSize=32;
  const keys=b=>{const out=[];for(let y=Math.floor(b.top/cellSize);y<=Math.floor(b.bottom/cellSize);y++)for(let x=Math.floor(b.left/cellSize);x<=Math.floor(b.right/cellSize);x++)out.push(x+':'+y);return out;};
  const occupied=(box,gap)=>{
   const padded={left:box.left-gap,right:box.right+gap,top:box.top-gap,bottom:box.bottom+gap};
   if(excluded.some(b=>overlaps(padded,b)))return true;
   const seen=new Set();for(const key of keys(padded))for(const b of cells.get(key)??[]){if(!seen.has(b)&&overlaps(padded,b))return true;seen.add(b);}return false;
  };
  const choices={officer:[...pool.hill,...pool.field],warrant:[...pool.hill.filter(p=>p.depth<=.52),...pool.field,...pool.hill.filter(p=>p.depth>.52)],enlisted:pool.field};
  const cursors={officer:0,warrant:0,enlisted:0};
  for(const person of ordered){
   const tier=person.appearance.order>=8?'officer':person.appearance.order>=6?'warrant':'enlisted',list=choices[tier];let accepted=false;
   while(cursors[tier]<list.length){
    const candidate=list[cursors[tier]++],box=graveBounds(candidate),gap=Math.max(.5,candidate.size*.13);
    if(occupied(box,gap))continue;
    const g={...person,...candidate,bounds:box};placed.push(g);for(const key of keys(box)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box);}accepted=true;break;
   }
   if(!accepted)break;
  }
  if(placed.length===graves.length)return placed.sort((a,b)=>a.y-b.y||a.x-b.x);
 }
 throw new Error('Недостаточно места для мемориала');
}
