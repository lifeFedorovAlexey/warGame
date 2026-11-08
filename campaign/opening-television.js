import {setButtonIcon} from '../assets/ui/icons.js';
import {drawDreamBlasts,playDreamBlast,DREAM_BLAST_SECONDS} from './dream-blasts.js';

const movie=new URL('../assets/campaign/alpha/mission01/opening-television.mp4',import.meta.url).href;
const prop=`<svg viewBox="0 0 600 630" aria-hidden="true">
  <path d="M247 160 134 44l4-3 117 116m18 3L378 54l3 3-101 108" fill="#5e6250"/>
  <path d="m241 161 12-15h25l14 15" fill="#272e23"/>
  <path d="m42 532 460-14 68 28-480 19z" fill="#393a29"/>
  <path d="m90 565 480-19v14L90 579z" fill="#23291e"/>
  <path d="m118 578 13-1-6 53h-16m369-69h15l12 69h-17" fill="#171e16"/>
  <path d="m78 148 414-6 37 24-446 10z" fill="#555840"/>
  <path d="m492 142 37 24v341l-22 22-16-27z" fill="#20291e"/>
  <path d="M55 168 492 160l15 369-450 6z" fill="#3c4532"/>
  <path d="m58 170 433-9v10l-428 9z" fill="#77755a"/>
  <path d="m66 180 327-1 3 318-328 7z" fill="#242c22"/>
  <path d="m78 185 305-1 4 307-310 7z" fill="#111a14"/>
  <path d="m76 500 315-6v5l-315 7z" fill="#747259"/>
  <path d="m411 191 65-1 3 297-66 2z" fill="#303a2b"/>
  <circle cx="444" cy="225" r="24" fill="#192219"/><circle cx="444" cy="225" r="19" fill="#727158"/>
  <path d="m439 209 5-3 9 33-6 2z" fill="#3c4532"/>
  <circle cx="445" cy="288" r="19" fill="#192219"/><circle cx="445" cy="288" r="14" fill="#65684f"/>
  <path d="m433 285 23 1v4l-23-1z" fill="#292f22"/>
  <path d="M421 339h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48m-48 9h48" stroke="#19251b" stroke-width="4"/>
  <circle cx="446" cy="465" r="3" fill="#bd743b"/>
  <path d="m96 531 58-1-5 13-48 1m277-12 56-1-4 13-47 1" fill="#131e16"/>
  <path d="m62 184 3 15m29 318 32-1m270-344 17-1m53 334 13-1" stroke="#878064" stroke-width="2" opacity=".4"/>
  </svg>`;

export class OpeningTelevision {
  constructor(sound) {
    this.sound=sound;this.active=false;this.sources=new Set();
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root=this.root=document.createElement('section');root.className='opening-dream';root.hidden=true;
    root.setAttribute('aria-label','Сон: телевизор и ядерные взрывы');
    root.innerHTML=`<div class="dream-set"><div class="dream-television">${prop}<div class="dream-screen"><video playsinline preload="metadata" aria-label="Запись в телевизоре"></video></div></div></div><canvas class="dream-blasts" aria-label="Ядерные взрывы во сне"></canvas><p class="dream-status" role="status" hidden></p><div class="dream-controls"><button type="button" data-dream="pause"></button><button type="button" data-dream="sound"></button><button type="button" data-dream="skip"></button></div>`;
    document.querySelector('#game').append(root);
    this.video=root.querySelector('video');this.video.src=movie;
    this.canvas=root.querySelector('canvas');this.status=root.querySelector('.dream-status');
    this.pauseButton=root.querySelector('[data-dream="pause"]');
    this.soundButton=root.querySelector('[data-dream="sound"]');
    this.skipButton=root.querySelector('[data-dream="skip"]');
    setButtonIcon(this.skipButton,'close','Пропустить сон','Esc');
    this.pauseButton.onclick=()=>this.togglePause();
    this.soundButton.onclick=()=>{this.muted=!this.muted;this.syncControls();};
    this.skipButton.onclick=()=>this.finish('skipped');
    this.video.addEventListener('ended',()=>{if(this.active&&this.record.phase==='television')this.startBlasts();});
    this.video.addEventListener('error',()=>{
      if(!this.active||this.record.phase!=='television')return;
      this.paused=true;this.status.textContent='Видео недоступно. Можно пропустить сон.';this.status.hidden=false;this.syncControls();
    });
    this.video.addEventListener('loadedmetadata',()=>this.restorePosition());
    document.addEventListener('keydown',event=>{
      if(!this.active||event.repeat)return;
      if(event.code==='Escape'){event.preventDefault();this.finish('skipped');}
      if(event.code==='Space'&&!event.target.closest('button')){event.preventDefault();this.togglePause();}
    });
    document.addEventListener('visibilitychange',()=>{
      if(this.active&&document.hidden&&!this.paused)this.togglePause();
    });
  }

