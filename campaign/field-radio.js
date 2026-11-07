import {setButtonIcon} from '../assets/ui/icons.js';
import {raidApproachSignal, southernApproachSignal, visibleRaidContact, waterTowerSignal} from './threat-guidance.js';
import {setCharacterPortrait} from './character-portraits.js';

const messages = {
  'first-contact': { station: 'Разведка', speaker:'scout', portrait:'radio', text: 'Отбросы в ущелье. Прикройте въезд!' },
  'raid-won': { station: 'Командир', speaker:'commander', portrait:'radio', text: 'Сектор зачищен. Проверьте машины. Продолжаем операцию.' },
  'artifact-flamethrower': { station: 'Лаборатория', text: 'Нашли модуль с синей лентой. Изучите в лаборатории.' },
  'research-flamethrower': { station: 'Лаборатория', text: 'Огнемёт готов. Ищите модуль в конструкторе.' },
  'artifact-mg-ammo-1': { station: 'Лаборатория', text: 'На складе нашли новые боеприпасы. Образцы в лаборатории.' },
  'research-mg-ammo-1': { station: 'Лаборатория', text: 'Новые патроны уже на машинах.' },
  'warrant-upgrade': { station: 'Прапорщик', speaker:'warrant', portrait:'neutral', text: 'Вот «Буханку» опять обновили. Зря, конечно. Хорошая была машина. Сорок лет ничего не меняли — и правильно делали. А теперь ручку дверную другую поставили. Спрашивается, зачем?' },
  'camp3-sighted': { station: 'Разведка', speaker:'scout', portrait:'radio', text: 'На башне пулемёт. Ищите укрытие!' },
  'research-mg-tower': { station: 'Лаборатория', text: 'Чертёж башни готов. Можно строить.' },
  'last-camp': { station: 'Разведка', speaker:'scout', portrait:'radio', text: 'Штаб Петровича на юге. Заходите по западной дороге.' },
  victory: { station: 'Командир', speaker:'commander', portrait:'neutral', text: 'База действует. Все четыре лагеря зачищены.' },
  outro: { station: 'Штаб', text: 'Сильный сигнал на юге. Нужна разведка.' },
};

const tacticalPriority = 2, endingPriority = 4;
const priorities = { 'last-camp':1, 'camp3-sighted':tacticalPriority, 'first-contact':3, victory:endingPriority, outro:endingPriority };
const routineLifetime = 10000;

function relevant(entry, mission, now) {
  const {state} = mission;
  const {chapter, priority, queuedAt} = entry;
  if (state.status !== 'running') return state.status === 'victory' && priority === endingPriority;
  if (chapter === 'first-contact') return !state.flags.raidWon;
  if (chapter === 'camp3-sighted') return !!waterTowerSignal(mission);
  if (chapter === 'last-camp') return !state.camps[3].cleared;
  if (chapter.startsWith('artifact-') && state.research[chapter.slice(9)]) return false;
  return priority > 0 || now - queuedAt < routineLifetime;
}

export function missionSignal(chapter, mission) {
  const {config, field, state} = mission;
  const mark = (point, label, kind, distance) => point && {x:point.x,y:point.y,label,kind,distance};
  if (chapter === 'intro') {
    const well = config.oilFields.map(field.gridToWorld).find(point =>
      mission.placement('derrick', point.x, point.y, 0, {checkMoney:false}).ok);
    return mark(well, 'К нефти', 'guidance', 320);
  }
  if (chapter === 'first-contact') {
    const contact = visibleRaidContact(mission);
    return raidApproachSignal(mission) ?? (contact ? mark(contact, 'К контакту', 'threat', 400) :
      mark(field.gridToWorld(config.startGrid), 'К базе', 'threat', 380));
  }
  if (chapter === 'raid-won' && state.flags.raidWon && state.camps[0] && !state.camps[0].cleared && config.raidApproachGrid) {
    const entry = field.gridToWorld(config.raidApproachGrid);
    if (mission.exploredAt(entry.x, entry.y)) return mark(entry, 'К выезду на разведку', 'recon', 420);
  }
  if (chapter === 'camp3-sighted') {
    return waterTowerSignal(mission);
  }
  if (chapter === 'last-camp') {
    return southernApproachSignal(mission);
  }
  if (chapter === 'outro') {
    const [x] = config.startGrid;
    return mark(field.gridToWorld([x+12,config.finalMapBounds[3]+9]), 'К сигналу', 'anomaly', 690);
  }
  return null;
}

export class FieldRadio {
  constructor(panel, toggle, {onSignal, onFocus, dialogue = {}, director = null}) {
    this.panel = panel;
    this.toggle = toggle;
    this.onSignal = onSignal;
    this.dialogue = dialogue;
    this.director = director;
    this.queue = [];
    this.until = 0;
    this.portrait = document.createElement('canvas');
    this.portrait.className = 'radio-portrait';
    this.portrait.hidden = true;
    this.portrait.setAttribute('aria-hidden', 'true');
    panel.prepend(this.portrait);
    this.focus = panel.querySelector('[data-focus]');
    this.focus.onclick = () => { if (this.current) onFocus(this.current); };
    try { this.enabled = localStorage.getItem('warGame.fieldRadio') !== 'off'; }
    catch { this.enabled = true; }
    this.refreshToggle();
    panel.querySelector('[data-dismiss]').onclick = () => this.dismiss();
    toggle.onclick = () => this.setEnabled(!this.enabled);
  }

