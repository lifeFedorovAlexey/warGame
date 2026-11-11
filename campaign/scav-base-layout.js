// World-space yards follow the flat pockets already present on the campaign map.
// A wide, permanently open scrap gate keeps both attackers and sorties mobile.
const layouts={
 'nw-pocket':{box:[-88,-29,112,145],gate:'east',gateAt:12,gateSpan:76,barracks:[-43,105],store:[48,112],towers:[[87,72],[87,119]],garageTurn:180},
 'nw-west':{box:[-84,-116,128,109],gate:'south',gateAt:83.2,exitGate:'north',exitAt:59,barracks:[-43,-60],barracksTurn:90,store:[-43,65],towers:[[-65,-97],[114,-75]]},
 'nw-east':{box:[-70,-65,112,104],gate:'south',gateAt:24,barracks:[60,61],store:[92,-8],towers:[[-44,20],[86,-43]]},
 'west-south':{box:[-175,-106,123,117],gate:'north',gateAt:26,gateSpan:90,exitGate:'south',exitAt:-132,exitSpan:76,barracks:[67,-61],barracksTurn:180,store:[-77,30],towers:[[-80,89],[94,89]]},
};
export function campGuardPose(camp,index){
 const layout=campBaseLayout(camp),g=layout?.gate??camp.gate,n=layout?.normal??{x:0,y:1},forward=(camp.siteLayout?.guardStart??20)+Math.floor(index/2)*32,side=(index%2?1:-1)*65;
 return {x:g.x+n.x*forward-n.y*side,y:g.y+n.y*forward+n.x*side,heading:Math.atan2(-n.x,n.y),guard:{...g}};
}
export function campBaseLayout(camp){
 const data=camp.siteLayout??layouts[camp.id];if(!data)return null;
 const [left,bottom,right,top]=data.box,span=data.gateSpan??68,at=data.gateAt;
 const point=(x,y)=>({x:camp.x+x,y:camp.y+y});
 const side=data.gate,normal=side==='east'?{x:1,y:0}:side==='north'?{x:0,y:1}:{x:0,y:-1};
 const gate=side==='east'?point(right,at):point(at,side==='north'?top:bottom);
 const rotation=side==='east'?Math.PI/2:side==='north'?Math.PI:0;
 const edges=[[[left,bottom],[right,bottom],'south'],[[right,bottom],[right,top],'east'],[[right,top],[left,top],'north'],[[left,top],[left,bottom],'west']];
 const fences=[];
 for(const [a,b,name] of edges){
  const horizontal=a[1]===b[1],lo=Math.min(a[horizontal?0:1],b[horizontal?0:1]),hi=Math.max(a[horizontal?0:1],b[horizontal?0:1]);
  const service=name===data.serviceGate?.side;
  const opening=name===side?at:service?data.serviceGate.at:name===data.exitGate?data.exitAt:null;
  const width=service?data.serviceGate.span:name===data.exitGate?data.exitSpan??span:span;
  const ranges=opening!==null?[[lo,opening-width/2],[opening+width/2,hi]]:[[lo,hi]];
  for(const [start,end] of ranges){const count=Math.ceil((end-start)/32),length=(end-start)/count;
   for(let i=0;i<count;i++){const t=start+(i+.5)*length;fences.push({...point(horizontal?t:a[0],horizontal?a[1]:t),length,rotation:horizontal?0:Math.PI/2});}
  }
 }
 const exits=data.exitGate?[data.exitGate==='west'?{gate:point(left,data.exitAt),normal:{x:-1,y:0},rotation:-Math.PI/2}:{gate:point(data.exitAt,data.exitGate==='north'?top:bottom),normal:{x:0,y:data.exitGate==='north'?1:-1},rotation:data.exitGate==='north'?Math.PI:0}]:[];
 const gates=[{gate,normal,rotation},...exits],departure=data.departure==='main'?gates[0]:exits[0]??gates[0];
 return {gate,normal,rotation,fences,departure,barracks:point(...data.barracks),barracksRotation:data.barracksTurn===undefined?rotation:data.barracksTurn*Math.PI/180,store:point(...data.store),
  serviceGate:data.serviceGate?{...point(data.serviceGate.at,bottom),length:data.serviceGate.span,rotation:0}:null,
  emplacements:(data.emplacements??[]).map(p=>point(...p)),
  towers:data.towers.map(p=>point(...p)),garageTurn:data.garageTurn,
  centre:point((left+right)/2,(bottom+top)/2),bounds:data.box.map((v,i)=>v+(i%2?camp.y:camp.x)),
  gatePosts:gates.flatMap(({gate:g,normal:n,rotation:r},i)=>[-1,1].map(sign=>({x:g.x-n.y*sign*(i?data.exitSpan??span:span)/2+n.x*10,y:g.y+n.x*sign*(i?data.exitSpan??span:span)/2+n.y*10,rotation:r+Math.PI})))};
}

