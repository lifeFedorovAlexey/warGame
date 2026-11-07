import {checkManeuver, planManeuver} from './vehicle-motion.js';
import {footprintSupport, vehicleEnvelope, vehicleSweep} from './vehicle-collision.js';

const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function mergeMatchingLegs(legs) {
  const merged = [];
  for (const leg of legs) {
    const previous = merged.at(-1);
    if (previous?.curve === leg.curve && previous.direction === leg.direction) previous.remaining += leg.remaining;
    else merged.push({...leg});
  }
  return merged;
}

function checkedApproach(entry, start, scale, allowed) {
  const leg = {direction:1,curve:0,remaining:distance(entry,start)};
  return checkManeuver({...entry,heading:start.heading,kind:start.kind},[leg],scale,allowed);
}

export function passageStillOpen(mission, egress) {
  const scale = mission.config.worldScale;
  const obstacles = mission.state.units.filter(unit => unit.hp > 0 && !unit.path.length && !unit.detour);
  const allowed = (from,to) => mission.vehicleMotionClear(egress.start,from,to,.52,undefined,obstacles);
  return checkedApproach(egress.entry,egress.start,scale,allowed)
    && checkManeuver(egress.start,egress.legs,scale,allowed);
}

// Find a swept exit before admitting a formation. The centreline may be
// open all the way through the throat while its first turning arc is blocked.
export function preparePassageEgress(mission, passage, group, goal) {
  const {field,nav,state,config} = mission, scale = config.worldScale;
  const {along,direction,entrance,exit,heading,mouth} = passage;
  const side = along === 'x' ? 'y' : 'x';
  const progress = p => (p[along]-mouth)*direction;
  const kind = 'bukhanka'; // The widest hull in the current ground fleet.
  const fixed = state.units.filter(unit => unit.hp > 0 && !unit.path.length && !group.includes(unit)
    && (unit.owner === group[0].owner || mission.visibleAt(unit.x,unit.y))
    && progress(unit) > progress(entrance)-scale*3 && progress(unit) < scale*48
    && Math.abs(unit[side]-exit[side]) < scale*12);
  const blockers = fixed.filter(unit => {
    const shape = vehicleEnvelope(unit,scale,field);
    const half = side === 'x' ? footprintSupport(shape,1,0) : footprintSupport(shape,0,1);
    return progress(unit) < scale*18 && Math.abs(shape[side]-exit[side]) < half+scale*1.7;
  });
  const forwardProbe = {...exit,[along]:mouth+direction*scale*12,heading,kind};
  const probe = vehicleSweep({...exit,heading,kind},forwardProbe,scale,field);
  const walls = nav.solids.filter(wall => !nav.clearSolidSweep(probe,[wall]));
  if (!blockers.length && !walls.length) return null;

  const start = {...exit,[along]:mouth-direction*scale*2.2,heading,kind};
  const allowed = (from,to) => mission.vehicleMotionClear(start,from,to,.52,undefined,fixed);
  if (!checkedApproach(entrance,start,scale,allowed)) return {blocked:true};

  const halfLength = unit => {
    const shape = vehicleEnvelope(unit,scale,field);
    return along === 'x' ? footprintSupport(shape,1,0) : footprintSupport(shape,0,1);
  };
  const finalProgress = Math.max(scale*13,
    ...blockers.map(unit => progress(unit)+halfLength(unit)+scale),
    ...walls.map(wall => progress(wall)+(along === 'x' ? wall.halfWidth : wall.halfDepth)+scale));
  const candidates = [-1,1].map(turn => ({
    [along]:mouth+direction*(finalProgress+scale*.8),[side]:exit[side]+turn*scale*5
  })).sort((a,b) => distance(a,goal)-distance(b,goal));
  const clearExit = {direction:1,curve:0,remaining:scale*2.5};
  for (const target of candidates) {
    const accept = pose => progress(pose) >= finalProgress && Math.cos(pose.heading-heading) > .94
      && nav.lineClear(pose,{...pose,[along]:pose[along]+direction*scale*3.5},false,true)
      && checkManeuver(pose,[clearExit],scale,allowed);
    const result = planManeuver(start,target,{scale,allowed,accept,attempts:3,maximumLegs:25,reverseBudget:0});
    if (!result) continue;
    const legs = mergeMatchingLegs(result);
    const end = checkManeuver(start,legs,scale,allowed);
    if (end) {
      // Leave the area needed to turn away from the bypass free of arrivals,
      // including any stationary vehicles immediately beyond the swept exit.
      const downstream = fixed.filter(unit => progress(unit) > progress(end)
        && progress(unit)-progress(end) < scale*14 && Math.abs(unit[side]-end[side]) < scale*4.8);
      const space = Math.max(scale*14,...downstream.map(unit =>
        progress(unit)-progress(end)+halfLength(unit)+scale*1.8));
      const parkingStep = scale*2;
      const parkingClearance = Math.ceil(space/parkingStep)*parkingStep;
      return {entry:entrance,start,end,legs,parkingClearance};
    }
  }
  return {blocked:true};
}
