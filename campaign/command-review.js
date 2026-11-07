import * as T from 'three';
import {GLTFLoader} from '../demo/vendor/loaders/GLTFLoader.js';
import {OrbitControls} from '../demo/vendor/OrbitControls.js';

const element = id => document.getElementById(id);
const host = element('view');
const renderer = new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.3));
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
host.prepend(renderer.domElement);

const scene = new T.Scene();
scene.background = new T.Color('#7c7f70');
scene.add(new T.HemisphereLight('#e0ebef','#8d826c',2.65));
const sun = new T.DirectionalLight('#ffdfb5',3.0);
sun.position.set(-7,8,13);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.1,far:36});
sun.shadow.normalBias = .015;
scene.add(sun);
const fill = new T.DirectionalLight('#b3c8d6',1.45);
fill.position.set(7,-3,8);
scene.add(fill);
const floor = new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:'#727563',roughness:.97}));
floor.position.z = -.001;
floor.receiveShadow = true;
scene.add(floor);

const camera = new T.OrthographicCamera(-4,4,3,-3,.1,100);
camera.up.set(0,0,1);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minZoom = .68;
controls.maxZoom = 2.6;
controls.maxPolarAngle = Math.PI*.47;
const assembledTargetZ = 1.84;
const separatedTargetZ = 2.48;
controls.target.set(0,0,assembledTargetZ);

const guideGeometry = new T.BufferGeometry();
const guidePositions = new T.Float32BufferAttribute(new Float32Array(30),3);
guideGeometry.setAttribute('position',guidePositions);
const guideColors = [];
for (let i=0;i<5;i++) {
 const color = new T.Color(i===4?'#edc484':'#9de6cc');
 guideColors.push(...color.toArray(),...color.toArray());
}
guideGeometry.setAttribute('color',new T.Float32BufferAttribute(guideColors,3));
const guides = new T.LineSegments(guideGeometry,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.68,depthTest:false}));
guides.frustumCulled = false;
guides.renderOrder = 5;
guides.visible = false;
scene.add(guides);

const padNames = ['FL','FR','RL','RR'].map(name=>'pad_'+name);
const assetBase = new URL('../assets/vehicles/command-uaz/',import.meta.url);
const loader = new GLTFLoader();
const parts = [];
const wheels = [];
const steering = [];
let antenna, home, anchorPairs, ready = false, motion = false, explodeTarget = 0, exploded = 0;
const pointA = new T.Vector3(), pointB = new T.Vector3();
const partRise = [0,1.22,2.58];

function updateProjection() {
 const half = T.MathUtils.lerp(2.8,3.52,exploded);
 const aspect = host.clientWidth/Math.max(1,host.clientHeight);
 camera.top = half;
 camera.bottom = -half;
 camera.left = -half*aspect;
 camera.right = half*aspect;
 camera.updateProjectionMatrix();
}
function resize() {
 renderer.setSize(host.clientWidth,host.clientHeight,false);
 updateProjection();
}
new ResizeObserver(resize).observe(host);
resize();

function setView(view='front') {
 const front = view==='front';
 camera.position.copy(controls.target).add(new T.Vector3(front?6.5:-6.3,front?8.7:-8.6,4.0));
 camera.zoom = 1;
 camera.updateProjectionMatrix();
 controls.update();
 element('front').setAttribute('aria-pressed',String(front));
 element('rear').setAttribute('aria-pressed',String(!front));
}
setView();

function setLayout(value) {
 const oldZ = controls.target.z;
 exploded = value;
 for (const [i,part] of parts.entries()) part.position.z = home[i].z + partRise[i]*exploded;
 controls.target.z = T.MathUtils.lerp(assembledTargetZ,separatedTargetZ,exploded);
 camera.position.z += controls.target.z-oldZ;
 guides.visible = exploded>.02;
 if (guides.visible) {
  for (const [i,[a,b]] of anchorPairs.slice(1).entries()) {
   a.getWorldPosition(pointA);
   b.getWorldPosition(pointB);
   guidePositions.setXYZ(i*2,pointA.x,pointA.y,pointA.z);
   guidePositions.setXYZ(i*2+1,pointB.x,pointB.y,pointB.z);
  }
  guidePositions.needsUpdate = true;
 }
 updateProjection();
 if (exploded===0) {
  const error = Math.max(...Object.values(audit()));
  const formatted = error.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
  element('status').value = `Совмещено 6 точек · ${formatted} мм`;
 } else if (exploded===1) {
  element('status').value = 'Три раздельных модуля';
 }
}

