// Analytic damped suspension response. No position correction, physics body or
// per-frame state update: only a real contact stores a small serializable kick.
const damping=3.6,frequency=11,zero=Object.freeze({roll:0,pitch:0,rollSpeed:0,pitchSpeed:0});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function contactRockAt(unit,time){
  const state=unit.contactRock,t=state?time-state.at:Infinity;
  if(t<0||t>2.2)return zero;
  const decay=Math.exp(-damping*t),s=Math.sin(frequency*t),c=Math.cos(frequency*t);
  const sample=(q,v)=>{const b=(v+damping*q)/frequency;return [decay*(q*c+b*s),decay*(v*c-(frequency*q+damping*b)*s)];};
  const [roll,rollSpeed]=sample(state.roll,state.rollSpeed),[pitch,pitchSpeed]=sample(state.pitch,state.pitchSpeed);
  return {roll,pitch,rollSpeed,pitchSpeed};
}
export function kickContactRock(unit,worldDirection,closingSpeed,time){
  if(unit.hp<=0||closingSpeed<=.18)return;
  const prior=contactRockAt(unit,time),c=Math.cos(unit.heading??0),s=Math.sin(unit.heading??0);
  const side=worldDirection[0]*c+worldDirection[1]*s,forward=-worldDirection[0]*s+worldDirection[1]*c;
  const kick=Math.min(.65,.18+closingSpeed*.13);
  unit.contactRock={at:time,roll:prior.roll,pitch:prior.pitch,
    rollSpeed:clamp(prior.rollSpeed+side*kick,-.85,.85),pitchSpeed:clamp(prior.pitchSpeed-forward*kick*.55,-.44,.44)};
}
// Weapon impulses use the same suspension as contacts, but never move the
// navigation body. A flame stream heats the hull rather than kicking it.
export function kickWeaponRock(unit,hit,time,weapon='mg'){
  if(unit.hp<=0||['fire','collision'].includes(hit.type))return;
  const heavy=['shell','grenade','penetrator'].includes(hit.type);
  const mass=unit.kind==='scav-bus'||unit.kind==='scav-firetruck'?1.8:unit.kind==='scav-zaporozhets'?.7:1;
  const strength=(heavy?Math.min(1.45,.45+Math.sqrt(hit.power)*.065):Math.min(.26,.06+Math.sqrt(hit.power)*.045)*(weapon==='rifle'?.65:1))/mass;
  const dir=hit.worldDirection??hit.direction,c=Math.cos(unit.heading??0),s=Math.sin(unit.heading??0),prior=contactRockAt(unit,time);
  const side=dir[0]*c+dir[1]*s,forward=-dir[0]*s+dir[1]*c;
  unit.contactRock={at:time,roll:prior.roll,pitch:prior.pitch,
    rollSpeed:clamp(prior.rollSpeed+side*strength,-1.65,1.65),pitchSpeed:clamp(prior.pitchSpeed-forward*strength*.75,-1.2,1.2)};
}
