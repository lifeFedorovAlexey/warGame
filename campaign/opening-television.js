import {setButtonIcon} from '../assets/ui/icons.js';
import {drawDreamBlasts,prepareDreamBlasts,disposeDreamBlasts,DREAM_BLAST_SECONDS,DREAM_TITLE_START} from './dream-blasts.js';
import {DreamSoundtrack,loadDreamExplosion} from './dream-sound.js';
import {smooth} from './dream-render-kit.js';
const movie=new URL('../assets/campaign/alpha/mission01/opening-television.mp4',import.meta.url).href;

export class OpeningTelevision {
 constructor(sound) {
  this.sound=sound;this.active=false;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root=this.root=document.createElement('section');root.className='opening-dream';root.hidden=true;root.setAttribute('aria-label','Сон: последняя ночь перед катастрофой');
  root.innerHTML=`<video class="dream-video-source" playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video><canvas class="dream-blasts" aria-label="Ночная комната, ракеты над городом и Земля с орбиты"></canvas><p class="dream-time-card" aria-live="polite" hidden>Прошло 50 лет</p><p class="dream-status" role="status" hidden></p><div class="dream-controls"><button type="button" data-dream="pause"></button><button type="button" data-dream="sound"></button><button type="button" data-dream="skip"></button></div>`;
  document.querySelector('#game').append(root);
  this.video=root.querySelector('video');this.video.src=movie;this.canvas=root.querySelector('canvas');this.status=root.querySelector('.dream-status');this.card=root.querySelector('.dream-time-card');
  this.pauseButton=root.querySelector('[data-dream="pause"]');this.soundButton=root.querySelector('[data-dream="sound"]');this.skipButton=root.querySelector('[data-dream="skip"]');
  setButtonIcon(this.skipButton,'close','Пропустить сон','Esc');this.pauseButton.onclick=()=>this.togglePause();
  this.soundButton.onclick=()=>{this.muted=!this.muted;this.syncControls();};this.skipButton.onclick=()=>this.finish('skipped');
  this.video.addEventListener('ended',()=>{if(this.active&&this.record.phase==='television')this.startBlasts();});
  this.video.addEventListener('error',()=>{if(!this.active||this.record.phase!=='television')return;this.paused=true;this.score?.stop();this.status.textContent='Видео недоступно. Можно пропустить сон.';this.status.hidden=false;this.syncControls();});
  this.video.addEventListener('loadedmetadata',()=>this.restorePosition());
  document.addEventListener('keydown',event=>{
   if(!this.active||event.repeat)return;
   if(event.code==='Escape'){event.preventDefault();this.finish('skipped');}
   if(event.code==='Space'&&!event.target.closest('button')){event.preventDefault();this.togglePause();}
  });
  document.addEventListener('visibilitychange',()=>{if(this.active&&document.hidden&&!this.paused)this.togglePause();});
 }
 start(mission,director,{enabled=true}={}) {
  this.close();const data=director.bind(mission);if(!enabled||!data.includeOpening||director.finished('p01'))return false;
  this.director=director;this.record=data.openingDream??={phase:'television',position:0,elapsed:0};
  if(this.record.phase!=='television'&&this.record.phase!=='blast')this.record.phase='television';
  this.record.elapsed=Number.isFinite(this.record.elapsed)?Math.max(0,this.record.elapsed):0;
  this.seekPosition=Number.isFinite(this.record.position)?Math.max(0,this.record.position):0;
  data.active='p01';director.record('p01').status='playing';this.active=true;this.paused=false;this.muted=!this.sound.enabled||!this.sound.storyEnabled;
  this.status.hidden=true;this.card.hidden=true;this.root.hidden=false;this.root.dataset.phase=this.record.phase;
  document.body.classList.add('television-playing');this.sound.stopStory();this.sound.stopVoice();this.sound.setOpeningMix(true);
  if(this.sound.context){
   this.blastGain=this.sound.context.createGain();this.blastGain.connect(this.sound.context.destination);
   if(!this.blastLoading&&!this.blastBuffer){
    this.root.dataset.blastAudio='loading';
    this.blastLoading=loadDreamExplosion(this.sound.context).then(buffer=>{this.blastBuffer=buffer;this.score?.setExplosion(buffer);this.root.dataset.blastAudio='ready';})
     .catch(error=>{this.blastLoading=null;this.root.dataset.blastAudio='unavailable';console.warn(error.message);});
   }
  }
  this.syncControls();prepareDreamBlasts(this.canvas,this.video);
  if(!this.video.getAttribute('src'))this.video.src=movie;
  if(this.record.phase==='television'){this.restorePosition();if(this.record.phase==='television')this.play();}
  this.previousFocus=document.activeElement;this.pauseButton.focus({preventScroll:true});return true;
 }
 restorePosition() {
  if(!this.active||this.record.phase!=='television'||!Number.isFinite(this.video.duration)||this.seekPosition===null)return;
  if(this.seekPosition>=this.video.duration-.02){this.seekPosition=null;this.startBlasts();return;}
  this.video.currentTime=Math.min(this.seekPosition,this.video.duration);this.seekPosition=null;
 }
 play() {
  const record=this.record;this.video.play().catch(error=>{
   if(!this.active||this.record!==record||this.record.phase!=='television'||error.name==='AbortError')return;
   this.paused=true;this.score?.stop();this.status.textContent='Нажмите воспроизведение';this.status.hidden=false;this.syncControls();
  });
 }
 togglePause() {
  this.paused=!this.paused;this.status.hidden=true;
  if(this.record.phase==='television'){if(this.paused)this.video.pause();else this.play();}
  if(this.paused)this.score?.stop();this.syncControls();
 }
 syncControls() {
  this.video.muted=this.muted;this.video.volume=.85;
  if(this.blastGain)this.blastGain.gain.setTargetAtTime(this.muted?0:.9,this.sound.context.currentTime,.025);
  setButtonIcon(this.pauseButton,this.paused?'play':'pause',this.paused?'Продолжить':'Пауза','Пробел');
  setButtonIcon(this.soundButton,this.muted?'muted':'sound',this.muted?'Включить звук':'Выключить звук');this.soundButton.setAttribute('aria-pressed',String(!this.muted));
 }
 startBlasts() {
  this.video.pause();this.record.position=this.video.duration;this.record.phase='blast';this.record.elapsed=0;this.root.dataset.phase='blast';this.status.hidden=true;
 }
 update(dt) {
  if(!this.active)return;
  const television=this.record.phase==='television',duration=Number.isFinite(this.video.duration)?this.video.duration:(television?27.88:(this.record.position||27.88));
  if(television){if(this.seekPosition===null)this.record.position=this.video.currentTime;}
  else if(!this.paused)this.record.elapsed+=Math.max(0,Math.min(.1,dt));
  const elapsed=this.record.elapsed,time=television?this.video.currentTime:duration+elapsed;
  if(this.blastGain&&(!this.score||Math.abs(this.score.duration-duration)>.05)){this.score?.stop();this.score=new DreamSoundtrack(this.sound.context,this.blastGain,duration,DREAM_BLAST_SECONDS,this.blastBuffer);}
  const advancing=!this.paused&&(!television||(!this.video.paused&&!this.video.seeking&&this.video.readyState>=3));
  this.score?.sync(time,advancing);
  drawDreamBlasts(this.canvas,elapsed,{video:this.video,movieTime:this.video.currentTime,movieDuration:duration,television,reducedMotion:this.reducedMotion});
  this.card.hidden=television||elapsed<DREAM_TITLE_START;
  this.card.style.opacity=String(smooth((elapsed-DREAM_TITLE_START)/.7)*smooth((DREAM_BLAST_SECONDS-elapsed)/.7));
  if(!television&&elapsed>=DREAM_BLAST_SECONDS)this.finish('done');
 }
 close() {
  const wasActive=this.active;this.active=false;this.video.pause();this.score?.stop();this.score=null;this.blastGain?.disconnect();this.blastGain=null;
  if(wasActive){this.sound.setOpeningMix(false);this.video.removeAttribute('src');this.video.load();}
  disposeDreamBlasts(this.canvas);this.canvas.width=this.canvas.height=1;this.card.hidden=true;this.root.hidden=true;document.body.classList.remove('television-playing');
 }
 finish(status) {
  if(!this.active)return;this.director.end(status);this.record.phase='finished';this.close();
  if(this.previousFocus?.isConnected&&!this.previousFocus.closest('[hidden]'))this.previousFocus.focus({preventScroll:true});
 }
}