  start(mission,director,{enabled=true}={}) {
    this.close();
    const data=director.bind(mission);
    if(!enabled||!data.includeOpening||director.finished('p01'))return false;
    this.director=director;
    this.record=data.openingDream??={phase:'television',position:0,elapsed:0};
    if(this.record.phase!=='television'&&this.record.phase!=='blast')this.record.phase='television';
    this.record.elapsed=Number.isFinite(this.record.elapsed)?Math.max(0,this.record.elapsed):0;
    this.seekPosition=Number.isFinite(this.record.position)?Math.max(0,this.record.position):0;
    data.active='p01';director.record('p01').status='playing';
    this.active=true;this.paused=false;this.muted=!this.sound.enabled||!this.sound.storyEnabled;
    this.status.hidden=true;this.root.hidden=false;this.root.dataset.phase=this.record.phase;
    document.body.classList.add('television-playing');
    this.sound.stopStory();this.sound.stopVoice();this.sound.setOpeningMix(true);
    if(this.sound.context){this.blastGain=this.sound.context.createGain();this.blastGain.connect(this.sound.context.destination);}
    this.syncControls();
    if(this.record.phase==='television'){
      if(!this.video.getAttribute('src'))this.video.src=movie;
      this.restorePosition();if(this.record.phase==='television')this.play();
    }
    this.previousFocus=document.activeElement;this.pauseButton.focus({preventScroll:true});
    return true;
  }

  restorePosition() {
    if(!this.active||this.record.phase!=='television'||!Number.isFinite(this.video.duration))return;
    if(this.seekPosition===null)return;
    if(this.seekPosition>=this.video.duration-.02){this.seekPosition=null;this.startBlasts();return;}
    this.video.currentTime=Math.min(this.seekPosition,this.video.duration);this.seekPosition=null;
  }

  play() {
    const record=this.record;
    this.video.play().catch(error=>{
      if(!this.active||this.record!==record||this.record.phase!=='television'||error.name==='AbortError')return;
      this.paused=true;this.status.textContent='Нажмите воспроизведение';this.status.hidden=false;this.syncControls();
    });
  }

  togglePause() {
    this.paused=!this.paused;this.status.hidden=true;
    if(this.record.phase==='television'){if(this.paused)this.video.pause();else this.play();}
    if(this.paused)this.stopBlasts();
    this.syncControls();
  }

  syncControls() {
    this.video.muted=this.muted;this.video.volume=.85;
    if(this.blastGain)this.blastGain.gain.setValueAtTime(this.muted?0:.55,this.sound.context.currentTime);
    setButtonIcon(this.pauseButton,this.paused?'play':'pause',this.paused?'Продолжить':'Пауза','Пробел');
    setButtonIcon(this.soundButton,this.muted?'muted':'sound',this.muted?'Включить звук':'Выключить звук');
    this.soundButton.setAttribute('aria-pressed',String(!this.muted));
  }

  startBlasts() {
    this.video.pause();this.record.position=this.video.duration;
    this.record.phase='blast';this.record.elapsed=0;this.root.dataset.phase='blast';
    this.status.hidden=true;
  }

  update(dt) {
    if(!this.active)return;
    if(this.record.phase==='television'){if(this.seekPosition===null)this.record.position=this.video.currentTime;return;}
    const before=this.record.elapsed;
    if(!this.paused)this.record.elapsed+=Math.max(0,Math.min(.1,dt));
    for(const [time,seed] of [[.12,51],[2.1,401],[5.6,802],[7.7,903]])if(before<time&&this.record.elapsed>=time&&this.blastGain){
      const source=playDreamBlast(this.sound.context,this.blastGain,seed);
      if(source)this.sources.add(source);
    }
    drawDreamBlasts(this.canvas,this.record.elapsed,{reducedMotion:this.reducedMotion});
    if(this.record.elapsed>=DREAM_BLAST_SECONDS)this.finish('done');
  }

  stopBlasts() {for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();}
  close() {
    const wasActive=this.active;this.active=false;
    this.video.pause();this.stopBlasts();this.blastGain?.disconnect();this.blastGain=null;
    if(wasActive){this.sound.setOpeningMix(false);this.video.removeAttribute('src');this.video.load();}
    this.canvas.width=this.canvas.height=1;
    this.root.hidden=true;document.body.classList.remove('television-playing');
  }
  finish(status) {
    if(!this.active)return;
    this.director.end(status);
    this.record.phase='finished';this.close();
    if(this.previousFocus?.isConnected&&!this.previousFocus.closest('[hidden]'))this.previousFocus.focus({preventScroll:true});
  }
}
