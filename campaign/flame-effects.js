export function createFlameEffects(T,scene,scale) {
  const pulses=[],pulseLimit=14;
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
  const flame=batch('red_flame_jet',pulseLimit*32,false),smoke=batch('black_flame_smoke',pulseLimit*20,true);
  const point=new T.Vector3();
  let serial=0;
  const random=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
  return {
    spawn(start,end,now){
      pulses.push({start,end,born:now,seed:++serial});
      if(pulses.length>pulseLimit)pulses.shift();
    },
    reset(){pulses.length=0;},
    update(now,viewportHeight){
      flame.start(viewportHeight);smoke.start(viewportHeight);
      for(let i=pulses.length-1;i>=0;i--){
        const {start,end,born,seed}=pulses[i], age=now-born;
        if(age>2.15){pulses.splice(i,1);continue;}
        const dx=end.x-start.x,dy=end.y-start.y,len=Math.max(1,Math.hypot(dx,dy)),rx=-dy/len,ry=dx/len;
        for(let j=0;j<32;j++){
          const delay=j*.0064, t=(age-delay)/(.37+.17*random(seed,j));
          if(t<0||t>1)continue;
          const along=Math.pow(t,.82),spread=(random(j,seed)-.5)*(.16+3.1*t)*scale;
          point.copy(start).lerp(end,along);
          const heat=(1-t)*(.68+.32*random(seed+31,j));
          const rise=(.19+random(seed+18,j)*.31)*t*t*scale;
          const size=(.36+2.25*Math.pow(t,.74))*scale;
          flame.add(point.x+rx*spread,point.y+ry*spread,point.z+rise,size,(1-t*.65)*.92,1,.025+.28*heat,.005+.035*heat);
        }
        for(let j=0;j<20;j++){
          const delay=.18+j*.028, t=(age-delay)/(1.05+.27*random(j,seed+17));
          if(t<0||t>1)continue;
          const along=.23+random(j,seed+2)*.77, drift=(random(seed+5,j)-.48)*(1+t*2.4)*scale;
          point.copy(start).lerp(end,along);
          const size=(.49+t*2.38)*scale, rise=(.30+t*3.05)*scale;
          smoke.add(point.x+rx*drift+t*2,point.y+ry*drift+t*.9,point.z+rise,size,Math.sin(Math.PI*t)**.7*.60,.016,.012,.011);
        }
      }
      flame.flush();smoke.flush();
    },
    get statistics(){return{flameParticles:flame.count,smokeParticles:smoke.count};},
  };
}
