export const asphaltBonus = .34;
const bucketSize = 64;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function gradeSpeed(grade) {
  return clamp(1 - grade * 1.6, .57, 1.18);
}

export function surfaceTravelCost(coverage, slope, pavedTrip) {
  // A downhill shortcut can be fast and still have poor grip on a side slope.
  const looseSlope = Math.max(0, slope - .07);
  const sandCost = (pavedTrip ? 1.85 : .12) + 8 * looseSlope * looseSlope;
  return (1 + (1 - coverage) * sandCost) / (1 + asphaltBonus * coverage);
}

export class RoadTraffic {
  constructor(field) {
    this.field = field;
    this.buckets = new Map();
    this.routes = new Map();
    this.junctionLinks = new Map();
    this.intersections = (field.roadNetwork?.nodes ?? []).filter(node => node.degree > 2 || node.base);
    for (const [pathIndex,path] of (field.roadNetwork?.paths ?? []).entries()) {
      const pathId=path.id??pathIndex,segments=[];
      this.routes.set(pathId,segments);
      let progress=0;
      for (let index = 0; index + 1 < path.points.length; index++) {
        const a = path.points[index], b = path.points[index + 1];
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        if (length < .001) continue;
        const half = Math.max(a.width ?? path.width, b.width ?? path.width) / 2;
        const segment = {a, b, path, index, pathId, progress, ux: dx / length, uy: dy / length, length};
        segments.push(segment);
        progress+=length;
        const x0 = Math.floor((Math.min(a.x, b.x) - half) / bucketSize);
        const x1 = Math.floor((Math.max(a.x, b.x) + half) / bucketSize);
        const y0 = Math.floor((Math.min(a.y, b.y) - half) / bucketSize);
        const y1 = Math.floor((Math.max(a.y, b.y) + half) / bucketSize);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const key = x + ',' + y;
          const list = this.buckets.get(key) ?? [];
          list.push(segment);
          this.buckets.set(key, list);
        }
      }
      if (progress && path.from != null && path.to != null) {
        for (const [from, to] of [[path.from, path.to], [path.to, path.from]]) {
          const links = this.junctionLinks.get(from) ?? [];
          links.push({to, length: progress});
          this.junctionLinks.set(from, links);
        }
      }
    }
  }

  nearest(point, radius = 0) {
    const x0 = Math.floor((point.x - radius) / bucketSize), x1 = Math.floor((point.x + radius) / bucketSize);
    const y0 = Math.floor((point.y - radius) / bucketSize), y1 = Math.floor((point.y + radius) / bucketSize);
    let nearest = null, shortest = Infinity;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      for (const segment of this.buckets.get(x + ',' + y) ?? []) {
        const {a, b, path, ux, uy, length} = segment;
        const along = clamp((point.x - a.x) * ux + (point.y - a.y) * uy, 0, length);
        const px = a.x + ux * along, py = a.y + uy * along;
        const width = (a.width ?? path.width) + ((b.width ?? path.width) - (a.width ?? path.width)) * along / length;
        const dx = point.x - px, dy = point.y - py, limit = Math.min(shortest, width / 2 + radius);
        // Exact broad phase: a point outside either axis interval is also
        // outside the circle. Keep hypot and the original strict tie rule for
        // every surviving candidate; no approximate distance enters routing.
        if (Math.abs(dx) > limit || Math.abs(dy) > limit) continue;
        const distance = Math.hypot(dx, dy);
        if (distance >= shortest || distance > width / 2 + radius) continue;
        shortest = distance;
        nearest = {segment, along, x: px, y: py, distance, width};
      }
    }
    return nearest;
  }

  coverage(x, y) {
    if (this.field.roadBlendAt) return clamp(this.field.roadBlendAt(x, y), 0, 1);
    const closest = this.nearest({x, y});
    return closest ? clamp((closest.width / 2 - closest.distance) / 2.5, 0, 1) : 0;
  }

  factor(x, y) {
    return 1 + asphaltBonus * this.coverage(x, y);
  }

  nearPavement(point) {
    return this.nearest(point, 5) !== null;
  }

  worthChecking(from, to, directCost, pavedTrip) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (!this.buckets.size || directCost < length / (1 + asphaltBonus) * 1.035) return false;
    if (pavedTrip) return true;
    if (length < 68) return false;
    const radius = Math.min(155, length * .32);
    const a = this.nearest(from, radius), b = this.nearest(to, radius);
    if (!a || !b) return false;
    const access = Math.max(0, a.distance - a.width / 3) + Math.max(0, b.distance - b.width / 3);
    const estimate = access + Math.hypot(a.x - b.x, a.y - b.y) / (1 + asphaltBonus);
    return estimate < directCost * .98;
  }

  roadPosition(road) {
    const {segment, along} = road;
    const last = this.routes.get(segment.pathId).at(-1);
    return {progress: segment.progress + along, length: last.progress + last.length};
  }

  distancesAlongRoads(road) {
    const {from, to} = road.segment.path;
    if (from == null || to == null) return new Map();
    const {progress, length} = this.roadPosition(road);
    const distances = new Map([[from, progress], [to, length - progress]]);
    const open = new Set(distances.keys());
    while (open.size) {
      const closest = [...open].reduce((a, b) => distances.get(a) <= distances.get(b) ? a : b);
      open.delete(closest);
      for (const link of this.junctionLinks.get(closest) ?? []) {
        const distance = distances.get(closest) + link.length;
        if (distance >= (distances.get(link.to) ?? Infinity)) continue;
        distances.set(link.to, distance);
        open.add(link.to);
      }
    }
    return distances;
  }

  formation(goal, approach, count, scale) {
    if (count < 2 || this.coverage(goal.x, goal.y) < .58) return null;
    const road = this.nearest(goal);
    if (!road) return null;
    const {segment} = road;
    const {progress, length: end} = this.roadPosition(road), spacing = scale * 5.8;
    const approachRoad = this.nearest(approach,scale*15);
    const direct = (goal.x - approach.x) * segment.ux + (goal.y - approach.y) * segment.uy;
    let offset = approachRoad?.segment.pathId === segment.pathId
      ? progress - approachRoad.segment.progress - approachRoad.along : direct;
    if (approachRoad && approachRoad.segment.pathId !== segment.pathId) {
      const distances = this.distancesAlongRoads(approachRoad);
      const viaStart = (distances.get(segment.path.from) ?? Infinity) + progress;
      const viaEnd = (distances.get(segment.path.to) ?? Infinity) + end - progress;
      if (viaStart !== viaEnd) offset = viaStart < viaEnd ? 1 : -1;
    }
    const direction = Math.sign(offset) || 1;
    const segments = this.routes.get(segment.pathId);
    const slots = [];
    const add = position => {
      if (position < 0 || position > end) return;
      const part = segments.find(candidate => candidate.progress + candidate.length >= position);
      const d = position - part.progress, t = d / part.length;
      const width = (part.a.width ?? part.path.width) * (1 - t) + (part.b.width ?? part.path.width) * t;
      const centre = {x: part.a.x + part.ux * d, y: part.a.y + part.uy * d};
      const offset = Math.max(0, Math.min(width * .23, width / 2 - scale * 1.40));
      const right = {x: centre.x + part.uy * direction * offset, y: centre.y - part.ux * direction * offset};
      const point = this.coverage(right.x, right.y) >= .58 ? right : centre;
      if (this.coverage(point.x, point.y) >= .58) slots.push(point);
    };
    add(progress);
    for (let index = 1; index <= count + 3 && slots.length < count + 2; index++) add(progress - direction * index * spacing);
    for (let index = 1; index <= count + 3 && slots.length < count + 2; index++) add(progress + direction * index * spacing);
    return slots.length ? {slots,goal,path:segment.pathId,direction,targetProgress:progress*direction,
      distances:this.distancesAlongRoads(road)} : null;
  }

  formationProgress(unit, layout, scale) {
    const road = this.nearest(unit,scale*14);
    if (!road) return null;
    const nearLane = road.distance <= Math.min(scale * 7, road.width);
    const {segment} = road, progress = (segment.progress + road.along) * layout.direction;
    if (segment.pathId !== layout.path) {
      if (!nearLane || this.coverage(unit.x, unit.y) < .4) return null;
      const {progress, length} = this.roadPosition(road);
      const remaining = Math.min(
        (layout.distances.get(segment.path.from) ?? Infinity) + progress,
        (layout.distances.get(segment.path.to) ?? Infinity) + length - progress
      );
      const direct = Math.hypot(unit.x - layout.goal.x, unit.y - layout.goal.y);
      return remaining <= direct * 3 + 60 ? layout.targetProgress - remaining : null;
    }
    if (nearLane && this.coverage(unit.x,unit.y) >= .4) return progress;
    // A group entering from an apron can use the same lane slots as vehicles
    // already on the road. The navigation search still validates each approach.
    return progress <= layout.targetProgress ? progress : null;
  }

  rightLane(unit, goal, scale) {
    const dx = goal.x - unit.x, dy = goal.y - unit.y, distance = Math.hypot(dx, dy);
    if (distance < 40 || this.coverage(unit.x, unit.y) < .40) return null;
    const road = this.nearest(unit);
    if (!road || road.width < scale * 4.85) return null;
    const {segment} = road;
    const alignment = (dx * segment.ux + dy * segment.uy) / distance;
    if (Math.abs(alignment) < .73) return null;
    const direction = Math.sign(alignment), steps = segment.path.points;
    let remaining = Math.min(distance * .80, 39);
    let index = segment.index, along = road.along;
    while (index >= 0 && index < steps.length - 1) {
      const a = steps[index], b = steps[index + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < .001) { index += direction; continue; }
      const available = direction > 0 ? length - along : along;
      if (remaining > available) {
        remaining -= available;
        index += direction;
        if (index >= 0 && index < steps.length - 1) {
          along = direction > 0 ? 0 : Math.hypot(steps[index + 1].x - steps[index].x, steps[index + 1].y - steps[index].y);
        }
        continue;
      }
      const x = a.x + (b.x - a.x) * (along + direction * remaining) / length;
      const y = a.y + (b.y - a.y) * (along + direction * remaining) / length;
      if (this.intersections.some(node => Math.hypot(x - node.x, y - node.y) < 26)) return null;
      const offset = Math.min(road.width * .25, road.width / 2 - scale * 1.30);
      const lane = {
        x: x + (b.y - a.y) / length * direction * offset,
        y: y - (b.x - a.x) / length * direction * offset,
        ux: segment.ux * direction, uy: segment.uy * direction,
        path: segment.pathId, direction, progress: (segment.progress + road.along) * direction
      };
      return this.coverage(lane.x, lane.y) >= .4 ? lane : null;
    }
    return null;
  }
}
