export function createShadowCasters() {
  const casters = new Map();
  let frame = 0, changed = false;

  return {
    begin() { frame++; changed = false; },
    watch(id, ...pose) {
      const previous = casters.get(id);
      // Steering settles asymptotically after a drive. Sub-microscopic numeric
      // drift must not redraw the shadow map forever once the vehicle is parked.
      const same=(value,prior)=>value===prior||typeof value==='number'&&typeof prior==='number'&&Math.abs(value-prior)<1e-6;
      if (previous?.pose.length === pose.length && pose.every((value, i) => same(value,previous.pose[i]))) {
        previous.frame = frame;
        return;
      }
      casters.set(id, {frame, pose});
      changed = true;
    },
    end() {
      for (const [id, caster] of casters) {
        if (caster.frame === frame) continue;
        casters.delete(id);
        changed = true;
      }
      return changed;
    },
  };
}