  refreshToggle() {
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    setButtonIcon(this.toggle, this.enabled ? 'radio' : 'radio-off', this.enabled ? 'Радио: вкл.' : 'Радио: выкл.');
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem('warGame.fieldRadio', enabled ? 'on' : 'off'); } catch {}
    if (!enabled) this.reset();
    this.refreshToggle();
  }

  reset() {
    this.queue.length = 0;
    this.director?.suspend();
    this.hide();
  }

  dismiss() {
    const entry = this.entry;
    if (entry?.story) this.director.skip();
    else if (entry?.dialogue) {
      const progress = this.mission.state.fieldDialogue ??= {};
      progress[entry.chapter] = entry.index + 1;
      if (progress[entry.chapter] >= this.dialogue[entry.chapter].length) this.mission.finishCinematic(entry.chapter);
    }
    return this.hide();
  }

  suspendDialogue() {
    // Reopen the interrupted line on returning from the constructor.
    if (this.entry?.dialogue) { this.director?.suspend(); this.hide(); }
  }

  hide() {
    setCharacterPortrait(this.portrait, null);
    if (this.panel.hidden) return false;
    this.panel.hidden = true;
    this.until = 0;
    this.entry = null;
    this.current = null;
    this.onSignal(null, null);
    return true;
  }

  consume(mission, now) {
    if(this.director)return this.consumeStory(mission,now);
    this.mission = mission;
    let queued = false;
    for (const chapter of [...mission.state.pendingCinematics]) {
      // A chapter is complete only after its last line, never when it is queued.
      if (this.dialogue[chapter]) continue;
      mission.finishCinematic(chapter);
      if (!this.enabled || !messages[chapter]) continue;
      const priority = priorities[chapter] ?? 0;
      this.queue.push({chapter, ...messages[chapter], priority, queuedAt:now});
      if (chapter === 'research-mg-ammo-1') {
        this.queue.push({chapter:'warrant-upgrade', ...messages['warrant-upgrade'], priority:0, queuedAt:now});
      }
      queued = true;
    }
    if (!this.enabled) return;
    if (queued) this.queue.sort((a,b) => b.priority - a.priority);
    while (this.queue.length && !relevant(this.queue[0], mission, now)) this.queue.shift();
    if (mission.state.status !== 'running' && this.entry?.dialogue) this.hide();
    if (mission.state.status === 'defeat') { this.hide(); return; }
    if (this.entry && now >= this.until) this.dismiss();
    const next = this.queue[0];
    if (next && (!this.entry || next.priority > this.entry.priority)) {
      this.queue.shift();
      this.present(next, mission, now);
    }
    if (this.entry || mission.state.status !== 'running') return;
    for (const chapter of [...mission.state.pendingCinematics]) {
      const lines = this.dialogue[chapter];
      if (!lines) continue;
      const index = mission.state.fieldDialogue?.[chapter] ?? 0;
      if (index >= lines.length) { mission.finishCinematic(chapter); continue; }
      this.present({...lines[index], chapter, index, dialogue:true, priority:-1}, mission, now);
      break;
    }
  }

  consumeStory(mission,now) {
    this.mission=mission;
    // Legacy chapter flags still drive objectives and signals, but no longer enqueue duplicate speech.
    for(const chapter of [...mission.state.pendingCinematics])mission.finishCinematic(chapter);
    if(this.entry?.story&&now>=this.until){this.director.completeLine();this.hide();}
    const next=this.director.update(mission,now,{enabled:this.enabled});
    if(!next){if(this.entry)this.hide();return;}
    if(this.entry?.story&&this.entry.token===next.token)return;
    this.present(next,mission,now);
  }

  present(entry, mission, now) {
    this.entry = entry;
    setCharacterPortrait(this.portrait, entry.speaker, entry.portrait);
    const { chapter, station, text, priority } = entry;
    this.current = missionSignal(chapter, mission);
    this.focus.hidden = !this.current;
    if (this.current) setButtonIcon(this.focus, this.current.kind === 'guidance' ? 'derrick' : 'focus', this.current.label);
    this.panel.querySelector('strong').textContent = station;
    this.panel.querySelector('p').textContent = text;
    this.panel.hidden = false;
    this.until = now + (entry.dialogue ? Math.max(2200, text.length * 60) : Math.min(6700, 3000 + text.length * 28));
    this.onSignal(this.current, chapter, until => {
      if (this.entry === entry) this.until = entry.dialogue ? until : Math.max(this.until, until);
    }, entry.story ? priority===4 : priority >= tacticalPriority && priority < endingPriority, entry.dialogue ? entry : null);
  }
}
