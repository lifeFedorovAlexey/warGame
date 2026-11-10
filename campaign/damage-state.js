// Renderer-independent, bounded, JSON-serializable damage. Metres in model space.
export const DAMAGE_VERSION = 3;
export const CAGE = {size:[5,9,5], min:[-1.35,-2.7,0], max:[1.35,2.7,3.6]};
export const CAGE_COUNT = 225;
export const MAX_MARKS = 24;
export const MAX_PARTS = 192;
const cagePoints=new Float32Array(CAGE_COUNT*3);
const customCagePoints=new WeakMap();
for(let z=0;z<5;z++)for(let y=0;y<9;y++)for(let x=0;x<5;x++){
  const i=(z*45+y*5+x)*3;cagePoints[i]=CAGE.min[0]+x/4*(CAGE.max[0]-CAGE.min[0]);cagePoints[i+1]=CAGE.min[1]+y/8*(CAGE.max[1]-CAGE.min[1]);cagePoints[i+2]=CAGE.min[2]+z/4*(CAGE.max[2]-CAGE.min[2]);
}
export const MATERIAL = {metal:0, concrete:1, glass:2, rubber:3, equipment:4};
export const PROFILES = {
  metal:{yield:16, compliance:.0035, limit:.65, strength:150},
  concrete:{yield:Infinity, compliance:0, limit:0, strength:260},
  glass:{yield:Infinity, compliance:0, limit:0, strength:19},
  rubber:{yield:Infinity, compliance:0, limit:0, strength:95},
  equipment:{yield:22, compliance:.0018, limit:.18, strength:85},
};
export const VEHICLE_PARTS = {
  0:{name:'body',material:'metal'},
  1:{name:'wheel_fl',material:'rubber',detachable:true},
  2:{name:'wheel_fr',material:'rubber',detachable:true},
  3:{name:'wheel_rl',material:'rubber',detachable:true},
  4:{name:'wheel_rr',material:'rubber',detachable:true},
  5:{name:'headlamp_l',material:'glass',detachable:true,breakOnWreck:true},
  6:{name:'headlamp_r',material:'glass',detachable:true,breakOnWreck:true},
  7:{name:'bumper_front',material:'metal',detachable:true},
  8:{name:'bumper_rear',material:'metal',detachable:true},
  9:{name:'weapon',material:'equipment',detachable:true,strength:210},
  10:{name:'window_front_l',material:'glass',detachable:true},
  11:{name:'window_front_r',material:'glass',detachable:true},
  12:{name:'window_left',material:'glass',detachable:true},
  13:{name:'window_right',material:'glass',detachable:true},
  14:{name:'window_rear_l',material:'glass',detachable:true},
  15:{name:'window_rear_r',material:'glass',detachable:true},
  16:{name:'mirror_l',material:'glass',detachable:true},
  17:{name:'mirror_r',material:'glass',detachable:true},
  18:{name:'window_rear_side_l',material:'glass',detachable:true},
  19:{name:'window_rear_side_r',material:'glass',detachable:true},
  20:{name:'window_cab_l',material:'glass',detachable:true},
  21:{name:'window_cab_r',material:'glass',detachable:true},
  22:{name:'hood_guard',material:'metal',detachable:true,strength:95},
  23:{name:'window_grille',material:'metal',detachable:true,strength:55},
  24:{name:'cargo_rail_left',material:'metal',detachable:true,strength:75},
  25:{name:'cargo_rail_right',material:'metal',detachable:true,strength:75},
  26:{name:'tube_bumper',material:'metal',detachable:true,strength:125},
  27:{name:'side_hood_left',material:'metal',detachable:true,strength:75},
  28:{name:'side_hood_right',material:'metal',detachable:true,strength:75},
  29:{name:'spare_wheel',material:'rubber',detachable:true,strength:100},
  30:{name:'hood_panel',material:'metal',detachable:true,strength:65},
  31:{name:'rear_lamp_l',material:'glass',detachable:true,breakOnWreck:true},
  32:{name:'rear_lamp_r',material:'glass',detachable:true,breakOnWreck:true},
};
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const normalize = v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
export function createDamageState(bounds=CAGE){
  const state={version:DAMAGE_VERSION,revision:0,hits:0,total:0,burn:0,wreck:false,cage:null,parts:{},marks:[]};
  if(bounds!==CAGE){
    if(!bounds?.min?.every(Number.isFinite)||!bounds?.max?.every(Number.isFinite)||bounds.min.length!==3||bounds.max.length!==3||bounds.max.some((v,i)=>v<=bounds.min[i]))throw new TypeError('Invalid damage cage bounds');
    state.cageBounds={min:bounds.min.slice(),max:bounds.max.slice()};
  }
  return state;
}
export function upgradeDamageState(state,vehicle=false){
  if(!state||state.version>=DAMAGE_VERSION)return state;
  if(vehicle&&state.version<2){
    // Version 1 grouped all side panes. Preserve existing failures on loading
    // old saves; only new hits use the finer individual pane mapping.
    for(const id of [12,13])if(state.parts[id])for(const next of [id+6,id+8])state.parts[next]??={...state.parts[id]};
    for(const mark of state.marks)if(mark.part===12||mark.part===13){if(mark.point[1]>.55)mark.part+=8;else if(mark.point[1]<-.98)mark.part+=6;}
  }
  // Older saves keep their contact locations and part failures. Enlarge only
  // the presentation support of old tiny MG marks; do not invent lost impulses.
  if(state.version<3)for(const mark of state.marks??[])if(mark.kind===0&&mark.material===MATERIAL.metal&&mark.radius<.10)mark.radius*=3;
  state.version=DAMAGE_VERSION;state.revision++;return state;
}
export function damageLOD(distance,previous=2,visible=true){
  if(!visible)return 3;
  if(previous===0&&distance<280||distance<235)return 0;
  if(previous<=1&&distance<820||distance<720)return 1;
  return 2;
}
export function partState(state,id){return state?.parts?.[id]??null;}
export function partMissing(state,id){return !!partState(state,id)?.detached;}
export function damageMobility(state){
  if(!state)return 1;
  const wheels=[1,2,3,4].filter(id=>partMissing(state,id)).length;
  return Math.max(.25,1-wheels*.2);
}
export function cageSample(state,point,out=[0,0,0]){
  out[0]=out[1]=out[2]=0;
  if(!state?.cage)return out;
  const bounds=state.cageBounds??CAGE;
  const qx=clamp((point[0]-bounds.min[0])*4/(bounds.max[0]-bounds.min[0]),0,4),qy=clamp((point[1]-bounds.min[1])*8/(bounds.max[1]-bounds.min[1]),0,8),qz=clamp((point[2]-bounds.min[2])*4/(bounds.max[2]-bounds.min[2]),0,4);
  const bx=Math.min(3,Math.floor(qx)),by=Math.min(7,Math.floor(qy)),bz=Math.min(3,Math.floor(qz)),fx=qx-bx,fy=qy-by,fz=qz-bz;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
    const weight=(x?fx:1-fx)*(y?fy:1-fy)*(z?fz:1-fz),index=((bz+z)*45+(by+y)*5+bx+x)*3;
    out[0]+=state.cage[index]*weight;out[1]+=state.cage[index+1]*weight;out[2]+=state.cage[index+2]*weight;
  }
  return out;
}
// Return material coordinates for marks on an already deformed surface.
export function undeformPoint(state,point){
  const rest=point.slice(),d=[0,0,0];
  for(let i=0;i<7;i++){cageSample(state,rest,d);for(let a=0;a<3;a++)rest[a]=point[a]-d[a];}
  return rest;
}
// Bound the Frobenius norm of the displacement gradient throughout every
// trilinear cell, using the four edges for each derivative. Keeping it < 1
// makes I + gradient nonsingular with positive determinant: dents cannot fold
// the volume inside out, even after opposing accumulated hits.
function admissibleCage(values,bounds){
  const step=bounds.max.map((v,k)=>(v-bounds.min[k])/[4,8,4][k]),stride=[3,15,135];
  for(let z=0;z<4;z++)for(let y=0;y<8;y++)for(let x=0;x<4;x++){
    const base=(z*45+y*5+x)*3;let norm2=0;
    for(let axis=0;axis<3;axis++){
      const a=(axis+1)%3,b=(axis+2)%3;
      for(let component=0;component<3;component++){
        let maximum=0;
        for(let i=0;i<2;i++)for(let j=0;j<2;j++){
          const index=base+i*stride[a]+j*stride[b]+component;
          maximum=Math.max(maximum,Math.abs(values[index+stride[axis]]-values[index])/step[axis]);
        }
        norm2+=maximum*maximum;
      }
    }
    if(norm2>.82*.82)return false;
  }
  return true;
}
function dent(state,hit,profile){
  // Small arms gradually dish thin sheet metal. The old collision yield of
  // 16 excluded every ordinary MG hit (3–12 HP), even a lethal burst.
  // This remains a local impulse; hull HP never selects a damage shape.
  const bullet=(hit.type??'bullet')==='bullet',sheet=profile===PROFILES.metal;
  const yieldPower=bullet&&sheet?2:profile.yield;
  if(hit.type==='fire'||hit.power<=yieldPower||!profile.compliance)return false;
  const radius=clamp(hit.radius??((bullet&&sheet?.8:.55)+Math.sqrt(hit.power)*.065),.5,2.2);
  const depth=Math.min(bullet?.065:hit.type==='collision'?.42:.32,(hit.power-yieldPower)*profile.compliance*(bullet&&sheet?3.5:1));
  const direction=normalize(hit.direction),point=hit.restPoint??hit.point;
  state.cage??=Array(CAGE_COUNT*3).fill(0);
  let changed=false;const candidate=state.cage.slice();
  const radius2=radius*radius;
  let points=cagePoints;
  if(state.cageBounds){
    points=customCagePoints.get(state.cageBounds);
    if(!points){points=new Float32Array(CAGE_COUNT*3);const b=state.cageBounds;
      for(let z=0;z<5;z++)for(let y=0;y<9;y++)for(let x=0;x<5;x++){const i=(z*45+y*5+x)*3;points[i]=b.min[0]+x/4*(b.max[0]-b.min[0]);points[i+1]=b.min[1]+y/8*(b.max[1]-b.min[1]);points[i+2]=b.min[2]+z/4*(b.max[2]-b.min[2]);}
      customCagePoints.set(state.cageBounds,points);
    }
  }
  for(let idx=0;idx<points.length;idx+=3){
    const dx=points[idx]-point[0],dy=points[idx+1]-point[1],dz=points[idx+2]-point[2],r2=(dx*dx+dy*dy+dz*dz)/radius2;
    if(r2>=1)continue;
    // Compact smooth support; no temporary objects or per-vertex randomness.
    const weight=(1-r2)**2*depth;
    let nx=state.cage[idx]+direction[0]*weight,ny=state.cage[idx+1]+direction[1]*weight,nz=state.cage[idx+2]+direction[2]*weight;
    const length=Math.sqrt(nx*nx+ny*ny+nz*nz),factor=length>profile.limit?profile.limit/length:1;nx*=factor;ny*=factor;nz*=factor;
    changed||=Math.abs(nx-state.cage[idx])+Math.abs(ny-state.cage[idx+1])+Math.abs(nz-state.cage[idx+2])>1e-9;
    candidate[idx]=nx;candidate[idx+1]=ny;candidate[idx+2]=nz;
  }
  if(!changed)return false;
  const bounds=state.cageBounds??CAGE;
  if(admissibleCage(candidate,bounds)){state.cage=candidate;return true;}
  // A bounded line search preserves the previous plastic deformation. Only
  // the current impulse is reduced; no global reset or replacement wreck.
  const trial=state.cage.slice();let lo=0,hi=1;
  for(let iteration=0;iteration<8;iteration++){
    const f=(lo+hi)*.5;
    for(let i=0;i<trial.length;i++)trial[i]=state.cage[i]+(candidate[i]-state.cage[i])*f;
    if(admissibleCage(trial,bounds))lo=f;else hi=f;
  }
  if(!lo)return false;
  for(let i=0;i<trial.length;i++)trial[i]=state.cage[i]+(candidate[i]-state.cage[i])*lo;
  state.cage=trial;return true;
}
// Nearby attachments receive local mechanical stress, not extra combat HP
// hits. Regions come from the actual original model. IDs and wreck status do
// not choose the failed parts. The direct contact is already handled below.
export function applyStructuralImpact(state,hit,regions,parts){
  if(!['collision','shell','penetrator'].includes(hit.type)||hit.power<=16)return [];
  const point=hit.restPoint??hit.point,direction=normalize(hit.direction),radius=clamp(.25+Math.sqrt(hit.power)*.065,.3,1.8),failed=[];
  const transfer=hit.type==='collision'?.55:hit.type==='shell'?.7:.2;
  let changed=false;
  for(const region of regions){
    const id=region.id,part=parts[id],before=state.parts[id]??{damage:0,detached:false};
    if(id===hit.partId||!part?.detachable||before.detached||region.installationPart&&!state.parts[region.installationPart]?.installed)continue;
    const delta=point.map((v,k)=>clamp(v,region.min[k],region.max[k])-v);
    const along=delta.reduce((s,v,k)=>s+v*direction[k],0),distance2=delta.reduce((s,v)=>s+v*v,0);
    // A contact transmits less stress back out of the struck surface.
    const metric=(distance2+Math.max(0,-along)**2*2)/(radius*radius);
    if(metric>=1)continue;
    const load=hit.power*transfer*(1-metric)**2;
    if(load<.01)continue;
    const damage=Math.min(2,before.damage+load/(part.strength??PROFILES[part.material]?.strength??150));
    const detached=damage>=1;state.parts[id]={...before,damage,detached};changed=true;
    if(detached)failed.push(id);
  }
  if(changed)state.revision++;
  return failed;
}
export function applyDamageHit(state,hit,part={material:'metal'},options={deform:true}){
  if(!Number.isFinite(hit.power)||hit.power<=0)return {changed:false,detached:false,deformed:false};
  for(const key of ['point','normal','direction'])if(!Array.isArray(hit[key])||hit[key].length!==3||!hit[key].every(Number.isFinite))throw new TypeError('Invalid damage '+key);
  const id=clamp(Math.trunc(hit.partId??0),0,MAX_PARTS-1),material=part.material??'metal',profile=PROFILES[material]??PROFILES.metal;
  const before=state.parts[id]??{damage:0,detached:false};
  const damage=before.damage+hit.power/(part.strength??profile.strength);
  const detached=!!part.detachable&&damage>=1;
  state.parts[id]={...before,damage:Math.min(2,damage),detached:before.detached||detached};
  state.total+=hit.power;state.hits++;state.revision++;
  const restPoint=hit.restPoint??undeformPoint(state,hit.point);
  const dentStart=performance.now();
  const deformed=options.deform&&!before.detached&&dent(state,{...hit,restPoint},profile);
  const deformationMs=deformed?performance.now()-dentStart:0;
  const type=hit.type??'bullet',fire=type==='fire',penetration=(type==='penetrator'||type==='shell')&&['metal','glass'].includes(material);
  if(fire)state.burn=clamp(state.burn+hit.power*.004,0,1);
  // Radius describes chipped paint/spall, not the calibre of a through-hole.
  const radius=hit.markRadius??(fire?.38:type==='shell'?.30:type==='collision'?.48:material==='concrete'?.14:material==='glass'?.07:clamp(.085+Math.sqrt(hit.power)*.025,.10,.23));
  const mark={point:restPoint,normal:normalize(hit.restNormal??hit.normal),radius,part:id,kind:fire?2:type==='collision'?3:penetration?1:0,material:MATERIAL[material]??0};
  // Merge overlapping bursts before replacing the oldest cosmetic mark. Cage/part damage is never evicted.
  const same=state.marks.find(m=>m.part===id&&m.kind===mark.kind&&m.normal.reduce((s,v,i)=>s+v*mark.normal[i],0)>.8&&Math.hypot(...m.point.map((v,i)=>v-restPoint[i]))<radius*.65);
  if(same)same.radius=Math.min(radius*1.8,same.radius+radius*.06);
  else{if(state.marks.length>=MAX_MARKS)state.marks.shift();state.marks.push(mark);}
  return {changed:true,detached:detached&&!before.detached,partId:id,deformed,deformationMs};
}
export function destroyDamage(state){
  if(state.wreck)return;
  state.wreck=true;state.revision++;
}
