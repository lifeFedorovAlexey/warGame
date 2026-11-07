export {clearOfVehicles, vehicleClearance} from './vehicle-collision.js';
import {gradeSpeed} from './road-traffic.js';
import {vehicleDynamics} from './vehicle-dynamics.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const lengthBetween = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const headingTo = (from, to) => Math.atan2(from.x - to.x, to.y - from.y);

// X is right, Y is forward. Sweep the whole Ackermann arc, including the rotating footprint.
function traceArc(start, direction, curve, length, scale, allowed,blocked) {
  if (length <= 1e-8) return start;
  const curvature = curve / (vehicleDynamics(start).wheelbase * scale);
  let previous = start,previousArc=0;
  const first = Math.min(.14, length), steps = Math.ceil((length - first) / 1.25);
  for (let index = 0; index <= steps; index++) {
    const arc = steps ? first + (length - first) * index / steps : first;
    const turn = curvature * arc, middle = start.heading + turn / 2;
    const chord = Math.abs(curvature) < 1e-6 ? arc : 2 * Math.sin(turn / 2) / curvature;
    const pose = {
      x: start.x - Math.sin(middle) * chord * direction,
      y: start.y + Math.cos(middle) * chord * direction,
      heading: wrap(start.heading + turn), kind: start.kind
    };
    if (!allowed(previous, pose)){if(blocked)Object.assign(blocked,{from:previous,to:pose,travelled:previousArc});return null;}
    previous = pose;
    previousArc=arc;
  }
  return previous;
}

function vehiclePose(unit, pose, direction, curve, length, dt) {
  return {
    ...pose,
    driveSpeed: length / dt,
    reversing: direction < 0,
    steering: Math.atan(curve * direction),
    wheelDistance: (unit.wheelDistance ?? 0) + length * direction
  };
}

export function driveStep(unit, point, dt, {speed, grade, scale, tolerance, reverseLimit = 0, trafficLimit = Infinity, allowed, onBlockedContact, curveLimit}) {
  const dynamics=vehicleDynamics(unit),steeringLimit=dynamics.steeringLimit,maximumCurve=Math.tan(steeringLimit);
  const distance = lengthBetween(unit, point);
  const direct = wrap(headingTo(unit, point) - unit.heading);
  const reverse = distance < reverseLimit && Math.abs(direct) > (unit.reversing ? Math.PI * .47 : Math.PI * .61);
  const direction = reverse ? -1 : 1;
  const angle = wrap(direct + (reverse ? Math.PI : 0));
  const curve = Math.tan(clamp(angle * 1.55, -steeringLimit, steeringLimit));
  const mainLimit = direction > 0 ? curveLimit?.(curve) ?? Infinity : Infinity;
  const targetSpeed = Math.min(speed * gradeSpeed(grade) * (reverse ? .59 : 1),
    Math.sqrt(2*dynamics.braking * Math.max(.05, distance - tolerance * .6)), speed / (1 + dynamics.turnPenalty * Math.abs(angle)),
    reverse ? Infinity : Math.min(trafficLimit,mainLimit));
  const lastSpeed = unit.reversing === reverse ? unit.driveSpeed ?? 0 : 0;
  const nextSpeed = lastSpeed + clamp(targetSpeed - lastSpeed, -dynamics.braking * dt, dynamics.acceleration * dt);
  const travel = Math.min(distance, Math.max(0, nextSpeed * dt));
  if (travel < .001) return null;
  // A new waypoint can request a tight turn while the body is still moving
  // too fast to enter its stopping corridor. Brake along the current arc
  // first, preserving inertia; changing steering before slowing can make a
  // later collision unavoidable even though every immediate sweep is clear.
  if(direction>0&&nextSpeed>mainLimit+1e-6){
    const previousCurve=Math.tan(unit.steering??0);
    const brakingSpeed=Math.max(0,lastSpeed-dynamics.braking*dt);
    if(Math.abs(previousCurve-curve)>1e-6&&brakingSpeed>0
      &&brakingSpeed<=(curveLimit?.(previousCurve)??Infinity)+1e-6){
      const brakingTravel=brakingSpeed*dt;
      const brakingPose=traceArc(unit,direction,previousCurve,brakingTravel,scale,allowed);
      if(brakingPose)return vehiclePose(unit,brakingPose,direction,previousCurve,brakingTravel,dt);
    }
  }
  // A gentle physical contact also triggers suspension feedback. Combat
  // damage keeps its separate, much higher kinetic-energy threshold.
  const blocked=lastSpeed>.18*scale?{}:null;
  const pose = nextSpeed<=mainLimit+1e-6?traceArc(unit, direction, curve, travel, scale, allowed,blocked):null;
  if (pose) return vehiclePose(unit, pose, direction, curve, travel, dt);
  for (const alternative of [maximumCurve, -maximumCurve, 0]) {
    // A different arc has a different stopping corridor. Passing the main
    // arc's forecast does not permit an alternative to cut across a nearby
    // vehicle's unavoidable braking path. Check the executed fallback speed
    // against that arc's own cap; retain the existing slow fallback handling.
    const limit = direction > 0 ? curveLimit?.(alternative) ?? Infinity : Infinity;
    const alternativeSpeed = lastSpeed + clamp(Math.min(targetSpeed,limit) - lastSpeed, -dynamics.braking * dt, dynamics.acceleration * dt);
    const fallbackTravel = Math.min(distance, Math.max(0,alternativeSpeed * dt)) * .70;
    if(fallbackTravel<.001||fallbackTravel/dt>limit+1e-6)continue;
    const next = traceArc(unit, direction, alternative, fallbackTravel, scale, allowed);
    if (next && lengthBetween(point, next) < distance - fallbackTravel * .15) {
      return vehiclePose(unit, next, direction, alternative, fallbackTravel, dt);
    }
  }
  if(blocked?.from){
    // Suspension feedback must not turn a failed low-speed move into a
    // successful pose: that would reset the traffic recovery stall timer.
    if(lastSpeed<=1.8*scale){onBlockedContact?.(lastSpeed*direction);return null;}
    const {x,y,heading,kind}=blocked.from;
    return {...vehiclePose(unit,{x,y,heading,kind},direction,curve,blocked.travelled,dt),driveSpeed:0,impactSpeed:lastSpeed*direction};
  }
  return null;
}

