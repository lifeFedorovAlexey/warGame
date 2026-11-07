import {matchingRecipe, projectAssemblyKey, projectDesignation, vehicleComponentName} from './vehicle-designs.js';
import {DesignPreview} from './design-preview.js';
import {FIELD_RECIPES,ensureSalvage} from './vehicle-salvage.js';
import {setButtonIcon} from '../assets/ui/icons.js';

const catalogue = {
  C01: {role:'wheeled', detail:'Полный привод', icon:'move', massKg:1120},
  B01: {role:'light', detail:'Кузов фургона', icon:'command', massKg:730, armor:'Без навесной', armorDetail:'Штатный стальной кузов без навесных бронепанелей'},
  U01: {role:'combat', detail:'Пулемёт', icon:'bukhanka', massKg:155},
  U25: {role:'builder', detail:'Стройка и ремонт', icon:'builder', massKg:175},
  'mission-flamer': {role:'combat', detail:'Ближний бой', icon:'flamer', tag:'ОГН', massKg:210},
};

const roleNames = {combat:'Боевые', builder:'Инженерные', support:'Поддержка', recon:'Разведка', wheeled:'Колёсные', tracked:'Гусеничные', light:'Лёгкие', heavy:'Тяжёлые', other:'Прочие'};
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
    this.previewModules = new Set();
    this.fieldNote = panel.querySelector('[data-design-field-note]');
    this.recipes = [];
    this.salvageToggle=panel.querySelector('[data-salvage-enabled]');
    this.salvageChoices=panel.querySelector('[data-salvage-recipes]');
    this.salvageToggle.onchange=()=>{const state=ensureSalvage(this.mission);state.enabled=this.salvageToggle.checked;state.userConfigured=true;this.paintSalvage();};
    for (const [index, tab] of this.tabs.entries()) tab.onclick = () => {
      this.activeSlot = index;
      this.activeRole = '';
      this.choicePage = null;
      this.paintChoices();
      this.paintFieldNote();
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
    this.panel.querySelector('.design-salvage').open = false;
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
    this.paintSalvage();
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

  paintSalvage(){
    const state=ensureSalvage(this.mission),key=JSON.stringify([state.enabled,state.recipes,state.wanted]);
    if(this.salvageKey===key)return;this.salvageKey=key;this.salvageToggle.checked=state.enabled;
    this.salvageChoices.replaceChildren(...Object.entries(FIELD_RECIPES).map(([id,recipe])=>{
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=state.wanted.includes(id);input.disabled=!state.enabled||!state.recipes.includes(id);
      label.append(input,document.createTextNode(' '+recipe.name+' · +'+recipe.hpBonus+' HP'+(state.recipes.includes(id)?'':' · нет чертежа')));
      input.onchange=()=>{state.wanted=input.checked?[...new Set([...state.wanted,id])]:state.wanted.filter(key=>key!==id);this.paintSalvage();};return label;
    }));
  }

  paintChoices() {
    for (const [index, tab] of this.tabs.entries()) {
      if(index===3){
        tab.setAttribute('aria-pressed',String(this.activeSlot===3));
        setButtonIcon(tab,'armor-upgrade','04 · Навесные модули');
        continue;
      }
      const id = this.components[index];
      tab.setAttribute('aria-pressed', String(index === this.activeSlot));
      const slotName = ['Ходовая', 'Корпус', 'Модуль'][index];
      const partName = id ? this.componentInfo(id).name : '—';
      setButtonIcon(tab, ['wheels', 'body', 'turret-ring'][index], slotName + ' · ' + partName);
    }
    if(this.activeSlot===3)return this.paintFieldChoices();
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
      const roleIcons = {combat:'machinegun', builder:'tools', support:'repair', recon:'recon', wheeled:'wheels', tracked:'tracks', light:'body', heavy:'shield', other:'all'};
      setButtonIcon(button, roleIcons[role] ?? 'all', label);
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
    button.type = 'button';
    button.className = 'design-part';
    button.dataset.designComponent = id;
    button.setAttribute('aria-pressed', String(this.components[this.activeSlot] === id));
    const known = ['C01', 'B01', 'U01', 'U25', 'mission-flamer'].includes(id);
    setButtonIcon(button, known ? id : info.icon, info.name,
      [info.tag ?? id, info.detail, Number.isFinite(info.massKg) ? 'Масса ' + info.massKg + ' кг' : ''].filter(Boolean).join(' · '));
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
    const modifications=this.fieldPreview();
    this.saveButton.disabled = !recipe;
    this.modelName.textContent = recipe?.spec.name ?? 'Нет доступных сочетаний';
    this.paintStats(recipe);
    this.paintFieldNote();
    this.syncName();
    const modelKey = this.components.join('/')+'|'+modifications.map(r=>r.id).join('/');
    if (recipe && this.preview && modelKey !== this.modelKey) {
      this.modelKey = modelKey;
      try {
        this.preview.setModel(this.makeModel(this.components),modifications.map(r=>r.id));
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
    const modifications=this.fieldPreview(),bonus=modifications.reduce((sum,r)=>sum+r.hpBonus,0);
    const values = {
      hp:spec ? spec.hp+bonus : null,
      cost:spec && spec.cost + ' ⚡',
      time:spec && spec.seconds + ' с',
      speed:spec && spec.speed + ' м/с',
      range:spec?.range ? spec.range + ' м' : null,
      vision:spec && spec.vision + ' м',
      mass:total ? '≈ ' + tons.format(total / 1000) + ' т' : null,
      armor:bonus?'Навесная · +'+bonus+' HP':body?.armor,
    };
    for (const [key, value] of Object.entries(values)) this.panel.querySelector('[data-design-' + key + ']').textContent = value ?? '—';
    this.panel.querySelector('[data-design-armor]').title = bonus?modifications.map(r=>r.name).join(', '):body?.armorDetail ?? '';
  }

  fieldChoices() {
    const state=ensureSalvage(this.mission);
    return Object.entries(FIELD_RECIPES).filter(([id,r])=>state.recipes.includes(id)&&this.components.includes(r.body))
      .map(([id,recipe])=>({id,...recipe}));
  }

  fieldPreview() {return this.fieldChoices().filter(r=>this.previewModules.has(r.id));}

  paintFieldChoices() {
    this.filters.hidden=this.pages.hidden=true;
    this.cards.replaceChildren(...this.fieldChoices().map(recipe=>{
      const button=document.createElement('button');button.type='button';button.className='design-part';
      button.dataset.designModification=recipe.id;
      button.setAttribute('aria-pressed',String(this.previewModules.has(recipe.id)));
      setButtonIcon(button,recipe.id==='hood-guard'?'armor-plate':'wall',recipe.name,'Показать на машине · +'+recipe.hpBonus+' HP');
      button.onclick=()=>{
        if(this.previewModules.has(recipe.id))this.previewModules.delete(recipe.id);else this.previewModules.add(recipe.id);
        this.paintFieldChoices();this.paintAssembly();
      };
      return button;
    }));
    this.paintFieldNote();
  }

  paintFieldNote() {
    const modules=this.fieldPreview();
    this.fieldNote.hidden=this.activeSlot!==3&&!modules.length;
    this.fieldNote.textContent=modules.length?modules.map(r=>r.name+' +'+r.hpBonus+' HP').join(' · ')+'. Установка при подборе деталей.'
      :this.fieldChoices().length?'Выберите модуль для осмотра на машине. Установка при подборе деталей.':'Нет доступных навесных модулей для этого корпуса.';
  }

  syncName() {
    const {state, config} = this.mission;
    const assembly = projectAssemblyKey({components:this.components});
    const current = state.designs.find(project => projectAssemblyKey(project) === assembly);
    this.saveButton.title = current ? 'Заменит проект «' + current.name + '» для этого набора деталей' : 'Новый проект';
    this.autoName.disabled = !this.manualName || !this.components.length;
    if (!this.manualName) {
      this.name.value = this.components.length ? projectDesignation(this.components, state.designs, config, state.research) : '';
    }
  }

  syncStageControls() {
    const exploded = !!this.preview?.exploded;
    this.explodeButton.disabled = this.resetButton.disabled = !this.preview?.model;
    setButtonIcon(this.explodeButton, exploded ? 'assemble' : 'explode', exploded ? 'Собрать' : 'Разобрать');
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
