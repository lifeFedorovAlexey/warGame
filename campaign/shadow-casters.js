export function createShadowCasters() {
  const casters = new Map();
  let frame = 0, changed = false;

  return {
    begin() { frame++; changed = false; },
    watch(id, ...pose) {
      const previous = casters.get(id);
      if (previous?.pose.length === pose.length && pose.every((value, i) => value === previous.pose[i])) {
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