export function installScavBases(mission,{restoring=false}={}){
 const scale=mission.config.worldScale;
 for(const camp of mission.state.camps){
  if(camp.baseVersion)continue;
  const layout=campBaseLayout(camp);if(!layout)continue;
  camp.baseVersion=2;
  const core=mission.state.buildings.find(b=>b.campId===camp.id&&b.kind==='camp-core');
  // Never resurrect a cleared or already demolished base when migrating a save.
  if(camp.cleared||!core||core.hp<=0)continue;
  camp.gate={...layout.gate};camp.yard={...layout.centre};
  if(layout.garageTurn!==undefined)core.rotation=layout.garageTurn*Math.PI/180;
  core.scavProduction={type:'vehicles',count:0,waiting:[],nextAt:null};
  if(camp.siteLayout?.design==='square-workshop')core.scavVariant='square-workshop';
  for(const tower of mission.state.buildings.filter(b=>b.campId===camp.id&&b.kind==='mg-tower'))tower.halfWidth=tower.halfDepth=2.55*scale;
  const add=(kind,p,extra={})=>{
   const spec=mission.config.buildings[kind],rotation=extra.rotation??0;
   const [w,d]=(extra.size??spec.footprintMetres).map(v=>v*scale/2),swap=Math.abs(Math.sin(rotation))>.7;
   const halfWidth=swap?d:w,halfDepth=swap?w:d;
   if(restoring&&mission.state.units.some(u=>u.hp>0&&Math.abs(u.x-p.x)<halfWidth+9&&Math.abs(u.y-p.y)<halfDepth+12))return null;
   const entity=mission.addStructure(kind,'scavs',p,{campId:camp.id,rotation,halfWidth,halfDepth,...extra});
   // Short buried footings seat modules on slopes without hovering above them.
   const heights=[[-halfWidth,-halfDepth],[-halfWidth,halfDepth],[halfWidth,-halfDepth],[halfWidth,halfDepth]].map(([x,y])=>mission.field.heightAt(p.x+x,p.y+y));
   entity.groundHeight=Math.min(...heights);
   if(kind==='scav-fence'){
    entity.groundHeight=mission.field.heightAt(p.x,p.y);
    entity.fenceProfile=[-.5,0,.5].map(t=>(mission.field.heightAt(p.x+Math.cos(rotation)*p.length*t,p.y+Math.sin(rotation)*p.length*t)-entity.groundHeight)/scale);
   }
   return entity;
  };
  add('scav-barracks',layout.barracks,{rotation:layout.barracksRotation,scavProduction:{type:'infantry',count:0,waiting:[],nextAt:null}});
  add('scav-store',layout.store,{rotation:layout.rotation,campInfrastructure:true});
  layout.towers.forEach((p,i)=>add('mg-tower',p,{rotation:layout.rotation,hp:(camp.siteLayout?.towerHp??370)*camp.strength,scavVariant:'watch-'+i,size:[5.1,5.1]}));
  layout.emplacements.forEach(p=>add('bunker',p,{rotation:layout.rotation,hp:650,scavVariant:'square-yard',size:[5.4,4.4]}));
  layout.fences.forEach((p,i)=>add('scav-fence',p,{rotation:p.rotation,size:[p.length/scale,.7],fenceSpan:p.length/scale,scavVariant:String(i%3),campInfrastructure:true}));
  layout.gatePosts.forEach((p,i)=>add('scav-gate',p,{rotation:p.rotation,scavVariant:String(i%2),campInfrastructure:true}));
  if(layout.serviceGate){const p=layout.serviceGate;add('scav-fence',p,{rotation:0,size:[p.length/scale,.7],fenceSpan:p.length/scale,scavVariant:'service-gate',hp:320,campInfrastructure:true});}
 }
}
