import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(import.meta.dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const base = 'assets/campaign/alpha/mission01/';
const queue = read('docs/campaign/alpha/voice/warrant-recording-queue.json');
const commanderQueue = read('docs/campaign/alpha/voice/commander-recording-queue.json');
const queues = {warrant:queue,commander:commanderQueue};
const story = read(base + 'story.json');
const canonical = story.dialogue.filter(cue => cue.speaker === 'warrant');
const recordings = read(base + 'audio-overrides.json').clips;
const reactions = read(base + 'audio-overrides.json').reactions ?? {};
const audio = read(base + 'audio.json');
assert.equal(queue.lines.length, 24);
assert.deepEqual(queue.lines.map(({id, text}) => ({id, text})), canonical.map(({id, text}) => ({id, text})));
assert.deepEqual(commanderQueue.lines.map(({id,text}) => ({id,text})), story.dialogue.filter(cue => cue.speaker === 'commander').map(({id,text}) => ({id,text})));
for (const clip of Object.values(read(base + 'warrant-radio/manifest.json').clips)) {
  const bytes = fs.readFileSync(path.join(root, base, 'warrant-radio', clip.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
}
for (const [id, recording] of Object.entries(recordings)) {
  const clip = audio.clips[id], speakerQueue = queues[recording.speaker];
  const entry = [...speakerQueue.lines,...(speakerQueue.barks ?? [])].find(cue => cue.id === id);
  assert.equal(clip.file, recording.file);
  assert.equal(clip.origin, 'user-recording');
  assert.equal(entry.status, 'recorded');
  const bytes = fs.readFileSync(path.join(root, base, clip.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), recording.sha256);
  assert.equal(clip.sha256, recording.sha256);
}
const fieldRecordings = read(base + 'field-radio/manifest.json');
for (const cue of commanderQueue.fieldRadio.filter(cue => cue.status === 'recorded')) {
  const clip = fieldRecordings[cue.id];
  assert.equal(clip.text, cue.text);
  assert.equal(clip.origin, 'user-recording');
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,base,'field-radio',clip.file))).digest('hex'), clip.sha256);
}
for (const [id, recording] of Object.entries(reactions)) {
  const clip = audio.reactions[id];
  assert.equal(queue.nonverbal.find(cue => cue.id === id).status, 'recorded');
  assert.equal(clip.afterCue, recording.afterCue);
  assert(read(base + 'story.json').dialogue.some(cue => cue.id === clip.afterCue));
  assert.equal(clip.sha256, createHash('sha256').update(fs.readFileSync(path.join(root, base, clip.file))).digest('hex'));
}

