// Keep a normal two-lane width at camp entrances. Only real junctions flare,
// over a short approach; a base node is not a roundabout or a turning apron.
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function profileRoadWidths(points,width,a,b){
 const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
 const length=distances.at(-1);
 points.forEach((p,i)=>{
  const start=a.degree>2?1-smooth(distances[i]/40):0,end=b.degree>2?1-smooth((length-distances[i])/40):0;
  p.width=width+(32-width)*(start+end-start*end);
 });
}
const roadApronRadius=node=>node.degree>2?16:node.base?12:0;
module.exports={profileRoadWidths,roadApronRadius};
if(require.main===module){
 const fs=require('node:fs'),file='assets/maps/alpha/roads.json',roads=JSON.parse(fs.readFileSync(file)),nodes=new Map(roads.nodes.map(n=>[n.id,n]));
 for(const p of roads.paths)profileRoadWidths(p.points,p.width,nodes.get(p.from),nodes.get(p.to));
 for(const n of roads.nodes)n.apronRadius=roadApronRadius(n);
 fs.writeFileSync(file,JSON.stringify(roads)+'\n');
 console.log('Updated widths of '+roads.paths.length+' corridors; all centre lines and heights preserved');
}
