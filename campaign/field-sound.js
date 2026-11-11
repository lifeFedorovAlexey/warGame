import {setButtonIcon} from '../assets/ui/icons.js';
const clampLevel = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

// Dry sand movement and short irregular scanning passes, generated once
// when audio unlocks rather than a sustained projector tone.
export function constructionSoundBuffer(ctx){
  const buffer=ctx.createBuffer(1,ctx.sampleRate*8,ctx.sampleRate),samples=buffer.getChannelData(0);
  let seed=173,low=0,soft=0,begin=0,end=0,rest=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<samples.length;i++){
    const t=i/ctx.sampleRate;
    if(t>=rest){begin=t;end=t+.07+random()*.12;rest=end+.025+random()*.11;}
    const white=random()*2-1;low+=.035*(white-low);soft+=.28*(white-soft);
    const pulse=t<end?Math.sin(Math.PI*(t-begin)/(end-begin))**2:0;
    const seam=Math.min(1,t/.08,(8-t)/.08);
    samples[i]=((soft-low)*(.045+.17*pulse)+low*.16)*seam;
  }
  return buffer;
}

const driveFiles = {
  idle:'engine-idle.ogg', load:'engine-drive.ogg', asphalt:'tire-asphalt.ogg',
  gravel:'tire-gravel.ogg', skid:'tire-skid.ogg',
};
const driveBase = '../assets/campaign/alpha/mission01/vehicle-sfx/';
const radioBase = '../assets/campaign/alpha/mission01/unit-radio/';
const warrantBase = '../assets/campaign/alpha/mission01/warrant-radio/';
const storyBase = '../assets/campaign/alpha/mission01/field-radio/';
const dialogueBase = '../assets/campaign/alpha/mission01/';
const ambienceBase = '../assets/campaign/alpha/mission01/field-ambience/';
const combatBase = '../assets/campaign/alpha/mission01/combat-sfx/';
const combatFiles = {
  mg:'mg-burst.ogg', flame:'flame-roar.ogg', armor:'armor-hit.ogg',
  structure:'structure-hit.ogg', debris:'debris-fall.ogg',
};
const combatVoiceLimit = 10;
const voiceKinds = ['select', 'move', 'attack', 'build', 'stop'];
const voiceCooldown = 1250;
const warrantStopCooldown = 45000;
const voiceMaxAge = 1300;
const storyMaxAge = 1500;

export class FieldSound {
  constructor(toggle, storyToggle) {
    this.toggle = toggle;
    this.storyToggle = storyToggle;
    this.last = new Map();
    this.lastVoice = new Map();
    this.combatClips = new Map();
    this.combatVoices = new Set();
    this.storyClips = new Map();
    this.drivingUpdated = -Infinity;
    this.previousRolling = 0;
    this.slipping = false;
    try { this.enabled = localStorage.getItem('warGame.fieldSound') !== 'off'; }
    catch { this.enabled = true; }
    try { this.storyEnabled = localStorage.getItem('warGame.fieldStoryVoice') !== 'off'; }
    catch { this.storyEnabled = true; }
    this.refresh();
    toggle.onclick = () => {
      this.enabled = !this.enabled;
      try { localStorage.setItem('warGame.fieldSound', this.enabled ? 'on' : 'off'); } catch {}
      this.refresh();
      if (this.enabled) this.unlock();
      else {
        this.music?.pause();
        this.memorialMusic?.pause();
        this.stopStory();
        this.pendingVoice = null;
        this.voiceSource?.stop();
        this.voiceSource = null;
        this.anomalySource?.stop();
        for (const source of this.combatVoices) source.stop();
      }
    };
    storyToggle.onclick = () => {
      this.storyEnabled = !this.storyEnabled;
      try { localStorage.setItem('warGame.fieldStoryVoice', this.storyEnabled ? 'on' : 'off'); } catch {}
      if (!this.storyEnabled) this.stopStory();
      this.refresh();
    };
    this.menu=document.getElementById('welcome');
    if(this.menu)new MutationObserver(()=>{
      if(this.menu.hidden)this.playMusic();else {this.music?.pause();this.memorialMusic?.pause();}
    }).observe(this.menu,{attributes:true,attributeFilter:['hidden']});
  }

