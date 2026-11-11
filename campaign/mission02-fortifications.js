import {siteCourts} from '../assets/campaign/alpha/mission02/site-plan.js';
import layout from '../assets/campaign/alpha/mission02/layout.js';

export const M02_FORTIFICATION_VERSION=3;
// Tile complete edges, leaving only explicitly authored gate intervals.
// Roads, parked vehicles and rally points must never silently delete walls.
export function installM02Fortifications(mission){
 const m=mission.state.m02;if(!m||m.version<2||m.fortificationVersion>=M02_FORTIFICATION_VERSION)return;
 const f=mission.field,scale=mission.config.worldScale,old=mission.state.buildings.filter(b=>b.m02Fortification);
 const upgrading=!!m.fortificationVersion,damaged=new Set(old.filter(b=>b.hp<b.maxHp).map(b=>b.m02Base));
 if(upgrading){
  mission.state.buildings=mission.state.buildings.filter(b=>!b.m02Fortification);
  for(const authored of layout.bases){
   const base=m.bases[authored.id];if(!base)continue;
   for(const item of authored.structures){
    const b=mission.state.buildings.find(b=>b.id===item.id);if(!b)continue;
    // Preserve damage, ownership, production and objectives. Never recreate a
    // missing original entity or resurrect a conquered camp on save migration.
    if(b.hp<b.maxHp)damaged.add(authored.id);
    if(!b.originalGrid)Object.assign(b,f.gridToWorld(item.grid));
    Object.assign(b,{kind:item.kind,halfWidth:item.halfWidth,halfDepth:item.halfDepth});
    b.groundHeight=Math.max(...[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=>f.heightAt(b.x+dx*b.halfWidth,b.y+dy*b.halfDepth))));
    if(base.artifact?.carrierId===b.id){base.artifact.carrierPosition={x:b.x,y:b.y};if(base.artifact.state==='sealed')base.artifact.point=f.gridToWorld(item.pickupGrid);}
   }
   base.structureIds=base.structureIds.filter(id=>!old.some(b=>b.id===id));
  }
 }
 function add(site,key,kind,p,{width,depth,rotation=0,span=7,hp,variant='reinforced',gate,combat=false}={}){
  const spec=mission.config.buildings[kind],swap=Math.abs(Math.sin(rotation))>.7;
  const w=width??spec.footprintMetres[0]*scale,d=depth??spec.footprintMetres[1]*scale,hw=(swap?d:w)/2,hd=(swap?w:d)/2;
  const heights=[-.5,0,.5].map(t=>f.heightAt(p.x+Math.cos(rotation)*w*t,p.y+Math.sin(rotation)*w*t));
  const groundHeight=kind==='scav-fence'?heights[1]:Math.max(...[-1,0,1].flatMap(x=>[-1,0,1].map(y=>f.heightAt(p.x+x*hw,p.y+y*hd))));
  const former=old.filter(b=>b.m02Base===site&&b.kind===kind).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
  const inherited=old.find(b=>b.id==='m02.fort.'+site+'.'+key)??(former&&Math.hypot(former.x-p.x,former.y-p.y)<36?former:null);
  const b=mission.addStructure(kind,'scavs',p,{id:'m02.fort.'+site+'.'+key,campId:'m02.base.'+site,m02Base:site,campInfrastructure:true,rotation,
   halfWidth:hw,halfDepth:hd,hp:hp??spec.hp,groundHeight,scavVariant:variant,m02Fortification:true,...(gate?{m02Gate:gate}:{}),
   ...(kind==='scav-fence'?{fenceSpan:span,fenceProfile:heights.map(h=>(h-groundHeight)/scale)}:{}),...(kind==='scav-gate'?{fenceSpan:span}:{})});
  if(inherited&&inherited.hp<inherited.maxHp){b.hp=b.maxHp*inherited.hp/inherited.maxHp;if(inherited.damage)b.damage=structuredClone(inherited.damage);if(inherited.destroyedAt!==undefined)b.destroyedAt=inherited.destroyedAt;}
  if(combat)m.bases[site].structureIds.push(b.id);
  return b;
 }
 for(const site of siteCourts){
  const base=m.bases[site.id];if(!base||base.state==='neutralized')continue;
  base.gate=f.gridToWorld(site.gate);
  const [l,t,r,b]=site.rect,corners=[[l,t],[r,t],[r,b],[l,b]].map(f.gridToWorld);
  for(let edge=0;edge<4;edge++){
   const a=corners[edge],b=corners[(edge+1)%4],length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,rotation=Math.atan2(uy,ux);
   const gates=site.gates.filter(g=>g.edge===edge).map(g=>{const p=f.gridToWorld(g.grid);return {...g,p,at:(p.x-a.x)*ux+(p.y-a.y)*uy};}).sort((a,b)=>a.at-b.at);
   const intervals=[];let cursor=0;
   for(const g of gates){intervals.push([cursor,g.at-g.width/2]);cursor=g.at+g.width/2;}
   intervals.push([cursor,length]);
   for(const [section,[start,end]] of intervals.entries()){
    if(end<start)throw Error('Gate extends beyond compound corner: '+site.id);
    const count=Math.ceil((end-start)/28),step=(end-start)/count;
    for(let i=0;i<count;i++){const at=start+(i+.5)*step;
     add(site.id,'wall.'+edge+'.'+section+'.'+i,'scav-fence',{x:a.x+ux*at,y:a.y+uy*at},{width:step,depth:3.2,rotation,span:step/scale,hp:320});
    }
   }
   for(const g of gates){
    if(g.closed){add(site.id,'gate.'+g.id,'scav-fence',g.p,{width:g.width,depth:3.2,rotation,span:g.width/scale,hp:840,variant:'service-gate',gate:g.id});continue;}
    const nx=uy,ny=-ux,leaf=g.width/2;
    for(const side of [-1,1])add(site.id,'gate.'+g.id+'.'+side,'scav-gate',{
     x:g.p.x+ux*side*g.width/2+nx*leaf/2,y:g.p.y+uy*side*g.width/2+ny*leaf/2,
    },{width:4,depth:leaf+4,rotation:Math.atan2(-nx,ny),span:leaf/scale,hp:420,variant:'m02-open-leaf',gate:g.id});
   }
  }
 }
 for(const [site,key,kind,grid,rotation=0] of [
  ['east_factory','barracks','scav-barracks',[34.7,74.6]],['east_factory','store','scav-store',[31,77.2],Math.PI/2],
  ['hill_factory','barracks','scav-barracks',[17.5,70.4],Math.PI],['hill_factory','store','scav-store',[18.6,72.4],Math.PI/2],
  ['sensor_outpost','store','scav-store',[32,88.5],Math.PI/2],
  ['energy_hub','barracks','scav-barracks',[29.5,112.9],Math.PI],
  ['sensor_outpost','watch.nw','mg-tower',[29.25,87.75]],['sensor_outpost','watch.se','mg-tower',[32.05,91.25]],
  ['sensor_outpost','watch.ne','mg-tower',[32.05,87.5]],['sensor_outpost','watch.sw','mg-tower',[29.25,91.25]],
  ['energy_hub','watch.nw','mg-tower',[19.2,103.2]],['energy_hub','watch.ne','mg-tower',[32.4,103.2]],
  ['energy_hub','watch.sw','mg-tower',[19.2,113.3]],['energy_hub','watch.se','mg-tower',[32.4,113.3]],
  ['energy_hub','watch.s','mg-tower',[25.8,113.3]],
  ['energy_hub','entry.n','mg-tower',[32.3,106.2]],['energy_hub','entry.s','mg-tower',[32.3,108.8]],
 ]){
  if(!m.bases[site]||m.bases[site].state==='neutralized')continue;
  const combat=!!mission.config.buildings[kind].damage;
  // An attacked old layout receives no new defenders, but existing defenders
  // (including destroyed ones) retain their HP through a later layout revision.
  if(upgrading&&combat&&damaged.has(site)&&!old.some(b=>b.id==='m02.fort.'+site+'.'+key))continue;
  add(site,key,kind,f.gridToWorld(grid),{rotation,combat,...(combat?{width:23,depth:23}:{})});
 }
 m.fortificationVersion=M02_FORTIFICATION_VERSION;
 mission.rebuildNavigation();
 // Assembly slots were imported before walls existed. Keep valid slots, then
 // replace blocked ones with bus-sized parking near the actual entrance.
 for(const site of siteCourts){
  const base=m.bases[site.id];if(!base||base.state==='neutralized')continue;
  const candidates=[...base.rally],slots=[];
  for(let radius=40;radius<=240;radius+=32)for(let i=0;i<24;i++){
   const a=i*Math.PI/12;candidates.push({x:base.gate.x+Math.cos(a)*radius,y:base.gate.y+Math.sin(a)*radius});
  }
  for(const p of candidates){
   const pose={...p,kind:'scav-bus',owner:'scavs',heading:0};
   if(!mission.inBounds(p.x,p.y)||slots.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<28)||!mission.vehicleMotionClear(pose,pose,pose,.52,undefined,[]))continue;
   if(!mission.nav.findPath(base.gate,p)?.length)continue;
   slots.push(p);if(slots.length===12)break;
  }
  if(slots.length<12)throw Error('Insufficient assembly space at '+site.id);
  base.rally=slots;
 }
 // Move only vehicles intersecting the new layout, never punch a hole for them.
 for(const u of mission.state.units.filter(u=>u.hp>0)){
  if(!mission.state.buildings.some(b=>b.m02Base&&b.hp>0&&Math.abs(u.x-b.x)<b.halfWidth+24&&Math.abs(u.y-b.y)<b.halfDepth+24))continue;
  if(mission.vehicleMotionClear(u,u,u,.52,undefined,[]))continue;
  let found=false;
  for(let r=24;r<=240&&!found;r+=16)for(let i=0;i<24&&!found;i++){
   const a=i*Math.PI/12,p={...u,x:u.x+Math.cos(a)*r,y:u.y+Math.sin(a)*r};
   if(!mission.inBounds(p.x,p.y)||mission.state.units.some(v=>v!==u&&v.hp>0&&Math.hypot(v.x-p.x,v.y-p.y)<28))continue;
   if(mission.vehicleMotionClear(u,p,p,.52,undefined,[])){u.x=p.x;u.y=p.y;if(u.guard)u.guard={x:u.x,y:u.y};u.path=[];found=true;}
  }
 }
}
