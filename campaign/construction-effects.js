import {buildLayerHeight} from './builder-optics.js';

export function createConstructionEffects(T,scene,scale) {
  const states=new WeakMap(),limit=48;
  const beamGeometry=new T.BufferGeometry(),grainGeometry=new T.BufferGeometry();
  const verticesPerBeam=12,grainsPerBeam=12,contactLimit=4;
  const beamPosition=new T.Float32BufferAttribute(new Float32Array(limit*verticesPerBeam*3),3).setUsage(T.DynamicDrawUsage);
  const beamUv=new T.Float32BufferAttribute(new Float32Array(limit*verticesPerBeam*2),2);
  const grainPosition=new T.Float32BufferAttribute(new Float32Array(limit*grainsPerBeam*3),3).setUsage(T.DynamicDrawUsage);
  const ribbonUv=[[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]];
  for(let i=0;i<limit;i++)for(let side=0;side<2;side++){
    const vertex=i*verticesPerBeam+side*6;
    ribbonUv.forEach(([x,y],index)=>beamUv.setXY(vertex+index,x,y));
  }
  beamGeometry.setAttribute('uv',beamUv);
  beamGeometry.setAttribute('position',beamPosition);grainGeometry.setAttribute('position',grainPosition);
  beamGeometry.setDrawRange(0,0);grainGeometry.setDrawRange(0,0);
  const beam=new T.Mesh(beamGeometry,new T.ShaderMaterial({
    uniforms:{beamTime:{value:0}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,forceSinglePass:true,
    vertexShader:`
      varying vec2 beamUV;
      void main(){beamUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform float beamTime;
      varying vec2 beamUV;
      void main(){
        float center=max(0.,1.-abs(beamUV.x*2.-1.));
        float core=pow(center,5.);
        float pulse=.84+.16*sin(beamUV.y*32.-beamTime*11.);
        float alpha=(pow(center,1.8)*.18+core*.58)*pulse;
        vec3 light=mix(vec3(.02,.32,.60),vec3(.08,.78,1.),core);
        gl_FragColor=vec4(light,alpha);
        #include <colorspace_fragment>
      }
    `
  }));
  const grains=new T.Points(grainGeometry,new T.PointsMaterial({color:'#8edff6',size:.10*scale,opacity:.65,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  beam.name='construction_projection';grains.name='rising_construction_grains';
  for(const object of [beam,grains]){object.frustumCulled=false;scene.add(object);}
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
      const layer={value:plane.constant},contacts={value:Array.from({length:contactLimit},()=>new T.Vector3())},contactCount={value:0};
      body.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const original=mesh.material,clipped=original.clone();
        clipped.clippingPlanes=[plane];clipped.clipShadows=true;
        clipped.onBeforeCompile=shader=>{
          original.onBeforeCompile(shader);
          shader.uniforms.buildLayer=layer;shader.uniforms.buildContacts=contacts;shader.uniforms.buildContactCount=contactCount;
          shader.vertexShader='varying vec3 vConstructionPosition;\n'+shader.vertexShader.replace(
            '#include <worldpos_vertex>','#include <worldpos_vertex>\nvConstructionPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
          shader.fragmentShader=('uniform float buildLayer;uniform vec3 buildContacts['+contactLimit+'];uniform int buildContactCount;varying vec3 vConstructionPosition;\n')+shader.fragmentShader.replace(
            '#include <tonemapping_fragment>',`
              float belowLayer=max(0.,buildLayer-vConstructionPosition.z);
              float nearby=0.;
              for(int i=0;i<${contactLimit};i++){
                if(i>=buildContactCount)break;
                float reach=length(buildContacts[i].xy-vConstructionPosition.xy);
                nearby=max(nearby,1.-smoothstep(${(.7*scale).toFixed(3)},${(4.4*scale).toFixed(3)},reach));
              }
              float layerLight=exp(-belowLayer*2.2)*(.18+.78*nearby);
              gl_FragColor.rgb+=vec3(.035,.49,.78)*layerLight;
              #include <tonemapping_fragment>
            `);
        };
        clipped.customProgramCacheKey=()=>original.customProgramCacheKey()+'_construction';
        mesh.material=clipped;
        materials.push({mesh,original});
      });
      state={plane,materials,layer,contacts,contactCount};states.set(object,state);
    }
    state.layer.value=state.plane.constant=buildLayerHeight(entity,spec,scale);
    const points=activeTargets.get(entity.id)??[];
    state.contactCount.value=points.length;
    points.forEach((point,index)=>state.contacts.value[index].copy(point));
  }

  const activeTargets=new Map();
  function ribbon(vertex,from,to,x,y,z,nearWidth,farWidth){
    const sx=x*nearWidth,sy=y*nearWidth,sz=z*nearWidth;
    const ex=x*farWidth,ey=y*farWidth,ez=z*farWidth;
    beamPosition.setXYZ(vertex,from.x-sx,from.y-sy,from.z-sz);
    beamPosition.setXYZ(vertex+1,from.x+sx,from.y+sy,from.z+sz);
    beamPosition.setXYZ(vertex+2,to.x-ex,to.y-ey,to.z-ez);
    beamPosition.setXYZ(vertex+3,from.x+sx,from.y+sy,from.z+sz);
    beamPosition.setXYZ(vertex+4,to.x+ex,to.y+ey,to.z+ez);
    beamPosition.setXYZ(vertex+5,to.x-ex,to.y-ey,to.z-ez);
  }
  // Vehicle links are independent of deduplicated dust and surface scanning.
  // An early return in a target effect must never hide a working builder.
  function projectLinks(beams){
    for(let i=0;i<count;i++){
      const {from,to,mode}=beams[i],dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
      const span=Math.max(.01,Math.hypot(dx,dy)),length=Math.hypot(span,dz);
      const rx=-dy/span,ry=dx/span,width=(mode==='build'?.34:.19)*scale;
      const vx=-ry*dz/length,vy=rx*dz/length,vz=span/length;
      const vertex=i*verticesPerBeam,nearWidth=width*.59;
      ribbon(vertex,from,to,rx,ry,0,nearWidth,width);
      ribbon(vertex+6,from,to,vx,vy,vz,nearWidth,width);
    }
    beamGeometry.setDrawRange(0,count*verticesPerBeam);
    if(count)beamPosition.needsUpdate=true;
  }
  function update(beams,time){
    count=Math.min(beams.length,limit);
    beam.material.uniforms.beamTime.value=time;
    projectLinks(beams);
    activeTargets.clear();
    let point=0;
    for(let i=0;i<count;i++){
      const {to,mode,targetId}=beams[i],width=(mode==='build'?.34:.19)*scale;
      if(mode==='build'){
        if(!activeTargets.has(targetId))activeTargets.set(targetId,[]);
        const points=activeTargets.get(targetId);
        if(points.length<contactLimit)points.push(to);
      }
      for(let j=0;j<grainsPerBeam;j++){
        const phase=(time*1.4+j/grainsPerBeam)%1,t=j*2.399+i+time*.35,r=phase*width*1.8;
        grainPosition.setXYZ(point++,to.x+Math.sin(t)*r,to.y+Math.cos(t)*r,to.z+Math.sin(Math.PI*phase)*scale*.48);
      }
    }
    grainGeometry.setDrawRange(0,point);
    if(point)grainPosition.needsUpdate=true;
  }
  return{building,release,update,get active(){return count;}};
}
