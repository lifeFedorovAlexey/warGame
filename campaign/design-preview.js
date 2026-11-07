import * as T from 'three';
import {OrbitControls} from '../demo/vendor/OrbitControls.js';

const viewDirection = new T.Vector3(.63, .88, .47).normalize();
const vertical = new T.Vector3(0, 0, 1);

export class DesignPreview {
  constructor(host) {
    this.host = host;
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#202724');
    this.scene.fog = new T.Fog('#202724', 13, 26);
    this.camera = new T.PerspectiveCamera(40, 1, .08, 52);
    this.camera.up.set(0, 0, 1);
    this.renderer = new T.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '3D-модель машины. Перетаскивание и стрелки вращают камеру, колесо меняет масштаб.');
    canvas.tabIndex = 0;
    host.prepend(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.minPolarAngle = .16;
    this.controls.maxPolarAngle = Math.PI * .47;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 24;
    this.controls.addEventListener('change', () => this.requestRender());
    canvas.addEventListener('keydown', event => {
      if (!this.model || !['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
      event.preventDefault();
      const angle = (event.code === 'ArrowLeft' ? 1 : -1) * .17;
      this.camera.position.sub(this.controls.target).applyAxisAngle(vertical, angle).add(this.controls.target);
      this.controls.update();
    });
    this.floor = this.addStage();
    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(host);
    this.resize();
  }

  addStage() {
    const floor = new T.Mesh(new T.PlaneGeometry(38, 38), new T.MeshStandardMaterial({color:'#3d443d', roughness:.94}));
    floor.position.z = -.028;
    floor.receiveShadow = true;
    const grid = new T.GridHelper(30, 30, '#67715f', '#535c50');
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -.019;
    grid.material.transparent = true;
    grid.material.opacity = .48;
    const ring = new T.Mesh(new T.RingGeometry(2.85, 2.88, 72), new T.MeshBasicMaterial({color:'#9a9c67'}));
    ring.position.z = -.01;
    const lights = new T.HemisphereLight('#e0e9de', '#59564a', 2.25);
    lights.position.set(0, 0, 8);
    const key = new T.DirectionalLight('#fff1d0', 3.3);
    key.position.set(-4.2, 3.5, 8.7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {left:-5, right:5, top:5, bottom:-5, near:.5, far:22});
    key.shadow.normalBias = .032;
    const fill = new T.DirectionalLight('#aecadc', 1.65);
    fill.position.set(2.5, -5, 5);
    this.scene.add(floor, grid, ring, lights, key, fill);
    return [floor, grid, ring];
  }

  resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  setModel({root, chassis, body, upper}) {
    const initial = !this.model;
    const interrupted = !!this.motion;
    this.motion = null;
    if (this.model) this.scene.remove(this.model);
    this.model = root;
    this.parts = [chassis, body, upper].map(node => ({node, base:node.position.clone()}));
    root.traverse(node => {
      if (node.isMesh) node.castShadow = node.receiveShadow = true;
    });
    this.scene.add(root);
    root.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(root);
    this.centre = bounds.getCenter(new T.Vector3());
    this.size = bounds.getSize(new T.Vector3());
    this.lift = Math.max(.85, this.size.z * .31);
    this.placeParts(this.exploded ? 1 : 0);
    if (initial || interrupted) this.resetView();
    else this.requestRender();
  }

  clearModel() {
    if (this.model) this.scene.remove(this.model);
    this.model = null;
    this.motion = null;
    this.requestRender();
  }

  placeParts(progress) {
    for (const [index, {node, base}] of this.parts.entries()) {
      node.position.copy(base);
      node.position.z += index * this.lift * progress;
    }
  }

  fittedDistance(progress) {
    const radius = Math.hypot(this.size.x, this.size.y, this.size.z + 2 * this.lift * progress) * .5;
    const fov = T.MathUtils.degToRad(this.camera.fov * .5);
    return radius / Math.sin(fov) * Math.max(1, 1 / this.camera.aspect) * 1.03;
  }

  resetView() {
    if (!this.model) return;
    const progress = this.exploded ? 1 : 0;
    this.controls.target.copy(this.centre);
    this.controls.target.z += this.lift * progress;
    this.camera.position.copy(this.controls.target).addScaledVector(viewDirection, this.fittedDistance(progress));
    this.controls.update();
    this.requestRender();
  }

  setExploded(exploded) {
    if (!this.model || this.exploded === exploded) return;
    const progress = this.motion?.progress ?? (this.exploded ? 1 : 0);
    this.exploded = exploded;
    this.motion = {start:performance.now(), from:progress, to:exploded ? 1 : 0, progress};
    this.requestRender();
  }

  requestRender() {
    if (!this.frame) this.frame = requestAnimationFrame(time => this.render(time));
  }

  render(time) {
    this.frame = 0;
    if (this.motion) {
      const motion = this.motion;
      const t = Math.min(1, Math.max(0, (time - motion.start) / 325));
      const eased = t * t * (3 - 2 * t);
      const progress = T.MathUtils.lerp(motion.from, motion.to, eased);
      this.placeParts(progress);
      const direction = this.camera.position.clone().sub(this.controls.target);
      direction.multiplyScalar(this.fittedDistance(progress) / this.fittedDistance(motion.progress));
      this.controls.target.z += (progress - motion.progress) * this.lift;
      this.camera.position.copy(this.controls.target).add(direction);
      this.controls.update();
      motion.progress = progress;
      if (t >= 1) this.motion = null;
      else this.requestRender();
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizer.disconnect();
    this.controls.dispose();
    for (const item of this.floor) {
      item.geometry.dispose();
      item.material.dispose();
    }
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
