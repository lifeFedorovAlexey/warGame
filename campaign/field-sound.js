const clampLevel = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const driveFiles = {
  idle:'engine-idle.ogg', load:'engine-drive.ogg', asphalt:'tire-asphalt.ogg',
  gravel:'tire-gravel.ogg', skid:'tire-skid.ogg',
};
const driveBase = '../assets/campaign/alpha/mission01/vehicle-sfx/';
const radioBase = '../assets/campaign/alpha/mission01/unit-radio/';
const ambienceBase = '../assets/campaign/alpha/mission01/field-ambience/';
const voiceKinds = ['select', 'move', 'attack', 'build', 'stop'];
const voiceCooldown = 1250;
const voiceMaxAge = 1300;

export class FieldSound {
  constructor(toggle) {
    this.toggle = toggle;
    this.last = new Map();
    this.lastVoice = new Map();
    this.drivingUpdated = -Infinity;
    this.previousRolling = 0;
    this.slipping = false;
    try { this.enabled = localStorage.getItem('warGame.fieldSound') !== 'off'; }
    catch { this.enabled = true; }
    this.refresh();
    toggle.onclick = () => {
      this.enabled = !this.enabled;
      try { localStorage.setItem('warGame.fieldSound', this.enabled ? 'on' : 'off'); } catch {}
      this.refresh();
      if (this.enabled) this.unlock();
      else {
        this.pendingVoice = null;
        this.voiceSource?.stop();
        this.voiceSource = null;
        this.anomalySource?.stop();
      }
    };
  }

  refresh() {
    this.toggle.textContent = this.enabled ? 'Звук: вкл.' : 'Звук: выкл.';
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    if (this.output) this.output.gain.setTargetAtTime(this.enabled ? .62 : 0, this.context.currentTime, .018);
  }

  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) this.setup();
      await this.context.resume();
      this.playPendingVoice();
    } catch (error) { console.warn('Игровой звук недоступен:', error.message); }
  }

  setup() {
    const ctx = this.context = new AudioContext();
    this.output = ctx.createGain();
    this.output.gain.value = .62;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -15;
    this.output.connect(limiter).connect(ctx.destination);
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
    this.loadProjector();
    this.loadClip(ambienceBase, 'desert-wind.ogg')
      .then(buffer => { this.wind = this.startLoop(buffer); })
      .catch(error => console.warn('Запись ветра недоступна:', error.message));
    this.loadClip(ambienceBase, 'anomaly-pulse.ogg')
      .then(buffer => { this.anomalyClip = buffer; })
      .catch(error => console.warn('Сигнал аномалии недоступен:', error.message));
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
    source.connect(gain).connect(this.output);
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

  acknowledge(kind, ids) {
    if (!this.enabled || !ids.length || !voiceKinds.includes(kind)) return;
    const now = performance.now();
    const key = kind + ':' + JSON.stringify([...ids].sort());
    if (now - (this.lastVoice.get(key) ?? -Infinity) < voiceCooldown) return;
    const pending = this.pendingVoice;
    if (kind === 'select' && pending && pending.kind !== 'select' && now - pending.time < voiceMaxAge) return;
    this.pendingVoice = {kind, key, time:now};
    if (this.ready()) this.playPendingVoice();
    else this.unlock();
  }

  playPendingVoice() {
    if (!this.ready() || !this.voices || this.voiceSource || !this.pendingVoice) return;
    const {kind, key, time} = this.pendingVoice;
    this.pendingVoice = null;
    const now = performance.now();
    if (now - time >= voiceMaxAge) return;
    for (const [played, at] of this.lastVoice) if (now - at >= voiceCooldown) this.lastVoice.delete(played);
    const source = this.context.createBufferSource();
    this.voiceSource = source;
    source.buffer = this.voices[kind];
    source.connect(this.output);
    source.onended = () => {
      source.disconnect();
      if (this.voiceSource !== source) return;
      this.voiceSource = null;
      this.playPendingVoice();
    };
    source.start();
    this.lastVoice.set(key, now);
  }

  playSkid(level, road) {
    if (!this.recordings) return;
    const ctx=this.context, source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    source.buffer=this.recordings.skid;
    source.playbackRate.value=.83+.16*road;
    filter.type='lowpass';
    filter.frequency.value=1050+1250*road;
    gain.gain.value=level*(.48+.17*road);
    source.connect(filter).connect(gain).connect(this.output);
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
    source.connect(filter).connect(envelope).connect(stereo).connect(this.output);
    if (tone) source.start(now);
    else source.start(now, Math.random() * .55);
    source.stop(now + duration + .01);
  }

  shot(weapon, level, pan) {
    if (level < .012 || !this.limit('shot-' + weapon, .044)) return;
    if (weapon === 'flame') {
      this.transient({duration:.24, frequency:430, end:210, level:.22*level, pan});
      return;
    }
    this.transient({duration:.09, frequency:1450, end:630, level:.67*level, pan});
    this.transient({duration:.13, frequency:107, end:48, level:.34*level, pan, tone:'triangle'});
  }

  impact(level, pan) {
    if (level > .04 && this.limit('impact', .085)) this.transient({duration:.12, frequency:910, end:310, level:.17*level, pan});
  }

  update({engine = 0, rolling = 0, slip = 0, road = 0, welding = 0, field = false} = {}) {
    if (!this.ready()) return;
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
    source.connect(gain).connect(this.output);
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
