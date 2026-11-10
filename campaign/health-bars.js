import {buildLayerHeight} from './builder-optics.js';
import {SCAV_PROFILES} from './scav-unit-profiles.js';
const poseComponents=[8,9,10,12,13,14];

// Render health in the same WebGL frame as the map. A separate DOM canvas can
// be composited against an older map frame while the camera is moving.
export function createHealthBars(T,scene,field,config,transforms,buildings){
 const geometry=new T.InstancedBufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,1,0,1,0,0,1,1,0],3));
 let capacity=0,rects,values,previousEnabled=null,lastCount=-1;
 const cameraElements=new Float64Array(16),projectionElements=new Float64Array(16),inputs=new WeakMap();
 let lastWidth=0,lastHeight=0,lastRelevant=-1;
 const candidates=[],candidateOrder=[];
 const viewport=new T.Vector2(),point=new T.Vector3(),ground=new T.Vector3();
 const material=new T.RawShaderMaterial({
  uniforms:{viewport:{value:viewport}},depthTest:false,depthWrite:false,transparent:true,toneMapped:false,side:T.DoubleSide,
  vertexShader:`precision highp float;
   uniform vec2 viewport;
   attribute vec3 position;
   attribute vec4 barRect;
   attribute vec4 barValues;
   varying vec2 pixel;
   varying vec4 rect;
   varying vec4 state;
   void main(){
    rect=barRect;state=barValues;
    pixel=position.xy*vec2(rect.z,rect.w+4.0);
    vec2 screen=rect.xy+pixel;
    gl_Position=vec4(screen.x/viewport.x*2.0-1.0,1.0-screen.y/viewport.y*2.0,0.0,1.0);
   }`,
  fragmentShader:`precision highp float;
   varying vec2 pixel;
   varying vec4 rect;
   varying vec4 state;
   void main(){
    float w=rect.z,h=rect.w,inside=w-2.0;
    vec3 color=vec3(21.0,26.0,22.0)/255.0;
    if(pixel.y>=h){
     if(state.z>0.5&&pixel.y<h+1.0)color=vec3(233.0,133.0,106.0)/255.0;
     else if(state.w>=0.0&&pixel.y>=h+2.0&&pixel.x<w*state.w)color=vec3(212.0,189.0,136.0)/255.0;
     else discard;
    }else if(pixel.x>=1.0&&pixel.x<w-1.0&&pixel.y>=1.0&&pixel.y<h-1.0){
     color=vec3(70.0,55.0,44.0)/255.0;
     if(pixel.x<1.0+max(1.0,inside*state.x))color=(state.x>.58?vec3(156.0,221.0,105.0):state.x>.28?vec3(241.0,204.0,88.0):vec3(237.0,106.0,77.0))/255.0;
     float stepHp=inside*100.0/state.y>=2.3?50.0:100.0;
     float hp=floor((pixel.x-1.0)/inside*state.y/stepHp+.5)*stepHp;
     float marker=floor(inside*hp/state.y+.5)+1.0;
     bool major=mod(hp,100.0)<.1;
     if(hp>0.0&&hp<state.y&&pixel.x>=marker&&pixel.x<marker+(major?1.25:1.0)&&pixel.y>=(major?1.0:3.0)&&pixel.y<h-1.0)
      color=mix(color,(major?vec3(22.0,27.0,22.0):vec3(29.0,36.0,29.0))/255.0,major?.91:.6);
    }
    gl_FragColor=vec4(color,1.0);
   }`,
 });
 const root=new T.Mesh(geometry,material);root.name='unit_health_bars';root.frustumCulled=false;root.renderOrder=10000;root.visible=false;scene.add(root);
 function update(mission,selected,camera,width,height,enabled=true){
  const units=mission.state.units,structures=mission.state.buildings,total=units.length+structures.length;
  let changed=enabled!==previousEnabled||total!==lastCount||width!==lastWidth||height!==lastHeight;
  previousEnabled=enabled;lastCount=total;lastWidth=width;lastHeight=height;
  for(let i=0;i<16;i++){
   if(cameraElements[i]!==camera.matrixWorldInverse.elements[i]||projectionElements[i]!==camera.projectionMatrix.elements[i])changed=true;
   cameraElements[i]=camera.matrixWorldInverse.elements[i];projectionElements[i]=camera.projectionMatrix.elements[i];
  }
  candidates.length=0;
  if(enabled)for(let i=0;i<total;i++){
   const e=i<units.length?units[i]:structures[i-units.length],chosen=selected.has(e.id);
   if(e.hp<=0||e.hp===e.maxHp&&!chosen&&e.completed!==false||config.buildings[e.kind]?.storyOnly||e.factoryVisit?.phase==='inside')continue;
   const visible=e.owner==='rai'||mission.visibleAt(e.x,e.y);if(!visible)continue;
   const pose=transforms.get(e.id);if(config.units[e.kind]&&!pose)continue;
   if(candidateOrder[candidates.length]!==e)changed=true;
   candidateOrder[candidates.length]=e;candidates.push(e);const m=pose?.matrix.elements;
   let saved=inputs.get(e);if(!saved){saved={};inputs.set(e,saved);changed=true;}
   const inside=false;
   if(saved.kind!==e.kind||saved.owner!==e.owner||saved.hp!==e.hp||saved.maxHp!==e.maxHp||saved.chosen!==chosen||saved.visible!==visible||saved.inside!==inside||saved.progress!==e.progress||saved.completed!==e.completed||saved.x!==e.x||saved.y!==e.y||saved.z!==e.groundHeight)changed=true;
   saved.kind=e.kind;saved.owner=e.owner;saved.hp=e.hp;saved.maxHp=e.maxHp;saved.chosen=chosen;saved.visible=visible;saved.inside=inside;saved.progress=e.progress;saved.completed=e.completed;saved.x=e.x;saved.y=e.y;saved.z=e.groundHeight;
   for(const j of poseComponents){if(saved[j]!==m?.[j])changed=true;saved[j]=m?.[j];}
  }
  if(candidates.length!==lastRelevant)changed=true;lastRelevant=candidates.length;candidateOrder.length=lastRelevant;
  if(!changed)return;
  if(total>capacity){
   if(capacity)geometry.dispose();
   capacity=Math.max(64,2**Math.ceil(Math.log2(total)));
   rects=new T.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(T.DynamicDrawUsage);
   values=new T.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(T.DynamicDrawUsage);
   geometry.setAttribute('barRect',rects);geometry.setAttribute('barValues',values);
  }
  viewport.set(width,height);let count=0;
  let rectChanged=false,valueChanged=false;
  if(enabled)for(const entity of candidates){
   const spec=config.buildings[entity.kind],unit=config.units[entity.kind];
   if(entity.factoryVisit?.phase==='inside'||spec?.storyOnly||entity.hp<=0||entity.owner!=='rai'&&!mission.visibleAt(entity.x,entity.y))continue;
   if(entity.hp===entity.maxHp&&!selected.has(entity.id)&&entity.completed!==false)continue;
   const pose=unit&&transforms.get(entity.id);
   if(unit&&!pose)continue;
   if(unit){
    point.set(0,0,SCAV_PROFILES[entity.kind]?.height??(entity.kind==='builder'?3.65:3.2)).applyMatrix4(pose.matrix);
    ground.copy(pose.position);
   }else{
    const base=buildings.get(entity.id)?.position.z??entity.groundHeight??field.heightAt(entity.x,entity.y);
    ground.set(entity.x,entity.y,base);
    point.copy(ground);point.z=entity.completed===false&&spec?buildLayerHeight(entity,spec,config.worldScale):base+(spec?.realSizeMetres?.[2]??4)*config.worldScale;
   }
   point.project(camera);ground.project(camera);
   const x=(point.x+1)*width/2,y=(1-point.y)*height/2;
   const visibleHeight=Math.hypot((point.x-ground.x)*width/2,(point.y-ground.y)*height/2);
   if(point.z<=-1||point.z>=1||visibleHeight<6||x<0||x>width||y<45||y>height)continue;
   const w=Math.round(Math.max(27,Math.min(53,visibleHeight*1.75))),h=visibleHeight>16?7:6;
   const rx=Math.round(x-w/2),ry=Math.round(y-h-3),ratio=Math.fround(Math.max(0,Math.min(1,entity.hp/entity.maxHp))),hostile=Number(entity.owner!=='rai'),progress=entity.completed===false?Math.fround(entity.progress):-1;
   if(rects.getX(count)!==rx||rects.getY(count)!==ry||rects.getZ(count)!==w||rects.getW(count)!==h){rects.setXYZW(count,rx,ry,w,h);rectChanged=true;}
   if(values.getX(count)!==ratio||values.getY(count)!==entity.maxHp||values.getZ(count)!==hostile||values.getW(count)!==progress){values.setXYZW(count,ratio,entity.maxHp,hostile,progress);valueChanged=true;}
   count++;
  }
  geometry.instanceCount=count;root.visible=count>0;
  if(count){if(rectChanged)rects.needsUpdate=true;if(valueChanged)values.needsUpdate=true;}
 }
 return {update,root};
}
