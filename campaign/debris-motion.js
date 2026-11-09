// Sample once per detached piece. Frame rate must not change its trajectory.
export function debrisRandom(seed){
 let value=seed>>>0;
 return ()=>{value=(value+0x6D2B79F5)>>>0;let n=Math.imul(value^(value>>>15),1|value);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
}

export function debrisLaunch({seed,size,material='metal',offset,direction,power,wreck=false}){
 const random=debrisRandom(seed),signed=()=>random()*2-1;
 const dims=size.map(v=>Math.max(.025,v)),sorted=[...dims].sort((a,b)=>a-b);
 const sheet=material==='metal'&&sorted[0]<sorted[1]*.16;
 // Rendered roof sheets have exaggerated thickness. Use a sheet's weight,
 // rather than treating its entire bounding box as solid steel.
 const density={concrete:2.4,metal:7.8,equipment:1.8,rubber:1.1,wood:.55}[material]??1.8;
 const volume=sorted[1]*sorted[2]*(sheet?Math.min(sorted[0],.035):sorted[0]);
 const mass=volume*density,response=1/Math.sqrt(1+mass*.18);
 const outward=Math.hypot(offset[0],offset[1])>.001?Math.atan2(offset[1],offset[0]):random()*Math.PI*2;
 const angle=outward+signed()*.85;
 const scatter=(wreck?2.5: .45)*(.25+random()**1.6*2.3)*response;
 const hit=Math.min(6,Math.sqrt(Math.max(0,power))*.24)*response*(wreck?.25:1)*(.35+random()*1.15);
 const length=Math.hypot(...direction)||1;
 const velocity=[Math.cos(angle)*scatter+direction[0]/length*hit,Math.sin(angle)*scatter+direction[1]/length*hit,
  direction[2]/length*hit+((sheet?.5:-.3)+random()**1.5*(sheet?5.5:2.5))*response];
 // Independent, signed torque on all axes, reduced by each principal moment.
 const tumble=(.3+random()**1.3*4.5)*(sheet?1.4:1);
 const spin=dims.map((_,i)=>signed()*tumble/Math.sqrt(1+mass*(dims[(i+1)%3]**2+dims[(i+2)%3]**2)*.018));
 const rubber=material==='rubber',concrete=material==='concrete';
 return {velocity,spin,mass,sheet,
  bounce:(rubber?.35:concrete?.04:.12)+random()*(rubber?.25:.13),
  friction:(concrete?.3:rubber?.65:.48)+random()*.18,
  angularRetention:.25+random()*.35,drag:sheet?.32:.035,
  settle:.1+random()*.17};
}

export function blastShards(seed,radius,scale){
 const random=debrisRandom(seed),jet=random()*Math.PI*2;
 return Array.from({length:10+Math.floor(random()*7)},()=>{
  // An uneven burst has gaps and small clusters, never a regular radial fan.
  const angle=random()<.55?jet+(random()-.5)*2.1:random()*Math.PI*2;
  const size=scale*(.055+random()**1.7*.23),light=1-size/(scale*.4);
  const speed=radius*(.22+random()**1.3*1.9)*light;
  return {angle,speed,vz:scale*(.3+random()**1.5*6.2)*light,size,
   start:[(random()-.5)*radius*.4,(random()-.5)*radius*.4,random()*radius*.12],
   spin:[0,1,2].map(()=> (random()-.5)*18*light),rotation:[0,1,2].map(()=>random()*Math.PI*2),
   shape:[.7+random()*1.7,.35+random()*.65,.18+random()*.55],
   bounce:.08+random()*.27,slide:.06+random()*.22,colour:Math.floor(random()*3)};
 });
}
