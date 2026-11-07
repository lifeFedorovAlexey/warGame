const rigs = new WeakMap();

function rigOf(root) {
  if (!rigs.has(root)) {
    const yaw = root.getObjectByName('tower_yaw');
    rigs.set(root, yaw ? {
      yaw,
      pitch: yaw.getObjectByName('tower_pitch'),
      recoil: yaw.getObjectByName('tower_recoil'),
      muzzle: yaw.getObjectByName('muzzle'),
    } : null);
  }
  return rigs.get(root);
}

export function aimTowerWeapon(root, building, field, scale, target = building.aimTarget, shotAge = Infinity) {
  const rig = rigOf(root);
  if (!rig) return null;
  const {yaw, pitch, recoil, muzzle} = rig;
  yaw.rotation.z = 0;
  pitch.rotation.x = 0;
  if (target) {
    const dx = target.x - building.x, dy = target.y - building.y;
    const reach = Math.hypot(dx, dy);
    if (reach > .001) yaw.rotation.z = Math.atan2(dx, -dy) - building.rotation;
    const ground = building.groundHeight ?? field.heightAt(building.x, building.y);
    const height = ground + pitch.position.z * scale;
    const targetHeight = target.z ?? field.heightAt(target.x, target.y);
    pitch.rotation.x = Math.atan2(height - targetHeight, reach + pitch.position.y * scale);
  }
  recoil.position.y = shotAge >= 0 && shotAge < .14 ? .095 * Math.sin(shotAge / .14 * Math.PI) : 0;
  return muzzle;
}

export function towerDamagePose(T, root, bindings, field, scale) {
  const rig = rigOf(root);
  if (!rig) return undefined;
  const moving = [];
  for (const binding of bindings) {
    for (let node = binding.node; node; node = node.parent) {
      if (node !== rig.yaw) continue;
      binding.dynamic = true;
      moving.push({binding, inverse: binding.bind.clone().invert()});
      break;
    }
  }
  const matrices = new Map(moving.map(({binding}) => [binding, new T.Matrix4()]));
  return building => {
    aimTowerWeapon(root, building, field, scale);
    root.updateMatrixWorld(true);
    for (const {binding, inverse} of moving) {
      matrices.get(binding).multiplyMatrices(binding.node.matrixWorld, inverse);
    }
    return matrices;
  };
}
