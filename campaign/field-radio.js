const messages = {
  intro: { station: 'Штаб', text: 'Альфа, разверните базу. Сначала генератор и вышка на нефтяной точке.' },
  'first-contact': { station: 'Разведка', text: 'В ущелье замечены машины отбросов. Прикройте стройку.' },
  'raid-won': { station: 'Командир', text: 'Рейд отбили. Проверьте технику и выдвигайтесь к лагерям.' },
  'artifact-flamethrower': { station: 'Лаборатория', text: 'Забрали устройство с синей изолентой. Отправьте его на исследование.' },
  'research-flamethrower': { station: 'Лаборатория', text: 'Под синей изолентой была жёлтая. Огнемёт доступен в конструкторе.' },
  'artifact-mg-ammo-1': { station: 'Лаборатория', text: 'На складе нашли новые боеприпасы. Образцы в лаборатории.' },
  'research-mg-ammo-1': { station: 'Лаборатория', text: 'Новые патроны готовы. Передали боекомплект на машины.' },
  'camp3-sighted': { station: 'Разведка', text: 'На водонапорной башне пулемёт. Заходите с укрытия.' },
  'research-mg-tower': { station: 'Лаборатория', text: 'Разобрались с башней. Чертёж доступен в меню строительства.' },
  'last-camp': { station: 'Разведка', text: 'Опорный пункт Петровича на юге. Сектор открыт и отмечен на карте.' },
  victory: { station: 'Командир', text: 'База действует. Все четыре лагеря зачищены.' },
  outro: { station: 'Штаб', text: 'К востоку зафиксирован энергетический всплеск. Готовьтесь к разведке.' },
};

export class FieldRadio {
  constructor(panel, toggle, onSignal) {
    this.panel = panel;
    this.toggle = toggle;
    this.onSignal = onSignal;
    this.queue = [];
    this.until = 0;
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
    this.panel.hidden = true;
    this.until = 0;
  }

  dismiss() {
    if (this.panel.hidden) return false;
    this.panel.hidden = true;
    this.until = 0;
    return true;
  }

  consume(mission, now) {
    for (const chapter of [...mission.state.pendingCinematics]) {
      mission.finishCinematic(chapter);
      if (this.enabled && messages[chapter]) this.queue.push(messages[chapter]);
    }
    if (now >= this.until) this.panel.hidden = true;
    if (!this.enabled || !this.panel.hidden || !this.queue.length) return;
    const { station, text } = this.queue.shift();
    this.panel.querySelector('strong').textContent = station;
    this.panel.querySelector('p').textContent = text;
    this.panel.hidden = false;
    this.until = now + Math.min(6700, 3000 + text.length * 28);
    this.onSignal();
  }
}
