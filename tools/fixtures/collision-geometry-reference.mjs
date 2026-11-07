// Exhaustive-axis collision oracle, frozen from own project commit 20ac7df.
import {vehiclePose} from '../../campaign/builder-kinematics.js';
import {SCAV_PROFILES} from '../../campaign/scav-unit-profiles.js';

const modular = [
  [1.177, -.008, 2.417, .75, .75],
  [1.177, .065, 2.138, 1.875, .827],
];
const fieldCar = [[1.03, -.075, 2.18, .43, .47], [.96, -.06, 2.10, 1.48, .78]];
const cached = new WeakMap();
const skin = .055;
export const vehicleLocalBoxes = kind => SCAV_PROFILES[kind]?.boxes ?? (kind === 'command' || kind === 'raider' ? fieldCar : modular);
const radiusBounds=new WeakMap();
export function vehicleRadiusBound(kind,scale){
  const boxes=vehicleLocalBoxes(kind);let radius=radiusBounds.get(boxes);
  if(radius===undefined){
    // Projection can combine extrema from different authored boxes. sqrt(2)
    // also encloses the corners of that projected bounding rectangle, for
    // any ground pitch, roll and heading, including long buses/trucks.
    radius=Math.SQRT2*Math.max(...boxes.map(([hx,y,hy,z,hz])=>Math.hypot(hx,Math.abs(y)+hy,Math.abs(z)+hz)));
    radiusBounds.set(boxes,radius);
  }
  return radius*scale;
}
// Death releases the driving space immediately. A retained visual wreck and
// collectible parts have their own lifetimes, but are never traffic obstacles.
export const vehicleObstacle = unit => unit.hp > 0;

// Local dimensions follow the C01/B01 GLB bounds. Project both the lower
// running gear and the higher body onto the ground using the render pose.
export function vehicleEnvelope(unit, scale, field) {
  const heading = unit.heading ?? 0, kind = unit.kind;
  const entry = cached.get(unit);
  if (entry && entry.x === unit.x && entry.y === unit.y && entry.heading === heading
      && entry.scale === scale && entry.field === field && entry.kind === kind) return entry.envelope;
  const pose = field ? vehiclePose(unit, field, scale) : {pitch: 0, roll: 0};
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch), cr = Math.cos(pose.roll), sr = Math.sin(pose.roll);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [hx, y, hy, z, hz] of vehicleLocalBoxes(kind)) {
    const x = z * sr, forward = y * cp - z * sp * cr;
    const wx = hx * Math.abs(cr) + hz * Math.abs(sr);
    const wy = hx * Math.abs(sp * sr) + hy * Math.abs(cp) + hz * Math.abs(sp * cr);
    xmin = Math.min(xmin, x - wx); xmax = Math.max(xmax, x + wx);
    ymin = Math.min(ymin, forward - wy); ymax = Math.max(ymax, forward + wy);
  }
  const c = Math.cos(heading), s = Math.sin(heading);
  const x = (xmin + xmax) * scale / 2, y = (ymin + ymax) * scale / 2;
  const envelope = {
    x: unit.x + x * c - y * s, y: unit.y + x * s + y * c,
    width: (xmax - xmin) * scale / 2, depth: (ymax - ymin) * scale / 2,
    c, s, pitch: pose.pitch, roll: pose.roll
  };
  cached.set(unit, {x: unit.x, y: unit.y, heading, scale, field, kind, envelope});
  return envelope;
}

export function footprintSupport(shape, x, y) {
  return shape.width * Math.abs(shape.c * x + shape.s * y) +
    shape.depth * Math.abs(shape.c * y - shape.s * x);
}

function poseGap(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let gap = -Infinity;
  for(let axis=0;axis<4;axis++){
    const shape=axis<2?a:b,x=axis%2?-shape.s:shape.c,y=axis%2?shape.c:shape.s;
    gap = Math.max(gap, Math.abs(dx * x + dy * y) - footprintSupport(a, x, y) - footprintSupport(b, x, y));
  }
  return gap;
}

export function vehicleClearance(a, b, scale, field) {
  return poseGap(vehicleEnvelope(a, scale, field), vehicleEnvelope(b, scale, field));
}

export function vehicleSweep(from, to, scale, field) {
  const start = vehicleEnvelope(from, scale, field), end = vehicleEnvelope(to, scale, field);
  const difference = (to.heading ?? 0) - (from.heading ?? 0);
  const turn = Math.atan2(Math.sin(difference), Math.cos(difference));
  const middle = vehicleEnvelope({
    x: (from.x + to.x) / 2, y: (from.y + to.y) / 2,
    kind: to.kind ?? from.kind, heading: (from.heading ?? 0) + turn / 2
  }, scale, field);
  // The union of three support intervals includes the projected corners. The
  // rotational sagitta allowance covers the small arc between checked poses.
  const radius = Math.max(start.width + start.depth, end.width + end.depth);
  return {start, middle, end, padding: .012 + radius * turn * turn / 24};
}

