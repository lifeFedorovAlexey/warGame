import {matchingRecipe, projectAssemblyKey, projectDesignation, vehicleComponentName} from './vehicle-designs.js';
import {DesignPreview} from './design-preview.js';

const catalogue = {
  C01: {role:'wheeled', detail:'Полный привод', icon:'move', massKg:1120},
  B01: {role:'light', detail:'Кузов фургона', icon:'command', massKg:730, armor:'Без навесной', armorDetail:'Штатный стальной кузов без навесных бронепанелей'},
  U01: {role:'combat', detail:'Пулемёт', icon:'bukhanka', massKg:155},
  U25: {role:'builder', detail:'Стройка и ремонт', icon:'builder', massKg:175},
  'mission-flamer': {role:'combat', detail:'Ближний бой', icon:'flamer', tag:'ОГН', massKg:210},
};

const roleNames = {combat:'Боевые', builder:'Инженерные', support:'Поддержка', recon:'Разведка', wheeled:'Колёсные', tracked:'Гусеничные', light:'Лёгкие', heavy:'Тяжёлые', other:'Прочие'};
const svgNS = 'http://www.w3.org/2000/svg';
const tons = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2});
const partsPerPage = 4;

export class VehicleDesigner {
  constructor(panel, toggle, mission, {makeModel, onSave, onActiveChange}) {
    this.panel = panel;
    this.toggle = toggle;
    this.mission = mission;
    this.makeModel = makeModel;
    this.onSave = onSave;
    this.onActiveChange = onActiveChange;
    this.tabs = [...panel.querySelectorAll('[data-design-slot]')];
    this.cards = panel.querySelector('[data-design-cards]');
    this.filters = panel.querySelector('[data-design-filters]');
    this.pages = panel.querySelector('[data-design-pages]');
    this.pageNumber = this.pages.querySelector('output');
    this.previousPage = this.pages.querySelector('[data-design-prev]');
    this.nextPage = this.pages.querySelector('[data-design-next]');
    this.stage = panel.querySelector('[data-design-viewport]');
    this.stageStatus = panel.querySelector('[data-design-stage-status]');
    this.modelName = panel.querySelector('[data-design-model-name]');
    this.form = panel.querySelector('form');
    this.name = this.form.elements.projectName;
    this.autoName = panel.querySelector('[data-design-auto-name]');
    this.status = panel.querySelector('[data-design-status]');
    this.saveButton = panel.querySelector('[type=submit]');
    this.explodeButton = panel.querySelector('[data-design-explode]');
    this.resetButton = panel.querySelector('[data-design-reset]');
    this.activeSlot = 2;
    this.activeRole = '';
    this.choicePage = null;
    this.manualName = false;
    this.components = [];
    this.recipes = [];
    for (const [index, tab] of this.tabs.entries()) tab.onclick = () => {
      this.activeSlot = index;
      this.activeRole = '';
      this.choicePage = null;
      this.paintChoices();
    };
    this.previousPage.onclick = () => { this.choicePage--; this.paintChoices(); };
    this.nextPage.onclick = () => { this.choicePage++; this.paintChoices(); };
    this.name.addEventListener('input', () => {
      this.manualName = true;
      this.autoName.disabled = false;
      this.status.textContent = '';
    });
    this.autoName.onclick = () => {
      this.manualName = false;
      this.status.textContent = '';
      this.syncName();
    };
    this.form.addEventListener('submit', event => this.submit(event));
    panel.querySelector('[data-close-designer]').onclick = () => this.close();
    panel.addEventListener('cancel', event => {event.preventDefault(); this.close();});
    this.explodeButton.onclick = () => {
      if (!this.preview) return;
      this.preview.setExploded(!this.preview.exploded);
      this.syncStageControls();
    };
    this.resetButton.onclick = () => this.preview?.resetView();
  }

  get visible() { return this.panel.open; }