  refresh() {
    setButtonIcon(this.toggle, this.enabled ? 'sound' : 'muted', this.enabled ? 'Звук: вкл.' : 'Звук: выкл.');
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    setButtonIcon(this.storyToggle, this.storyEnabled ? 'voice' : 'voice-off', this.storyEnabled ? 'Голос радио: вкл.' : 'Голос радио: выкл.');
    this.storyToggle.setAttribute('aria-pressed', String(this.storyEnabled));
    if (this.output) this.output.gain.setTargetAtTime(this.enabled && !this.openingMix ? .62 : 0, this.context.currentTime, .018);
  }

  setOpeningMix(active) { this.openingMix=active;this.refresh(); }

  setMemorialMix(active) {
    this.memorialMix=active;
    clearTimeout(this.memorialPauseTimer);
    clearTimeout(this.fieldPauseTimer);
    if(this.context){
      this.updateMusicMix(.55);
      if(active){this.playMemorialMusic();this.fieldPauseTimer=setTimeout(()=>{if(this.memorialMix)this.music?.pause();},1500);}
      else {this.playMusic();this.memorialPauseTimer=setTimeout(()=>{if(!this.memorialMix)this.memorialMusic?.pause();},1500);}
    }
  }

  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) this.setup();
      this.playMusic();
      await this.context.resume();
      this.playPendingVoice();
      this.playPendingStory();
    } catch (error) { console.warn('Игровой звук недоступен:', error.message); }
  }

  setup() {
    const ctx = this.context = new AudioContext();
    this.output = ctx.createGain();
    this.output.gain.value = this.openingMix ? 0 : .62;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -15;
    this.output.connect(limiter).connect(ctx.destination);
    this.effectsOutput = ctx.createGain();
    this.effectsOutput.connect(this.output);
    this.combatOutput = ctx.createGain();
    this.combatOutput.connect(this.output);
    this.commandOutput = ctx.createGain();
    this.commandOutput.connect(this.output);
    // Stream the full soundtrack; only short effects are decoded into buffers.
    this.music = new Audio(new URL('../assets/music/abandoned-technology.mp3', import.meta.url).href);
    this.music.loop = true;
    this.music.preload = 'metadata';
    this.musicOutput = ctx.createGain();
    this.musicOutput.gain.value = 0;
    this.musicSource = ctx.createMediaElementSource(this.music);
    this.musicSource.connect(this.musicOutput).connect(this.output);
    this.memorialMusic = new Audio(new URL('../assets/music/memorial-red-banner.mp3', import.meta.url).href);
    this.memorialMusic.loop=true;this.memorialMusic.preload='metadata';
    this.memorialMusicOutput=ctx.createGain();this.memorialMusicOutput.gain.value=0;
    this.memorialMusicSource=ctx.createMediaElementSource(this.memorialMusic);
    this.memorialMusicSource.connect(this.memorialMusicOutput).connect(this.output);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    let low = 0;
    for (let i = 0; i < samples.length; i++) {
      const white = Math.random() * 2 - 1;
      low = .82 * low + .18 * white;
      samples[i] = white * .73 + low * .27;
    }
    this.loadRecordings();
    this.loadVoices();
    this.loadClip(combatBase,'attack-warning.ogg')
      .then(buffer=>{this.attackAlert=buffer;})
      .catch(error=>console.warn('Сигнал нападения недоступен:',error.message));
    this.loadClip(warrantBase, 'stop.mp3')
      .then(buffer => { this.warrantStop = buffer; })
      .catch(error => console.warn('Реплика прапорщика недоступна:', error.message));
    if (this.storyEnabled) for (const chapter of ['first-contact', 'camp3-sighted']) this.storyClip(chapter);
    this.loadProjector();
    this.construction=this.startLoop(constructionSoundBuffer(ctx));
    for (const [kind, file] of Object.entries(combatFiles)) {
      this.loadClip(combatBase, file)
        .then(buffer => this.combatClips.set(kind, buffer))
        .catch(error => console.warn('Боевой звук недоступен:', error.message));
    }
    this.loadClip(ambienceBase, 'desert-wind.ogg')
      .then(buffer => { this.wind = this.startLoop(buffer); })
      .catch(error => console.warn('Запись ветра недоступна:', error.message));
    this.loadClip(ambienceBase, 'anomaly-pulse.ogg')
      .then(buffer => { this.anomalyClip = buffer; })
      .catch(error => console.warn('Сигнал аномалии недоступен:', error.message));
  }

  playMusic() {
    if(this.memorialMix){this.playMemorialMusic();return;}
    if (!this.enabled || !this.music || this.menu&&!this.menu.hidden || !this.music.paused) return;
    const now = this.context.currentTime;
    this.musicOutput.gain.cancelScheduledValues(now);
    this.musicOutput.gain.setValueAtTime(0, now);
    this.updateMusicMix(.8);
    this.music.play().catch(error => {
      if (error.name !== 'AbortError') console.warn('Фоновая музыка недоступна:', error.message);
    });
  }

  updateMusicMix(transition = .7) {
    const story = this.storyPlayback;
    const level = this.memorialMix ? 0 : story ? (story.urgent ? .035 : .055) : this.voiceSource ? .09 : .2;
    this.musicOutput.gain.setTargetAtTime(level, this.context.currentTime, transition);
    this.memorialMusicOutput?.gain.setTargetAtTime(this.memorialMix?.26:0,this.context.currentTime,transition);
  }

  playMemorialMusic(){
    if(!this.enabled||!this.memorialMix||!this.memorialMusic||this.menu&&!this.menu.hidden)return;
    this.updateMusicMix(.55);
    if(this.memorialMusic.paused)this.memorialMusic.play().catch(error=>{if(error.name!=='AbortError')console.warn('Музыка экрана памяти недоступна:',error.message);});
  }

  async loadClip(base, file) {
    const response = await fetch(base + file);
    if (!response.ok) throw new Error(file + ' · ' + response.status);
    return this.context.decodeAudioData(await response.arrayBuffer());
  }

  startLoop(buffer) {
    const ctx = this.context, source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    source.connect(gain).connect(this.effectsOutput);
    source.start();
    return {source, gain};
  }

  async loadRecordings() {
    try {
      const clips = await Promise.all(Object.entries(driveFiles).map(async ([name,file]) =>
        [name, await this.loadClip(driveBase, file)]));
      const buffers = Object.fromEntries(clips);
      const loops = {};
      for (const name of ['idle','load','asphalt','gravel']) {
        loops[name] = this.startLoop(buffers[name]);
      }
      this.recordings = {loops, skid:buffers.skid};
    } catch (error) {
      console.warn('Записи машин недоступны:', error.message);
    }
  }

  async loadProjector() {
    try {
      this.projector = this.startLoop(await this.loadClip(driveBase, 'projector-hum.ogg'));
    } catch (error) {
      console.warn('Запись проектора недоступна:', error.message);
    }
  }

  async loadVoices() {
    try {
      const clips = await Promise.all(voiceKinds.map(async kind =>
        [kind, await this.loadClip(radioBase, kind + '.ogg')]));
      this.voices = Object.fromEntries(clips);
      this.playPendingVoice();
    } catch (error) {
      this.pendingVoice = null;
      console.warn('Реплики техники недоступны:', error.message);
    }
  }

  storyClip(chapter, cue) {
    if(cue&&!cue.clip?.file)return Promise.resolve(null);
    if (cue) {
      // A dynamic phrase ID may realize different counts or a different crew voice.
      const key = cue.dynamic?'dynamic:'+cue.clip.base+cue.clip.file:'line:'+cue.id;
      if(cue.dynamic&&this.storyClips.size>=256)this.storyClips.delete(this.storyClips.keys().next().value);
      if (!this.storyClips.has(key)) this.storyClips.set(key,
        this.loadClip(cue.clip.base??dialogueBase, cue.clip.file).catch(error => {
          this.storyClips.delete(key);
          console.warn('Реплика сюжета недоступна:', error.message);
          return null;
        }));
      return this.storyClips.get(key);
    }
    this.storyManifest ??= fetch(storyBase + 'manifest.json').then(response => {
      if (!response.ok) throw new Error('manifest.json · ' + response.status);
      return response.json();
    }).catch(error => {
      console.warn('Голос радио недоступен:', error.message);
      return {};
    });
    if (!this.storyClips.has(chapter)) {
      const clip = this.storyManifest.then(manifest => {
        const file = manifest[chapter]?.file;
        return file ? this.loadClip(storyBase, file) : null;
      }).catch(error => {
        this.storyClips.delete(chapter);
        console.warn('Реплика радио недоступна:', error.message);
        return null;
      });
      this.storyClips.set(chapter, clip);
    }
    return this.storyClips.get(chapter);
  }

  playStory(chapter, keepCaptionUntil, urgent = false, cue = null) {
    this.stopStory();
    if(this.storyVoices&&chapter)this.stopVoice();
    if (!chapter || !this.enabled || !this.storyEnabled || !this.context) return;
    const request = {chapter, urgent, cue, keepCaptionUntil, time:performance.now()};
    this.pendingStory = request;
    const scene=this.storyScenes?.get(cue?.storyScene),index=scene?.cues.indexOf(cue.id)??-1;
    if(index>=0)for(const id of scene.cues.slice(index+1,index+3))this.storyClip(chapter,this.storyLines.get(id));
    if (cue) {
      keepCaptionUntil(Infinity);
      request.releaseCaption = () => keepCaptionUntil(performance.now() + Math.max(2200, cue.text.length * 60));
      // Slow or unavailable audio falls back to readable subtitles, without hanging the dialogue.
      request.timeout = setTimeout(() => {
        if (this.pendingStory !== request) return;
        this.pendingStory = null;
        request.releaseCaption();
      }, 15000);
    }
    this.storyClip(chapter, cue).then(buffer => {
      if (this.pendingStory !== request) return;
      if (!buffer) {
        this.pendingStory = null;
        clearTimeout(request.timeout);
        request.releaseCaption?.();
        return;
      }
      request.buffer = buffer;
      this.playPendingStory();
    });
  }

  playPendingStory() {
    const request = this.pendingStory;
    if (!request?.buffer || !this.ready()) return;
    this.pendingStory = null;
    clearTimeout(request.timeout);
    if (!request.cue && performance.now() - request.time >= storyMaxAge) return;
    const ctx = this.context, now = ctx.currentTime, source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = request.buffer;
    gain.gain.value = 0;
    source.connect(gain).connect(this.output);
    let volume=request.cue?.dynamic?Math.max(0,Math.min(1,request.cue.volume??1)):1;
    if(request.cue?.dynamic&&request.cue.normalize){
      this.radioNormalization??=new WeakMap();
      if(!this.radioNormalization.has(request.buffer)){
        let peak=0;for(let c=0;c<request.buffer.numberOfChannels;c++)for(const sample of request.buffer.getChannelData(c))peak=Math.max(peak,Math.abs(sample));
        this.radioNormalization.set(request.buffer,peak>.001?Math.min(4,.85/peak):1);
      }
      volume*=this.radioNormalization.get(request.buffer);
    }
    const playback = this.storyPlayback = {source, gain, chapter:request.chapter, cueId:request.cue?.id, urgent:request.urgent,volume,
      releaseCaption:request.releaseCaption};
    const gap=Math.max(0,(request.cue?.pauseAfter??.18)-(request.cue?.clip?.trailingSilence??0));
    this.updateDialogueMix();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.storyPlayback !== playback) return;
      this.storyPlayback = null;
      this.updateDialogueMix();
      request.keepCaptionUntil(performance.now()+gap*1000);
    };
    source.start(now);
    // Advance on AudioBuffer completion: a wall-clock deadline can cut the tail
    // when the audio context starts late or is suspended by the browser.
    request.keepCaptionUntil(request.cue?Infinity:performance.now()+(request.buffer.duration+gap)*1000);
  }

  updateDialogueMix() {
    const now = this.context.currentTime, story = this.storyPlayback, urgent = story?.urgent;
    this.effectsOutput.gain.setTargetAtTime(urgent ? .46 : story ? .67 : 1, now, story ? .045 : .16);
    this.combatOutput.gain.setTargetAtTime(urgent ? .82 : 1, now, urgent ? .045 : .16);
    this.commandOutput.gain.setTargetAtTime(urgent ? .54 : 1, now, urgent ? .035 : .12);
    story?.gain.gain.setTargetAtTime((urgent ? .94 : this.voiceSource ? .51 : .88)*(story.volume??1), now, .035);
    this.updateMusicMix(story || this.voiceSource ? .08 : .7);
  }

  stopStory() {
    clearTimeout(this.pendingStory?.timeout);
    this.pendingStory?.releaseCaption?.();
    this.pendingStory = null;
    const playback = this.storyPlayback;
    if (!playback) return;
    this.storyPlayback = null;
    playback.releaseCaption?.();
    const now = this.context.currentTime;
    playback.gain.gain.setTargetAtTime(0, now, .012);
    playback.source.stop(now + .065);
    this.updateDialogueMix();
  }

  acknowledge(kind, ids) {
    if(this.storyMission?.radioObserver?.owns('command.'+kind,ids.length))return;
    if(this.storyVoices)return this.storyAcknowledgement(kind,ids);
    if (!this.enabled || !ids.length || !voiceKinds.includes(kind)) return;
    const now = performance.now();
    const key = kind + ':' + JSON.stringify([...ids].sort());
    if (now - (this.lastVoice.get(key) ?? -Infinity) < voiceCooldown) return;
    const pending = this.pendingVoice;
    if (kind === 'select' && pending && pending.kind !== 'select' && now - pending.time < voiceMaxAge) return;
    // A long idle remark must never hold up an acknowledgement of a new order.
    if (this.voiceIsWarrant && this.voiceSource && kind !== 'select' && kind !== 'stop') {
      const previous = this.voiceSource;
      this.voiceSource = null;
      this.voiceIsWarrant = false;
      previous.stop();
    }
    this.pendingVoice = {kind, key, time:now};
    if (this.ready()) this.playPendingVoice();
    else this.unlock();
  }

  playPendingVoice() {
    if(this.storyVoices)return;
    if (!this.ready() || !this.voices || this.voiceSource || !this.pendingVoice) return;
    const {kind, key, time} = this.pendingVoice;
    this.pendingVoice = null;
    const now = performance.now();
    if (now - time >= voiceMaxAge) return;
    for (const [played, at] of this.lastVoice) if (now - at >= voiceCooldown) this.lastVoice.delete(played);
    const source = this.context.createBufferSource();
    this.voiceSource = source;
    this.updateDialogueMix();
    this.voiceIsWarrant = kind === 'stop' && !!this.warrantStop && !this.storyPlayback &&
      now - (this.lastWarrantStop ?? -Infinity) >= warrantStopCooldown;
    source.buffer = this.voiceIsWarrant ? this.warrantStop : this.voices[kind];
    if (this.voiceIsWarrant) this.lastWarrantStop = now;
    source.connect(this.commandOutput);
    source.onended = () => {
      source.disconnect();
      if (this.voiceSource !== source) return;
      this.voiceSource = null;
      this.voiceIsWarrant = false;
      this.playPendingVoice();
      this.updateDialogueMix();
    };
    source.start();
    this.lastVoice.set(key, now);
  }

  configureStoryVoices(script,mission,isBusy) {
    this.storyVoices=new Map(script.barks.map(cue=>[cue.event,cue]));
    this.storyScenes=new Map(script.scenes.map(scene=>[scene.id,scene]));
    this.storyLines=new Map(script.dialogue.map(cue=>[cue.id,cue]));
    this.storyMission=mission;this.storyBusy=isBusy;this.barkTimes=new Map();
    this.seenHostiles=new Set();this.lastOrderAt=performance.now();
  }

  stopVoice() {
    this.barkRequest=null;this.pendingVoice=null;
    const source=this.voiceSource;this.voiceSource=null;this.voiceCueId=null;
    this.voiceIsWarrant=false;source?.stop();
    if(this.context)this.updateDialogueMix();
  }

  async bark(event,{cooldown=60000}={}) {
    if(this.storyMission.radioObserver?.warmingUp)return false;
    const cue=this.storyVoices?.get(event),id=cue?.id,now=performance.now(),story=this.storyMission.state.radioStory;
    if(this.storyMission.radioObserver?.engine.enabled&&cue?.clip?.origin==='temporary-synthesis')return false;
    if(!cue||!this.ready()||!this.storyEnabled||this.storyBusy()||this.pendingStory||this.storyPlayback||this.voiceSource)return false;
    if(story&&story.clock-story.lastCombat<8000)return false;
    if(now-(this.lastBarkAt??-Infinity)<45000||now-(this.barkTimes.get(id)??-Infinity)<cooldown||story&&story.clock-(story.facts.lastChatterAt??-Infinity)<45000)return false;
    const request=this.barkRequest={id,time:now};
    const buffer=await this.storyClip('unit',cue);
    // Low-priority responses expire instead of piling up behind a conversation.
    if(this.barkRequest!==request)return false;
    this.barkRequest=null;
    if(!buffer||this.storyMission.radioObserver?.warmingUp||!this.ready()||!this.storyEnabled||this.storyBusy()||this.storyPlayback||this.pendingStory||performance.now()-now>1300||story&&story.clock-story.lastCombat<8000)return false;
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.commandOutput);
    this.voiceSource=source;this.voiceCueId=id;this.lastBarkAt=performance.now();this.barkTimes.set(id,this.lastBarkAt);
    if(story)story.facts.lastChatterAt=story.clock;
    source.onended=()=>{source.disconnect();if(this.voiceSource===source){this.voiceSource=null;this.voiceCueId=null;this.updateDialogueMix();}};
    source.start();this.updateDialogueMix();return true;
  }

  storyAcknowledgement(kind,ids) {
    const units=ids.map(id=>this.storyMission.entity(id)).filter(e=>e?.hp>0);
    if(!units.length)return;
    this.lastOrderAt=performance.now();this.idleIds=ids;
    if(kind!=='select') {
      this.stopVoice();
      if(kind==='stop')this.bark('a14');
    }
  }

  storyEvent(event) {
    if(!this.storyVoices)return;
    const mission=this.storyMission;
    const dynamicType=event.type==='destroyed'&&event.kind==='command'?'damage.commander_down':{'factory-repair-start':'repair.start_factory','factory-repair-complete':'repair.complete','research-start':'research.start','research-complete':'research.complete','unit-produced':'factory.vehicle_complete','unit-damaged':'damage.hit'}[event.type];
    if(dynamicType&&mission.radioObserver?.owns(dynamicType))return;
    if(event.type==='factory-repair-start'){
      const variant=(this.factoryBarkVariant??0)%2;this.factoryBarkVariant=variant+1;
      this.bark(variant?'factory-repair-start-alt':'factory-repair-start');
    }
    if(event.type==='factory-repair-complete')this.bark('factory-repair-complete');
    if(event.type==='research-start')this.bark('a07');
    if(event.type==='research-complete'&&!['flamethrower','mg-ammo-1','mg-tower'].includes(event.key))this.bark('a08');
    // A damage quip may use the first quiet moment, but never arrive minutes late.
    if(event.type==='unit-damaged'&&mission.entity(event.target)?.kind!=='builder'&&this.afterCombatBark?.event!=='a11')
      this.afterCombatBark={event:'a09',target:event.target,state:mission.state,expires:performance.now()+16000};
    if(event.type==='destroyed'&&event.owner==='rai'&&event.kind==='command')
      this.afterCombatBark={event:'a11',state:mission.state,expires:performance.now()+16000};
    if(event.type==='unit-produced'&&!event.first&&event.kind!=='builder')this.bark('a12');
  }

  updateStoryVoices(field) {
    if(!field||!this.storyVoices)return;
    const now=performance.now();if(now-(this.lastBarkCheck??0)<1000)return;this.lastBarkCheck=now;
    const mission=this.storyMission,visible=mission.state.units.filter(e=>e.owner==='scavs'&&e.hp>0&&mission.visibleAt(e.x,e.y));
    const pending=this.afterCombatBark;
    if(pending){
      if(pending.expires<now||pending.state!==mission.state||pending.target&&!mission.entity(pending.target))this.afterCombatBark=null;
      else this.bark(pending.event).then(played=>{if(played&&this.afterCombatBark===pending)this.afterCombatBark=null;});
    }
    const discovered=visible.some(e=>!this.seenHostiles.has(e.id));
    for(const e of visible)this.seenHostiles.add(e.id);
    if(discovered&&mission.state.flags.raidWon)this.bark('a13');
    if(!mission.radioObserver?.owns('idle.group_no_order')&&now-this.lastOrderAt>45000&&this.idleIds?.some(id=>{const unit=mission.entity(id);return unit?.hp>0&&unit.kind!=='builder'&&!unit.task&&!unit.path?.length;}))this.bark('a10',{cooldown:90000});
    if(mission.state.energy<=0&&mission.state.buildings.some(b=>b.owner==='rai'&&(b.queue.length||b.research)))this.bark('a06',{cooldown:90000});
    this.repairTargets??=new Map();
    for(const [id,hp] of this.repairTargets){
      const unit=mission.entity(id);
      if(unit?.hp>hp&&unit.hp>=unit.maxHp)this.bark('a05');
    }
    this.repairTargets.clear();
    for(const builder of mission.state.units.filter(e=>e.owner==='rai'&&e.task?.type==='repair')){
      const unit=mission.entity(builder.task.targetId);
      if(unit&&mission.config.units[unit.kind])this.repairTargets.set(unit.id,unit.hp);
    }
  }

  playSkid(level, road) {
    if (!this.recordings) return;
    const ctx=this.context, source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    source.buffer=this.recordings.skid;
    source.playbackRate.value=.83+.16*road;
    filter.type='lowpass';
    filter.frequency.value=1050+1250*road;
    gain.gain.value=level*(.48+.17*road);
    source.connect(filter).connect(gain).connect(this.effectsOutput);
    source.start();
  }

  ready() { return this.enabled && this.context?.state === 'running'; }

  limit(key, seconds) {
    if (!this.ready()) return false;
    const now = this.context.currentTime;
    if (now - (this.last.get(key) ?? -Infinity) < seconds) return false;
    this.last.set(key, now);
    return true;
  }

  transient({duration, frequency, level, tone, end, pan = 0, q = .6, hold = 0}) {
    const ctx = this.context, now = ctx.currentTime;
    const source = tone ? ctx.createOscillator() : ctx.createBufferSource();
    const filter = ctx.createBiquadFilter(), envelope = ctx.createGain(), stereo = ctx.createStereoPanner();
    stereo.pan.value = Math.max(-1, Math.min(1, pan));
    filter.type = tone ? 'lowpass' : 'bandpass';
    filter.frequency.value = tone ? 2400 : frequency;
    filter.Q.value = q;
    if (tone) {
      source.type = tone;
      source.frequency.setValueAtTime(frequency, now);
      source.frequency.exponentialRampToValueAtTime(end ?? frequency, now + duration);
    } else {
      source.buffer = this.noise;
      if (end) filter.frequency.exponentialRampToValueAtTime(end, now + duration);
    }
    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(level, now + .008);
    if (hold > 0) envelope.gain.setValueAtTime(level, now + .008 + hold);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter).connect(envelope).connect(stereo).connect(this.effectsOutput);
    if (tone) source.start(now);
    else source.start(now, Math.random() * .55);
    source.stop(now + duration + .01);
  }

  playCombat(kind, level, pan) {
    const clip = this.combatClips.get(kind);
    if (!clip || this.combatVoices.size >= combatVoiceLimit) return;
    const ctx = this.context, source = ctx.createBufferSource();
    const gain = ctx.createGain(), stereo = ctx.createStereoPanner();
    source.buffer = clip;
    source.playbackRate.value = .96 + Math.random() * .08;
    gain.gain.value = level;
    stereo.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
    source.connect(gain).connect(stereo).connect(this.combatOutput);
    this.combatVoices.add(source);
    source.onended = () => {
      this.combatVoices.delete(source);
      source.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
    source.start();
  }

  shot(weapon, level, pan) {
    if(weapon==='grenade')return;
    const kind = weapon === 'flame' ? 'flame' : 'mg';
    const volume = clampLevel(level);
    if (volume < .012 || !this.limit('shot-' + kind, .044)) return;
    this.playCombat(kind, volume * (kind === 'flame' ? .61 : weapon==='rifle'?.40:.92), pan);
  }

  impact(level, pan, surface = 'armor') {
    const volume = clampLevel(level);
    if (volume <= .04 || surface === 'flame') return;
    const debris = surface === 'debris';
    const kind = debris ? 'debris' : ['ground','structure'].includes(surface) ? 'structure' : 'armor';
    if (this.limit(debris ? 'debris' : 'impact', debris ? .32 : .085)) {
      this.playCombat(kind, volume * (debris ? .72 : .46), pan);
    }
  }

  update({engine = 0, rolling = 0, slip = 0, road = 0, welding = 0, construction = 0, field = false} = {}) {
    if (!this.ready()) return;
    this.updateStoryVoices(field);
    const now = this.context.currentTime;
    if (now - this.drivingUpdated < 1 / 30) return;
    const dt = now - this.drivingUpdated;
    this.drivingUpdated = now;
    engine = clampLevel(engine);
    rolling = clampLevel(rolling);
    slip = clampLevel(slip);
    road = clampLevel(road);
    welding = clampLevel(welding);
    construction = field ? clampLevel(construction) : 0;
    const acceleration = dt < .25 ? clampLevel((rolling - this.previousRolling) / dt * .28) : 0;
    this.previousRolling = rolling;
    const load = clampLevel(.68 * rolling + .52 * slip + .32 * acceleration);
    if (this.recordings) {
      const {idle,load:drive,asphalt,gravel}=this.recordings.loops;
      const transition=clampLevel((load-.12)/.62),tireLevel=Math.pow(rolling,.86);
      idle.gain.gain.setTargetAtTime(engine*(1-transition)*.73,now,.16);
      idle.source.playbackRate.setTargetAtTime(.96+.16*load,now,.15);
      drive.gain.gain.setTargetAtTime(engine*transition*.95,now,.16);
      drive.source.playbackRate.setTargetAtTime(.87+.56*load,now,.15);
      asphalt.gain.gain.setTargetAtTime(tireLevel*road*.25,now,.12);
      asphalt.source.playbackRate.setTargetAtTime(.68+.49*rolling,now,.16);
      gravel.gain.gain.setTargetAtTime(tireLevel*(1-road)*.30,now,.12);
      gravel.source.playbackRate.setTargetAtTime(.66+.53*rolling,now,.16);
    }
    if (slip < .09) this.slipping=false;
    if (slip > .18 && !this.slipping && this.limit('tire-slip',.35)) {
      this.slipping=true;
      this.playSkid(slip,road);
    }
    this.projector?.gain.gain.setTargetAtTime(.56*welding, now, .12);
    this.construction?.gain.gain.setTargetAtTime(.7*construction, now, .08);
    this.wind?.gain.gain.setTargetAtTime(this.memorialMix ? .13+.035*Math.sin(now*.41)+.018*Math.sin(now*.87) : field ? .16 * (1 - .5*engine) : 0, now, .4);
  }

  anomaly() {
    if (!this.anomalyClip || !this.limit('anomaly', 3)) return;
    const ctx = this.context, source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = this.anomalyClip;
    gain.gain.value = .7;
    source.connect(gain).connect(this.effectsOutput);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.anomalySource === source) this.anomalySource = null;
    };
    this.anomalySource = source;
    source.start();
  }

  signal(kind) {
    if(kind==='attack'){
      if(!this.attackAlert||!this.limit('attack',8))return;
      const ctx=this.context,source=ctx.createBufferSource();
      source.buffer=this.attackAlert;
      source.connect(this.effectsOutput);source.onended=()=>source.disconnect();source.start();
      return;
    }
    if (!this.limit(kind, .18)) return;
    if (kind === 'radio') this.transient({duration:.13, frequency:1180, end:710, level:.055});
    else if (kind === 'complete') this.transient({duration:.25, frequency:320, end:480, level:.048, tone:'sine'});
    else this.transient({duration:.076, frequency:530, end:190, level:.042, tone:'sine'});
  }
}
