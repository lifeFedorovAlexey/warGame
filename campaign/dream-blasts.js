import * as T from '../demo/vendor/three.module.js';
import {createDreamGlobe} from './dream-globe.js';
import {createDreamCity} from './dream-city.js';
import {createDreamRoom} from './dream-room.js';
import {glowTexture,disposeScene,smooth} from './dream-render-kit.js';
export const DREAM_ORBIT_START=3.2,DREAM_CLOSE_START=13.2,DREAM_TITLE_START=14.4,DREAM_BLAST_SECONDS=17.8;
const stages=new WeakMap();
export function prepareDreamBlasts(canvas,video) {
 if(stages.has(canvas))return stages.get(canvas);
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(1);renderer.setSize(1,1,false);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
 const glow=glowTexture(),city=createDreamCity(glow),room=createDreamRoom(city.scene,video),globe=createDreamGlobe(glow);
 const overlay=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,2);
 const material=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{openness:{value:0},flash:{value:0},time:{value:0},reduced:{value:0}},
  vertexShader:'varying vec2 uvEye; void main(){uvEye=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`varying vec2 uvEye; uniform float openness; uniform float flash; uniform float time; uniform float reduced;
   void main(){vec2 p=uvEye*2.-1.;float arch=sqrt(max(0.,1.-p.x*p.x*.94));
   float lid=smoothstep(arch*openness*2.-.035,arch*openness*2.+.035,abs(p.y));
   lid=max(lid,1.-smoothstep(0.,.025,openness));lid*=1.-smoothstep(.92,1.,openness);
   lid=mix(lid,1.-openness,reduced);
   float vignette=smoothstep(.35,1.5,length(p))*.24;
   float grain=fract(sin(dot(uvEye+fract(time)*.01,vec2(12.9898,78.233)))*43758.5453)*.025;
   float shade=max(lid,vignette+grain);float a=flash+shade*(1.-flash);
   gl_FragColor=vec4(vec3(.93,.91,.81)*flash/max(.001,a),a);}`});
 const veil=new T.Mesh(new T.PlaneGeometry(2,2),material);overlay.add(veil);
 const stage={renderer,city,room,globe,overlay,camera,veil,glow};stages.set(canvas,stage);
 // No detached readiness poll: Escape may dispose this renderer in the very next frame.
 renderer.compile(city.scene,city.camera);renderer.compile(globe.scene,globe.camera);
 return stage;
}
export function dreamEyeOpening(time,reducedMotion=false){
 if(reducedMotion)return smooth(time/2.5);
 if(time<1.2)return smooth((time-.3)/.9)*.58;
 if(time<1.5)return .58-smooth((time-1.2)/.3)*.4;
 return .18+smooth((time-1.5)/1.3)*.82;
}
export function drawDreamBlasts(canvas,seconds,options={}) {
 const {video,movieTime=0,movieDuration=27.88,television=false,reducedMotion=false}=options;
 const stage=prepareDreamBlasts(canvas,video),{renderer,city,room,globe,overlay,camera,veil}=stage;
 const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),scale=Math.min(devicePixelRatio||1,1920/width,1200/height);
 const w=Math.round(width*scale),h=Math.round(height*scale);if(canvas.width!==w||canvas.height!==h)renderer.setSize(w,h,false);
 const orbital=!television&&seconds>=DREAM_ORBIT_START,shot=orbital?globe:city;
 if(orbital)globe.update(seconds-DREAM_ORBIT_START,width/height,options);
 else{city.update(television?movieTime-movieDuration:seconds,width/height,options);room.update(television?movieTime:movieDuration,movieDuration,city.camera,width/height,{reducedMotion,blastAge:television?-1:seconds});}
 renderer.autoClear=true;renderer.render(shot.scene,shot.camera);const sceneCalls=renderer.info.render.calls;
 const uniforms=veil.material.uniforms;
 uniforms.openness.value=television?dreamEyeOpening(movieTime,reducedMotion):1-smooth((seconds-DREAM_CLOSE_START)/1.1);
 uniforms.flash.value=television||reducedMotion?0:Math.exp(-Math.pow((seconds-.2)/.15,2))*.65+Math.exp(-Math.pow((seconds-DREAM_ORBIT_START)/.18,2))*.8;
 uniforms.time.value=television?movieTime:movieDuration+seconds;uniforms.reduced.value=Number(reducedMotion);
 renderer.autoClear=false;renderer.render(overlay,camera);renderer.autoClear=true;
 canvas.dataset.shot=television?(movieTime>movieDuration-6?'missiles':'room'):seconds>=DREAM_TITLE_START?'title':seconds>=DREAM_CLOSE_START?'closing':orbital?'globe':'city';
 canvas.dataset.drawCalls=sceneCalls+renderer.info.render.calls;canvas.dataset.earthReady=String(!!globe.texture.image?.width);
 canvas.dataset.eyeOpen=uniforms.openness.value.toFixed(3);
}
export function disposeDreamBlasts(canvas) {
 const stage=stages.get(canvas);if(!stage)return;
 for(const shot of [stage.city.scene,stage.globe.scene,stage.overlay])disposeScene(shot);
 stage.glow.dispose();stage.renderer.dispose();stages.delete(canvas);
 for(const key of ['shot','drawCalls','earthReady','eyeOpen'])delete canvas.dataset[key];
}
