import {SCAV_PROFILES,isInfantry} from './scav-unit-profiles.js';
import {generatorLayout} from './generator-layout.js';
import {M02_STATION_SCALE} from './mission02-base-layout.js';

const profiles=new Map();
const buildingProfiles=new WeakMap();
const volumeRadii=new WeakMap();
function sightRadius(boxes){
 let radius=volumeRadii.get(boxes);if(radius!==undefined)return radius;
 radius=0;for(const [x,y,,width,depth] of boxes)radius=Math.max(radius,Math.hypot(Math.abs(x)+width/2,Math.abs(y)+depth/2));
 volumeRadii.set(boxes,radius);return radius;
}
// Local metres: [centre x, centre y, bottom, width, depth, top]. These are
// opaque structural volumes from the existing prefabs, not the larger
// construction exclusion footprint. Open pump/tower frames stay open.
export function sightVolumes(building,spec,scale){
 if(spec.sightVolumes)return spec.sightVolumes;
 const cached=buildingProfiles.get(building),size=spec.realSizeMetres,profile=building.fenceProfile;
 if(cached&&cached.kind===building.kind&&cached.variant===building.scavVariant&&cached.owner===building.owner&&cached.base===building.m02Base&&cached.camp===building.campId
  &&cached.width===building.halfWidth&&cached.depth===building.halfDepth&&cached.span===building.fenceSpan&&cached.scale===scale
  &&cached.w===size?.[0]&&cached.d===size?.[1]&&cached.h===size?.[2]
  &&cached.p0===profile?.[0]&&cached.p1===profile?.[1]&&cached.p2===profile?.[2])return cached.boxes;
 const boxes=computeSightVolumes(building,spec,scale);
 buildingProfiles.set(building,{kind:building.kind,variant:building.scavVariant,owner:building.owner,base:building.m02Base,camp:building.campId,
  width:building.halfWidth,depth:building.halfDepth,span:building.fenceSpan,scale,w:size?.[0],d:size?.[1],h:size?.[2],
  p0:profile?.[0],p1:profile?.[1],p2:profile?.[2],boxes});return boxes;
}
function computeSightVolumes(building,spec,scale){
 if(building.kind==='scav-gate'&&building.scavVariant==='m02-open-leaf')return [[0,0,.2,.2,building.fenceSpan,2.6],[0,-building.fenceSpan/2,0,.4,.42,3.9]];
 if(building.kind==='scav-fence'){
  const span=building.fenceSpan??7,profile=building.fenceProfile??[0,0,0],key='fence|'+span+'|'+profile;
  if(!profiles.has(key)){
   const height=t=>{const i=Math.min(1,Math.floor(t));return profile[i]+(profile[i+1]-profile[i])*(t-i);};
   profiles.set(key,Array.from({length:4},(_,i)=>{const a=height(i/2),b=height((i+1)/2);return [(i-1.5)*span/4,0,Math.min(a,b),span/4,.7,Math.max(a,b)+2.5];}));
  }
  return profiles.get(key);
 }
 if(spec.sightVolumes)return spec.sightVolumes;
 const modelScale=building.kind==='generator'&&building.m02Base==='energy_hub'&&building.owner==='scavs'?M02_STATION_SCALE:1;
 const size=spec.realSizeMetres,key=building.kind+'|'+(building.campId??'')+'|'+modelScale+'|'+(size?.join(',')??[building.halfWidth,building.halfDepth,scale].join(','));
 if(profiles.has(key))return profiles.get(key);
 let boxes=[];
 if(size){
  const [w,d,h]=size;
  if(building.kind==='factory')boxes=[[-w*.117,0,.35,w*.63,d*.79,.35+h*.59]];
  else if(building.kind==='lab')boxes=[...[-1,1].map(side=>[side*w*.291,.21,.35,w*.352,d*.715,.35+h*.615]),
   [0,-d*.396+d*.79/2,.35,w*.238,d*.79,.35+h*.789]];
  else if(building.kind==='generator'){
   const {hall}=generatorLayout(size);boxes=[[hall.x,hall.y,hall.bottom,hall.width,hall.depth,hall.top]];
  }else if(building.kind==='bunker')boxes=[[0,d*.12,.28,w*.72,d*.57,h*.8+.16]];
  else if(building.kind!=='derrick'&&building.kind!=='mg-tower')boxes=[[0,0,0,w,d,h]];
 }else if(building.kind==='camp-core'){
  if(building.campId==='nw-pocket')boxes=[[-2.6,.4,0,4.2,4.3,2.65]];
  else if(building.campId==='west-south')boxes=[[-3.64,.85,.205,3.32,4.75,3.115],[2.85,.85,.205,4.44,4.75,3.115],[-.66,1.73,.205,2.63,2.95,3.115]];
  else boxes=[[0,0,0,building.halfWidth*1.7/scale,building.halfDepth*1.7/scale,3.2]];
 }
 if(modelScale!==1)boxes=boxes.map(box=>box.map(value=>value*modelScale));
 profiles.set(key,boxes);return boxes;
}

