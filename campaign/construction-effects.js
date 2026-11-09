import {buildLayerHeight} from './builder-optics.js';

export function createConstructionEffects(T,scene,scale) {
  const states=new WeakMap(),limit=48;
  const beamGeometry=new T.BufferGeometry(),grainGeometry=new T.BufferGeometry();
  const verticesPerBeam=12,grainsPerBeam=32;
  const beamPosition=new T.Float32BufferAttribute(new Float32Array(limit*verticesPerBeam*3),3).setUsage(T.DynamicDrawUsage);
  const beamUv=new T.Float32BufferAttribute(new Float32Array(limit*verticesPerBeam*2),2);
  const grainPosition=new T.Float32BufferAttribute(new Float32Array(limit*grainsPerBeam*3),3).setUsage(T.DynamicDrawUsage);
  const grainColor=new T.Float32BufferAttribute(new Float32Array(limit*grainsPerBeam*3),3).setUsage(T.DynamicDrawUsage);
  const grainScale=new T.Float32BufferAttribute(new Float32Array(limit*grainsPerBeam),1).setUsage(T.DynamicDrawUsage);
  const grainAlpha=new T.Float32BufferAttribute(new Float32Array(limit*grainsPerBeam),1).setUsage(T.DynamicDrawUsage);
  const ribbonUv=[[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]];
  for(let i=0;i<limit;i++)for(let side=0;side<2;side++){
    const vertex=i*verticesPerBeam+side*6;
    ribbonUv.forEach(([x,y],index)=>beamUv.setXY(vertex+index,x,y));
  }
  beamGeometry.setAttribute('uv',beamUv);
  beamGeometry.setAttribute('position',beamPosition);grainGeometry.setAttribute('position',grainPosition);grainGeometry.setAttribute('color',grainColor);
  grainGeometry.setAttribute('grainScale',grainScale);grainGeometry.setAttribute('grainAlpha',grainAlpha);
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
  const dustCanvas=document.createElement('canvas');dustCanvas.width=dustCanvas.height=32;
  const ctx=dustCanvas.getContext('2d'),falloff=ctx.createRadialGradient(16,16,0,16,16,16);
  falloff.addColorStop(0,'#ffffffff');falloff.addColorStop(.45,'#ffffff88');falloff.addColorStop(1,'#ffffff00');ctx.fillStyle=falloff;ctx.fillRect(0,0,32,32);
  const grains=new T.Points(grainGeometry,new T.PointsMaterial({map:new T.CanvasTexture(dustCanvas),vertexColors:true,size:.12*scale,opacity:.6,transparent:true,depthWrite:false}));
  grains.material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float grainScale,grainAlpha;varying float vGrainAlpha;\n'+shader.vertexShader
      .replace('gl_PointSize = size;','gl_PointSize = size * grainScale;vGrainAlpha=grainAlpha;');
    shader.fragmentShader='varying float vGrainAlpha;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vGrainAlpha;\n#include <alphatest_fragment>');
  };
  grains.material.customProgramCacheKey=()=> 'construction-sand-points';
  beam.name='service_projection';grains.name='rising_construction_sand';
  for(const object of [beam,grains]){object.frustumCulled=false;scene.add(object);}
  let count=0;
  const scanTime={value:0};

  function release(object){
    const previous=states.get(object);
    if(!previous)return;
    for(const {mesh,original} of previous.materials){mesh.material.dispose();mesh.material=original;}
    previous.body.position.z=previous.bodyZ;
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
      // The complete structure rises through the ground plane. The foundation
      // remains seated; only the visual body moves, never gameplay geometry.
      const plane=new T.Plane(new T.Vector3(0,0,1),-entity.groundHeight),materials=[];
      const layer={value:entity.groundHeight},active={value:0};
      const contacts={value:Array.from({length:4},()=>new T.Vector3())},contactCount={value:0};
      const origin={value:new T.Vector3(entity.x??0,entity.y??0,entity.groundHeight)};
      const axes={value:new T.Vector2(Math.cos(entity.rotation??0),Math.sin(entity.rotation??0))};
      const size={value:new T.Vector3(...spec.realSizeMetres).multiplyScalar(scale)};
      const phase={value:[...(entity.id??'')].reduce((n,c)=>(n*31+c.charCodeAt(0))%997,0)/997};
      body.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const original=mesh.material,clipped=original.clone();
        clipped.clippingPlanes=[plane];clipped.clipShadows=true;
        clipped.onBeforeCompile=shader=>{
          original.onBeforeCompile(shader);
          Object.assign(shader.uniforms,{buildLayer:layer,buildActive:active,buildTime:scanTime,buildOrigin:origin,buildAxes:axes,buildSize:size,buildPhase:phase,buildContacts:contacts,buildContactCount:contactCount});
          shader.vertexShader='varying vec3 vConstructionPosition;\n'+shader.vertexShader.replace(
            '#include <worldpos_vertex>','#include <worldpos_vertex>\nvConstructionPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
          shader.fragmentShader='uniform float buildLayer,buildActive,buildTime,buildPhase;uniform vec3 buildOrigin,buildSize,buildContacts[4];uniform int buildContactCount;uniform vec2 buildAxes;varying vec3 vConstructionPosition;\n'+shader.fragmentShader.replace(
            '#include <tonemapping_fragment>',`
              vec3 p=vConstructionPosition-buildOrigin;
              vec3 q=vec3(p.x*buildAxes.x+p.y*buildAxes.y,-p.x*buildAxes.y+p.y*buildAxes.x,p.z);
              // Illuminate the real contact; the beam and its spot travel together.
              float scan=0.;
              for(int i=0;i<4;i++){
                if(i>=buildContactCount)break;
                float d=length(vConstructionPosition-buildContacts[i]);
                scan=max(scan,exp(-d*d/${(.23*scale)**2})+.18*exp(-d*d/${(.65*scale)**2}));
              }
              float sand=exp(-max(0.,q.z)/${(.55*scale).toFixed(3)})*.45*buildActive;
              gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.48,.34,.17),sand);
              gl_FragColor.rgb+=vec3(.32,.65,.68)*scan*buildActive;
              #include <tonemapping_fragment>
            `);
        };
        clipped.customProgramCacheKey=()=>original.customProgramCacheKey()+'_construction_scan';
        mesh.material=clipped;
        materials.push({mesh,original});
      });
      state={plane,materials,layer,active,contacts,contactCount,body,bodyZ:body.position.z};states.set(object,state);
    }
    state.layer.value=buildLayerHeight(entity,spec,scale);
    state.plane.constant=-entity.groundHeight;
    state.active.value=activeTargets.has(entity.id)?1:0;
    const points=activeTargets.get(entity.id)??[];state.contactCount.value=points.length;points.forEach((point,i)=>state.contacts.value[i].copy(point));
    body.position.z=state.bodyZ-(spec.realSizeMetres[2]-.25)*(1-Math.max(0,Math.min(1,entity.progress)));
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
  function update(beams,time,mission){
    count=Math.min(beams.length,limit);
    scanTime.value=time;
    beam.material.uniforms.beamTime.value=time;
    projectLinks(beams);
    activeTargets.clear();
    let point=0;
    for(let i=0;i<count;i++){
      const {to,mode,targetId}=beams[i];
      if(mode==='build'){
        const points=activeTargets.get(targetId);
        if(points){if(points.length<4)points.push(to);continue;}
        activeTargets.set(targetId,[to]);
        const target=mission?.entity(targetId),spec=mission?.config.buildings[target?.kind];
        if(!target||!spec)continue;
        const [w,d]=spec.realSizeMetres,c=Math.cos(target.rotation),s=Math.sin(target.rotation);
        for(let j=0;j<grainsPerBeam;j++){
          const phase=(time*(1.1+(j%5)*.13)+j/grainsPerBeam)%1,angle=j*2.399+i;
          const cx=Math.cos(angle),cy=Math.sin(angle),edge=Math.max(Math.abs(cx),Math.abs(cy));
          const x=cx/edge*(w*.5+phase*.6)*scale,y=cy/edge*(d*.5+phase*.6)*scale;
          const drift=Math.sin(angle*3+phase*5)*scale*.18;
          grainPosition.setXYZ(point,target.x+x*c-y*s+drift,target.y+x*s+y*c-drift,
            target.groundHeight+(.03+phase*.9)*scale);
          const shade=.6+.2*Math.sin(angle);
          grainColor.setXYZ(point,shade,shade*.76,shade*.43);
          grainScale.setX(point,10+phase*14);grainAlpha.setX(point++,Math.sin(Math.PI*phase)*.4);
        }
        continue;
      }
      const width=(mode==='build'?.34:.19)*scale;
      for(let j=0;j<12;j++){
        const phase=(time*1.4+j/12)%1,t=j*2.399+i+time*.35,r=phase*width*1.8;
        grainPosition.setXYZ(point,to.x+Math.sin(t)*r,to.y+Math.cos(t)*r,to.z+Math.sin(Math.PI*phase)*scale*.48);
        grainColor.setXYZ(point,.27,.74,.92);grainScale.setX(point,1);grainAlpha.setX(point++,1);
      }
    }
    grainGeometry.setDrawRange(0,point);
    if(point){grainPosition.needsUpdate=true;grainColor.needsUpdate=true;grainScale.needsUpdate=true;grainAlpha.needsUpdate=true;}
  }
  return{building,release,update,get active(){return count;}};
}
