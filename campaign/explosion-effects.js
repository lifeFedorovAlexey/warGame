// Short hot core, rolling smoke, ground-hugging dust and bounded solid debris.
// All batches share geometry; no texture downloads or per-particle draw calls.
export function createExplosionEffects(T,scene,scale,field){
 const limit=16,bursts=[],remains=[],burns=[];let serial=0;
 const rand=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
 const ground=(x,y,fallback=0)=>field?.heightAt(x,y)??fallback;
 const vertex=`attribute float diameter;attribute float alpha;attribute vec3 shade;attribute float seed;
 uniform float viewport;varying float a;varying vec3 colour;varying float s;
 void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(diameter*projectionMatrix[1][1]*viewport*.5/max(1.,-p.z),1.,300.);a=alpha;colour=shade;s=seed;}`;
 const fragment=`uniform float clock;uniform float fire;varying float a;varying vec3 colour;varying float s;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 p=gl_PointCoord*2.-1.;vec2 q=p*3.1+vec2(s,clock*(fire>.5?-1.8:-.25));
 float n=noise(q)*.65+noise(q*2.13)*.35;float edge=length(p)+.24*(n-.5);
 float mask=(1.-smoothstep(.55,1.,edge))*a;if(mask<.008)discard;
 float light=.72+.34*n-.14*p.y;
 vec3 ink=colour*light;
 if(fire>.5){float hot=(1.-smoothstep(.05,.7,length(p)))*(.45+n*.55);ink=mix(colour,vec3(1.,.88,.48),hot);}
 gl_FragColor=vec4(ink,mask);#include <colorspace_fragment>
 }`;
 function batch(name,capacity,fire){
  const geometry=new T.BufferGeometry(),attrs={};
  for(const [key,size] of [['position',3],['diameter',1],['alpha',1],['shade',3],['seed',1]]){attrs[key]=new T.BufferAttribute(new Float32Array(capacity*size),size).setUsage(T.DynamicDrawUsage);geometry.setAttribute(key,attrs[key]);}
  const material=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment.replace(';#include',';\n#include'),uniforms:{clock:{value:0},viewport:{value:900},fire:{value:Number(fire)}},transparent:true,depthWrite:false});
  const mesh=new T.Points(geometry,material);mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=fire?6:5;scene.add(mesh);geometry.setDrawRange(0,0);let count=0;
  return {start(now,height){count=0;material.uniforms.clock.value=now;material.uniforms.viewport.value=height;},
   add(x,y,z,d,a,c,seed){if(count>=capacity||a<=0)return;attrs.position.setXYZ(count,x,y,z);attrs.diameter.setX(count,d);attrs.alpha.setX(count,a);attrs.shade.setXYZ(count,...c);attrs.seed.setX(count++,seed);},
   flush(){geometry.setDrawRange(0,count);if(count)for(const attr of Object.values(attrs))attr.needsUpdate=true;},get count(){return count;}};
 }
 const fire=batch('explosion_fire',limit*14+32*6,true),smoke=batch('explosion_smoke',limit*32+32*6,false);
 const object=new T.Object3D(),colour=new T.Color();
 const fragments=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),24*16);
 fragments.name='explosion_fragments';fragments.count=0;fragments.frustumCulled=false;fragments.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(fragments);
 const scorchGeo=new T.CircleGeometry(1,24),positions=scorchGeo.attributes.position;
 for(let i=1;i<positions.count;i++){const k=.8+rand(i,9)*.2;positions.setXY(i,positions.getX(i)*k,positions.getY(i)*k);}
 const scorches=new T.InstancedMesh(scorchGeo,new T.MeshBasicMaterial({color:'#302a20',transparent:true,opacity:.48,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),24);
 scorches.name='blast_scorches';scorches.count=0;scorches.frustumCulled=false;scene.add(scorches);
 const flash=new T.PointLight('#ffba65',0,1);scene.add(flash);
 function spawn(point,radius,now){const b={point:point.clone(),radius,born:now,seed:++serial,ground:ground(point.x,point.y,point.z)};bursts.push(b);remains.push(b);if(bursts.length>limit)bursts.shift();if(remains.length>24)remains.shift();}
 function setBurning(mission,transforms){
  burns.length=0;
  for(const e of [...mission.state.units,...mission.state.buildings]){
   if(!e.burning||e.burning.until<=mission.state.time||e.owner!=='rai'&&!mission.visibleAt(e.x,e.y))continue;
   const b=e.burning,pose=transforms?.get(e.id),p=pose?.position,a=pose?.heading??e.heading??e.rotation??0,c=Math.cos(a),s=Math.sin(a),local=b.point;
   burns.push({x:(p?.x??e.x)+(local[0]*c-local[1]*s)*scale,y:(p?.y??e.y)+(local[0]*s+local[1]*c)*scale,z:(p?.z??e.groundHeight??ground(e.x,e.y))+Math.max(.4,local[2])*scale,fade:Math.min(1,(b.until-mission.state.time)/1.1),seed:e.id.split('').reduce((n,c)=>n+c.charCodeAt(0),0)});
   if(burns.length===32)break;
  }
 }
 function update(now,camera,height){
  fire.start(now,height);smoke.start(now,height);flash.intensity=0;let nearest=Infinity;
  for(let i=bursts.length-1;i>=0;i--){
   const b=bursts[i],age=now-b.born,{point:p,radius:r,seed}=b;if(age>6.2){bursts.splice(i,1);continue;}
   if(age<.2&&camera.position.distanceToSquared(p)<nearest){nearest=camera.position.distanceToSquared(p);flash.position.copy(p);flash.distance=r*5;flash.intensity=r*r*8*(1-age/.2);}
   for(let j=0;j<12;j++){
    const t=age-j*.012,life=.40+rand(seed,j)*.35;if(t<0||t>life)continue;
    const f=t/life,angle=j*2.399+seed,spread=r*(.08+.62*Math.sin(f*Math.PI*.5))*(.4+rand(j,seed)*.6);
    fire.add(p.x+Math.cos(angle)*spread,p.y+Math.sin(angle)*spread,p.z+r*(.18+f*.9)*(.4+rand(seed+3,j)*.6),r*(.5+f*.65),Math.min(1,t*40)*(1-f)**1.1,[1,.18+.3*(1-f),.015],seed+j);
   }
   for(let j=0;j<14;j++){
    const t=(age-.08-j*.035)/(3.4+rand(j,seed)*1.7);if(t<0||t>1)continue;
    const angle=j*2.399+seed,spread=r*(.15+t*.55),shade=.075+rand(seed,j)*.055;
    smoke.add(p.x+Math.cos(angle)*spread+t*r*.7,p.y+Math.sin(angle)*spread,p.z+r*(.12+t*(1.1+rand(j,seed))),r*(.5+t*1.25),Math.min(1,t*18)*(1-t)*.75,[shade,shade*.93,shade*.81],seed+j);
   }
   for(let j=0;j<18;j++){
    const t=age/(1.5+rand(seed,j)*1.4);if(t>1)continue;
    const angle=j*2.399+seed,spread=r*(.25+Math.sqrt(t)*1.8)*(1+rand(j,seed)*.22),x=p.x+Math.cos(angle)*spread,y=p.y+Math.sin(angle)*spread;
    smoke.add(x,y,ground(x,y,b.ground)+r*(.03+t*.1),r*(.3+t*.65),Math.min(1,t*15)*(1-t)*.40,[.48,.36,.21],seed+j);
   }
  }
  for(const b of burns)for(let j=0;j<6;j++){
   const t=(now*1.4+j*.167+b.seed*.013)%1,angle=j*2.399,spread=scale*.24;
   fire.add(b.x+Math.cos(angle)*spread,b.y+Math.sin(angle)*spread,b.z+t*scale*1.5,scale*(.7+t*.65),Math.sin(Math.PI*t)*b.fade*.85,[.95,.16+.2*(1-t),.012],b.seed+j);
   const u=(now*.34+j/6)%1;
   smoke.add(b.x+u*scale*.9,b.y+Math.sin(angle)*scale*.4,b.z+scale*(.8+u*3),scale*(.6+u*1.6),Math.sin(Math.PI*u)*b.fade*.5,[.055,.05,.042],b.seed+j);
  }
  let count=0,marks=0;
  for(let i=remains.length-1;i>=0;i--){
   const b=remains[i],age=now-b.born,{point:p,radius:r,seed}=b;if(age>40){remains.splice(i,1);continue;}
   const fade=Math.min(1,(40-age)/4);
   object.position.set(p.x,p.y,b.ground+1);object.rotation.set(0,0,seed);object.scale.set(r*.95,r*.78,1);object.updateMatrix();scorches.setMatrixAt(marks++,object.matrix);
   for(let j=0;j<16;j++){
    const angle=j*2.399+seed,speed=r*(.7+rand(seed,j)*1.3),vz=scale*(2.1+rand(j,seed)*3.2),gravity=9.8*scale;
    const land=(vz+Math.sqrt(vz*vz+2*gravity*Math.max(.4,p.z-b.ground)))/gravity,t=Math.min(age,land),roll=Math.max(0,Math.min(1,age-land));
    const x=p.x+Math.cos(angle)*speed*(t+roll*.18),y=p.y+Math.sin(angle)*speed*(t+roll*.18),size=scale*(.07+rand(seed+6,j)*.18);
    object.position.set(x,y,Math.max(ground(x,y,b.ground)+size*.35,p.z+vz*t-.5*gravity*t*t));object.rotation.set(t*(3+j%3),t*2.5,angle);object.scale.set(size*1.8*fade,size*.6*fade,size*.4*fade);object.updateMatrix();fragments.setMatrixAt(count,object.matrix);
    colour.set(j%3===0?'#9b8d72':j%3===1?'#414338':'#6b5540');fragments.setColorAt(count++,colour);
   }
  }
  fragments.count=count;scorches.count=marks;if(count){fragments.instanceMatrix.needsUpdate=true;fragments.instanceColor.needsUpdate=true;}if(marks)scorches.instanceMatrix.needsUpdate=true;
  fire.flush();smoke.flush();
 }
 return {spawn,setBurning,update,reset(){bursts.length=remains.length=burns.length=0;fragments.count=scorches.count=0;flash.intensity=0;},get statistics(){return {explosions:bursts.length,explosionLimit:limit,blastParticles:fire.count+smoke.count,blastFragments:fragments.count,burningTargets:burns.length};}};
}