function sweepGap(sweep, obstacle) {
  const {start, middle, end, padding} = sweep;
  let gap = -Infinity;
  for(let axis=0;axis<8;axis++){
    const shape=axis<2?start:axis<4?middle:axis<6?end:obstacle,x=axis%2?-shape.s:shape.c,y=axis%2?shape.c:shape.s;
    const sa = footprintSupport(start, x, y), sm = footprintSupport(middle, x, y), sb = footprintSupport(end, x, y);
    const a = (start.x - obstacle.x) * x + (start.y - obstacle.y) * y;
    const m = (middle.x - obstacle.x) * x + (middle.y - obstacle.y) * y;
    const b = (end.x - obstacle.x) * x + (end.y - obstacle.y) * y;
    const min = Math.min(a - sa, m - sm, b - sb), max = Math.max(a + sa, m + sm, b + sb);
    gap = Math.max(gap, Math.max(min, -max) - footprintSupport(obstacle, x, y) - padding);
  }
  return gap;
}

export function sweepAvoidsFootprint(sweep, obstacle, minimum = .1) {
  const box = {
    x: obstacle.x, y: obstacle.y, width: obstacle.halfWidth, depth: obstacle.halfDepth, c: 1, s: 0
  };
  if (sweepGap(sweep, box) >= minimum) return true;
  // Saves made with the former capsule can start in penetration. Permit only
  // movement which releases that penetration and never deepens it.
  const start = poseGap(sweep.start, box);
  return start < minimum + sweep.padding && poseGap(sweep.middle, box) >= start - .001
    && poseGap(sweep.end, box) > start + .002;
}

export function clearOfVehicles(unit, next, units, scale, strict = false, previous = unit, field, blockers, prepared) {
  const minimum = skin * scale;
  const current = next.kind || !unit?.kind ? next : {...next, kind: unit.kind};
  const before = previous?.kind || !unit?.kind ? previous : {...previous, kind: unit.kind};
  const broadFrom=!strict&&before?before:current;
  const ownRadius=Math.max(vehicleRadiusBound(current.kind,scale),vehicleRadiusBound(broadFrom.kind,scale));
  const angle=(current.heading??0)-(broadFrom.heading??0),turn=Math.atan2(Math.sin(angle),Math.cos(angle));
  const padding=minimum+(prepared?.padding??(.012+Math.SQRT2*ownRadius*turn*turn/24));
  const xmin=Math.min(broadFrom.x,current.x),xmax=Math.max(broadFrom.x,current.x),ymin=Math.min(broadFrom.y,current.y),ymax=Math.max(broadFrom.y,current.y);
  let sweep = prepared, end;
  let clear = true;
  for (const other of units) {
    if (other === unit || !vehicleObstacle(other))continue;
    const range=ownRadius+vehicleRadiusBound(other.kind,scale)+padding;
    if(other.x<xmin-range||other.x>xmax+range||other.y<ymin-range||other.y>ymax+range)continue;
    const obstacle = vehicleEnvelope(other, scale, field);
    end ??= sweep?.end ?? vehicleEnvelope(current, scale, field);
    if (strict || !before || before === current) {
      if (poseGap(end, obstacle) >= minimum) continue;
    } else {
      sweep ??= vehicleSweep(before, current, scale, field);
      if (sweepGap(sweep, obstacle) >= minimum) continue;
      const initial = poseGap(sweep.start, obstacle);
      const middle = poseGap(sweep.middle, obstacle), final = poseGap(end, obstacle);
      if (initial < minimum + sweep.padding && middle >= initial - .000001
          && final > initial + .000001) continue;
      // A legacy save may contain two parallel, interpenetrating vans. A
      // straight exit can keep their side gap constant before the ends clear.
      // Ground-following pitch and roll can vary the projected gap slightly.
      const straightTolerance = initial < 0 ? .0005 : .000001;
      if (initial < minimum + sweep.padding && middle >= initial - straightTolerance
          && final >= initial - straightTolerance
          && Math.abs(sweep.start.c * end.s - sweep.start.s * end.c) < .000001) continue;
    }
    clear = false;
    if (!blockers) return false;
    blockers.add(other);
  }
  return clear;
}

export function vehicleGroundSafe(envelope, grade) {
  const recovery = grade > .52;
  return Math.abs(Math.tan(envelope.pitch)) <= (recovery ? .95 : .81)
    && Math.abs(Math.tan(envelope.roll)) <= (recovery ? .78 : .65);
}