function audit() {
 if (!ready) return null;
 return Object.fromEntries(anchorPairs.map(([a,b])=>[a.name,a.getWorldPosition(pointA).distanceTo(b.getWorldPosition(pointB))*1000]));
}
function setExploded(value,immediate=false) {
 if (!ready) return;
 explodeTarget = value?1:0;
 element('assemble').setAttribute('aria-pressed',String(!value));
 element('explode').setAttribute('aria-pressed',String(!!value));
 if (immediate || exploded===explodeTarget) setLayout(explodeTarget);
 else element('status').value = value?'Разборка…':'Сборка…';
}
function setMotion(value) {
 motion = !!value;
 element('motion').setAttribute('aria-pressed',String(motion));
}
element('assemble').onclick = () => setExploded(false);
element('explode').onclick = () => setExploded(true);
element('front').onclick = () => setView('front');
element('rear').onclick = () => setView('rear');
element('motion').onclick = () => setMotion(!motion);
window.commandReview = {get ready(){return ready;},audit,setExploded,setView,setMotion};

try {
 const response = await fetch(new URL('manifest.json',assetBase));
 if (!response.ok) throw new Error(`Каталог моделей · HTTP ${response.status}`);
 const manifest = await response.json();
 const loaded = await Promise.all(manifest.components.map(component=>loader.loadAsync(new URL(component.file,assetBase).href)));
 for (const [i,asset] of loaded.entries()) {
  const part = new T.Group();
  part.name = manifest.components[i].id;
  part.rotation.x = Math.PI/2;
  part.add(asset.scene);
  part.traverse(node=>{if(node.isMesh)node.castShadow=node.receiveShadow=true;});
  scene.add(part);
  parts.push(part);
 }
 const [chassis,body,radio] = parts;
 const mount = chassis.getObjectByName('body_mount');
 const bodyOrigin = body.getObjectByName('mount');
 const radioSeat = body.getObjectByName('radio_mount');
 const radioOrigin = radio.getObjectByName('mount');
 body.position.add(mount.getWorldPosition(pointA).sub(bodyOrigin.getWorldPosition(pointB)));
 radio.position.add(radioSeat.getWorldPosition(pointA).sub(radioOrigin.getWorldPosition(pointB)));
 anchorPairs = [[mount,bodyOrigin],...padNames.map(name=>[chassis.getObjectByName(name),body.getObjectByName(name)]),[radioSeat,radioOrigin]];
 home = parts.map(part=>part.position.clone());
 chassis.traverse(node=>{
  if (node.name.endsWith('_wheel')) wheels.push(node);
  if (node.name.startsWith('axle_1_')&&node.name.endsWith('_steer')) steering.push(node);
 });
 antenna = radio.getObjectByName('antenna_flex');
 for (const component of manifest.components) {
  const card = document.createElement('div');
  card.className = 'part';
  const name = document.createElement('b');
  name.textContent = `${component.label} · ${component.id}`;
  const size = document.createElement('small');
  const {min,max} = component.boundsMm;
  size.textContent = `${max[1]-min[1]} × ${max[0]-min[0]} × ${max[2]-min[2]} мм`;
  card.append(name,size);
  element('parts').append(card);
 }
 ready = true;
 for (const button of document.querySelectorAll('button')) button.disabled = false;
 setExploded(false,true);
} catch (error) {
 element('error').hidden = false;
 element('error').textContent = error.message;
 element('status').value = 'Сборка не загружена';
 console.error(error);
}

let previous = performance.now();
function frame(now) {
 const dt = Math.min(.1,(now-previous)/1000);
 previous = now;
 if (ready && exploded!==explodeTarget) {
  const next = T.MathUtils.damp(exploded,explodeTarget,6,dt);
  setLayout(Math.abs(next-explodeTarget)<.001?explodeTarget:next);
 }
 const time = now/1000;
 for (const wheel of wheels) wheel.rotation.x = motion?-time*2.8:0;
 for (const joint of steering) joint.rotation.z = motion?Math.sin(time*1.7)*.40:0;
 if (antenna) antenna.rotation.x = motion?Math.sin(time*3.8)*.018:0;
 controls.update();
 renderer.render(scene,camera);
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
