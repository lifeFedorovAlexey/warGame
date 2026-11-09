import * as T from 'three';
import {OrbitControls} from '../demo/vendor/OrbitControls.js';
import {createAlphaMap} from '../demo/alpha-map.js';
import {createDesertSky} from '../demo/sky.js';
import {createVehicleLayer} from './vehicle-layer.js';
import {createHealthBars} from './health-bars.js';
import {createFactoryServiceEffects,factoryShutterDamagePose} from './factory-service-effects.js';
import {createBuildingPrefab} from './prefabs.js';
import {createScavPrefab} from './scav-prefabs.js';
import {createScavBasePrefab} from './scav-base-prefabs.js';
import {aimTowerWeapon,towerDamagePose} from './tower-weapon.js';
import {mgRecoil} from './mg-burst.js';
import {createShadowCasters} from './shadow-casters.js';
import {createGroundEffects} from './ground-effects.js';
import {updateOilPump} from './oil-pump.js';
import {createHeadlightPair,setHeadlightPower} from '../demo/vehicle-effects.js';
import {createCombatEffects} from './combat-effects.js';
import {placeSelectionRing} from './selection-rings.js';
import {createPlacementGrid} from './placement-grid.js';
import {fitBuildingFoundation} from './building-foundation.js';
import {SCAV_PROFILES,isInfantry} from './scav-unit-profiles.js';
import {createConstructionEffects} from './construction-effects.js';
import {createFogMask} from './fog-mask.js';
import {createStorySignals} from './story-signals.js';
import {createRallyFlags} from './rally-flags.js';
import {createBaseYard} from './base-yard.js';
import {createDamEnvironment} from './dam-environment.js';
import {createDesertDressing} from './desert-dressing.js';
import {createFieldArtifact} from './field-artifacts.js';
import {combatContact} from './combat-contact.js';
import {vehicleLocalBoxes} from './vehicle-collision.js';
import {buildLayerHeight} from './builder-optics.js';
import {createDamageSystem} from './damage-system.js';
import {partMissing} from './damage-state.js';

