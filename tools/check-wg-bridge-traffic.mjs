import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {vehicleEnvelope,footprintContact} from '../campaign/vehicle-collision.js';

const rows=Number(process.env.BRIDGE_GROUP_ROWS??2),total=rows*4;
for(let bridgeIndex=0;bridgeIndex<2;bridgeIndex++){
 const m=prepareM02Diagnostic(makeMission()),f=m.field,bridge=f.river.bridges[bridgeIndex];
 m.state.units=[];m.updateMission=()=>{};
 for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;
 const a=bridge.points[0],b=bridge.points.at(-1),length=Math.hypot(b.x-a.x,b.y-a.y),u={x:(b.x-a.x)/length,y:(b.y-a.y)/length},n={x:-u.y,y:u.x};
 const offset=(p,forward,side)=>({x:p.x+u.x*forward+n.x*side,y:p.y+u.y*forward+n.y*side});
 // Real vehicle bodies start on both bridge approaches.
 // Leave enough room beyond each bridge for every group destination slot.
 const groups=[[],[]],targets=[offset(b,180,0),offset(a,-180,0)];
 for(let direction=0;direction<2;direction++)for(let row=0;row<rows;row++)for(const side of [-10,10]){
  const forward=(direction?1:-1)*(24+row*24),p=offset(direction?b:a,forward,side),heading=Math.atan2(-u.x,u.y)+(direction?Math.PI:0);
  const unit=m.addUnit('bukhanka','rai',p,{heading});groups[direction].push(unit);
 }
 m.addUnit('builder','rai',f.gridToWorld(m.config.startGrid));
 for(let direction=0;direction<2;direction++)assert(m.order(groups[direction].map(v=>v.id),'move',targets[direction]).ok,'Group command accepted');
 const crossed=new Set(),seenDeck=new Set(),previous=new Map(groups.flat().map(v=>[v.id,{x:v.x,y:v.y}]));let seconds=0;
 const observe=()=>{
  for(let direction=0;direction<2;direction++)for(const v of groups[direction]){
   assert(!f.river.forbidden(v.x,v.y),'Vehicle cannot enter the river');
   const progress=(v.x-a.x)*u.x+(v.y-a.y)*u.y;
   const side=(v.x-a.x)*n.x+(v.y-a.y)*n.y;
   const prev=previous.get(v.id),prevProgress=(prev.x-a.x)*u.x+(prev.y-a.y)*u.y,prevSide=(prev.x-a.x)*n.x+(prev.y-a.y)*n.y,delta=progress-prevProgress;
   const fraction=Math.abs(delta)>.001?(length/2-prevProgress)/delta:-1;
   if((fraction>=0&&fraction<=1&&Math.abs(prevSide+(side-prevSide)*fraction)<bridge.width/2)||(Math.abs(progress-length/2)<24&&Math.abs(side)<bridge.width/2))seenDeck.add(v.id);
   previous.set(v.id,{x:v.x,y:v.y});
   if(direction===0?progress>length+4:progress< -4)crossed.add(v.id);
  }
 };
 // Observe every physical tick, not one straight chord between positions a
 // second apart: a turning car can enter and leave the narrow deck in that
 // interval. This also checks forbidden water on every simulated step.
 const continueTick=m.continueTick;
 m.continueTick=function(...args){const pending=this.pendingTick,result=continueTick.apply(this,args);if(pending&&!this.pendingTick)observe();return result;};
 while(seconds++<180&&crossed.size<total){m.advance(1);m.drainEffects();m.drainEvents();}
 assert.equal(crossed.size,total,`${bridge.id}: only ${crossed.size}/${total} crossed after ${seconds}s; `+JSON.stringify(groups.flat().filter(v=>!crossed.has(v.id)).map(v=>({id:v.id,x:Math.round(v.x),y:Math.round(v.y),seenDeck:seenDeck.has(v.id),task:v.task?.type,path:v.path.length}))));
 // A large formation may legitimately send a minority of vehicles around the
 // other crossing; every vehicle must still reach the opposite side.
 assert(seenDeck.size>=Math.max(8,Math.ceil(total*.9)),`${bridge.id}: only ${seenDeck.size}/${total} used the tested deck`);
 // Both full-sized vehicle footprints fit abreast at the middle of the deck.
 const mid=bridge.points[Math.floor(bridge.points.length/2)],left={...offset(mid,0,-10),kind:'bukhanka',heading:Math.atan2(-u.x,u.y)},right={...offset(mid,0,10),kind:'bukhanka',heading:Math.atan2(-u.x,u.y)+Math.PI};
 assert(footprintContact(vehicleEnvelope(left,m.config.worldScale,f),vehicleEnvelope(right,m.config.worldScale,f)).gap>0,'Opposing vehicles have real body clearance');
 console.log('PASS',bridge.id,`${total}/${total} reached the opposite bank; ${seenDeck.size}/${total} used this bridge in`,seconds,'s');
}