function rayBox(ax,ay,az,bx,by,bz,box,progress){
 const [x,y,bottom,w,d,roof]=box,top=bottom+(roof-bottom)*progress;
 let enter=0,leave=1;
 for(let axis=0;axis<3;axis++){
  const a=axis===0?ax:axis===1?ay:az,b=axis===0?bx:axis===1?by:bz,
   lo=axis===0?x-w/2:axis===1?y-d/2:bottom,hi=axis===0?x+w/2:axis===1?y+d/2:top,delta=b-a;
  if(Math.abs(delta)<1e-9){if(a<lo||a>hi)return false;continue;}
  let first=(lo-a)/delta,last=(hi-a)/delta;if(first>last)[first,last]=[last,first];
  enter=Math.max(enter,first);leave=Math.min(leave,last);if(enter>leave)return false;
 }
 return leave>1e-5&&enter<1-1e-5;
}

export function clearCombatSight(mission,from,to){
 const field=mission.field,scale=mission.config.worldScale;
 const left=Math.min(from.x,to.x),right=Math.max(from.x,to.x),bottom=Math.min(from.y,to.y),top=Math.max(from.y,to.y);
 const a=field.heightAt(from.x,from.y)+(['mg-tower','m03-flame-tower'].includes(from.kind)?12:SCAV_PROFILES[from.kind]?.height??3.2)*scale;
 const targetSpec=mission.config.buildings[to.kind];
 const targetHeight=targetSpec?(targetSpec.realSizeMetres?.[2]??3.2)*(to.kind==='mg-tower'?.74:.42):isInfantry(to)?1:1.5;
 const b=(to.groundHeight??field.heightAt(to.x,to.y))+targetHeight*scale;
 const samples=Math.max(12,Math.min(512,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/8)));
 for(let i=1;i<samples;i++){
  const t=i/samples;
  if(field.heightAt(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t)+.4>a+(b-a)*t)return false;
 }
 for(const building of mission.state.buildings){
  if(building.hp<=0||building.id===from.id||building.id===to.id)continue;
  const spec=mission.buildingSpec(building),boxes=sightVolumes(building,spec,scale);
  if(!boxes.length)continue;
  // The radius encloses every rotated structural volume. Buildings outside
  // the ray's XY bounds cannot occlude it, so avoid terrain and ray tests.
  const radius=sightRadius(boxes)*scale;
  if(building.x+radius<left||building.x-radius>right||building.y+radius<bottom||building.y-radius>top)continue;
  const c=Math.cos(building.rotation??0),s=Math.sin(building.rotation??0),z=building.groundHeight??field.heightAt(building.x,building.y),
   fx=(from.x-building.x)/scale,fy=(from.y-building.y)/scale,tx=(to.x-building.x)/scale,ty=(to.y-building.y)/scale;
  const progress=building.completed?1:Math.max(0,Math.min(1,building.progress??1));
  for(const box of boxes)if(rayBox(fx*c+fy*s,-fx*s+fy*c,(a-z)/scale,tx*c+ty*s,-tx*s+ty*c,(b-z)/scale,box,progress))return false;
 }
 return true;
}
