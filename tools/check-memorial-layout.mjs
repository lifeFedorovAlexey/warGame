import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {layoutMemorialGraves,graveBounds} from '../campaign/memorial-layout.js';
import {graveAppearances} from '../campaign/memorial-graves.js';

const crosses=Array.from({length:39},(_,i)=>({id:'soldier-'+i,rank:graveAppearances[i].id,death:{at:i}}));
const viewport=(width,height)=>{const scale=Math.max(width/1672,height/941),iw=1672*scale,ih=941*scale;return {width,height,art:{iw,ih,ox:(width-iw)/2,oy:(height-ih)/2}};};
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
function check(graves,view){
 const start=performance.now(),layout=layoutMemorialGraves(graves,view);
 assert.equal(layout.length,graves.length);assert.equal(new Set(layout.map(g=>g.soldier.id)).size,graves.length);
 for(let i=0;i<layout.length;i++){
  const g=layout[i],b=graveBounds(g);assert(b.left>=0&&b.top>=0&&b.right<=view.width&&b.bottom<=view.height);
  assert(!view.excluded?.some(e=>overlap(b,e)),'No grave behind report text');
  for(let j=0;j<i;j++)assert(!overlap(b,graveBounds(layout[j])),`Overlapping graves ${g.soldier.id} / ${layout[j].soldier.id}`);
 }
 return {layout,ms:performance.now()-start};
}
for(const [w,h] of [[1440,900],[1366,768],[844,390],[390,211],[320,185]]){
 const view=viewport(w,h),{layout}=check(crosses,view);
 for(const g of layout.filter(g=>g.appearance.order<6))assert.equal(g.zone,'field','Enlisted ranks stay in the valley');
 const generals=layout.filter(g=>g.appearance.order>=15),privates=layout.filter(g=>g.appearance.order===0);
 assert(Math.min(...generals.map(g=>g.size))>Math.max(...privates.map(g=>g.size))*2,'Officers in front, privates in distant perspective');
 assert(Math.max(...layout.map(g=>g.size))<=view.art.ih*.14,'Foreground accents stay within the designed perspective');
 const accents=layout.filter(g=>g.anchor>=0);assert(accents.length<=3,'At most three foreground focal monuments');
 if(accents.length)assert(Math.max(...accents.map(g=>g.size))>Math.max(...layout.filter(g=>g.zone==='hill'&&g.anchor<0).map(g=>g.size))*1.4,'Foreground is distinct from middle-distance groups');
 const reversed=layoutMemorialGraves(crosses.slice().reverse(),view);
 for(const g of layout){const other=reversed.find(p=>p.soldier.id===g.soldier.id);assert.equal(other.x,g.x);assert.equal(other.y,g.y);}
}
const crowded=Array.from({length:2000},(_,i)=>({id:'private-'+i,rank:'private',death:{at:i}}));
// Coverage is independent of rank preference: a populated cemetery must use
// both banks, the upper slope and the distant valley, not just a near cluster.
for(const [w,h] of [[1440,900],[390,211]]){
 const view=viewport(w,h),{layout}=check([...crosses,...crowded.slice(0,41)],view),hill=layout.filter(g=>g.zone==='hill'),field=layout.filter(g=>g.zone==='field');
 const span=(rows,key)=>Math.max(...rows.map(g=>g[key]))-Math.min(...rows.map(g=>g[key]));
 assert(span(hill,'x')>w*.75,'Use the whole hill width');assert(span(hill,'y')>h*.40,'Use the ridge and the lower slope');
 assert(span(field,'x')>w*.50,'Use the whole distant valley');assert(span(field,'y')>h*.22,'Do not compress the valley into a stripe');
 for(const [x,y] of [[.18,.91],[.4,.86],[.55,.80],[.7,.7],[.8,.55],[.92,.42],[.92,.88]]){
  const px=view.art.ox+x*view.art.iw,py=view.art.oy+y*view.art.ih;
  assert(Math.min(...hill.map(g=>Math.hypot(g.x-px,g.y-py)))<view.art.ih*.18,'No large empty patch on the hill');
 }
}
const stress=check(crowded,{...viewport(1440,900),excluded:[{left:30,right:840,top:20,bottom:490}]});
assert(stress.layout.every(g=>g.zone==='field'),'Even a large enlisted memorial stays in the distant field');
for(const n of [0,1,8,200])check(crowded.slice(0,n),viewport(390,211));
console.log(`PASS full hill/valley coverage, compact perspective, rank priority, no overlaps/clipping, stable identity, 5 viewports; 2,000 graves in ${Math.round(stress.ms)} ms`);
