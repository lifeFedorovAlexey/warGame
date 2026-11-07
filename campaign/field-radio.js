const messages = {
  intro: { station: 'Штаб', text: 'Альфа, разверните базу. Сначала генератор и вышка на нефтяной точке.' },
  'first-contact': { station: 'Разведка', text: 'В ущелье замечены машины отбросов. Прикройте подъезд к базе.' },
  'raid-won': { station: 'Командир', text: 'Рейд отбили. Проверьте технику и выдвигайтесь к лагерям.' },
  'artifact-flamethrower': { station: 'Лаборатория', text: 'Забрали устройство с синей изолентой. Отправьте его на исследование.' },
  'research-flamethrower': { station: 'Лаборатория', text: 'Под синей изолентой была жёлтая. Огнемёт доступен в конструкторе.' },
  'artifact-mg-ammo-1': { station: 'Лаборатория', text: 'На складе нашли новые боеприпасы. Образцы в лаборатории.' },
  'research-mg-ammo-1': { station: 'Лаборатория', text: 'Новые патроны готовы. Передали боекомплект на машины.' },
  'camp3-sighted': { station: 'Разведка', text: 'На водонапорной башне пулемёт. Заходите с укрытия.' },
  'research-mg-tower': { station: 'Лаборатория', text: 'Разобрались с башней. Чертёж доступен в меню строительства.' },
  'last-camp': { station: 'Разведка', text: 'Опорный пункт Петровича на юге. Отметили подход по западной дороге.' },
  victory: { station: 'Командир', text: 'База действует. Все четыре лагеря зачищены.' },
  outro: { station: 'Штаб', text: 'К югу от ваших позиций зафиксирован энергетический всплеск. Следующая задача — разведка.' },
};

export function missionSignal(chapter, mission) {
  const {config, field, state} = mission;
  const mark = (point, label, kind, distance) => point && {x:point.x,y:point.y,label,kind,distance};
  if (chapter === 'intro') {
    const well = config.oilFields.map(field.gridToWorld).find(point => mission.exploredAt(point.x, point.y));
    return mark(well, 'К нефтяной точке', 'guidance', 320);
  }
  if (chapter === 'first-contact') {
    const contact = state.units.find(unit => unit.owner === 'scavs' && unit.hp > 0 && mission.visibleAt(unit.x, unit.y));
    return contact ? mark(contact, 'К месту контакта', 'threat', 400) :
      mark(field.gridToWorld(config.startGrid), 'К базе', 'threat', 380);
  }
  if (chapter === 'camp3-sighted') {
    const camp=state.camps[2];
    const tower=state.buildings.find(b=>b.campId===camp.id&&b.kind==='mg-tower'&&b.hp>0&&mission.exploredAt(b.x,b.y));
    return mark(tower??camp, 'К водонапорной башне', 'threat', 440);
  }
  if (chapter === 'last-camp') {
    return mark(state.camps[3].gate, 'К подходу на юге', 'intel', 530);
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
    if (this.panel.hidden) return false;
    this.panel.hidden = true;
    this.until = 0;
    this.current = null;
    this.onSignal(null, false);
    return true;
  }

  consume(mission, now) {
    for (const chapter of [...mission.state.pendingCinematics]) {
      mission.finishCinematic(chapter);
      if (this.enabled && messages[chapter]) this.queue.push({chapter, ...messages[chapter]});
    }
    if (now >= this.until) this.dismiss();
    if (!this.enabled || !this.panel.hidden || !this.queue.length) return;
    const { chapter, station, text } = this.queue.shift();
    this.current = missionSignal(chapter, mission);
    this.focus.hidden = !this.current;
    if (this.current) this.focus.textContent = this.current.label;
    this.panel.querySelector('strong').textContent = station;
    this.panel.querySelector('p').textContent = text;
    this.panel.hidden = false;
    this.until = now + Math.min(6700, 3000 + text.length * 28);
    this.onSignal(this.current, true);
  }
}
