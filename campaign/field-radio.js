import {setCharacterPortrait} from './character-portraits.js';
import {raidApproachSignal, waterTowerSignal} from './threat-guidance.js';

const messages = {
  intro: { station: 'Командир', speaker:'commander', portrait:'radio', text: 'Вас понял. На месте.' },
  'first-contact': { station: 'Разведка', text: 'Отбросы в ущелье. Прикройте въезд!' },
  'raid-won': { station: 'Командир', speaker:'commander', portrait:'radio', text: 'Сектор зачищен. Проверьте машины. Продолжаем операцию.' },
  'artifact-flamethrower': { station: 'Лаборатория', text: 'Нашли модуль с синей лентой. Изучите в лаборатории.' },
  'research-flamethrower': { station: 'Лаборатория', text: 'Огнемёт готов. Ищите модуль в конструкторе.' },
  'artifact-mg-ammo-1': { station: 'Лаборатория', text: 'На складе нашли новые боеприпасы. Образцы в лаборатории.' },
  'research-mg-ammo-1': { station: 'Лаборатория', text: 'Новые патроны уже на машинах.' },
  'camp3-sighted': { station: 'Разведка', text: 'На башне пулемёт. Ищите укрытие!' },
  'research-mg-tower': { station: 'Лаборатория', text: 'Чертёж башни готов. Можно строить.' },
  'last-camp': { station: 'Разведка', text: 'Штаб Петровича на юге. Заходите по западной дороге.' },
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
    const contact = state.units.find(unit => unit.owner === 'scavs' && unit.hp > 0 && mission.visibleAt(unit.x, unit.y));
    return raidApproachSignal(mission) ?? (contact ? mark(contact, 'К контакту', 'threat', 400) :
      mark(field.gridToWorld(config.startGrid), 'К базе', 'threat', 380));
  }
  if (chapter === 'camp3-sighted') {
    return waterTowerSignal(mission);
  }
  if (chapter === 'last-camp') {
    const approach = config.camps[3].approachGrid;
    return approach ? mark(field.gridToWorld(approach), 'К подходу', 'intel', 530) :
      mark(state.camps[3].gate, 'К въезду', 'intel', 530);
  }
  if (chapter === 'outro') {
    const [x] = config.startGrid;
    return mark(field.gridToWorld([x+12,config.finalMapBounds[3]+9]), 'К сигналу', 'anomaly', 690);
  }
  return null;
}

export class FieldRadio {
  constructor(panel, toggle, {onSignal, onFocus}) {
    this.panel = panel;
    this.toggle = toggle;
    this.onSignal = onSignal;
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
    panel.querySelector('[data-skip-all]').onclick = () => this.setEnabled(false);
    toggle.onclick = () => this.setEnabled(!this.enabled);
  }

  refreshToggle() {
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    this.toggle.textContent = this.enabled ? 'Радио: вкл.' : 'Радио: выкл.';
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem('warGame.fieldRadio', enabled ? 'on' : 'off'); } catch {}
    if (!enabled) this.reset();
    this.refreshToggle();
  }

  reset() {
    this.queue.length = 0;
    this.dismiss();
  }

  dismiss() {
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
    let queued = false;
    for (const chapter of [...mission.state.pendingCinematics]) {
      mission.finishCinematic(chapter);
      if (!this.enabled || !messages[chapter]) continue;
      const priority = priorities[chapter] ?? 0;
      this.queue.push({chapter, ...messages[chapter], priority, queuedAt:now});
      queued = true;
    }
    if (!this.enabled) return;
    if (queued) this.queue.sort((a,b) => b.priority - a.priority);
    while (this.queue.length && !relevant(this.queue[0], mission, now)) this.queue.shift();
    if (this.entry && (now >= this.until || mission.state.status === 'defeat')) this.dismiss();
    const next = this.queue[0];
    if (!next || (this.entry && next.priority <= this.entry.priority)) return;
    this.queue.shift();
    this.present(next, mission, now);
  }

  present(entry, mission, now) {
    this.entry = entry;
    setCharacterPortrait(this.portrait, entry.speaker, entry.portrait);
    const { chapter, station, text, priority } = entry;
    this.current = missionSignal(chapter, mission);
    this.focus.hidden = !this.current;
    if (this.current) this.focus.textContent = this.current.label;
    this.panel.querySelector('strong').textContent = station;
    this.panel.querySelector('p').textContent = text;
    this.panel.hidden = false;
    this.until = now + Math.min(6700, 3000 + text.length * 28);
    this.onSignal(this.current, chapter, until => {
      if (this.entry === entry) this.until = Math.max(this.until, until);
    }, priority >= tacticalPriority && priority < endingPriority);
  }
}