  open() {
    if (this.visible) return;
    this.opener = document.activeElement;
    this.panel.showModal();
    this.toggle.setAttribute('aria-expanded', 'true');
    this.modelKey = null;
    try {
      this.preview = new DesignPreview(this.stage);
      this.stageStatus.textContent = '';
    } catch (error) {
      this.stageStatus.textContent = '3D-осмотр недоступен в этом браузере.';
      console.warn('Не удалось открыть 3D-гараж:', error.message);
    }
    this.refresh(true);
    this.onActiveChange(true);
    this.tabs[this.activeSlot].focus({preventScroll:true});
  }

  close(restoreFocus = true) {
    if (!this.visible) return;
    this.preview?.dispose();
    this.preview = null;
    this.panel.close();
    this.toggle.setAttribute('aria-expanded', 'false');
    this.status.textContent = '';
    this.onActiveChange(false);
    if (restoreFocus) (this.opener?.isConnected ? this.opener : this.toggle).focus();
  }

  refresh(force = false) {
    if (!this.visible) return;
    const recipes = this.mission.availableVehicleRecipes();
    const key = recipes.map(recipe => recipe.components.join('/')).join('|');
    if (!force && key === this.recipeKey) return;
    this.recipeKey = key;
    this.recipes = recipes;
    const recipe = matchingRecipe(recipes, this.components) ?? recipes[0];
    this.components = recipe ? [...recipe.components] : [];
    this.paintChoices();
    this.paintAssembly();
  }

  componentInfo(id, role = 'other') {
    const config = this.mission.config;
    return {name:vehicleComponentName(id, config), role, detail:'', icon:'build', ...catalogue[id], ...config.vehicleComponents?.[id]};
  }

  paintChoices() {
    for (const [index, tab] of this.tabs.entries()) {
      const id = this.components[index];
      tab.setAttribute('aria-pressed', String(index === this.activeSlot));
      tab.querySelector('strong').textContent = id ? this.componentInfo(id).name : '—';
    }
    const index = this.activeSlot;
    const prefix = this.components.slice(0, index);
    const candidates = this.recipes.filter(recipe => prefix.every((id, slot) => recipe.components[slot] === id));
    const ids = [...new Set(candidates.map(recipe => recipe.components[index]))];
    const choices = ids.map(id => {
      const recipe = candidates.find(entry => entry.components[index] === id);
      return {id, info:this.componentInfo(id, index === 2 ? recipe.spec.role : 'other')};
    });
    const groups = new Map();
    for (const {info} of choices) groups.set(info.role, info.roleLabel ?? roleNames[info.role] ?? roleNames.other);
    if (!groups.has(this.activeRole) || choices.length <= partsPerPage) this.activeRole = '';
    this.paintFilters(groups, choices.length);
    const visible = choices.filter(({info}) => !this.activeRole || info.role === this.activeRole);
    const pageCount = Math.max(1, Math.ceil(visible.length / partsPerPage));
    const selectedIndex = visible.findIndex(({id}) => id === this.components[index]);
    const page = this.choicePage ?? Math.floor(Math.max(0, selectedIndex) / partsPerPage);
    this.choicePage = Math.min(pageCount - 1, Math.max(0, page));
    const start = this.choicePage * partsPerPage;
    this.pages.hidden = pageCount === 1;
    this.pageNumber.value = (this.choicePage + 1) + ' / ' + pageCount;
    this.previousPage.disabled = this.choicePage === 0;
    this.nextPage.disabled = this.choicePage === pageCount - 1;
    this.cards.replaceChildren(...visible.slice(start, start + partsPerPage)
      .map(({id,info}) => this.partCard(id, info, candidates)));
  }

  paintFilters(groups, choiceCount) {
    this.filters.hidden = groups.size < 2 || choiceCount <= partsPerPage;
    if (this.filters.hidden) return;
    this.filters.replaceChildren(...[['', 'Все'], ...groups].map(([role, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(role === this.activeRole));
      button.onclick = () => {
        this.activeRole = role;
        this.choicePage = 0;
        this.paintChoices();
        this.filters.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
      };
      return button;
    }));
  }

