import {buildLayerHeight} from './builder-optics.js';

export function createConstructionEffects(T,scene,scale) {
  const states=new WeakMap(),limit=48;
  const coneGeometry=new T.BufferGeometry(),lineGeometry=new T.BufferGeometry(),grainGeometry=new T.BufferGeometry();
  const conePosition=new T.Float32BufferAttribute(new Float32Array(limit*18),3).setUsage(T.DynamicDrawUsage);
  const coneUv=new T.Float32BufferAttribute(new Float32Array(limit*12),2);
  const linePosition=new T.Float32BufferAttribute(new Float32Array(limit*6),3).setUsage(T.DynamicDrawUsage);
  const grainsPerBeam=18;
  const grainPosition=new T.Float32BufferAttribute(new Float32Array(limit*grainsPerBeam*3),3).setUsage(T.DynamicDrawUsage);
  for(let i=0;i<limit;i++)for(let side=0;side<2;side++){
    const vertex=i*6+side*3;
    coneUv.setXY(vertex,.5,0);coneUv.setXY(vertex+1,0,1);coneUv.setXY(vertex+2,1,1);
  }
  coneGeometry.setAttribute('uv',coneUv);
  coneGeometry.setAttribute('position',conePosition);lineGeometry.setAttribute('position',linePosition);grainGeometry.setAttribute('position',grainPosition);
  for(const geometry of [coneGeometry,lineGeometry,grainGeometry])geometry.setDrawRange(0,0);
  const cone=new T.Mesh(coneGeometry,new T.ShaderMaterial({
    uniforms:{beamTime:{value:0}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,forceSinglePass:true,
    vertexShader:`
      varying vec2 beamUV;
      void main(){beamUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform float beamTime;
      varying vec2 beamUV;
      void main(){
        float edge=1.-abs(beamUV.x*2.-1.)/max(.001,beamUV.y);
        float pulse=.92+.08*sin(beamUV.y*22.-beamTime*8.);
        float alpha=pow(max(edge,0.),1.4)*(.29+.19*beamUV.y)*pulse;
        vec3 light=mix(vec3(.13,.55,.74),vec3(.70,.98,1.),max(edge,0.));
        gl_FragColor=vec4(light,alpha);
        #include <colorspace_fragment>
      }
    `
  }));
  const line=new T.LineSegments(lineGeometry,new T.LineBasicMaterial({color:'#daffff',opacity:.32,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  const grains=new T.Points(grainGeometry,new T.PointsMaterial({color:'#93def5',size:.15*scale,opacity:.52,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  cone.name='construction_projection';line.name='construction_ray';grains.name='rising_construction_grains';
  for(const object of [cone,line,grains]){object.frustumCulled=false;scene.add(object);}
  let count=0;

  function release(object){
    const previous=states.get(object);
    if(!previous)return;
    for(const {mesh,original} of previous.materials){mesh.material.dispose();mesh.material=original;}
    states.delete(object);
  }

  function building(object,entity,spec){
    const base=object.getObjectByName('building_foundation'),body=object.getObjectByName('building_structure');
    base.visible=!entity.clearing;
    body.visible=!entity.clearing&&(entity.completed||entity.progress>0);
    if(entity.completed){release(object);return;}
    if(!body.visible)return;
    let state=states.get(object);
    if(!state){
      const plane=new T.Plane(new T.Vector3(0,0,-1),entity.groundHeight),materials=[];
      const layer={value:plane.constant},intensity={value:0};
      body.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const original=mesh.material,clipped=original.clone();
        clipped.clippingPlanes=[plane];clipped.clipShadows=true;
        clipped.onBeforeCompile=shader=>{
          shader.uniforms.buildLayer=layer;shader.uniforms.buildLight=intensity;
          shader.vertexShader='varying float vConstructionHeight;\n'+shader.vertexShader.replace(
            '#include <worldpos_vertex>','#include <worldpos_vertex>\nvConstructionHeight=(modelMatrix*vec4(transformed,1.)).z;');
          shader.fragmentShader='uniform float buildLayer;uniform float buildLight;varying float vConstructionHeight;\n'+shader.fragmentShader.replace(
            '#include <tonemapping_fragment>',`
              float layerLight=exp(-max(0.,buildLayer-vConstructionHeight)*1.4)*buildLight;
              gl_FragColor.rgb+=vec3(.12,.61,.88)*layerLight;
              #include <tonemapping_fragment>
            `);
        };
        mesh.material=clipped;
        materials.push({mesh,original});
      });
      state={plane,materials,layer,intensity};states.set(object,state);
    }
    state.layer.value=state.plane.constant=buildLayerHeight(entity,spec,scale);
    state.intensity.value=activeTargets.has(entity.id)?1.2:.12;
  }

  const activeTargets=new Set();
  function update(beams,time){
    count=Math.min(beams.length,limit);
    cone.material.uniforms.beamTime.value=time;
    activeTargets.clear();
    let point=0;
    for(let i=0;i<count;i++){
      const {from,to,mode,targetId}=beams[i],dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
      const span=Math.max(.01,Math.hypot(dx,dy)),length=Math.hypot(span,dz);
      const rx=-dy/span,ry=dx/span,width=(mode==='build'?1.55:.34)*scale,wiggle=Math.sin(time*3.4+i*1.7)*width*.32;
      const tx=to.x+rx*wiggle,ty=to.y+ry*wiggle;
      const vx=-ry*dz/length,vy=rx*dz/length,vz=span/length;
      const tip=to.z+.12,vertex=i*6;
      conePosition.setXYZ(vertex,from.x,from.y,from.z);
      conePosition.setXYZ(vertex+1,tx-rx*width,ty-ry*width,tip);
      conePosition.setXYZ(vertex+2,tx+rx*width,ty+ry*width,tip);
      conePosition.setXYZ(vertex+3,from.x,from.y,from.z);
      conePosition.setXYZ(vertex+4,tx-vx*width,ty-vy*width,tip-vz*width);
      conePosition.setXYZ(vertex+5,tx+vx*width,ty+vy*width,tip+vz*width);
      linePosition.setXYZ(i*2,from.x,from.y,from.z);
      linePosition.setXYZ(i*2+1,tx,ty,to.z+.10);
      if(mode==='build')activeTargets.add(targetId);
      for(let j=0;j<grainsPerBeam;j++){
        const phase=(time*1.6+j/grainsPerBeam)%1,t=j*2.399+time*.3,r=phase*width*1.25;
        grainPosition.setXYZ(point++,tx+Math.sin(t)*r,ty+Math.cos(t)*r,to.z+Math.sin(Math.PI*phase)*scale*.72);
      }
    }
    coneGeometry.setDrawRange(0,count*6);lineGeometry.setDrawRange(0,count*2);grainGeometry.setDrawRange(0,point);
    if(count){conePosition.needsUpdate=true;linePosition.needsUpdate=true;grainPosition.needsUpdate=true;}
  }
  return{building,release,update,get active(){return count;}};
}
