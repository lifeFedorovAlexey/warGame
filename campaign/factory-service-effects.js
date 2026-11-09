import {createFactoryGateSignals} from './factory-gate-signals.js';

export function createFactoryShutter(T,depth,partId,parts,rear=false){
 const root=new T.Group();root.name=rear?'factory_exit_shutter':'factory_shutter';root.position.set(0,(rear?1:-1)*(depth*.79/2+.13),.35);root.rotation.z=rear?Math.PI:0;
 root.userData.damageDynamic=true;
 const metal=new T.MeshStandardMaterial({color:'#3e443e',metalness:.6,roughness:.72});metal.name='factory_shutter_metal';
 const panel=new T.Mesh(new T.BoxGeometry(5.86,.12,3.48),metal);panel.position.z=1.74;panel.castShadow=panel.receiveShadow=true;root.add(panel);
 for(let j=0;j<8;j++){const slat=new T.Mesh(new T.BoxGeometry(5.82,.045,.045),metal);slat.position.set(0,-.075,.25+j*.4);root.add(slat);}
 root.traverse(n=>{if(n.isMesh){n.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(n.geometry.attributes.position.count).fill(partId),1));n.userData.damageParts=parts;}});
 return root;
}
function poseShutter(shutter,open){shutter.position.z=.35+3.48*open;shutter.scale.z=1-open*.97;}
export function factoryShutterDamagePose(T,root,bindings){
 const shutter=root.getObjectByName('factory_shutter'),exit=root.getObjectByName('factory_exit_shutter');if(!shutter)return undefined;
 const moving=bindings.filter(b=>b.dynamic),inverses=new Map(moving.map(b=>[b,b.bind.clone().invert()])),matrices=new Map(moving.map(b=>[b,new T.Matrix4()]));
 return factory=>{poseShutter(shutter,factory.garageDoorOpen??0);if(exit)poseShutter(exit,factory.garageExitOpen??0);root.updateMatrixWorld(true);for(const b of moving)matrices.get(b).multiplyMatrices(b.node.matrixWorld,inverses.get(b));return matrices;};
}
export function createFactoryServiceEffects(T,scene,scale){
 const gateSignals=createFactoryGateSignals(T,scene,scale);
 const states=new Map(),canvas=document.createElement('canvas');canvas.width=canvas.height=64;
 const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,2,32,32,30);g.addColorStop(0,'#ffffffcc');g.addColorStop(.45,'#ffffff77');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
 const smokeMap=new T.CanvasTexture(canvas),sparkGeo=new T.BufferGeometry(),positions=new T.Float32BufferAttribute(new Float32Array(16*12*3),3).setUsage(T.DynamicDrawUsage);
 sparkGeo.setAttribute('position',positions);sparkGeo.setDrawRange(0,0);
 const sparks=new T.Points(sparkGeo,new T.PointsMaterial({color:'#ffe1a0',size:.09*scale,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));sparks.frustumCulled=false;sparks.name='factory_welding_sparks';scene.add(sparks);
 let count=0,level=0;
 function update(mission,buildings,time,dt){
  gateSignals.begin(mission.state.buildings.reduce((n,f)=>n+Number(f.kind==='factory'),0));
  let points=0,doorChanged=false;count=level=0;const live=new Set();
  for(const f of mission.state.buildings){
   if(f.kind!=='factory')continue;const object=buildings.get(f.id);if(!object)continue;live.add(f.id);
   const working=f.hp>0&&f.completed&&!!f.activeRepair,shutter=object.getObjectByName('factory_shutter');
   const gate=mission.state.units.find(u=>u.id===f.garageGate&&u.factoryVisit?.factoryId===f.id),opening=working||gate&&['gate','entering'].includes(gate.factoryVisit.phase);
   const departure=mission.state.units.find(u=>u.id===f.garageExit&&u.factoryVisit?.factoryId===f.id),exit=object.getObjectByName('factory_exit_shutter'),exitOpening=departure&&['leaving','departure'].includes(departure.factoryVisit.phase)||f.queue[0]?.progress>=.98;
   if(f.owner==='rai'||mission.visibleAt(f.x,f.y))gateSignals.add(f,object,gate,mission.config.buildings.factory.realSizeMetres[1],departure);
   if(exit){const target=exitOpening?1:0,old=f.garageExitOpen??0,open=old+Math.sign(target-old)*Math.min(Math.abs(target-old),dt*1.8);doorChanged||=old!==open;f.garageExitOpen=open;poseShutter(exit,open);}
   if(shutter){const target=opening?1:0,old=f.garageDoorOpen??0,open=old+Math.sign(target-old)*Math.min(Math.abs(target-old),dt*1.8);doorChanged||=old!==open;f.garageDoorOpen=open;poseShutter(shutter,open);}
   let state=states.get(f.id);
   if(!state&&working&&states.size<16){
    const root=new T.Group();root.name='factory_service_'+f.id;
    const light=new T.PointLight('#91dfff',0,scale*11,1.6);light.position.set(0,-7.9*scale,1.7*scale);root.add(light);
    const glow=new T.Sprite(new T.SpriteMaterial({map:smokeMap,color:'#8ce4ff',transparent:true,depthWrite:false,blending:T.AdditiveBlending}));glow.position.copy(light.position);glow.position.y-=.5*scale;glow.scale.setScalar(1.05*scale);root.add(glow);
    const smoke=Array.from({length:5},()=>{const puff=new T.Sprite(new T.SpriteMaterial({map:smokeMap,color:'#858b85',transparent:true,opacity:0,depthWrite:false}));root.add(puff);return puff;});
    scene.add(root);state={root,light,glow,smoke,last:-Infinity};states.set(f.id,state);
   }
   if(!state)continue;
   const {root,light,glow,smoke}=state;root.position.set(f.x,f.y,object.position.z);root.rotation.z=f.rotation??0;
   if(working)state.last=time;const fade=Math.max(0,1-(time-state.last)/2);
   root.visible=f.hp>0&&fade>0&&(f.owner==='rai'||mission.visibleAt(f.x,f.y));
   if(!root.visible){scene.remove(root);root.traverse(n=>{if(n.isSprite)n.material.dispose();});states.delete(f.id);continue;}
   const flicker=working?(.5+.5*Math.sin(time*47)*Math.sin(time*71)):0;
   light.intensity=flicker*20;glow.material.opacity=flicker*.8;
   smoke.forEach((puff,i)=>{const phase=(time*.3+i/5)%1;puff.position.set(Math.sin(i*7+time*.3)*(.2+phase*.7)*scale,(-8.2-phase*1.2)*scale,(1.7+phase*3.4)*scale);puff.scale.setScalar((.45+phase*1.8)*scale);puff.material.opacity=Math.sin(phase*Math.PI)*.26*fade;});
   if(!working)continue;count++;level+=.3;
   for(let i=0;i<12&&points<192;i++){
    const phase=(time*1.8+i/12)%1,angle=i*2.399;
    const p=new T.Vector3(Math.sin(angle)*phase*.9*scale,(-8.4-phase*1.3)*scale,(1.7+Math.sin(phase*Math.PI)*.6-phase)*scale).applyAxisAngle(new T.Vector3(0,0,1),f.rotation??0).add(root.position);
    positions.setXYZ(points++,p.x,p.y,p.z);
   }
  }
  for(const [id,state] of states)if(!live.has(id)){scene.remove(state.root);state.root.traverse(n=>{if(n.isSprite)n.material.dispose();});states.delete(id);}
  sparkGeo.setDrawRange(0,points);if(points)positions.needsUpdate=true;
  gateSignals.end();
  return doorChanged;
 }
 return {update,get active(){return count;},get soundLevel(){return Math.min(1,level);}};
}
