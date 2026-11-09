// Metres in a dam-local frame: X along the crest, +Y upstream, Z up.
// Keep this contract stable for later mission scripts and breach simulations.
export const DAM_ID='western-reservoir';
export const DAM_WIDTH=84;
export const DAM_HEIGHT=20;
export const damBow=x=>-5*(1-(x/(DAM_WIDTH/2))**2);
export const DAM_OUTLETS=[{x:13,y:-20,z:2},{x:19,y:-20,z:2},{x:25,y:-20,z:2}];
export function damLayout(field,config){
 const start=field.gridToWorld(config.startGrid),x=start.x-316,y=start.y;
 return {id:DAM_ID,x,y,z:field.heightAt(x+20,y),rotation:Math.PI/2,scale:config.worldScale,
  road:{kind:'dam-access',width:30,points:[{x:start.x-246,y},{x:x+24,y}]},
  reservoir:{level:17.8,depth:30},breachOutlet:{x:0,y:-7,z:1}};
}
export function damWorld(layout,x,y,z=0){const c=Math.cos(layout.rotation),s=Math.sin(layout.rotation),k=layout.scale;return{x:layout.x+(x*c-y*s)*k,y:layout.y+(x*s+y*c)*k,z:layout.z+z*k};}
export function damState(mission){
 const environment=mission.state.environment??={};
 return environment[DAM_ID]??={version:1,sections:{},reservoirLevel:17.8};
}
export function setDamSectionDamage(state,id,damage){
 if(!/^(monolith_(0\d|1[0-3])|spillway_gate)$/.test(id)||!Number.isFinite(damage))return false;
 state.sections[id]=Math.max(0,Math.min(1,damage));return true;
}
export function damDischarge(time,index){
 const phase=((time-6-index*6.4)%29+29)%29;
 if(phase>4.7)return 0;
 return Math.min(1,phase/.7,(4.7-phase)/1.3)*(1+.12*Math.sin(time*11+index));
}
