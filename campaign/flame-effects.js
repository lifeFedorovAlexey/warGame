export function createFlameEffects(T,scene,scale) {
  const pulses=[],scorches=[],pulseLimit=14,scorchLimit=16,segments=6;
  const vertexShader=`
    attribute float diameter; attribute float opacity; attribute vec3 shade;
    uniform float viewportHeight; varying float vOpacity; varying vec3 vShade;
    void main(){
      vec4 p=modelViewMatrix*vec4(position,1.);
      gl_Position=projectionMatrix*p;
      gl_PointSize=clamp(diameter*projectionMatrix[1][1]*viewportHeight*.5/max(1.,-p.z),1.,140.);
      vOpacity=opacity;vShade=shade;
    }`;
  const fragmentShader=`
    varying float vOpacity; varying vec3 vShade; uniform float smoke;
    void main(){
      vec2 p=gl_PointCoord*2.-1.;
      float edge=length(p)+.10*sin(10.*p.x+4.*p.y)*sin(6.*p.y-4.*p.x);
      float envelope=(1.-smoothstep(.25,1.,edge))*vOpacity;
      if(envelope<.008)discard;
      vec3 core=mix(vec3(1.,.58,.16),vShade,smoothstep(.04,.60,edge));
      gl_FragColor=vec4(mix(core,vShade,smoke),envelope);
      #include <colorspace_fragment>
    }`;
  function batch(name,capacity,isSmoke){
    const geometry=new T.BufferGeometry();
    const attribute=(name,size)=>{
      const attr=new T.BufferAttribute(new Float32Array(capacity*size),size).setUsage(T.DynamicDrawUsage);
      geometry.setAttribute(name,attr);return attr;
    };
    const position=attribute('position',3),size=attribute('diameter',1),opacity=attribute('opacity',1),shade=attribute('shade',3);
    const uniforms={viewportHeight:{value:700},smoke:{value:Number(isSmoke)}};
    const material=new T.ShaderMaterial({vertexShader,fragmentShader,uniforms,transparent:true,depthWrite:false});
    const mesh=new T.Points(geometry,material);
    mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=isSmoke?4:5;
    scene.add(mesh);
    let count=0;
    return {
      start(height){count=0;uniforms.viewportHeight.value=height;},
      add(x,y,z,d,a,r,g,b){
        if(count>=capacity)return;
        position.setXYZ(count,x,y,z);size.setX(count,d);opacity.setX(count,a);shade.setXYZ(count++,r,g,b);
      },
      flush(){geometry.setDrawRange(0,count);if(count)for(const attr of [position,size,opacity,shade])attr.needsUpdate=true;},
      get count(){return count;},
    };
  }
  const flame=batch('red_flame_particles',pulseLimit*32,false);
  const smoke=batch('black_flame_smoke',pulseLimit*20+scorchLimit*6,true);
  const jetGeometry=new T.BufferGeometry(),jetCapacity=pulseLimit*segments*12;
  const jetPosition=new T.Float32BufferAttribute(new Float32Array(jetCapacity*3),3).setUsage(T.DynamicDrawUsage);
  const jetShape=new T.Float32BufferAttribute(new Float32Array(jetCapacity*3),3).setUsage(T.DynamicDrawUsage);
  jetGeometry.setAttribute('position',jetPosition);jetGeometry.setAttribute('plume',jetShape);jetGeometry.setDrawRange(0,0);
  const jet=new T.Mesh(jetGeometry,new T.ShaderMaterial({
    uniforms:{clock:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
    vertexShader:`
      attribute vec3 plume;
      varying vec3 vPlume;
      void main(){vPlume=plume;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform float clock;
      varying vec3 vPlume;
      void main(){
        float shift=sin(vPlume.y*26.-clock*31.)*.13;
        float edge=abs(vPlume.x+shift);
        float turbulence=.65+.35*sin(vPlume.y*72.-clock*43.);
        float alpha=(1.-smoothstep(.12,.96,edge))*turbulence*vPlume.z;
        vec3 heat=mix(vec3(.72,.035,.007),vec3(1.,.54,.06),(1.-smoothstep(.0,.72,edge))*(1.-vPlume.y*.51));
        gl_FragColor=vec4(heat,alpha);
        #include <colorspace_fragment>
      }
    `
  }));
  jet.name='continuous_flame_core';jet.frustumCulled=false;jet.renderOrder=5;scene.add(jet);
  const point=new T.Vector3();
  let serial=0;
  const random=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
  return {
    spawn(start,end,now,flight){
      pulses.push({start,end,born:now,flight,seed:++serial});
      if(pulses.length>pulseLimit)pulses.shift();
    },
    scorch(point,now,destroyed){
      scorches.push({point,born:now,destroyed,seed:++serial});
      if(scorches.length>scorchLimit)scorches.shift();
    },
    reset(){pulses.length=scorches.length=0;},
    update(now,viewportHeight){
      flame.start(viewportHeight);smoke.start(viewportHeight);
      jet.material.uniforms.clock.value=now;
      let vertices=0;
      for(let i=pulses.length-1;i>=0;i--){
        const {start,end,born,flight,seed}=pulses[i], age=now-born;
        if(age>2.15){pulses.splice(i,1);continue;}
        const dx=end.x-start.x,dy=end.y-start.y,len=Math.max(1,Math.hypot(dx,dy)),rx=-dy/len,ry=dx/len;
        const head=Math.min(1,Math.max(.038,age/flight)),tail=Math.max(0,(age-.48)/flight);
        if(head>tail){
          const emit=(plane,t,side)=>{
            point.copy(start).lerp(end,t);
            const width=(.075+.73*t)*scale,arc=Math.sin(Math.PI*t)*scale*.12;
            const opacity=.70*Math.min(1,(head-t)*12+.13)*Math.min(1,(t-tail)*14+.32);
            jetPosition.setXYZ(vertices,point.x+(plane===0?rx*side*width:0),
              point.y+(plane===0?ry*side*width:0),point.z+arc+(plane===1?side*width:0));
            jetShape.setXYZ(vertices++,side,t,opacity);
          };
          for(let j=0;j<segments;j++){
            const a=tail+(head-tail)*j/segments,b=tail+(head-tail)*(j+1)/segments;
            for(let plane=0;plane<2;plane++){
              emit(plane,a,-1);emit(plane,a,1);emit(plane,b,1);
              emit(plane,a,-1);emit(plane,b,1);emit(plane,b,-1);
            }
          }
        }
        for(let j=0;j<32;j++){
          const delay=j*.0064,t=(age-delay)/(flight*(.87+.29*random(seed,j)));
          if(t<0||t>1)continue;
          const along=Math.pow(t,.82),spread=(random(j,seed)-.5)*(.16+3.1*t)*scale;
          point.copy(start).lerp(end,along);
          const heat=(1-t)*(.68+.32*random(seed+31,j));
          const rise=(.19+random(seed+18,j)*.31)*t*t*scale;
          const size=(.36+2.25*Math.pow(t,.74))*scale;
          flame.add(point.x+rx*spread,point.y+ry*spread,point.z+rise,size,(1-t*.65)*.92,1,.025+.28*heat,.005+.035*heat);
        }
        for(let j=0;j<20;j++){
          const delay=flight*.56+j*.028,t=(age-delay)/(1.05+.27*random(j,seed+17));
          if(t<0||t>1)continue;
          const along=.43+random(j,seed+2)*.57, drift=(random(seed+5,j)-.48)*(1+t*2.4)*scale;
          point.copy(start).lerp(end,along);
          const size=(.49+t*2.38)*scale, rise=(.30+t*3.05)*scale;
          smoke.add(point.x+rx*drift+t*2,point.y+ry*drift+t*.9,point.z+rise,size,Math.sin(Math.PI*t)**.7*.60,.016,.012,.011);
        }
      }
      for(let i=scorches.length-1;i>=0;i--){
        const {point,born,destroyed,seed}=scorches[i],age=now-born,life=destroyed?2.9:1.72;
        if(age>=life){scorches.splice(i,1);continue;}
        for(let j=0;j<6;j++){
          const t=(age-j*.065)/(life-.32);
          if(t<0||t>1)continue;
          const angle=j*2.4+seed,spread=(.17+t*(destroyed?1.75:.95))*scale;
          const size=(.54+t*(destroyed?2.55:1.7))*scale;
          smoke.add(point.x+Math.cos(angle)*spread+t*2,point.y+Math.sin(angle)*spread,
            point.z+(t*(2.4+random(seed,j))+.17)*scale,size,Math.sin(Math.PI*t)**.65*.68,.020,.014,.012);
        }
      }
      jetGeometry.setDrawRange(0,vertices);
      if(vertices)jetPosition.needsUpdate=jetShape.needsUpdate=true;
      flame.flush();smoke.flush();
    },
    get statistics(){return{flameParticles:flame.count,smokeParticles:smoke.count,flameCoreVertices:jetGeometry.drawRange.count};},
  };
}