  partCard(id, info, candidates) {
    const button = document.createElement('button');
    const copy = document.createElement('span');
    copy.className = 'design-part-copy';
    const name = document.createElement('strong');
    const detail = document.createElement('small');
    const icon = document.createElementNS(svgNS, 'svg');
    const use = document.createElementNS(svgNS, 'use');
    button.type = 'button';
    button.className = 'design-part';
    button.dataset.designComponent = id;
    button.setAttribute('aria-pressed', String(this.components[this.activeSlot] === id));
    if (Number.isFinite(info.massKg)) button.title = 'Расчётная масса · ' + info.massKg + ' кг';
    name.textContent = info.name;
    detail.textContent = info.detail || id;
    icon.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', 'hud-icons.svg#' + info.icon);
    icon.append(use);
    copy.append(name, detail);
    button.append(icon, copy);
    button.onclick = () => this.choosePart(id, candidates);
    return button;
  }

  choosePart(id, candidates) {
    const index = this.activeSlot;
    if (this.components[index] === id) return;
    const possible = candidates.filter(recipe => recipe.components[index] === id);
    const recipe = possible.find(entry => entry.components.slice(index + 1).every((part, offset) => part === this.components[index + 1 + offset])) ?? possible[0];
    if (!recipe) return;
    this.components = [...recipe.components];
    this.status.textContent = '';
    this.paintChoices();
    this.cards.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
    this.paintAssembly();
  }

  paintAssembly() {
    const recipe = matchingRecipe(this.recipes, this.components);
    this.saveButton.disabled = !recipe;
    this.modelName.textContent = recipe?.spec.name ?? 'Нет доступных сочетаний';
    this.paintStats(recipe);
    this.syncName();
    const modelKey = this.components.join('/');
    if (recipe && this.preview && modelKey !== this.modelKey) {
      this.modelKey = modelKey;
      try {
        this.preview.setModel(this.makeModel(this.components));
        this.stageStatus.textContent = '';
      } catch (error) {
        this.preview.clearModel();
        this.stageStatus.textContent = 'Не удалось загрузить 3D-модель.';
        console.warn('Модель конструктора недоступна:', error.message);
      }
    }
    this.syncStageControls();
  }

  paintStats(recipe) {
    const spec = recipe?.spec;
    const body = this.components[1] ? this.componentInfo(this.components[1]) : null;
    const masses = this.components.map(id => this.componentInfo(id).massKg);
    const total = masses.length && masses.every(Number.isFinite) ? masses.reduce((sum, mass) => sum + mass, 0) : 0;
    const values = {
      hp:spec?.hp,
      cost:spec && spec.cost + ' ⚡',
      time:spec && spec.seconds + ' с',
      speed:spec && spec.speed + ' м/с',
      range:spec?.range ? spec.range + ' м' : null,
      vision:spec && spec.vision + ' м',
      mass:total ? '≈ ' + tons.format(total / 1000) + ' т' : null,
      armor:body?.armor,
    };
    for (const [key, value] of Object.entries(values)) this.panel.querySelector('[data-design-' + key + ']').textContent = value ?? '—';
    this.panel.querySelector('[data-design-armor]').title = body?.armorDetail ?? '';
  }

  syncName() {
    const {state, config} = this.mission;
    const assembly = projectAssemblyKey({components:this.components});
    const current = state.designs.find(project => projectAssemblyKey(project) === assembly);
    this.saveButton.title = current ? 'Заменит проект «' + current.name + '» для этого набора деталей' : '';
    this.autoName.disabled = !this.manualName || !this.components.length;
    if (!this.manualName) {
      this.name.value = this.components.length ? projectDesignation(this.components, state.designs, config, state.research) : '';
    }
  }

  syncStageControls() {
    const exploded = !!this.preview?.exploded;
    this.explodeButton.disabled = this.resetButton.disabled = !this.preview?.model;
    this.explodeButton.textContent = exploded ? 'Собрать' : 'Разобрать';
    this.explodeButton.setAttribute('aria-pressed', String(exploded));
  }

  submit(event) {
    event.preventDefault();
    const result = this.mission.saveDesign(this.manualName ? this.name.value : '', this.components);
    if (!result.ok) {
      this.status.textContent = result.reason;
      return;
    }
    this.manualName = false;
    this.name.value = '';
    this.close();
    this.onSave(this.mission.state.designs.find(project => project.id === result.id));
  }
}
