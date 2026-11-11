import {iconElement, setButtonIcon} from '../assets/ui/icons.js';
import {mergeDrafts, sameDraft} from './draft-merge.js';
import {DynamicWorkshop} from './dynamic-radio.js';

const $ = selector => document.querySelector(selector);
const state = {document:null, baseDocument:null, revision:0, serial:0, savedSerial:0, mode:'sequence', scene:null, query:'', history:[], saving:null, conflict:false};
const player = new Audio();
player.preload = 'metadata';
let timer, playToken = 0, playingKey = null, playlist = [], playlistIndex = 0, sequenceTimer, uploadCount = 0;
const imageCache = new Map();
const clone = value => structuredClone(value);
const assetURL = file => '/' + file.split('/').map(encodeURIComponent).join('/');
const time = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const backupKey = id => 'warGame.dialogueWorkshop.' + id;

function utilityIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true'); svg.classList.add('utility-icon');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', './editor-icons.svg#' + name); svg.append(use); return svg;
}
function setIcon(button, name, label) {
  if (['upload','download','plus','up','down','eye','eye-off'].includes(name)) {
    button.replaceChildren(utilityIcon(name)); button.title = label; button.setAttribute('aria-label', label);
  } else setButtonIcon(button, name, label);
  return button;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(icon, label, action) {
  const node = setIcon(element('button'), icon, label);
  node.type = 'button'; node.onclick = action; return node;
}
function status(text, error = false) {
  $('#save-status').textContent = text;
  $('#save-status').dataset.state = error ? 'error' : 'saved';
}
function showError(message) { $('#error').textContent = message; $('#error').hidden = !message; }
const dynamic = new DynamicWorkshop({button,status,error:showError,openLegacy:id=>{
  stop();state.mode='situation';state.scene=id;renderScenes();renderEditor();
}});
async function request(path, options = {}) {
  const response = await fetch(path, {...options, headers:{'X-Dialogue-Editor':'1', ...options.headers}});
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Сервер недоступен (${response.status}). Запустите python tools/serve.py.`);
    error.status = response.status; throw error;
  }
  return response.json();
}
function remember() {
  state.history.push(clone(state.document));
  if (state.history.length > 30) state.history.shift();
  $('#undo').disabled = false;
}
function backup() {
  try { localStorage.setItem(backupKey(state.document.id), JSON.stringify({revision:state.revision, document:state.document, baseDocument:state.baseDocument})); }
  catch { /* Disk autosave remains available if browser storage is full. */ }
}
function changed() {
  state.serial++; backup(); status('Есть несохранённые правки');
  clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 650);
}
function mutate(action, {render = true} = {}) {
  remember(); action(); changed();
  if (render) { renderScenes(); renderEditor(); }
}
async function flush() {
  clearTimeout(timer);
  if (!state.document || state.savedSerial === state.serial) return;
  if (state.conflict) throw new Error('Сначала сохраните локальную копию правок и обновите страницу.');
  if (state.saving) return state.saving;
  state.saving = (async () => {
    while (state.savedSerial < state.serial) {
      const serial = state.serial, document = clone(state.document);
      status('Сохраняется…');
      const saved = await request('/api/dialogues/' + state.document.id, {method:'PUT',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({revision:state.revision, document})});
      state.revision = saved.revision; state.savedSerial = serial; state.baseDocument = document;
      if (serial === state.serial) {try {localStorage.removeItem(backupKey(state.document.id));} catch {}}
      else backup();
      status('Сохранено · ' + new Date(saved.savedAt).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}));
    }
    showError('');
  })().catch(error => {
    if (error.status === 409) state.conflict = true;
    status('Не сохранено', true);
    showError(error.message + ' Кнопка скачивания сохранит локальный JSON с вашими правками.');
    throw error;
  }).finally(() => {state.saving = null;});
  return state.saving;
}
async function backupBase(id, pending) {
  if (pending.baseDocument?.id === id) return pending.baseDocument;
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !Number.isSafeInteger(pending.revision) || pending.revision < 0) return null;
  // Older editor backups did not include their base. The server retains each
  // saved revision, so they can still be recovered without discarding edits.
  try {
    const previous = await request('/docs/campaign/dialogue-drafts/' + id + '/.history/' + String(pending.revision).padStart(6, '0') + '.json');
    return previous.revision === pending.revision && previous.document?.id === id ? previous.document : null;
  } catch { return null; }
}
function autoSize(node) { node.style.height = 'auto'; node.style.height = Math.max(node.scrollHeight, 24) + 'px'; }
function editField(tag, value, label, className, update) {
  const node = element(tag, className); node.value = value ?? ''; node.setAttribute('aria-label', label);
  if (tag === 'textarea') {node.rows = 1; queueMicrotask(() => autoSize(node));}
  let remembered = false;
  node.onfocus = () => {remembered = false;};
  node.oninput = () => {
    if (!remembered) { remember(); remembered = true; }
    update(node.value); changed(); if (tag === 'textarea') autoSize(node);
  };
  node.onchange = () => renderScenes();
  return node;
}
function fieldLabel(text, control) {
  const label = element('label'); label.append(element('span', 'field-label', text), control); return label;
}
function select(options, value, label, onChange, className = '') {
  const node = element('select', className); node.setAttribute('aria-label', label);
  for (const [key, title] of options) {const option = element('option', '', title); option.value = key; node.append(option);}
  node.value = value;
  node.onchange = () => onChange(node.value); return node;
}

async function loadMission(id) {
  try {
    if (uploadCount) throw new Error('Дождитесь загрузки файла.');
    await flush(); stop();
    const saved = await request('/api/dialogues/' + id);
    state.document = saved.document; state.baseDocument = clone(saved.document); state.revision = saved.revision;
    state.serial = 0; state.savedSerial = 0; state.history = []; state.conflict = false;
    $('#undo').disabled = true;
    let pending;
    try { pending = JSON.parse(localStorage.getItem(backupKey(id))); } catch {}
    if (pending?.document?.id === id) {
      const base = pending.revision === saved.revision ? saved.document : await backupBase(id, pending);
      const merged = base ? mergeDrafts(base, pending.document, saved.document) : null;
      if (merged && !merged.conflicts.length) {
        state.document = merged.document;
        if (!sameDraft(state.document, saved.document)) changed();
        else {try {localStorage.removeItem(backupKey(id));} catch {} showError(''); status('Сохранено на диске');}
      } else {
        state.document = pending.document; state.baseDocument = base; state.revision = pending.revision; state.serial = 1; state.conflict = true;
        showError('Восстановлены несохранённые правки. Одни и те же реплики изменены в двух версиях. Кнопка скачивания сохранит локальную копию.');
        status('Восстановлена локальная копия', true);
      }
    } else {showError(''); status(saved.savedAt ? 'Сохранено на диске' : 'Готов к работе');}
    state.scene = (state.mode === 'sequence' && state.document.scenes.find(scene => scene.id === 'r01')?.id) || state.document.scenes.find(scene => scene.kind === state.mode)?.id || null;
    renderMissionLinks(); renderScenes(); renderEditor();
  } catch (error) {showError(error.message); status('Не удалось загрузить', true);}
}
let missionList = [];
function renderMissionLinks() {
  $('#missions').replaceChildren(); $('#mission-count').textContent = String(missionList.length).padStart(2,'0');
  missionList.forEach((mission, index) => {
    const link = element('a', 'mission-link'); link.href = '#' + mission.id;
    link.setAttribute('aria-current', state.document?.id === mission.id ? 'page' : 'false');
    link.append(element('span','mission-index',String(index + 1).padStart(2,'0')),element('strong','',mission.title),element('small','','Кампания «Альфа»'));
    link.onclick = event => {event.preventDefault(); if (state.document?.id !== mission.id) loadMission(mission.id);};
    $('#missions').append(link);
  });
}
function matchingScenes() {
  if (!state.document) return [];
  const query = state.query.toLocaleLowerCase('ru');
  return state.document.scenes.filter(scene => scene.kind === state.mode && (!query ||
    [scene.title, scene.trigger, scene.notes, scene.id, ...scene.cues.flatMap(key => {
      const line = state.document.lines[key]; return [line.text, line.id, state.document.speakers[line.speaker]?.name];
    })].join(' ').toLocaleLowerCase('ru').includes(query)));
}
function renderScenes() {
  dynamic.setActive(state.mode==='dynamic');
  if(state.mode==='dynamic'){
    document.querySelectorAll('[data-mode]').forEach(link=>link.setAttribute('aria-current',link.dataset.mode==='dynamic'?'page':'false'));
    dynamic.query=state.query;dynamic.renderList();return;
  }
  const nav = $('#scenes'), scroll = nav.scrollTop; nav.replaceChildren();
  document.querySelectorAll('[data-mode]').forEach(link => link.setAttribute('aria-current', link.dataset.mode === state.mode ? 'page' : 'false'));
  $('#add-scene').hidden = state.mode === 'portraits' || state.mode === 'archive';
  $('#search').disabled = state.mode === 'portraits';
  if (state.mode === 'portraits') {
    $('#scene-count').textContent = 'ГОЛОСА МИССИИ';
    nav.append(element('p','empty','Здесь можно заменить портрет персонажа сразу для всех его реплик. Отдельный кадр для одной реплики меняется прямо в диалоге.'));
    return;
  }
  const scenes = matchingScenes();
  $('#scene-count').textContent = `${scenes.length} ДИАЛОГОВ`;
  if (!scenes.length) nav.append(element('p','empty', state.query ? 'Ничего не найдено. Попробуйте другое слово.' : 'Пока нет диалогов. Добавьте первый.'));
  let section;
  scenes.forEach(scene => {
    if (section !== scene.section) {section = scene.section; nav.append(element('p','scene-section',section || 'Без раздела'));}
    const index = state.document.scenes.filter(s => s.kind === state.mode).indexOf(scene);
    const link = element('a', 'scene-link' + (scene.enabled === false ? ' disabled' : ''));
    link.href = '#' + encodeURIComponent(scene.id); link.dataset.scene = scene.id;
    link.setAttribute('aria-current', String(state.scene === scene.id));
    const count = element('span','count',scene.presentation?.type === 'video' ? '▶' : String(scene.cues.length));
    if (scene.presentation?.type === 'video') count.title = 'Видео в телевизоре';
    link.append(element('span','ordinal',String(index + 1).padStart(2,'0')),element('span','',scene.title || 'Без названия'),count);
    link.onclick = event => {
      event.preventDefault(); stop(); state.scene = scene.id; renderScenes(); renderEditor();
      if (matchMedia('(max-width:600px)').matches) $('#editor').scrollIntoView({behavior:'smooth',block:'start'});
    };
    nav.append(link);
  });
  nav.scrollTop = scroll;
  const selected = nav.querySelector('[aria-current=true]');
  if (selected) {
    const bounds = nav.getBoundingClientRect(), row = selected.getBoundingClientRect();
    if (row.top < bounds.top || row.bottom > bounds.bottom) nav.scrollTop += row.top - bounds.top - nav.clientHeight / 2 + row.height / 2;
  }
}

function moveScene(scene, direction) {
  const peers = state.document.scenes.filter(s => s.kind === scene.kind), index = peers.indexOf(scene), other = peers[index + direction];
  if (!other) return;
  mutate(() => {
    const items = state.document.scenes, a = items.indexOf(scene), b = items.indexOf(other);
    [items[a],items[b]] = [items[b],items[a]];
  });
}
function renderEditor() {
  dynamic.setActive(state.mode==='dynamic');
  if(state.mode==='dynamic'){dynamic.render();return;}
  const main = $('#editor'); main.replaceChildren();
  main.classList.remove('dynamic-editor');
  if (!state.document) return;
  if (state.mode === 'portraits') {renderCharacters(main); return;}
  const scene = state.document.scenes.find(s => s.id === state.scene);
  if (!scene) {main.append(element('p','empty','Выберите диалог слева.')); return;}
  const topline = element('div','scene-topline');
  topline.append(element('p','eyebrow',state.mode === 'archive' ? 'АРХИВ · РАННИЙ СЦЕНАРИЙ' : state.mode === 'situation' ? 'СИТУАЦИОННЫЙ ДИАЛОГ' : 'СЮЖЕТ · ' + scene.id.toUpperCase()));
  const tools = element('div','actions');
  const peers = state.document.scenes.filter(s => s.kind === scene.kind), position = peers.indexOf(scene);
  const up = button('up','Переместить диалог выше',() => moveScene(scene,-1)); up.disabled = position === 0;
  const down = button('down','Переместить диалог ниже',() => moveScene(scene,1)); down.disabled = position === peers.length - 1;
  tools.append(up,down,button(scene.enabled === false ? 'eye-off':'eye',scene.enabled === false ? 'Вернуть диалог в сценарий':'Исключить диалог из сценария',() => mutate(() => {scene.enabled = scene.enabled === false;})));
  topline.append(tools); main.append(topline);
  main.append(editField('textarea',scene.title,'Название диалога','scene-title',value => {scene.title = value;}));
  const condition = element('label','scene-condition');
  condition.append(element('span','field-label','КОГДА ЗВУЧИТ'),editField('textarea',scene.trigger,'Условие запуска диалога','',value => {scene.trigger = value;})); main.append(condition);
  const extra = element('details','scene-extra'); extra.append(element('summary','','Заметки и порядок'));
  const fields = element('div','extra-fields');
  fields.append(fieldLabel('Раздел',editField('input',scene.section,'Раздел сценария','',value => {scene.section = value;})),
    fieldLabel('Тип',select([['sequence','По порядку'],['situation','По ситуации'],['archive','Архив']],scene.kind,'Тип диалога',value => mutate(() => {scene.kind = value; state.mode = value;}))),
    editField('textarea',scene.notes,'Заметка к диалогу','',value => {scene.notes = value;}));
  fields.lastChild.placeholder = 'Как должна работать сцена, что изменить в сценарии…'; extra.append(fields); main.append(extra);
  if (scene.presentation?.type === 'video') {
    const section = element('section','video-scene');
    section.append(element('p','eyebrow','ВИДЕО В ТЕЛЕВИЗОРЕ'));
    const video = element('video','scene-video');
    video.src = assetURL(scene.presentation.file); video.preload = 'metadata'; video.playsInline = true;
    video.setAttribute('aria-label','Предпросмотр видео в телевизоре');
    section.append(video);
    const actions = element('div','actions');
    const play = button('play','Воспроизвести видео',async () => {
      if (!video.paused) video.pause();
      else {try {await video.play();} catch {showError('Не удалось воспроизвести видео.');}}
    });
    const seek = element('input','video-seek'); seek.type = 'range'; seek.min = 0; seek.max = 100; seek.step = .1; seek.value = 0;
    seek.setAttribute('aria-label','Позиция видео');
    const duration = element('span','audio-info','0:00');
    const refresh = () => {
      setIcon(play,video.paused ? 'play':'pause',video.paused ? 'Воспроизвести видео':'Приостановить видео');
      duration.textContent = time(video.currentTime) + ' / ' + time(video.duration);
      seek.value = Number.isFinite(video.duration) ? video.currentTime / video.duration * 100 : 0;
    };
    video.onplay = video.onpause = video.ontimeupdate = video.onloadedmetadata = refresh;
    video.onerror = () => showError('Видео недоступно. Проверьте файл вступления.');
    seek.oninput = () => {if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value) / 100 * video.duration;};
    actions.append(play,seek,duration); section.append(actions);
    section.append(element('p','reference-note','Звук идёт из видео. Отдельные реплики «Голоса из прошлого» убраны.'));
    main.append(section);
    if (!scene.cues.length) return;
  }
  const controls = element('div','scene-controls'), controlsRight = element('div','actions');
  controls.append(element('p','',`${scene.cues.length} РЕПЛИК`));
  const scenePlay = button('play','Прослушать диалог целиком',() => {
    if (playingKey) stop(); else playList(scene.cues.filter(key => state.document.lines[key].enabled !== false && state.document.lines[key].audio),0);
  }); scenePlay.id = 'play-scene'; scenePlay.disabled = scene.enabled === false || !scene.cues.some(key => state.document.lines[key].audio && state.document.lines[key].enabled !== false);
  controlsRight.append(scenePlay,button('plus','Добавить реплику',() => addLine(scene)));
  controls.append(controlsRight); main.append(controls);
  if (scene.enabled === false) main.append(element('p','empty','Диалог помечен как исключённый. Материалы сохранены — его можно вернуть значком глаза.'));
  const lines = element('div','lines');
  scene.cues.forEach((key,index) => lines.append(renderLine(scene,key,index))); main.append(lines);
  if (!scene.cues.length) main.append(element('p','empty','Добавьте первую реплику значком «+».'));
  main.append(element('p','reference-note','Условия и порядок можно переписать своими словами. Эти правки войдут в слепок для следующей редакции сценария.'));
  syncPlayer();
}

function renderLine(scene,key,index) {
  const line = state.document.lines[key], row = element('article','cue' + (line.enabled === false ? ' is-disabled':'')); row.dataset.key = key;
  row.append(element('span','cue-number',String(index + 1).padStart(2,'0')));
  const portrait = portraitButton(line.speaker,line.portraitState,line.portrait,scene.id,() => chooseFile('image', async media => {
    mutate(() => {line.portrait = media;});
  }), 'Заменить изображение этой реплики'); row.append(portrait);
  const body = element('div','cue-body'), heading = element('div','cue-heading');
  heading.append(select(Object.entries(state.document.speakers).map(([id,s]) => [id,s.name]),line.speaker,'Говорящий',speaker => mutate(() => {line.speaker = speaker; line.portraitState = '';}),'speaker'),element('span','cue-id',line.id));
  body.append(heading,editField('textarea',line.text,'Текст реплики','cue-text',value => {line.text = value;}));
  body.lastChild.placeholder = 'Текст реплики…';
  const controls = element('div','cue-tools'), actions = element('div','actions');
  const play = button('play','Прослушать реплику',() => {
    if (playingKey === key) {if (player.paused) resume(); else {player.pause(); syncPlayer();}}
    else playList([key],0);
  }); play.dataset.play = key; play.disabled = !line.audio || line.enabled === false;
  const upload = button('upload','Заменить аудио этой реплики',() => chooseFile('audio', async media => {
    stop(); mutate(() => {line.audio = {...media,text:line.text};});
  }));
  actions.append(play,upload);
  const up = button('up','Переместить реплику выше',() => moveLine(scene,index,-1)); up.disabled = index === 0;
  const down = button('down','Переместить реплику ниже',() => moveLine(scene,index,1)); down.disabled = index === scene.cues.length - 1;
  actions.append(up,down,button(line.enabled === false ? 'eye-off':'eye',line.enabled === false ? 'Вернуть реплику':'Исключить реплику',() => {stop(); mutate(() => {line.enabled = line.enabled === false;});}));
  const own = ['user-recording','editor-upload'].includes(line.audio?.origin);
  const origin = line.audio ? (own ? (line.audio.origin === 'editor-upload' ? 'Загружено' : 'Твоя запись') : line.audio.origin === 'temporary-synthesis' ? 'Временный голос' : 'Запись') : 'Нет записи';
  const audioInfo = element('span','audio-info' + (!line.audio ? ' missing' : own ? ' user' : ''), origin + (line.audio?.duration ? ' · ' + time(line.audio.duration) : ''));
  if (line.audio && line.audio.text !== undefined && line.audio.text !== line.text) {audioInfo.textContent = 'Текст изменён · запись прежняя'; audioInfo.classList.add('missing');}
  if (line.audio) audioInfo.title = line.audio.name || line.audio.file.split('/').at(-1);
  controls.append(actions,audioInfo); body.append(controls);
  const seek = element('input','seek'); seek.type = 'range'; seek.min = 0; seek.max = 100; seek.step = .1; seek.value = 0; seek.hidden = true; seek.setAttribute('aria-label','Позиция воспроизведения');
  seek.oninput = () => {if (playingKey === key && Number.isFinite(player.duration)) player.currentTime = Number(seek.value) / 100 * player.duration;}; body.append(seek);
  const details = element('details','line-extra'); details.append(element('summary','','Пауза, портрет, заметка'));
  const fields = element('div','extra-fields');
  const pause = element('input'); pause.type = 'number'; pause.min = 0; pause.max = 30; pause.step = .1; pause.value = line.pauseAfter ?? .2;
  pause.setAttribute('aria-label','Пауза после реплики в секундах'); pause.onchange = () => mutate(() => {line.pauseAfter = Math.max(0,Math.min(30,Number(pause.value) || 0));}, {render:false});
  fields.append(fieldLabel('Пауза, сек.',pause));
  const character = state.document.portraits[line.speaker];
  if (character) fields.append(fieldLabel('Портрет',select([['','По сцене'],...Object.entries(character.states).map(([id,s]) => [id,s.description || id])],line.portraitState || '','Состояние портрета',value => mutate(() => {line.portraitState = value; line.portrait = null;}))));
  if (line.portrait) fields.append(button('restart','Вернуть портрет персонажа',() => mutate(() => {line.portrait = null;})));
  const notes = editField('textarea',line.notes,'Заметка к реплике','',value => {line.notes = value;}); notes.placeholder = 'Интонация, новая запись, пожелание к сцене…'; fields.append(notes);
  const used = state.document.scenes.filter(s => s.cues.includes(key));
  if (used.length > 1) fields.append(element('p','reference-note','Общая реплика для сцен: ' + used.map(s => s.title).join(', ') + '. Замена текста и записи действует в каждой из них.'));
  details.append(fields); body.append(details); row.append(body); return row;
}
function moveLine(scene,index,direction) {
  stop(); mutate(() => {const target = index + direction; [scene.cues[index],scene.cues[target]] = [scene.cues[target],scene.cues[index]];});
}
function addLine(scene) {
  stop(); mutate(() => {
    const id = 'new-' + crypto.randomUUID();
    state.document.lines[id] = {key:id,id,speaker:scene.cues.length ? state.document.lines[scene.cues.at(-1)].speaker : 'commander',
      text:'',notes:'',pauseAfter:.2,enabled:true,audio:null,portrait:null,portraitState:''};
    scene.cues.push(id);
  });
  const node = $('#editor .cue:last-of-type .cue-text'); node?.focus();
}
function portraitButton(speaker, requestedState, override, sceneId, action, label) {
  const node = button('upload',label,action); node.className = 'portrait-button'; node.replaceChildren();
  const character = state.document.portraits[speaker], name = state.document.speakers[speaker]?.name || speaker;
  if (override) {
    const img = element('img'); img.src = assetURL(override.file); img.alt = name; node.append(img);
    img.onerror = () => {img.replaceWith(element('span','portrait-placeholder','?'));};
  } else if (character) {
    const canvas = element('canvas'); canvas.width = 0; canvas.height = 0; canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',name); node.append(canvas);
    const final = ['r48','r49','r50','r54','u01','u02','u04'].includes(sceneId);
    let pose = requestedState || (speaker === 'commander' ? (final ? 'relaxed':'radio') : speaker === 'warrant' ? (final ? 'tea':'neutral') : 'radio');
    if (!character.states[pose]) pose = character.defaultState;
    const [x,y,w,h] = character.states[pose].crop;
    if (!imageCache.has(character.file)) {
      const image = new Image(); image.src = assetURL(character.file);
      imageCache.set(character.file,image.decode().then(() => image));
    }
    imageCache.get(character.file).then(image => {
      canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);
    }).catch(() => canvas.replaceWith(element('span','portrait-placeholder','?')));
  } else node.append(element('span','portrait-placeholder',name.slice(0,1)));
  const corner = element('span','upload-corner'); corner.append(utilityIcon('upload')); node.append(corner); return node;
}
function renderCharacters(main) {
  main.append(element('p','eyebrow','ЛИЦА В ЭФИРЕ'),element('h2','scene-title','Персонажи'),element('p','reference-note','Новый портрет здесь заменяет все состояния персонажа. Для отдельной реплики изображение можно заменить прямо в диалоге.'));
  const grid = element('div','characters');
  for (const [id,speaker] of Object.entries(state.document.speakers)) {
    const character = state.document.portraits[id], card = element('section','character');
    const pose = character?.defaultState || 'radio';
    card.append(portraitButton(id,pose,null,null,() => chooseFile('image', async media => {
      mutate(() => {state.document.portraits[id] = {name:speaker.name,file:media.file,defaultState:'custom',states:{custom:{crop:[0,0,media.width,media.height],description:'Новый портрет'}}};});
    }), 'Заменить портрет: ' + speaker.name),element('h3','',speaker.name),element('p','',character ? (character.file.includes('/dialogue-drafts/') ? 'Твой новый портрет' : 'Портрет из игры') : 'Портрет не задан'));
    if (character && Object.keys(character.states).length > 1) {
      const poses = select(Object.entries(character.states).map(([key,s]) => [key,s.description || key]),pose,'Показать состояние: ' + speaker.name,value => {
        card.firstChild.replaceWith(portraitButton(id,value,null,null,() => chooseFile('image', async media => {
          // A new standalone portrait intentionally replaces the whole atlas.
          mutate(() => {state.document.portraits[id] = {name:speaker.name,file:media.file,defaultState:'custom',states:{custom:{crop:[0,0,media.width,media.height],description:'Новый портрет'}}};});
        }), 'Заменить портрет: ' + speaker.name));
      }); card.append(poses);
    }
    grid.append(card);
  }
  main.append(grid);
}

function chooseFile(kind,onUploaded) {
  const input = $('#file-input');
  input.accept = kind === 'image' ? 'image/png,image/jpeg,image/webp,image/gif' : '.mp3,.ogg,.wav,.flac,.m4a,audio/*';
  input.value = '';
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    uploadCount++; $('#export').disabled = true;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Файл больше 25 МБ. Выберите файл меньшего размера.');
      status('Загружается файл…');
      const url = URL.createObjectURL(file); let metadata;
      try {
        if (kind === 'image') {const image = new Image(); image.src = url; await image.decode(); metadata = {width:image.naturalWidth,height:image.naturalHeight};}
        else {
          metadata = await new Promise((resolve,reject) => {
            const audio = new Audio(); const timeout = setTimeout(() => {audio.src = ''; reject(new Error('Не удалось прочитать запись. Попробуйте MP3, OGG или WAV.'));},12000);
            audio.onloadedmetadata = () => {clearTimeout(timeout); const duration = audio.duration; audio.src = ''; Number.isFinite(duration) && duration > 0 ? resolve({duration}) : reject(new Error('Не удалось определить длительность записи.'));};
            audio.onerror = () => {clearTimeout(timeout); reject(new Error('Браузер не может воспроизвести этот файл. Попробуйте MP3, OGG или WAV.'));}; audio.src = url;
          });
        }
      } finally {URL.revokeObjectURL(url);}
      const media = await request('/api/dialogues/' + state.document.id + '/media',{method:'POST',headers:{'Content-Type':file.type || 'application/octet-stream','X-Media-Kind':kind,'X-File-Name':encodeURIComponent(file.name)},body:file});
      await onUploaded({...media,...metadata}); await flush(); showError('');
    } catch (error) {showError(error.message); status('Файл не загружен',true);}
    finally {uploadCount--; $('#export').disabled = uploadCount > 0;}
  };
  input.click();
}

function stop() {
  document.querySelector('.scene-video')?.pause();
  playToken++; clearTimeout(sequenceTimer); player.pause(); player.removeAttribute('src'); player.load();
  playingKey = null; playlist = []; syncPlayer();
}
async function playList(keys,index) {
  stop();
  if (!keys.length) return;
  playlist = keys; playlistIndex = index;
  await playCurrent();
}
async function playCurrent() {
  const token = ++playToken;
  const line = state.document.lines[playlist[playlistIndex]];
  if (!line?.audio) {stop(); return;}
  playingKey = line.key; player.src = assetURL(line.audio.file);
  try { await player.play(); if (token === playToken) syncPlayer(); }
  catch (error) { if (token === playToken) {stop(); showError('Не удалось воспроизвести запись. Проверьте файл или замените его.');} }
}
async function resume() {
  try {await player.play(); syncPlayer();} catch {showError('Не удалось продолжить воспроизведение.');}
}
player.onended = () => {
  const pause = state.document.lines[playingKey]?.pauseAfter ?? .2;
  if (playlistIndex + 1 < playlist.length) {
    sequenceTimer = setTimeout(() => {playlistIndex++; playCurrent();}, pause * 1000);
  } else stop();
};
player.ontimeupdate = () => {
  for (const row of document.querySelectorAll('.cue')) {
    if (row.dataset.key !== playingKey) continue;
    const seek = row.querySelector('.seek'); seek.hidden = false;
    seek.value = Number.isFinite(player.duration) ? player.currentTime / player.duration * 100 : 0;
    seek.setAttribute('aria-valuetext',time(player.currentTime) + ' из ' + time(player.duration));
  }
};
function syncPlayer() {
  for (const row of document.querySelectorAll('.cue')) {
    const active = row.dataset.key === playingKey;
    row.classList.toggle('is-playing',active);
    const play = row.querySelector('[data-play]');
    setIcon(play,active && !player.paused ? 'pause':'play',active && !player.paused ? 'Приостановить реплику':'Прослушать реплику');
    row.querySelector('.seek').hidden = !active;
  }
  if ($('#play-scene')) setIcon($('#play-scene'),playingKey ? 'stop':'play',playingKey ? 'Остановить прослушивание':'Прослушать диалог целиком');
}

function download(blob,name) {
  const url = URL.createObjectURL(blob), link = element('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}
setIcon($('#undo'),'restart','Отменить последнее изменение');
setIcon($('#save'),'save','Сохранить черновик');
$('#save').title = 'Сохранить черновик · Ctrl+S';
setIcon($('#export'),'download','Скачать слепок с записями и портретами');
$('#game-link').append(iconElement('home'));
setIcon($('#add-scene'),'plus','Добавить диалог');
$('#save').onclick = () => (state.mode==='dynamic'?dynamic.save():flush()).catch(() => {});
$('#undo').onclick = () => {
  if(state.mode==='dynamic'){dynamic.history();return;}
  if (uploadCount) {showError('Дождитесь загрузки файла, затем можно отменить изменение.'); return;}
  if (!state.history.length) return;
  stop(); state.document = state.history.pop(); $('#undo').disabled = !state.history.length;
  if (!state.document.scenes.some(s => s.id === state.scene)) state.scene = state.document.scenes.find(s => s.kind === state.mode)?.id;
  changed(); renderScenes(); renderEditor();
};
$('#export').onclick = async () => {
  if(state.mode==='dynamic'){dynamic.export();return;}
  if (!state.document) return;
  const name = state.document.id + '-dialogues';
  try {
    await flush(); $('#export').disabled = true; status('Собирается слепок…');
    const response = await fetch('/api/dialogues/' + state.document.id + '/export');
    if (!response.ok) throw new Error('Не удалось собрать архив');
    download(await response.blob(),name + '.zip'); status('Слепок скачан');
  } catch (error) {
    download(new Blob([JSON.stringify({revision:state.revision,document:state.document},null,2)],{type:'application/json'}),name + '-local.json');
    showError('Скачана локальная копия текстов и ссылок на файлы. Архив недоступен: ' + error.message);
  } finally {$('#export').disabled = false;}
};
$('#add-scene').onclick = () => {
  if(state.mode==='dynamic'){dynamic.newRule();return;}
  if (!state.document) return;
  stop(); mutate(() => {
    const scene = {id:'scene-' + crypto.randomUUID(),title:'Новый диалог',kind:state.mode,section:'Новые диалоги',trigger:'',notes:'',enabled:true,cues:[]};
    state.document.scenes.push(scene); state.scene = scene.id;
  }); $('#editor .scene-title').focus(); $('#editor .scene-title').select();
};
$('#search').oninput = event => {state.query = event.target.value; renderScenes();};
document.querySelectorAll('[data-mode]').forEach(link => link.onclick = event => {
  event.preventDefault(); stop(); state.mode = link.dataset.mode;
  state.scene = state.document?.scenes.find(s => s.kind === state.mode)?.id ?? null;
  renderScenes(); renderEditor();
});
window.addEventListener('keydown',event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {event.preventDefault(); (state.mode==='dynamic'?dynamic.save():flush()).catch(() => {});}
  if (event.key === 'Escape') {stop();if(state.mode==='dynamic')dynamic.stopPlayback();}
});
window.addEventListener('beforeunload',event => {
  if (state.savedSerial !== state.serial || uploadCount || dynamic.dirty) {event.preventDefault(); event.returnValue = '';}
});
window.addEventListener('online',() => flush().catch(() => {}));
let editorWidth = 0;
new ResizeObserver(entries => {
  const width = entries[0].contentRect.width;
  if (width === editorWidth) return;
  editorWidth = width;
  requestAnimationFrame(() => $('#editor').querySelectorAll('textarea').forEach(autoSize));
}).observe($('#editor'));
try {
  const result = await request('/api/dialogues'); missionList = result.missions; renderMissionLinks();
  if (missionList.length) await loadMission(missionList[0].id);
  else $('#editor').replaceChildren(element('p','empty','В проекте пока нет миссий со сценарием.'));
  if(location.hash==='#dynamic'||location.hash==='#situation'){
    state.mode='dynamic';renderScenes();renderEditor();
  }
} catch (error) {
  showError(error.message); status('Сервер редактора недоступен',true);
  $('#editor').replaceChildren(element('p','empty','Для редактора нужен сервер проекта: python tools/serve.py. Адрес: /dialogues/ на том же порте, что и игра.'));
}