export async function createCampaignWorld(host,config,sound,loading){
 await loading?.stage('terrain');
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
 const software=!!debug&&/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
 const renderScaleCeiling=()=>Math.min(devicePixelRatio,software?.77:1.15);
 renderer.setPixelRatio(renderScaleCeiling());renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.localClippingEnabled=true;host.append(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#8a826d');scene.fog=new T.Fog('#9c8d70',3500,11000);const camera=new T.PerspectiveCamera(43,1,1,22000);camera.up.set(0,0,1);
 scene.add(new T.HemisphereLight('#c4d8e0','#79664d',2.3));const sun=new T.DirectionalLight('#ffdfb7',2.5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-400,right:400,top:400,bottom:-400,near:1,far:1600});sun.shadow.bias=-.0001;sun.shadow.normalBias=.08;scene.add(sun,sun.target);const fill=new T.DirectionalLight('#a5b6c3',1);fill.position.set(100,-200,800);scene.add(fill);
 const [terrain,sky]=await Promise.all([createAlphaMap(T,{lightweightOverview:software}),createDesertSky(T,renderer,scene)]);scene.add(terrain.root);terrain.baseOutline.visible=false;terrain.path.visible=false;terrain.setViewMode('close');const field=terrain.field,start=field.gridToWorld(config.startGrid);
 const normalCameraLimit=Math.PI*.42;
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(start.x,start.y,field.heightAt(start.x,start.y));camera.position.set(start.x+100,start.y-360,controls.target.z+360);controls.enableDamping=true;controls.minDistance=110;controls.maxDistance=5300;controls.minPolarAngle=.06;controls.maxPolarAngle=normalCameraLimit;controls.mouseButtons={LEFT:-1,MIDDLE:T.MOUSE.ROTATE,RIGHT:-1};controls.enablePan=false;
 controls.addEventListener('start',()=>{controls.maxPolarAngle=normalCameraLimit;});
 const fog=createFogMask(T);
 const storySignals=createStorySignals(T,scene,field);
 const rallyFlags=createRallyFlags(T,scene,field,config.worldScale);
 const foggedMaterials=new Set();function addFog(material){if(!material||foggedMaterials.has(material))return;foggedMaterials.add(material);const before=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);material.onBeforeCompile=shader=>{before.call(material,shader);shader.uniforms.missionFog={value:fog.texture};shader.uniforms.missionExtent={value:field.extent};shader.uniforms.storySpill=storySignals.spill;shader.uniforms.storyObserver=storySignals.observer;shader.vertexShader='varying vec2 vMissionXY;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 missionPosition=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nmissionPosition=instanceMatrix*missionPosition;\n#endif\nvMissionXY=(modelMatrix*missionPosition).xy;');shader.fragmentShader='uniform sampler2D missionFog;uniform float missionExtent;uniform vec3 storySpill;uniform vec2 storyObserver;varying vec2 vMissionXY;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
 vec2 missionUv=vec2(vMissionXY.x,-vMissionXY.y)/missionExtent+.5;
 vec2 visibility=texture2D(missionFog,clamp(missionUv,vec2(0.),vec2(1.))).rg;
 float inside=step(0.,missionUv.x)*step(missionUv.x,1.)*step(0.,missionUv.y)*step(missionUv.y,1.);
 vec3 hidden=vec3(.023,.029,.031);
 if(storySpill.z>0.){
   float halo=1.-smoothstep(24.,460.,length(vMissionXY-storySpill.xy));
   float haze=smoothstep(770.,2450.,length(vMissionXY-storyObserver))*min(1.,storySpill.z*3.6);
   float surface=dot(gl_FragColor.rgb,vec3(.299,.587,.114));
   hidden=mix(hidden,vec3(.153,.246,.286),haze);
   hidden+=vec3(.19,.24,.35)*halo*storySpill.z*(.3+.7*surface);
 }
 gl_FragColor.rgb=mix(hidden,gl_FragColor.rgb,(visibility.g*.30+visibility.r*.70)*inside);
 `);};material.customProgramCacheKey=()=>cache()+'_mission_fog_v5';material.needsUpdate=true;}
 for(const material of terrain.terrainMaterials) addFog(material);
 const baseYard=createBaseYard(T,field,config,addFog);scene.add(baseYard.root);
 const dam=createDamEnvironment(T,field,config,addFog,sound,terrain);scene.add(dam.root);baseYard.roads.push(dam.road);terrain.setLocalRoads(baseYard.roads);
 const dressing=createDesertDressing(T,field,config,[...terrain.roadPaths,...baseYard.roads],dam.layout,addFog);scene.add(dressing.root);
 const damage=createDamageSystem(T,scene,field,config);
 await loading?.stage('vehicles');
 const vehicles=await createVehicleLayer(T,scene,field,config,damage,(completed,total)=>loading?.update('vehicles',completed,total)),buildingRoot=new T.Group();scene.add(buildingRoot);const buildings=new Map(),prefabs=new Map(),selectionRoot=new T.Group();scene.add(selectionRoot);
 const healthBars=createHealthBars(T,scene,field,config,vehicles.transforms,buildings);
 damage.setTemplateProvider(entity=>{
   const root=getPrefab(entity.kind,entity.owner,entity.campId,entity.scavVariant,entity.fenceSpan,entity.fenceProfile);root.updateMatrixWorld(true);
   const bindings=[];root.traverse(node=>{if(node.isMesh)bindings.push(damage.prepare(node,'building',0));});
   return {bindings,parts:root.userData.damageParts??{0:{name:'structure',material:'concrete'}},pose:towerDamagePose(T,root,bindings,field,config.worldScale)??factoryShutterDamagePose(T,root,bindings)};
 });
 const groundEffects=createGroundEffects(T,scene,field,config.worldScale),shotTimes=new Map();
 if(software)sun.shadow.mapSize.set(512,512);
 sun.shadow.camera.up.set(0,0,1);
 let lastWorldTime=-1,lastScaleAt=0,frameAverage=.023,terrainMode='',lastShadowLod=-1,fixedRenderScale=false,lastDamageRows=-1,minimumCameraHeight=40;
 const shadowCasters=createShadowCasters();
 let shadowUpdates=0;
 const damageCasters=['damage_debris_pool','recoverable_parts'].map(name=>scene.getObjectByName(name)).filter(Boolean);
 const shadowCentre=new T.Vector3(Infinity,Infinity,Infinity);
 const lightOffset=new T.Vector3(-450,200,800),lightDirection=lightOffset.clone().normalize();
 const lightRight=new T.Vector3().crossVectors(lightDirection,new T.Vector3(0,0,1)).normalize();
 const lightUp=new T.Vector3().crossVectors(lightRight,lightDirection).normalize(),stableTarget=new T.Vector3();
 const oilMarkers=config.oilFields.map(grid=>{const p=field.gridToWorld(grid),root=new T.Group();root.position.set(p.x,p.y,field.heightAt(p.x,p.y)+.25);const ring=new T.Mesh(new T.RingGeometry(10,11.5,24),new T.MeshBasicMaterial({color:'#baac72',transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));root.add(ring);const pipe=new T.Mesh(new T.CylinderGeometry(1.7,2,3,10),new T.MeshStandardMaterial({color:'#44463b',metalness:.6,roughness:.8}));pipe.rotation.x=Math.PI/2;pipe.position.z=1.5;root.add(pipe);scene.add(root);return{root,...p};});
 const artifactObjects=new Map();
 const ringGeometry=new T.RingGeometry(1,1.08,64),selectedMaterial=new T.MeshBasicMaterial({color:'#c0ce93',transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}),selectionRings=[];
 selectionRoot.name='selection_rings';
 for(let i=0;i<48;i++){const ring=new T.Mesh(ringGeometry.clone(),selectedMaterial);ring.visible=false;selectionRoot.add(ring);selectionRings.push(ring);}
 const marker=new T.Mesh(new T.RingGeometry(6,7,32),new T.MeshBasicMaterial({color:'#cfb473',transparent:true,opacity:.7,depthWrite:false,side:T.DoubleSide}));marker.visible=false;scene.add(marker);let markerUntil=0;
 const placementGrid=createPlacementGrid(T,scene,field,config);
 let ghost=null,ghostKind=null,ghostValid=null;const ghostMaterials=[];
 const footprint = new T.LineLoop(new T.BufferGeometry(), new T.LineBasicMaterial({color:'#d4edaa', depthTest:false}));
 footprint.geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(12),3));
 footprint.frustumCulled = false;
 footprint.visible = false;
 footprint.renderOrder = 8;
 scene.add(footprint);
 const combat=createCombatEffects(T,scene,config.worldScale,sound,field),lightLift=new T.Matrix4().makeTranslation(0,0,1.05);
 const headlights=Array.from({length:software?1:2},()=>{
  const root=new T.Group();root.name='bukhanka_headlights';root.matrixAutoUpdate=false;
  const spots=createHeadlightPair(T,root);scene.add(root);
  setHeadlightPower(spots,config.worldScale,false,false);
  return {root,spots};
 });
 let headlightCount=0;
 const construction=createConstructionEffects(T,scene,config.worldScale);
 const factoryEffects=createFactoryServiceEffects(T,scene,config.worldScale);
 const dustCanvas=document.createElement('canvas');dustCanvas.width=dustCanvas.height=64;const dc=dustCanvas.getContext('2d'),gradient=dc.createRadialGradient(32,32,0,32,32,30);gradient.addColorStop(0,'rgba(255,255,255,.7)');gradient.addColorStop(1,'rgba(255,255,255,0)');dc.fillStyle=gradient;dc.fillRect(0,0,64,64);const dustPositions=new Float32Array(256*3),dustGeometry=new T.BufferGeometry();dustGeometry.setAttribute('position',new T.BufferAttribute(dustPositions,3));dustGeometry.setDrawRange(0,0);const dust=new T.Points(dustGeometry,new T.PointsMaterial({map:new T.CanvasTexture(dustCanvas),color:'#b5a180',size:8,transparent:true,opacity:.13,depthWrite:false}));dust.frustumCulled=false;scene.add(dust);const particles=[];let dustTime=0;
 const ray=new T.Raycaster(),ndc=new T.Vector2(),vector=new T.Vector3();
 const localRay=new T.Ray(),inverse=new T.Matrix4(),pickBox=new T.Box3(),pickPoint=new T.Vector3();
 const keys=new Set();
 const resize=()=>{renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(host);resize();
 function pointerRay(clientX,clientY){
  const rect=renderer.domElement.getBoundingClientRect();
  ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
  ray.setFromCamera(ndc,camera);
 }
 function ground(clientX,clientY){pointerRay(clientX,clientY);let lo=0,hi=20000;for(let i=0;i<28;i++){const middle=(lo+hi)/2,p=ray.ray.at(middle,vector);if(p.z>field.heightAt(p.x,p.y))lo=middle;else hi=middle;}const point=ray.ray.at((lo+hi)/2,new T.Vector3());return Math.abs(point.x)<=field.half&&Math.abs(point.y)<=field.half?{x:point.x,y:point.y,z:point.z}:null;}
 function pickEntity(mission,clientX,clientY){
  pointerRay(clientX,clientY);
  let selected=null,nearest=Infinity;
  for(const b of mission.state.buildings){
   if(config.buildings[b.kind]?.storyOnly)continue;
   const model=buildings.get(b.id);
   if(!model?.visible||b.hp<=0||b.owner!=='rai'&&!mission.visibleAt(b.x,b.y))continue;
   const layer=b.completed?Infinity:buildLayerHeight(b,config.buildings[b.kind],config.worldScale);
   for(const hit of ray.intersectObject(model,true)){
    if(hit.distance>=nearest)break;
    if(hit.point.z>layer||!hit.object.parent?.visible||!hit.object.visible)continue;
    nearest=hit.distance;selected=b;break;
   }
  }
  for(const unit of mission.state.units){
   const pose=vehicles.transforms.get(unit.id);
   if(!pose||unit.hp<=0||unit.owner!=='rai'&&!mission.visibleAt(unit.x,unit.y))continue;
   localRay.copy(ray.ray).applyMatrix4(inverse.copy(pose.matrix).invert());
   for(const [width,y,depth,z,height] of vehicleLocalBoxes(unit.kind)){
    pickBox.min.set(-width,y-depth,z-height);pickBox.max.set(width,y+depth,z+height);
    if(!localRay.intersectBox(pickBox,pickPoint))continue;
    const distance=pickPoint.applyMatrix4(pose.matrix).distanceTo(ray.ray.origin);
    if(distance<nearest){nearest=distance;selected=unit;}
   }
  }
  return selected;
 }
 function screen(entity,height=8){const pose=entity.id&&vehicles.transforms.get(entity.id);const point=(pose?pose.position.clone():new T.Vector3(entity.x,entity.y,field.heightAt(entity.x,entity.y)));point.z+=height;point.project(camera);const rect=renderer.domElement.getBoundingClientRect();return{x:(point.x+1)*rect.width/2+rect.left,y:(1-point.y)*rect.height/2+rect.top,visible:point.z>-1&&point.z<1};}
 function centre(entity,distance){const offset=camera.position.clone().sub(controls.target);controls.maxPolarAngle=normalCameraLimit;controls.target.set(entity.x,entity.y,field.heightAt(entity.x,entity.y));if(distance)offset.setLength(distance);camera.position.copy(controls.target).add(offset);controls.update();}
 function focusStorySignal(signal,foreground){
  if(signal.kind!=='anomaly'){centre(signal,signal.distance);return;}
  const approach=new T.Vector2(signal.x-foreground.x,signal.y-foreground.y).normalize();
  const x=foreground.x-approach.x*350,y=foreground.y-approach.y*350;
  controls.maxPolarAngle=Math.PI*.48;
  controls.target.set(signal.x,signal.y,field.heightAt(signal.x,signal.y)+62);
  camera.position.set(x,y,field.heightAt(x,y)+120);
  controls.update();
 }
 function getPrefab(kind,owner='rai',camp='',variant='',span=7,profile=null){
  const key = owner + ':' + kind + ':' + camp+':'+variant+':'+span+':'+profile;
  if (!prefabs.has(key)) {
   const prefab = owner === 'scavs' ? kind.startsWith('scav-')?createScavBasePrefab(T,kind,camp,span,variant,profile):createScavPrefab(T,kind,variant?camp+':'+variant:camp) : createBuildingPrefab(T,kind,config.buildings[kind]);
   prefab.userData.kind = kind;
   prefab.userData.owner = owner;
   prefabs.set(key,prefab);
  }
  return prefabs.get(key);
 }
 function buildingCards(){
  const stage = new T.Scene(), camera = new T.OrthographicCamera(-1,1,1,-1,.1,80);
  stage.background = new T.Color('#41433c');
  stage.add(new T.HemisphereLight('#e7edf2','#938c71',1.95));
  const key = new T.DirectionalLight('#ffdfb4',2.85);
  key.position.set(-5,-8,12);
  stage.add(key);
  camera.up.set(0,0,1);
  const size = renderer.getSize(new T.Vector2()), ratio = renderer.getPixelRatio(), shadow = renderer.shadowMap.enabled;
  const result = {};
  try {
   renderer.shadowMap.enabled = false;
   renderer.setPixelRatio(1);
   renderer.setSize(192,116,false);
   const aspect=192/116, corner=new T.Vector3();
   for (const kind of Object.keys(config.buildings)) {
    if(config.buildings[kind].storyOnly||config.buildings[kind].enemyOnly)continue;
    const mesh = getPrefab(kind).clone(true), bounds = new T.Box3().setFromObject(mesh);
    const centre = bounds.getCenter(new T.Vector3());
    camera.position.copy(centre).add(new T.Vector3(kind==='factory'||kind==='generator'?22:-22,-29,20));
    camera.lookAt(centre);
    camera.updateMatrixWorld(true);
    let radius=0;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
     corner.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);
     radius=Math.max(radius,Math.abs(corner.x)/aspect,Math.abs(corner.y));
    }
    radius*=kind==='bunker'?1.48:1.13;
    camera.left=-radius*aspect;camera.right=-camera.left;camera.top=radius;camera.bottom=-radius;
    camera.updateProjectionMatrix();
    stage.add(mesh);
    renderer.render(stage,camera);
    result[kind] = renderer.domElement.toDataURL('image/webp',.88);
    stage.remove(mesh);
   }
  } finally {
   renderer.setPixelRatio(ratio);
   renderer.setSize(size.x,size.y,false);
   renderer.shadowMap.enabled = shadow;
   renderer.shadowMap.needsUpdate = true;
  }
  return result;
 }
 function setGhost(kind,placement,mission){
  placementGrid.update(kind,placement,mission);
  if(kind!==ghostKind){
   if(ghost)scene.remove(ghost);for(const {material} of ghostMaterials)material.dispose();ghostMaterials.length=0;ghostValid=null;
   ghostKind=kind;ghost=kind?getPrefab(kind).clone(true):null;
   if(ghost){
    const copies=new Map(),copy=original=>{
     if(copies.has(original))return copies.get(original);
     const material=original.clone();material.transparent=true;material.opacity=Math.min(original.opacity,.72);material.depthWrite=true;
     copies.set(original,material);ghostMaterials.push({material,color:original.color?.clone()});return material;
    };
    ghost.name='building_placement_ghost';ghost.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);o.castShadow=false;}});scene.add(ghost);
   }
  }
  footprint.visible = !!(ghost && placement);
  if(!footprint.visible){if(ghost)ghost.visible=false;return;}
  const {x,y,ok,rotation=0} = placement;
  const z = placement.height ?? field.heightAt(x,y);
  ghost.visible=true;ghost.position.set(x,y,z);ghost.rotation.z=rotation;ghost.scale.setScalar(config.worldScale);
  fitBuildingFoundation(ghost,{...placement,kind},field,config);
  if(ghostValid!==ok){
   ghostValid=ok;const tint=new T.Color(ok?'#b8d488':'#ed806b');
   for(const {material,color} of ghostMaterials)if(color)material.color.copy(color).lerp(tint,ok?.12:.55);
  }
  footprint.material.color.set(ok?'#e0f7b7':'#ff9c80');
  const [w,d]=config.buildings[kind].footprintMetres.map(value=>value*config.worldScale/2),c=Math.cos(rotation),s=Math.sin(rotation);
  const position=footprint.geometry.attributes.position;
  for(const [i,[a,b]] of [[-w,-d],[w,-d],[w,d],[-w,d]].entries()){
   const px=x+a*c-b*s,py=y+a*s+b*c;
   position.setXYZ(i,px,py,field.heightAt(px,py)+.8);
  }
  position.needsUpdate=true;
 }
 function commandMarker(point,hostile=false){marker.position.set(point.x,point.y,field.heightAt(point.x,point.y)+.4);marker.material.color.set(hostile?'#f4a081':'#cfb473');marker.visible=true;markerUntil=performance.now()+1000;}
 function update(mission,selected,dt,live=false,showHealth=true){
  const time=mission.state.time,now=performance.now()/1000,shotsThisFrame=mission.drainEffects();
  if(time<lastWorldTime){groundEffects.reset();shotTimes.clear();combat.reset();damage.reset();dustTime=0;particles.length=0;}
  for(const event of shotsThisFrame)if(event.type==='shot')shotTimes.set(event.from,now);
  for(const [id,when] of shotTimes)if(now-when>.75)shotTimes.delete(id);
  fog.update(mission);
  frameAverage=frameAverage*.93+Math.min(dt,.65)*.07;
  if(!fixedRenderScale){
   const ratio=renderer.getPixelRatio(),elapsed=now-lastScaleAt;
   const floor=software?.56:.67;
   let next=ratio;
   if(elapsed>2.5&&frameAverage>(software?.064:.042)&&ratio>floor){
    next=Math.max(floor,ratio*.86);
   }else if(elapsed>7&&frameAverage<(software?.038:.025)&&ratio<renderScaleCeiling()){
    next=Math.min(renderScaleCeiling(),ratio+.06);
   }
   if(next!==ratio){renderer.setPixelRatio(next);lastScaleAt=now;}
  }
  const distance=camera.position.distanceTo(controls.target),pan=distance*dt*.7;let dx=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),dy=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);if(dx||dy){const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.z=0;right.normalize();const forward=new T.Vector3(-right.y,right.x,0);const offset=right.multiplyScalar(dx*pan).addScaledVector(forward,dy*pan);camera.position.add(offset);controls.target.add(offset);}
  controls.target.x=T.MathUtils.clamp(controls.target.x,-field.half,field.half);controls.target.y=T.MathUtils.clamp(controls.target.y,-field.half,field.half);controls.update();camera.position.z=Math.max(camera.position.z,field.heightAt(camera.position.x,camera.position.y)+minimumCameraHeight);
  sky.update(camera,false);
  if(baseYard.update(mission,time+(live?mission.accumulator:0)))renderer.shadowMap.needsUpdate=true;
  if(dam.update(mission,camera,time+(live?mission.accumulator:0),live))renderer.shadowMap.needsUpdate=true;
  storySignals.update(mission,camera,now);
  rallyFlags.update(mission,selected,camera);
  const threshold=software?145:800;
  const mode=distance>(terrainMode==='close'?threshold+22:threshold-22)?'overview':'close';
  if(mode!==terrainMode){terrain.setViewMode(mode);terrainMode=mode;}
  damage.begin(camera,dt);
  vehicles.update(mission,distance,shotTimes,now,camera);
  construction.update(vehicles.workBeams,time);
  const texel=800/sun.shadow.mapSize.x,shadowX=controls.target.dot(lightRight),shadowY=controls.target.dot(lightUp);
  stableTarget.copy(controls.target).addScaledVector(lightRight,Math.round(shadowX/texel)*texel-shadowX).addScaledVector(lightUp,Math.round(shadowY/texel)*texel-shadowY);
  const targetMoved=shadowCentre.distanceToSquared(stableTarget)>.03;
  if(targetMoved||vehicles.lod!==lastShadowLod){
   shadowCentre.copy(stableTarget);sun.position.copy(stableTarget).add(lightOffset);sun.target.position.copy(stableTarget);
   lastShadowLod=vehicles.lod;renderer.shadowMap.needsUpdate=true;
  }
  shadowCasters.begin();
  const visibleIds=new Set(vehicles.visible.map(unit=>unit.id));
  const phase=Math.max(0,Math.min(1,mission.accumulator/config.simulationStep));
  const blend=(previous,next)=>T.MathUtils.lerp(previous??next??0,next??0,phase);
  for(const unit of mission.state.units){
   if(!visibleIds.has(unit.id)&&!unit.damage?.wreck)continue;
   const transform=vehicles.transforms.get(unit.id);
   if(!transform)continue;
   const {position,heading}=transform,aim=unit.aimTarget;
   const shotAge=now-(shotTimes.get(unit.id)??-Infinity);
   const recoil=unit.kind==='bukhanka'||unit.kind==='raider'?mgRecoil(shotAge):shotAge<.065?now:0;
   shadowCasters.watch(unit.id,unit.kind,unit.damage?.wreck,position.x,position.y,position.z,heading,
    blend(unit.previousSteering,unit.steering),blend(unit.previousWheelDistance,unit.wheelDistance),
    unit.projector?.yaw,unit.projector?.pitch,aim?.x,aim?.y,aim?.z,recoil);
  }
  groundEffects.update(dt,vehicles.visible,distance);
  const near=distance<680?vehicles.visible.filter(unit=>unit.owner==='rai'&&unit.kind!=='command').sort((a,b)=>{
   const priority=Number(selected.has(b.id))-Number(selected.has(a.id));
   return priority||Math.hypot(a.x-controls.target.x,a.y-controls.target.y)-Math.hypot(b.x-controls.target.x,b.y-controls.target.y);
  }):[];
  headlightCount=0;
  headlights.forEach(({root,spots},i)=>{
   const pose=vehicles.transforms.get(near[i]?.id);
   setHeadlightPower(spots,config.worldScale,false,!!pose);
   if(pose){root.matrix.copy(pose.matrix).multiply(lightLift);root.matrixWorldNeedsUpdate=true;const unit=mission.entity(near[i].id);spots.forEach((spot,j)=>{if(partMissing(unit?.damage,j+5))spot.intensity=0;else headlightCount++;});}
  });
  const buildingIds=new Set(mission.state.buildings.map(b=>b.id));for(const [id,object] of buildings)if(!buildingIds.has(id)){construction.release(object);damage.releaseBuilding(object);buildingRoot.remove(object);buildings.delete(id);}
  for(const b of mission.state.buildings){let object=buildings.get(b.id);if(object&&(object.userData.kind!==b.kind||object.userData.owner!==b.owner)){construction.release(object);damage.releaseBuilding(object);buildingRoot.remove(object);buildings.delete(b.id);object=null;}if(!object){object=getPrefab(b.kind,b.owner,b.campId,b.scavVariant,b.fenceSpan,b.fenceProfile).clone(true);object.userData.entity=b.id;damage.attachBuilding(object,b);buildingRoot.add(object);buildings.set(b.id,object);}object.visible=(b.hp>0||b.damage?.wreck)&&(b.owner==='rai'||mission.exploredAt(b.x,b.y));if(!object.visible)continue;object.position.set(b.x,b.y,b.groundHeight??field.heightAt(b.x,b.y));object.rotation.z=b.rotation;object.scale.setScalar(config.worldScale);
   fitBuildingFoundation(object,b,field,config);
   if(b.kind==='mg-tower')aimTowerWeapon(object,b,field,config.worldScale,b.aimTarget,now-(shotTimes.get(b.id)??-Infinity));
   if(b.owner==='rai'&&b.hp>0)construction.building(object,b,config.buildings[b.kind]);
   damage.updateBuilding(object,b);
   if(b.kind==='derrick'&&b.completed&&b.hp>0){
    const phase=(b.pumpTime??0)+(b.powered&&mission.state.status==='running'?Math.max(0,mission.accumulator):0);
    if(object.userData.pumpPhase!==phase){updateOilPump(object,phase);object.userData.pumpPhase=phase;}
   }
   const aim=b.aimTarget,recoil=mgRecoil(now-(shotTimes.get(b.id)??-Infinity));
   shadowCasters.watch(b.id,b.kind,b.owner,b.campId,b.x,b.y,object.position.z,b.rotation,b.progress,b.completed,b.clearing,
    object.userData.pumpPhase,aim?.x,aim?.y,aim?.z,recoil);
  }
  let index=0;for(const id of selected){const entity=mission.entity(id);if(!entity||entity.factoryVisit?.phase==='inside'||index>=selectionRings.length)continue;const ring=selectionRings[index++],pose=vehicles.transforms.get(id)?.position,profile=SCAV_PROFILES[entity.kind];ring.visible=true;const radius=entity.path?(profile?.infantry?3:profile?Math.max(8,profile.boxes[0][2]*config.worldScale):8):Math.max(entity.halfWidth,entity.halfDepth)*1.1;placeSelectionRing(ring,field,pose?.x??entity.x,pose?.y??entity.y,radius);}for(;index<selectionRings.length;index++)selectionRings[index].visible=false;
  for(const event of shotsThisFrame){
   if(event.type==='explosion'){
    if(event.owner==='rai'||mission.visibleAt(event.to.x,event.to.y))combat.explode(new T.Vector3(event.to.x,event.to.y,event.to.z),event.radius,now,camera);
    continue;
   }
   const from=mission.entity(event.from);
   const end=new T.Vector3(event.to.x,event.to.y,event.to.z);
   if(!from||from.owner!=='rai'&&!mission.visibleAt(from.x,from.y)){
    if(mission.visibleAt(end.x,end.y))combat.hit(end,event,now,camera);
    continue;
   }
   const building=buildings.get(from.id);
   const aimed=building&&aimTowerWeapon(building,from,field,config.worldScale,event.to,0);
   const mount=aimed??building?.getObjectByName('muzzle');
   const start=vehicles.muzzles.get(from.id)??(mount?mount.getWorldPosition(new T.Vector3()):new T.Vector3(from.x,from.y,(from.groundHeight??field.heightAt(from.x,from.y))+(from.kind==='mg-tower'?10.8:1.5)*config.worldScale));
   combat.spawn(start,end,event.weapon,now,camera,event);
   if(aimed&&from.aimTarget!==event.to)aimTowerWeapon(building,from,field,config.worldScale);
  }
  combat.updateBurning(mission,vehicles.transforms);
  combat.update(now,camera,renderer.domElement.height,(shot,start=shot.start)=>{
   const target=mission.entity(shot.targetId);
   if(!target||target.owner!=='rai'&&!mission.visibleAt(target.x,target.y))return null;
   const p=combatContact(start,target,config,field);
   return new T.Vector3(p.x,p.y,p.z);
  },id=>{
   if(visibleIds.has(id))return vehicles.muzzles.get(id);
   const attacker=mission.state.buildings.find(building=>building.id===id&&building.hp>0);
   if(!attacker||attacker.owner!=='rai'&&!mission.visibleAt(attacker.x,attacker.y))return null;
   return buildings.get(id)?.getObjectByName('muzzle')?.getWorldPosition(new T.Vector3());
  });
  combat.updateGrenades(mission.state.projectiles??[],time,(x,y)=>mission.visibleAt(x,y));
  for(const oil of oilMarkers)oil.root.visible=mission.exploredAt(oil.x,oil.y)&&!mission.state.buildings.some(b=>b.kind==='derrick'&&b.hp>0&&Math.hypot(b.x-oil.x,b.y-oil.y)<5);
  const knownArtifacts=mission.state.artifacts.filter(a=>!a.collected&&mission.exploredAt(a.x,a.y));
  const artifactIds=new Set(knownArtifacts.map(a=>a.id));
  for(const [id,{root}] of artifactObjects)if(!artifactIds.has(id)){
   scene.remove(root);artifactObjects.delete(id);
   const materials=new Set();
   for(const mesh of root.children){mesh.geometry.dispose();materials.add(mesh.material);}
   for(const material of materials)material.dispose();
  }
  for(const artifact of knownArtifacts){
   let model=artifactObjects.get(artifact.id);
   if(!model){
    const root=createFieldArtifact(T,artifact.key);
    root.position.set(artifact.x,artifact.y,field.heightAt(artifact.x,artifact.y));
    model={root,beacon:root.getObjectByName('salvage_beacon')};
    scene.add(root);artifactObjects.set(artifact.id,model);
   }
   model.beacon.rotation.z=time*.8;
   shadowCasters.watch(artifact.id,artifact.x,artifact.y,artifact.key);
  }
  if(time-dustTime>.16){dustTime=time;for(const unit of mission.state.units){if(unit.hp<=0||isInfantry(unit)||unit.owner!=='rai'&&!mission.visibleAt(unit.x,unit.y)||Math.hypot(unit.x-unit.previousX,unit.y-unit.previousY)<.15)continue;particles.push({x:unit.x+Math.sin(unit.heading)*9,y:unit.y-Math.cos(unit.heading)*9,z:field.heightAt(unit.x,unit.y)+1,born:time});}}while(particles.length>256)particles.shift();for(let i=particles.length-1;i>=0;i--)if(time-particles[i].born>2.5)particles.splice(i,1);particles.forEach((p,i)=>dustPositions.set([p.x+(time-p.born)*1.8,p.y,p.z+(time-p.born)*1.2],i*3));dustGeometry.attributes.position.needsUpdate=true;dustGeometry.setDrawRange(0,particles.length);marker.visible=performance.now()<markerUntil;
  if(factoryEffects.update(mission,buildings,time,dt))renderer.shadowMap.needsUpdate=true;
  let engine=0,rolling=0,slip=0,road=0;
  for(const unit of vehicles.visible){
   const distance=Math.hypot(unit.x-controls.target.x,unit.y-controls.target.y),volume=Math.max(0,1-distance/380);
   if(isInfantry(unit))continue;
   const speed=unit.speed/30;
   engine=Math.max(engine,volume*(.26+.74*speed));
   rolling=Math.max(rolling,volume*speed);
   const slope=field.gradientAt(unit.x,unit.y);
   slip=Math.max(slip,volume*speed*Math.min(1,Math.abs(unit.steering??0)*.65+Math.hypot(slope.x,slope.y)*1.7));
   if(terrain.field.roadBlendAt)road=Math.max(road,terrain.field.roadBlendAt(unit.x,unit.y)*volume);
  }
  const projection=vehicles.workBeams.reduce((level,{from})=>{
   const distance=Math.hypot(from.x-controls.target.x,from.y-controls.target.y);
   return level+.55*Math.max(0,1-distance/360);
  },0);
  sound?.update({field:live,engine:Math.min(1,engine),rolling:Math.min(1,rolling),slip:Math.min(1,slip),road:Math.min(1,road),welding:Math.min(1,projection+factoryEffects.soundLevel)});
  damage.end();
  for(const group of damageCasters)if(group.visible)for(const model of group.children){
   if(!model.visible)continue;
   const {position,quaternion}=model;
   shadowCasters.watch(model.id,position.x,position.y,position.z,quaternion.x,quaternion.y,quaternion.z,quaternion.w);
  }
  const {textureRows}=damage.statistics;
  if(textureRows!==lastDamageRows){lastDamageRows=textureRows;renderer.shadowMap.needsUpdate=true;}
  if(shadowCasters.end()||time<lastWorldTime)renderer.shadowMap.needsUpdate=true;
  if(renderer.shadowMap.needsUpdate)shadowUpdates++;
  const viewport=renderer.domElement.getBoundingClientRect();
  healthBars.update(mission,selected,camera,viewport.width,viewport.height,showHealth);
  renderer.render(scene,camera);
  lastWorldTime=time;
 }
 return{renderer,scene,camera,controls,terrain,field,vehicles,damage,ground,pickEntity,screen,centre,focusStorySignal,setGhost,commandMarker,buildingCards,drawMinimapFog:fog.drawMinimap,storySignals,update,keys,buildingObjects:buildings,set minimumCameraHeight(value){minimumCameraHeight=value;},set fixedRenderScale(value){fixedRenderScale=value;},get fixedRenderScale(){return fixedRenderScale;},get statistics(){return{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,vehicleDrawCalls:vehicles.drawCalls,vehicleLod:vehicles.lod,dustParticles:particles.length,dustLimit:256,...combat.statistics,...groundEffects.statistics,headlightBeams:headlightCount,projectors:construction.active,frameMs:frameAverage*1000,renderScale:renderer.getPixelRatio(),terrainMode,shadowUpdates,damage:damage.statistics};}};
}
