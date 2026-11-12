import {vehicleEnvelope} from './vehicle-collision.js';
import {assignFormation} from './formation-assignment.js';
import {isAutomaticRepair,inFactoryInterior,canReceiveAttack} from './combat-retreat-state.js';

/** @typedef {'auto'|'column'|'line'|'dispersed'|'concentrate'} Formation */
export const FORMATIONS=Object.freeze(['auto','column','line','dispersed','concentrate']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const liveMembers=(mission,group,byId)=>group.members.map(id=>byId?byId.get(id):mission.entity(id)).filter(u=>u?.hp>0&&u.owner===group.owner);

// Membership and the player's preferred formation survive saves. They are
// command inputs, not a second steering controller: roads, swept manoeuvres
// and combat positions retain authority over actual movement.
export function configureCommandGroup(mission,ids,{leaderId,formation='auto'}={}){
 if(!FORMATIONS.includes(formation))return mission.fail('Неизвестное построение');
 const selected=new Set(ids),members=mission.state.units.filter(u=>selected.has(u.id)&&u.owner==='rai'&&u.hp>0&&!inFactoryInterior(u));
 if(!members.length)return mission.fail('Выберите машины');
 const groups=mission.state.commandGroups??=[],old=groups.find(g=>g.members.length===members.length&&g.members.every(id=>selected.has(id)));
 const leader=leaderId?members.find(u=>u.id===leaderId):members.find(u=>u.id===old?.leaderId)??members.find(u=>u.kind==='command')??members[0];
 if(!leader)return mission.fail('Командир должен входить в подразделение');
 if(old){
  if(old.formation!==formation){old.formation=formation;delete old.slots;delete old.slotSignature;}
  old.leaderId=leader.id;old.virtual=leader.kind!=='command';
  for(const unit of members){unit.commandGroupId=old.id;unit.commanderId=leader.id;}
  return {ok:true,groupId:old.id,leaderId:leader.id,members:members.map(u=>u.id),formation};
 }
 // Moving members to another group never changes their current orders.
 const reassigned=new Set(members.map(u=>u.id));
 for(const group of groups){group.members=group.members.filter(id=>!reassigned.has(id));delete group.slots;delete group.slotSignature;}
 const group={id:'group-'+(mission.state.commandGroupSerial=(mission.state.commandGroupSerial??0)+1),owner:leader.owner,
  leaderId:leader.id,virtual:leader.kind!=='command',formation,members:members.map(u=>u.id)};
 groups.push(group);
 for(const unit of members){unit.commandGroupId=group.id;unit.commanderId=leader.id;}
 refreshCommandGroups(mission);
 return {ok:true,groupId:group.id,leaderId:leader.id,members:[...group.members],formation};
}

export function refreshCommandGroups(mission){
 if(!mission.state.commandGroups?.length)return;
 const retained=[],byId=new Map(mission.state.units.map(u=>[u.id,u]));
 for(const group of mission.state.commandGroups){
  const members=liveMembers(mission,group,byId);if(!members.length)continue;
  if(members.length!==group.members.length){group.members=members.map(u=>u.id);delete group.slots;delete group.slotSignature;}
  if(!members.some(u=>u.id===group.leaderId)){
   const leader=members.find(u=>u.kind==='command')??members[0];group.leaderId=leader.id;group.virtual=leader.kind!=='command';
   for(const member of members)member.commanderId=leader.id;
   mission.emit('command-leader-changed',{group:group.id,leader:leader.id});
  }
  retained.push(group);
 }
 mission.state.commandGroups=retained;
}

export function expandCommandIds(mission,ids,{includeRepairing=false,action=null}={}){
 const byId=new Map(mission.state.units.map(u=>[u.id,u]));
 const combat=['attack','attack-move'].includes(action);
 const available=id=>{const u=byId.get(id);return includeRepairing||!u
  ||(combat?canReceiveAttack(u,mission.unitSpec(u)):!isAutomaticRepair(u,mission.unitSpec(u)));};
 // Explicitly selected cars outside the garage obey the player. Expanding
 // a healthy leader's group must not recall unselected repair visitors.
 const expanded=new Set(ids.filter(id=>{
  const unit=byId.get(id);
  return includeRepairing||!inFactoryInterior(unit)&&(!combat||available(id));
 }));
 const selected=new Set(ids);
 for(const group of mission.state.commandGroups??[])if(combat?selected.has(group.leaderId):expanded.has(group.leaderId)&&available(group.leaderId))
  for(const member of liveMembers(mission,group,byId))if(available(member.id))expanded.add(member.id);
 return [...expanded];
}

export function commandGroupFor(mission,units){
 if(!units.length)return null;
 const id=units[0].commandGroupId;
 if(!id||units.some(u=>u.commandGroupId!==id))return null;
 const group=mission.state.commandGroups?.find(g=>g.id===id);
 const explicit=new Set(units.map(u=>u.id));
 return group&&group.members.filter(id=>{const u=mission.entity(id);return u?.hp>0&&(explicit.has(id)||!isAutomaticRepair(u,mission.unitSpec(u)));}).length===units.length?group:null;
}

export function formationRequest(mission,units,target){
 const group=commandGroupFor(mission,units);
 if(!group||group.formation==='auto')return null;
 const n=units.length,scale=mission.config.worldScale;
 const centre=units.reduce((p,u)=>({x:p.x+u.x/n,y:p.y+u.y/n}),{x:0,y:0});
 const dx=target.x-centre.x,dy=target.y-centre.y,length=Math.hypot(dx,dy);
 // Near-identical repeat commands keep both slot ownership and orientation.
 if(!group.anchor||distance(group.anchor,target)>=3){
  group.anchor={x:target.x,y:target.y};
  group.forward=length>.01?{x:dx/length,y:dy/length}:group.forward??{x:0,y:1};
 }
 const forward=group.forward,right={x:forward.y,y:-forward.x};
 let width=0,depth=0;
 for(const unit of units){const hull=vehicleEnvelope(unit,scale,mission.field);width=Math.max(width,hull.width*2);depth=Math.max(depth,hull.depth*2);}
 // Leave turning space as well as a non-overlapping stationary footprint.
 const spacing=Math.max(width+scale*3,depth+scale*1.2)*(group.formation==='dispersed'?1.6:1);
 const columns=group.formation==='column'?1:group.formation==='line'?n:Math.ceil(Math.sqrt(n));
 const offsets=Array.from({length:n},(_,i)=>({side:(i%columns-(Math.min(columns,n-Math.floor(i/columns)*columns)-1)/2)*spacing,
  back:Math.floor(i/columns)*spacing}));
 const points=offsets.map(p=>({x:target.x+right.x*p.side-forward.x*p.back,y:target.y+right.y*p.side-forward.y*p.back}));
 const signature=group.formation+'|'+units.map(u=>u.id).join(',');
 if(group.slotSignature!==signature){
  if(n<=100){
   const assignment=assignFormation(units.map(unit=>points.map(p=>(unit.x-p.x)**2+(unit.y-p.y)**2)));
   group.slots=Object.fromEntries(units.map((u,i)=>[u.id,assignment[i]]));
  }else{
   // Large selections use monotone rows instead of cubic matching. This is
   // an event-time ordering, never a per-frame all-pairs assignment.
   const ordered=units.slice().sort((a,b)=>(b.x-a.x)*forward.x+(b.y-a.y)*forward.y||a.id.localeCompare(b.id));
   for(let i=0;i<n;i+=columns){const row=ordered.slice(i,i+columns).sort((a,b)=>(a.x-b.x)*right.x+(a.y-b.y)*right.y||a.id.localeCompare(b.id));ordered.splice(i,row.length,...row);}
   group.slots=Object.fromEntries(ordered.map((u,i)=>[u.id,i]));
  }
  group.slotSignature=signature;
 }
 return {group,columns,spacing,forward,right,slots:new Map(units.map(unit=>[unit.id,points[group.slots[unit.id]]]))};
}
