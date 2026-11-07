import {setButtonIcon} from '../assets/ui/icons.js';
const clampLevel = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

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
  }

  refresh() {
    setButtonIcon(this.toggle, this.enabled ? 'sound' : 'muted', this.enabled ? 'Звук: вкл.' : 'Звук: выкл.');
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    setButtonIcon(this.storyToggle, this.storyEnabled ? 'voice' : 'voice-off', this.storyEnabled ? 'Голос радио: вкл.' : 'Голос радио: выкл.');
    this.storyToggle.setAttribute('aria-pressed', String(this.storyEnabled));
    if (this.output) this.output.gain.setTargetAtTime(this.enabled ? .62 : 0, this.context.currentTime, .018);
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
    this.output.gain.value = .62;
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
    this.loadClip(warrantBase, 'stop.mp3')
      .then(buffer => { this.warrantStop = buffer; })
      .catch(error => console.warn('Реплика прапорщика недоступна:', error.message));
    if (this.storyEnabled) for (const chapter of ['first-contact', 'camp3-sighted']) this.storyClip(chapter);
    this.loadProjector();
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
    if (!this.enabled || !this.music.paused) return;
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
    const level = story ? (story.urgent ? .035 : .055) : this.voiceSource ? .09 : .2;
    this.musicOutput.gain.setTargetAtTime(level, this.context.currentTime, transition);
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
    if (cue) {
      const key = 'line:' + cue.id;
      if (!this.storyClips.has(key)) this.storyClips.set(key,
        this.loadClip(dialogueBase, cue.clip.file).catch(error => {
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
    const playback = this.storyPlayback = {source, gain, chapter:request.chapter, cueId:request.cue?.id, urgent:request.urgent};
    this.updateDialogueMix();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.storyPlayback !== playback) return;
      this.storyPlayback = null;
      this.updateDialogueMix();
    };
    source.start(now);
    request.keepCaptionUntil(performance.now() + (request.buffer.duration + (request.cue?.pauseAfter ?? .18)) * 1000);
  }

  updateDialogueMix() {
    const now = this.context.currentTime, story = this.storyPlayback, urgent = story?.urgent;
    this.effectsOutput.gain.setTargetAtTime(urgent ? .46 : story ? .67 : 1, now, story ? .045 : .16);
    this.combatOutput.gain.setTargetAtTime(urgent ? .82 : 1, now, urgent ? .045 : .16);
    this.commandOutput.gain.setTargetAtTime(urgent ? .54 : 1, now, urgent ? .035 : .12);
    story?.gain.gain.setTargetAtTime(urgent ? .94 : this.voiceSource ? .51 : .88, now, .035);
    this.updateMusicMix(story || this.voiceSource ? .08 : .7);
  }

  stopStory() {
    clearTimeout(this.pendingStory?.timeout);
    this.pendingStory?.releaseCaption?.();
    this.pendingStory = null;
    const playback = this.storyPlayback;
    if (!playback) return;
    this.storyPlayback = null;
    const now = this.context.currentTime;
    playback.gain.gain.setTargetAtTime(0, now, .012);
    playback.source.stop(now + .065);
    this.updateDialogueMix();
  }

  acknowledge(kind, ids) {
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
    this.storyVoices=new Map(script.barks.map(cue=>[cue.id,cue]));
    this.storyMission=mission;this.storyBusy=isBusy;this.barkTimes=new Map();
    this.seenHostiles=new Set();this.lastOrderAt=performance.now();
  }

  stopVoice() {
    this.barkRequest=null;this.pendingVoice=null;
    const source=this.voiceSource;this.voiceSource=null;this.voiceCueId=null;
    this.voiceIsWarrant=false;source?.stop();
    if(this.context)this.updateDialogueMix();
  }

  async bark(number,{cooldown=20000}={}) {
    const id='m01v2-b'+String(number).padStart(3,'0'),cue=this.storyVoices?.get(id),now=performance.now();
    if(!cue||!this.ready()||!this.storyEnabled||this.storyBusy()||this.pendingStory||this.storyPlayback||this.voiceSource)return false;
    if(now-(this.lastBarkAt??-Infinity)<3500||now-(this.barkTimes.get(id)??-Infinity)<cooldown)return false;
    const request=this.barkRequest={id,time:now};
    const buffer=await this.storyClip('unit',cue);
    // Low-priority responses expire instead of piling up behind a conversation.
    if(this.barkRequest!==request)return false;
    this.barkRequest=null;
    if(!buffer||!this.ready()||!this.storyEnabled||this.storyBusy()||this.storyPlayback||this.pendingStory||performance.now()-now>1300)return false;
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.commandOutput);
    this.voiceSource=source;this.voiceCueId=id;this.lastBarkAt=performance.now();this.barkTimes.set(id,this.lastBarkAt);
    source.onended=()=>{source.disconnect();if(this.voiceSource===source){this.voiceSource=null;this.voiceCueId=null;this.updateDialogueMix();}};
    source.start();this.updateDialogueMix();return true;
  }

  storyAcknowledgement(kind,ids) {
    const units=ids.map(id=>this.storyMission.entity(id)).filter(e=>e?.hp>0);
    if(!units.length)return;
    this.lastOrderAt=performance.now();this.idleIds=ids;
    const builder=units.every(e=>e.kind==='builder'),key=JSON.stringify([...ids].sort());
    const repeat=this.lastSelection===key;
    if(kind==='select'){this.lastSelection=key;this.bark(builder?(repeat?2:1):(repeat?7:6),{cooldown:12000});}
    else {
      this.stopVoice();
      const number=kind==='build'?3:kind==='repair'?5:kind==='attack'?8:kind==='stop'?18:null;
      if(number)this.bark(number,{cooldown:number===18?45000:16000});
    }
  }

  storyEvent(event) {
    if(!this.storyVoices)return;
    const mission=this.storyMission;
    if(event.type==='construction-complete'&&!['generator','factory','lab','bunker','derrick'].includes(event.kind))this.bark(4);
    if(event.type==='research-start')this.bark(11);
    if(event.type==='research-complete'&&!['flamethrower','mg-ammo-1','mg-tower'].includes(event.key))this.bark(12);
    if(event.type==='unit-damaged'&&mission.entity(event.target)?.kind!=='builder')this.bark(13,{cooldown:45000});
    if(event.type==='destroyed'){
      if(event.owner==='scavs')this.bark(9,{cooldown:30000});
      else if(event.kind==='command')this.bark(15);
    }
    if(event.type==='unit-produced'&&!event.first&&event.kind!=='builder')this.bark(16,{cooldown:30000});
  }

  updateStoryVoices(field) {
    if(!field||!this.storyVoices)return;
    const now=performance.now();if(now-(this.lastBarkCheck??0)<1000)return;this.lastBarkCheck=now;
    const mission=this.storyMission,visible=mission.state.units.filter(e=>e.owner==='scavs'&&e.hp>0&&mission.visibleAt(e.x,e.y));
    const discovered=visible.some(e=>!this.seenHostiles.has(e.id));
    for(const e of visible)this.seenHostiles.add(e.id);
    if(discovered&&mission.state.radioStory?.scenes.o08?.status==='done')this.bark(17,{cooldown:45000});
    if(now-this.lastOrderAt>45000&&this.idleIds?.some(id=>{const unit=mission.entity(id);return unit?.hp>0&&unit.kind!=='builder'&&!unit.task&&!unit.path?.length;}))this.bark(14,{cooldown:90000});
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

  update({engine = 0, rolling = 0, slip = 0, road = 0, welding = 0, field = false} = {}) {
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
    this.wind?.gain.gain.setTargetAtTime(field ? .16 * (1 - .5*engine) : 0, now, .28);
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
    if (!this.limit(kind, .18)) return;
    if (kind === 'radio') this.transient({duration:.13, frequency:1180, end:710, level:.055});
    else if (kind === 'complete') this.transient({duration:.25, frequency:320, end:480, level:.048, tone:'sine'});
    else this.transient({duration:.076, frequency:530, end:190, level:.042, tone:'sine'});
  }
}