// A small deterministic search in pose space handles corners and parking.
// Reverse is confined to these local manoeuvres and paid for in both distance and cost.
export function planManeuver(...args) {
  const search=planManeuverSteps(...args);let step;do{step=search.next();}while(!step.done);return step.value;
}
export function* planManeuverSteps(unit, goal, {scale, allowed, accept, tolerance = 2, attempts = 0, reverseBudget = 4 * scale, failedArcs = [], maximumLegs = 9, deadline = ()=>Infinity}) {
  const steeringLimit=vehicleDynamics(unit).steeringLimit,maximumCurve=Math.tan(steeringLimit);
  const curves = [0, maximumCurve / 2, -maximumCurve / 2, maximumCurve, -maximumCurve];
  const initialDistance = lengthBetween(unit, goal);
  const stride = 1.2 * scale;
  const score = pose => {
    const distance = lengthBetween(pose, goal);
    const angle = Math.abs(wrap(headingTo(pose, goal) - pose.heading));
    return Math.min(distance, stride * 5) + distance * .42 + Math.min(distance, 12) * angle * .32;
  };
  let level = [{pose: unit, cost: 0, reverse: 0, legs: []}];
  const seen = new Map();
  let work=0;
  for (let depth = 0; depth < maximumLegs; depth++) {
    const next = [];
    for (const entry of level) {
      const remaining = lengthBetween(entry.pose, goal);
      const long = Math.min(stride, Math.max(tolerance * .6, remaining));
      for (const direction of [1, -1]) {
        for (const curve of curves) {
          if(++work%8===0&&performance.now()>=deadline())yield;
          if (!depth && failedArcs.some(leg => leg.direction === direction && leg.curve === curve)) continue;
          let length = direction > 0 ? long : Math.min(long, reverseBudget - entry.reverse);
          if (length < tolerance * .55) continue;
          let pose = traceArc(entry.pose, direction, curve, length, scale, allowed);
          if (!pose && attempts > 1 && length > tolerance * 1.2) {
            length *= .55;
            pose = traceArc(entry.pose, direction, curve, length, scale, allowed);
          }
          if (!pose) continue;
          const reverse = entry.reverse + (direction < 0 ? length : 0);
          const leg = {direction, curve, remaining: length};
          const legs = [...entry.legs, leg];
          const distance = lengthBetween(pose, goal);
          const toGoal = Math.abs(wrap(headingTo(pose, goal) - pose.heading));
          const facingGoal = !accept && distance < initialDistance + 6 && toGoal < .65
            && traceArc(pose, 1, Math.tan(clamp(wrap(headingTo(pose, goal) - pose.heading), -steeringLimit, steeringLimit)),
              Math.min(distance, 2.5 * scale), scale, allowed);
          if (accept ? accept(pose, legs) : distance <= tolerance || depth > 0 && facingGoal) return legs;
          const key = [Math.round(pose.x / (stride * .48)), Math.round(pose.y / (stride * .48)),
            Math.round(pose.heading / .24), direction].join(',');
          const gearChange = entry.legs.length && entry.legs.at(-1).direction !== direction ? 3 : 0;
          const cost = entry.cost + length * (direction > 0 ? 1 : 1.85) + gearChange + Math.abs(curve) * .65;
          if ((seen.get(key) ?? Infinity) <= cost) continue;
          seen.set(key, cost);
          next.push({pose, cost, reverse, legs, priority: cost * .55 + score(pose)});
        }
      }
    }
    next.sort((a, b) => a.priority - b.priority);
    level = next.slice(0, attempts > 1 ? 26 : 16);
    if (!level.length) break;
  }
  return null;
}

export function checkManeuver(unit, legs, scale, allowed) {
  let pose = unit;
  for (const leg of legs) {
    pose = traceArc(pose, leg.direction, leg.curve, leg.remaining, scale, allowed);
    if (!pose) return null;
  }
  return pose;
}

export function maneuverStep(unit, leg, dt, {scale, allowed, crawl = false, throughSpeed = 0, forwardSpeed = vehicleDynamics(unit).maneuverForward}) {
  const dynamics=vehicleDynamics(unit),maximumSpeed = crawl ? 7 : leg.direction > 0 ? forwardSpeed : dynamics.maneuverReverse;
  const lastSpeed = unit.reversing === (leg.direction < 0) ? unit.driveSpeed ?? 0 : 0;
  const speed = Math.min(maximumSpeed, Math.sqrt(2*dynamics.braking * leg.remaining + throughSpeed * throughSpeed), lastSpeed + dynamics.acceleration * dt);
  const length = Math.min(leg.remaining, speed * dt);
  const pose = traceArc(unit, leg.direction, leg.curve, length, scale, allowed);
  if (!pose) return null;
  return {length, pose: vehiclePose(unit, pose, leg.direction, leg.curve, length, dt)};
}
