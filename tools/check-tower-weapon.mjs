import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as T from '../demo/vendor/three.module.js';
import {aimTowerWeapon} from '../campaign/tower-weapon.js';

registerHooks({resolve(specifier,context,next){
  return next(specifier==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:specifier,context);
}});
const {createScavPrefab} = await import('../campaign/scav-prefabs.js');

const scale = 4.5, field = {heightAt: () => 8};
const building = {x: 50, y: -70, rotation: .37};
const model = createScavPrefab(T, 'mg-tower', 'nw-east');
model.position.set(building.x, building.y, field.heightAt());
model.rotation.z = building.rotation;
model.scale.setScalar(scale);
const receiver = model.getObjectByName('tower_recoil');
const tank = model.getObjectByName('building_structure').children.filter(node => node.isMesh);
for (const mesh of tank) mesh.material.side = T.DoubleSide;

const position = object => object.getWorldPosition(new T.Vector3());
for (const range of [35, 90, 170]) {
  for (let bearing = 0; bearing < 8; bearing++) {
    const angle = bearing * Math.PI / 4;
    const target = new T.Vector3(building.x + Math.cos(angle) * range, building.y + Math.sin(angle) * range, 14);
    const muzzle = aimTowerWeapon(model, building, field, scale, target, 0);
    const shot = position(muzzle);
    const aim = shot.clone().sub(position(receiver)).normalize();
    const trajectory = target.clone().sub(shot).normalize();
    assert(aim.dot(trajectory) > 1 - 1e-9, 'The barrel and tracer must point at the same target');
    const ray = new T.Raycaster(position(receiver), trajectory, 0, target.distanceTo(position(receiver)));
    assert.equal(ray.intersectObjects(tank).length, 0, 'The gun must clear its own tank');

    aimTowerWeapon(model, building, field, scale, target, .22);
    const recoil = position(muzzle).sub(shot);
    assert(Math.abs(recoil.length() - .12 * scale) < 1e-6, 'The muzzle must move with recoil and return to rest');
    assert(recoil.normalize().dot(trajectory) > 1 - 1e-9, 'Recoil travels along the barrel');
  }
}
console.log('Water tower gun: 24 clear firing angles, muzzle alignment and recoil');
