import {atlasRegions} from './atlas-regions.js';

// Shared icon vocabulary. Atlas cells follow the supplied reference sheets.
const sheets = [
  {file:'vehicles', columns:4, rows:4, names:['builder','construction-truck','repair','scout','wheels','halftrack','tracks','body','transport','command','supply-truck','crane-truck','excavator','wheel-upgrade','track-upgrade','new-design']},
  {file:'weapons', columns:4, rows:4, names:['machinegun','twin-gun','heavy-gun','cannon','mortar','flamer','rockets','missile','anti-air','projector','recon','radar','piercing','incendiary','reload','turret-ring']},
  {file:'buildings', columns:4, rows:4, names:['research','tools','build','factory','generator','lab','derrick','mg-tower','bunker','produce','upgrade','shield','engine','supply','radio','home']},
  // The newer sheets take precedence for matching actions; unique earlier icons remain available.
  {file:'modules-v2', columns:4, rows:5, names:['machinegun','twin-gun','heavy-gun','cannon','anti-air','mortar','rockets','flamer','missile','sensor','recon','projector','crane-module','ammunition','armor-plate','radar','engine','turret-ring','fortification','waypoint']},
  {file:'buildings-v2', columns:4, rows:5, names:['factory','lab','generator','derrick','home','construction-yard','repair-depot','radio','supply','wall','gate','bunker','mg-tower','cannon-tower','aa-tower','mortar-tower','watchtower','refinery','factory-upgrade','lab-upgrade']},
  {file:'vehicles-v2', columns:4, rows:5, names:['light-body','body','heavy-body','transport','wheels','halftrack','tracks','hovercraft','builder','repair','supply-truck','command','command-truck','crane-truck','excavator','scout','armor-layers','wheel-upgrade','track-upgrade','new-design']},
  {file:'actions-v2', columns:4, rows:5, names:['research','tools','build','produce','recycle','move','patrol','attack','shield','stop','engine-upgrade','armor-upgrade','damage-upgrade','ammo-upgrade','accuracy-upgrade','sensor-upgrade','power-upgrade','production-upgrade','defense-upgrade','technology']},
];
const atlas = new Map(sheets.flatMap(sheet => sheet.names.map((name, index) => [name, {...sheet, index}])));
export const iconGroups = sheets.filter(sheet => sheet.file.endsWith('-v2')).map(({file,names}) => ({file, names:[...names]}));
const aliases = {bukhanka:'light-body', raider:'scout', C01:'wheels', B01:'body', U01:'machinegun', U25:'projector', 'mission-flamer':'flamer', flamethrower:'flamer', 'mg-ammo-1':'ammo-upgrade', focus:'waypoint'};
Object.assign(aliases,{U02:'twin-gun',U21:'sensor','twin-machinegun':'twin-gun','flamer-upgrade':'damage-upgrade','power-module':'power-upgrade'});
const root = new URL('./', import.meta.url);

export function iconElement(name) {
  const key = aliases[name] ?? name, cell = atlas.get(key);
  if (cell) {
    const icon = document.createElement('span');
    icon.className = 'game-icon atlas-icon';
    icon.setAttribute('aria-hidden', 'true');
    const sprite = document.createElement('span');
    sprite.className = 'atlas-cell';
    sprite.style.backgroundImage = `url("${new URL(cell.file + '.png', root)}")`;
    sprite.style.backgroundSize = `${cell.columns * 100}% ${cell.rows * 100}%`;
    sprite.style.backgroundPosition = `${cell.index % cell.columns * 100 / (cell.columns - 1)}% ${Math.floor(cell.index / cell.columns) * 100 / (cell.rows - 1)}%`;
    const measured = atlasRegions[cell.file];
    if (measured) {
      const [x,y,width,height] = measured.rects[cell.index];
      const scale = 92 / Math.max(width,height), w = width*scale, h = height*scale;
      sprite.style.width = w + '%';
      sprite.style.height = h + '%';
      sprite.style.backgroundSize = `${measured.width/width*100}% ${measured.height/height*100}%`;
      sprite.style.backgroundPosition = `${x/(measured.width-width)*100}% ${y/(measured.height-height)*100}%`;
    }
    icon.append(sprite);
    return icon;
  }
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(icon.namespaceURI, 'use');
  icon.classList.add('game-icon');
  icon.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', new URL(key.startsWith('combat-') ? 'combat-symbols.svg' : 'controls.svg', root) + '#' + key);
  icon.append(use);
  return icon;
}

export function setButtonIcon(button, key, label, detail = '') {
  button.classList.add('icon-button');
  // UI refreshes frequently: keep the icon node when only its label changes.
  if (button.dataset.icon !== key || !button.querySelector('.game-icon')) button.replaceChildren(iconElement(key));
  button.dataset.icon = key;
  const description = [label, detail].filter(Boolean).join(' · ');
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  if (button.title !== description) button.title = description;
  return button;
}

export function setButtonLabel(button, label) {
  setButtonIcon(button, button.dataset.icon, label);
}

export function speedIcon(speed) { return speed <= 1 ? 'speed-one' : speed <= 2 ? 'speed-two' : 'speed-three'; }

for (const button of document.querySelectorAll('[data-icon]')) {
  setButtonIcon(button, button.dataset.icon, button.getAttribute('aria-label') || button.textContent.trim(), button.title);
}
