import {checkManeuver} from './vehicle-motion.js';
import {checkedRouteShortcut} from './traffic-shortcut.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// A parking approach can go around the outside of several occupied rows.
// Keep a finite travel allowance, but do not constrain it to one local beam.
export const arrivalRouteAllowance=(unit,goal,scale)=>distance(unit,goal)*4+scale*32;

// The grid suggests an approach only. Every connector, the exact arrival and
// its total reverse/travel allowance must pass the actual vehicle sweeps.
// Projected bodies are local inputs; the live world is never moved for search.
export function* checkedArrivalRoute(mission,unit,goal,obstacles,allowed,valid,accept){
 const scale=mission.config.worldScale,maximum=arrivalRouteAllowance(unit,goal,scale);
 const path=yield* mission.vehiclePathSteps(unit,goal,{obstacles,avoidMoving:true,fallback:false,maxGoalDistance:.01});
 if(!valid()||!path?.length)return null;
 return yield* checkedPathManeuvers(mission,unit,goal,path,allowed,valid,accept,maximum);
}
function* checkedPathManeuvers(mission,unit,goal,path,allowed,valid,accept,maximum){
 const scale=mission.config.worldScale;
 let previous=unit,length=0;
 for(const point of path){length+=distance(previous,point);previous=point;}
 if(length>maximum)return null;
 let pose={...unit,driveSpeed:0},travelled=0,reversed=0;const legs=[];
 for(let index=0;index<path.length;index++){
  const point=path[index],tolerance=index===path.length-1?.6:2,end={};let connector;
  // Each candidate gets its own pose object, so a failed shortcut from one
  // projected parking pose cannot suppress another candidate's connector.
  if((yield* checkedRouteShortcut(mission,pose,point,{allowed,tolerance,endpoint:end,maximumDistance:maximum-travelled}))&&end.reached)
   connector=end.legs;
  if(!valid())return null;
  if(!connector)connector=yield* mission.planManeuverSteps(pose,point,{scale,allowed,attempts:2,maximumLegs:20,
   reverseBudget:Math.max(0,scale*12-reversed),tolerance:.5,accept:p=>distance(p,point)<tolerance});
  if(!valid()||!connector)return null;
  travelled+=connector.reduce((sum,leg)=>sum+leg.remaining,0);
  reversed+=connector.reduce((sum,leg)=>sum+(leg.direction<0?leg.remaining:0),0);
  if(travelled>maximum||reversed>scale*12+1e-6)return null;
  const endPose=checkManeuver(pose,connector,scale,allowed);
  if(!endPose)return null;
  legs.push(...connector);pose={...unit,...endPose,driveSpeed:0};
 }
 return legs.length&&accept(pose)&&valid()?legs:null;
}

// The vehicle grid inflates every neighbour by our circumscribed radius.
// A physically free parking bay can therefore have no allowed goal cell.
// Reach an outside approach with that conservative grid, then prove the whole
// exact terminal manoeuvre with real oriented bodies. Nothing is executed or
// omitted until both the approach and the terminal portion have been checked.
export function* checkedTerminalApproach(mission,unit,goal,obstacles,allowed,valid,accept){
 const scale=mission.config.worldScale,maximum=arrivalRouteAllowance(unit,goal,scale),entries=[];
 for(const radius of [6,10,14].map(n=>n*scale))for(let sector=0;sector<16;sector++){
  const angle=sector*Math.PI/8,point={x:goal.x+Math.cos(angle)*radius,y:goal.y+Math.sin(angle)*radius};
  const pose={...unit,...point,heading:Math.atan2(point.x-goal.x,goal.y-point.y)};
  // The identical object enforces a stationary footprint check; it must not
  // be mistaken for a legacy penetration-recovery movement.
  if(allowed(pose,pose))entries.push(point);
 }
 const cost=point=>distance(unit,point)+distance(point,goal);
 entries.sort((a,b)=>cost(a)-cost(b));let checked=0;
 for(const entry of entries){
  if(performance.now()>=(mission.nav.workDeadline??Infinity)){yield;if(!valid())return null;}
  const prefix=yield* mission.vehiclePathSteps(unit,entry,{obstacles,avoidMoving:true,fallback:false,maxGoalDistance:.01});
  if(!valid())return null;if(!prefix?.length)continue;
  const legs=yield* checkedPathManeuvers(mission,unit,goal,[...prefix,{...goal}],allowed,valid,accept,maximum);
  if(!valid())return null;if(legs)return legs;
  if(++checked>=8)break;
 }
 return null;
}
