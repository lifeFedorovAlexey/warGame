export {clearOfVehicles, vehicleClearance} from './vehicle-collision.js';
import {gradeSpeed} from './road-traffic.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const lengthBetween = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const headingTo = (from, to) => Math.atan2(from.x - to.x, to.y - from.y);
const steeringLimit = .67;
const maximumCurve = Math.tan(steeringLimit);

// X is right, Y is forward. Sweep the whole Ackermann arc, including the rotating footprint.
function traceArc(start, direction, curve, length, scale, allowed,blocked) {
  if (length <= 1e-8) return start;
  const curvature = curve / (2.6 * scale);
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

export function driveStep(unit, point, dt, {speed, grade, scale, tolerance, reverseLimit = 0, trafficLimit = Infinity, allowed}) {
  const distance = lengthBetween(unit, point);
  const direct = wrap(headingTo(unit, point) - unit.heading);
  const reverse = distance < reverseLimit && Math.abs(direct) > (unit.reversing ? Math.PI * .47 : Math.PI * .61);
  const direction = reverse ? -1 : 1;
  const angle = wrap(direct + (reverse ? Math.PI : 0));
  const targetSpeed = Math.min(speed * gradeSpeed(grade) * (reverse ? .59 : 1),
    Math.sqrt(44 * Math.max(.05, distance - tolerance * .6)), speed / (1 + 1.9 * Math.abs(angle)),
    reverse ? Infinity : trafficLimit);
  const lastSpeed = unit.reversing === reverse ? unit.driveSpeed ?? 0 : 0;
  const nextSpeed = lastSpeed + clamp(targetSpeed - lastSpeed, -22 * dt, 14 * dt);
  const travel = Math.min(distance, Math.max(0, nextSpeed * dt));
  if (travel < .001) return null;
  const curve = Math.tan(clamp(angle * 1.55, -steeringLimit, steeringLimit));
  const blocked=lastSpeed>1.8*scale?{}:null;
  const pose = traceArc(unit, direction, curve, travel, scale, allowed,blocked);
  if (pose) return vehiclePose(unit, pose, direction, curve, travel, dt);
  const fallbackTravel = travel * .70;
  for (const alternative of [maximumCurve, -maximumCurve, 0]) {
    const next = traceArc(unit, direction, alternative, fallbackTravel, scale, allowed);
    if (next && lengthBetween(point, next) < distance - fallbackTravel * .15) {
      return vehiclePose(unit, next, direction, alternative, fallbackTravel, dt);
    }
  }
  if(blocked?.from){
    const {x,y,heading,kind}=blocked.from;
    return {...vehiclePose(unit,{x,y,heading,kind},direction,curve,blocked.travelled,dt),driveSpeed:0,impactSpeed:lastSpeed*direction};
  }
  return null;
}

// A small deterministic search in pose space handles corners and parking.
// Reverse is confined to these local manoeuvres and paid for in both distance and cost.
export function planManeuver(unit, goal, {scale, allowed, accept, tolerance = 2, attempts = 0, reverseBudget = 4 * scale, failedArcs = [], maximumLegs = 9}) {
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
  for (let depth = 0; depth < maximumLegs; depth++) {
    const next = [];
    for (const entry of level) {
      const remaining = lengthBetween(entry.pose, goal);
      const long = Math.min(stride, Math.max(tolerance * .6, remaining));
      for (const direction of [1, -1]) {
        for (const curve of curves) {
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
          if (accept ? accept(pose) : distance <= tolerance || depth > 0 && facingGoal) return legs;
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

export function maneuverStep(unit, leg, dt, {scale, allowed, crawl = false, throughSpeed = 0, forwardSpeed = 13}) {
  const maximumSpeed = crawl ? 7 : leg.direction > 0 ? forwardSpeed : 9;
  const lastSpeed = unit.reversing === (leg.direction < 0) ? unit.driveSpeed ?? 0 : 0;
  const speed = Math.min(maximumSpeed, Math.sqrt(38 * leg.remaining + throughSpeed * throughSpeed), lastSpeed + 14 * dt);
  const length = Math.min(leg.remaining, speed * dt);
  const pose = traceArc(unit, leg.direction, leg.curve, length, scale, allowed);
  if (!pose) return null;
  return {length, pose: vehiclePose(unit, pose, leg.direction, leg.curve, length, dt)};
}
