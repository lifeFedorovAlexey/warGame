// Opening-only scenes use the existing renderer library and game building prefabs.
import * as T from '../demo/vendor/three.module.js';
import {createDreamGlobe} from './dream-globe.js';
import {createDreamCity} from './dream-city.js';
import {glowTexture,disposeScene,smooth} from './dream-render-kit.js';
export const DREAM_BLAST_SECONDS=12;
const stages=new WeakMap();
export function prepareDreamBlasts(canvas) {
 if(stages.has(canvas))return stages.get(canvas);
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(1);renderer.setSize(1,1,false);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const glow=glowTexture(),city=createDreamCity(glow),globe=createDreamGlobe(glow);
 const overlay=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,2);
 const veil=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:'#020504',transparent:true,opacity:0,depthTest:false,depthWrite:false}));overlay.add(veil);
 const stage={renderer,city,globe,overlay,camera,veil,glow};stages.set(canvas,stage);
 renderer.compileAsync(city.scene,city.camera).catch(()=>{});renderer.compileAsync(globe.scene,globe.camera).catch(()=>{});
 return stage;
}
export function drawDreamBlasts(canvas,seconds,options={}) {
 const stage=prepareDreamBlasts(canvas),{renderer,city,globe,overlay,camera,veil}=stage;
 const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),scale=Math.min(1,1600/width,1000/height);
 const w=Math.round(width*scale),h=Math.round(height*scale);if(canvas.width!==w||canvas.height!==h)renderer.setSize(w,h,false);
 const orbital=seconds>=5.6,shot=orbital?globe:city;
 shot.update(orbital?seconds-5.6:seconds,width/height,options);renderer.autoClear=true;renderer.render(shot.scene,shot.camera);
 const sceneCalls=renderer.info.render.calls;
 // A short dark match-cut separates the scales; the final fade wakes the player.
 veil.material.opacity=seconds<.45?1-smooth(seconds/.45):seconds>10.8?smooth((seconds-10.8)/1.1)
  :seconds>5.15&&seconds<6.15?seconds<5.6?smooth((seconds-5.15)/.45):1-smooth((seconds-5.6)/.55):0;
 renderer.autoClear=false;renderer.render(overlay,camera);renderer.autoClear=true;
 canvas.dataset.shot=orbital?'globe':'city';canvas.dataset.drawCalls=sceneCalls+renderer.info.render.calls;
 canvas.dataset.earthReady=String(!!globe.texture.image?.width);
}
export function disposeDreamBlasts(canvas) {
 const stage=stages.get(canvas);if(!stage)return;
 for(const shot of [stage.city.scene,stage.globe.scene,stage.overlay])disposeScene(shot);
 stage.glow.dispose();stage.renderer.dispose();stages.delete(canvas);delete canvas.dataset.shot;delete canvas.dataset.drawCalls;delete canvas.dataset.earthReady;
}

export function playDreamBlast(context,destination,seed=1) {
  if(!context||context.state!=='running')return null;
  const length=Math.floor(context.sampleRate*3.5),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);
  let state=seed|0,low=0;
  for(let i=0;i<length;i++){state=(Math.imul(state,1664525)+1013904223)|0;const noise=(state>>>0)/2147483648-1;low=low*.98+noise*.02;data[i]=low*2+noise*.08;}
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),now=context.currentTime;
  source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(650,now);filter.frequency.exponentialRampToValueAtTime(90,now+3.4);
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.65,now+.07);gain.gain.exponentialRampToValueAtTime(.001,now+3.4);
  source.connect(filter).connect(gain).connect(destination);source.start();
  source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  return source;
}