const browser = await chromium.launch({
  executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true,
  args:['--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://wargame.test/**', async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    if (pathname === '/campaign/voice-check.html') {
      return route.fulfill({contentType:'text/html', body:'<button id="sound"></button><button id="voice"></button><button id="radio-toggle"></button><section id="radio" hidden><strong></strong><p></p><button data-focus></button><button data-dismiss></button></section>'});
    }
    const file = path.resolve(root, '.' + pathname);
    assert(file.startsWith(root + path.sep));
    const mime = {'.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg', '.ogg':'audio/ogg'}[path.extname(file)];
    await route.fulfill({path:file, contentType:mime ?? 'application/octet-stream'});
  });
  await page.goto('http://wargame.test/campaign/voice-check.html');
  await page.evaluate(async () => {
    const {FieldSound} = await import('./field-sound.js');
    const {FieldRadio} = await import('./field-radio.js');
    const sound = window.sound = new FieldSound(document.querySelector('#sound'), document.querySelector('#voice'));
    await sound.unlock();
    window.radio = new FieldRadio(document.querySelector('#radio'), document.querySelector('#radio-toggle'), {
      onFocus() {}, onSignal(signal, chapter, until, urgent) { sound.playStory(chapter, until, urgent); },
    });
    window.mission = {
      state:{status:'running', flags:{}, research:{'mg-ammo-1':true}, pendingCinematics:[], camps:[]}, config:{}, field:{},
      finishCinematic(chapter) { this.state.pendingCinematics.splice(this.state.pendingCinematics.indexOf(chapter), 1); },
    };
  });
  await page.waitForFunction(() => sound.ready() && sound.voices && sound.warrantStop);
  await page.evaluate(() => {
    mission.state.pendingCinematics.push('research-mg-ammo-1');
    radio.consume(mission, performance.now());
  });
  await page.waitForFunction(() => sound.storyPlayback?.chapter === 'research-mg-ammo-1');
  assert.deepEqual(await page.evaluate(() => radio.queue.map(entry => entry.chapter)), ['warrant-upgrade']);
  await page.evaluate(() => { radio.until = 0; radio.consume(mission, performance.now()); });
  await page.waitForFunction(() => sound.storyPlayback?.chapter === 'warrant-upgrade');
  const upgrade = await page.evaluate(() => ({duration:sound.storyPlayback.source.buffer.duration, captionRemaining:(radio.until - performance.now()) / 1000, text:document.querySelector('#radio p').textContent}));
  assert(Math.abs(upgrade.duration - 14.367) < .05);
  assert(upgrade.captionRemaining > 13.5, 'The complete long remark keeps its subtitle visible');
  assert.equal(upgrade.text, read(base + 'warrant-radio/manifest.json').clips.upgrade.text);
  await page.evaluate(() => {
    mission.state.status = 'victory';
    mission.state.pendingCinematics.push('victory');
    radio.consume(mission, performance.now());
  });
  await page.waitForFunction(() => sound.storyPlayback?.chapter === 'victory');
  const victory = await page.evaluate(() => ({duration:sound.storyPlayback.source.buffer.duration,text:document.querySelector('#radio p').textContent,captionRemaining:(radio.until-performance.now())/1000}));
  assert.equal(victory.text, commanderQueue.fieldRadio.find(cue => cue.id === 'victory').text);
  assert(Math.abs(victory.duration - fieldRecordings.victory.duration) < .05);
  assert(victory.captionRemaining > victory.duration - .25);
  await page.evaluate(() => radio.setEnabled(false));
  assert.equal(await page.evaluate(() => !!sound.storyPlayback || radio.queue.length > 0), false);

  const stop = await page.evaluate(() => {
    sound.acknowledge('stop', ['first']);
    const first = sound.voiceIsWarrant, duration = sound.voiceSource.buffer.duration;
    sound.acknowledge('attack', ['first']);
    return {first, duration, interrupted:!sound.voiceIsWarrant && sound.voiceSource.buffer === sound.voices.attack};
  });
  assert(stop.first && stop.interrupted, 'Attack acknowledgement interrupts the idle remark immediately');
  assert(Math.abs(stop.duration - 5.564) < .05);
  await page.evaluate(() => sound.voiceSource.stop());
  await page.waitForFunction(() => !sound.voiceSource);
  assert.equal(await page.evaluate(() => {
    sound.acknowledge('stop', ['second']);
    return sound.voiceIsWarrant;
  }), false, 'Switching selection does not bypass the 45-second repeat cooldown');
  await page.evaluate(() => document.querySelector('#sound').click());
  assert.equal(await page.evaluate(() => !!sound.voiceSource), false);

  // Exercise the actual cinematic player, including its recording-based timeline.
  const recordedIds = Object.keys(recordings);
  await page.evaluate(async ids => {
    const {CinematicPlayer} = await import('./cinematics.js');
    const base = '../assets/campaign/alpha/mission01/';
    const [story, audio] = await Promise.all(['story.json','audio.json'].map(file => fetch(base + file).then(response => response.json())));
    const canvas = document.createElement('canvas');
    canvas.width = 960; canvas.height = 540; document.body.append(canvas);
    const player = window.recordedPlayer = new CinematicPlayer({canvas, story, audio, base});
    await player.load(story.scenes.filter(scene => scene.cues.some(id => ids.includes(id))).map(scene => scene.id));
  }, recordedIds);
  const played = [];
  for (const id of recordedIds) {
    await page.evaluate(async id => {
      const player = window.recordedPlayer;
      player.pause();
      const cue = player.timeline.segments.flatMap(segment => segment.lines).find(cue => cue.id === id);
      await player.seek(cue.start + .03);
      await player.play();
    }, id);
    await page.waitForFunction(id => recordedPlayer.activeCue === id && !!recordedPlayer.source?.buffer, id);
    const result = await page.evaluate(() => {
      const player = window.recordedPlayer, cue = player.cueAt(player.clock());
      const result = {id:cue.id, file:cue.clip.file, text:cue.text, duration:player.source.buffer.duration, captionSeconds:cue.end - cue.start};
      player.pause();
      return result;
    });
    assert.equal(result.file, recordings[id].file);
    assert.equal(result.text, recordings[id].text);
    assert(Math.abs(result.duration - audio.clips[id].duration) < .05);
    assert(Math.abs(result.captionSeconds - result.duration) < .05, 'Caption timing follows the supplied recording');
    played.push({id, duration:result.duration});
  }
  const reactionChecks = await page.evaluate(async () => {
    const player = window.recordedPlayer, checks = [];
    for (const [id, clip] of Object.entries(player.audio.reactions ?? {})) {
      const buffer = await player.buffer(clip.file), source = player.audioContext.createBufferSource();
      source.buffer = buffer; source.connect(player.speech); source.start();
      checks.push({id, duration:buffer.duration, afterCue:clip.afterCue});
      source.stop(); source.disconnect();
    }
    player.dispose();
    return checks;
  });
  assert.equal(reactionChecks.length, Object.keys(reactions).length);
  for (const reaction of reactionChecks) assert(Math.abs(reaction.duration - audio.reactions[reaction.id].duration) < .05);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({canonicalLines:queue.lines.length, commanderLines:commanderQueue.lines.length, recordedDialogue:played, reactions:reactionChecks, victorySeconds:victory.duration, upgradeSeconds:upgrade.duration, stopSeconds:stop.duration, caption:true, priorityInterrupt:true, commandInterrupt:true, repeatCooldown:true, mute:true}));
} finally {
  await browser.close();
}
