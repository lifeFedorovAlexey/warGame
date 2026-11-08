import {vehiclePaint} from './vehicle-paint.js';

const starterKinds = ['bukhanka', 'builder'];
const componentNames = {C01:'Двор', B01:'Буханка', U01:'Корд', U25:'Проектор', 'mission-flamer':'Огнемёт'};
const designationPattern = /^([\p{L}\p{N}]+)-([1-9]\d*)(М\d*)?$/iu;

export function vehicleComponentName(id, config) {
  return config?.vehicleComponents?.[id]?.name ?? componentNames[id] ?? id;
}

export const designNameKey = name => name.trim().normalize('NFC').toLocaleLowerCase('ru');

export function projectAssemblyKey({components, engineUpgradeLevel = 0}) {
  // Paint and project names are cosmetic; only the assembly defines a type.
  const level = Number.isSafeInteger(engineUpgradeLevel) && engineUpgradeLevel > 0 ? engineUpgradeLevel : 0;
  return JSON.stringify([components, level]);
}

export function latestVehicleProject(projects, vehicle, config) {
  const components = vehicle.components ?? config.units[vehicle.kind]?.components;
  if (!components) return undefined;
  const key = projectAssemblyKey({...vehicle, components});
  return projects.findLast(project => projectAssemblyKey(project) === key);
}

export function latestVehicleProjects(projects) {
  const latest = new Map();
  for (const project of projects) {
    const key = projectAssemblyKey(project);
    latest.delete(key);
    latest.set(key, project);
  }
  return [...latest.values()];
}

function engineSuffix(config, research) {
  let level = 0;
  for (const [id, spec] of Object.entries(config.research ?? {})) {
    if (research[id] && Number.isSafeInteger(spec.engineUpgradeLevel)) level = Math.max(level, spec.engineUpgradeLevel);
  }
  return level > 1 ? 'М' + level : level === 1 ? 'М' : '';
}

export function projectDesignation(components, projects, config, research = {}) {
  const letters = components.map(id => Array.from(vehicleComponentName(id, config).normalize('NFC').replace(/[^\p{L}]/gu, '') || 'X').slice(0, 6));
  const lengths = letters.map(() => 1);
  const abbreviation = () => letters.map((word, i) => word[0].toLocaleUpperCase('ru') + word.slice(1, lengths[i]).join('').toLocaleLowerCase('ru'));
  const occupied = projects.flatMap(project => {
    const match = designationPattern.exec(designNameKey(project.name));
    return match ? [{stem:match[1], number:Number(match[2]), suffix:match[3] ?? '', components:project.components}] : [];
  });
  const conflicting = stem => occupied.filter(project => project.stem === designNameKey(stem) && components.some((id, i) => project.components[i] !== id));

  let stem = abbreviation().join('');
  for (let conflicts = conflicting(stem); conflicts.length; conflicts = conflicting(stem)) {
    const differs = i => conflicts.some(project => project.components[i] !== components[i]);
    const slot = lengths.findIndex((length, i) => length < letters[i].length && differs(i));
    if (slot >= 0) {
      lengths[slot]++;
      stem = abbreviation().join('');
      continue;
    }
    const differentSlot = components.findIndex((_, i) => differs(i));
    const parts = abbreviation();
    parts[differentSlot] += components[differentSlot].replace(/[^\p{L}\p{N}]/gu, '').slice(-4);
    const tagged = parts.join('');
    stem = tagged;
    for (let index = 2; conflicting(stem).length; index++) stem = tagged + index;
  }

  const used = new Set(projects.map(project => designNameKey(project.name)));
  const suffix = engineSuffix(config, research);
  const stemKey = designNameKey(stem), suffixKey = designNameKey(suffix);
  const previous = occupied.reduce((number, project) => {
    if (project.stem !== stemKey || project.suffix !== suffixKey || !components.every((id, i) => project.components[i] === id)) return number;
    return Number.isSafeInteger(project.number + projects.length + 1) ? Math.max(number, project.number) : number;
  }, 0);
  for (let index = previous + 1; ; index++) {
    const tail = '-' + index + suffix;
    const name = stem.slice(0, 36 - tail.length) + tail;
    if (!used.has(designNameKey(name))) return name;
  }
}

export function vehicleRecipes(config) {
  return (config.buildings.factory?.production ?? []).flatMap(kind => {
    const spec = config.units[kind];
    if (spec?.components?.length !== 3) return [];
    return [{kind, spec, components: spec.components}];
  });
}

export function starterProjects(recipes) {
  return recipes.filter(recipe => starterKinds.includes(recipe.kind)).map(({kind, spec, components}) => ({
    id: kind,
    name: spec.name,
    components: [...components],
    paint: vehiclePaint({kind, components}).id,
  }));
}

export function matchingRecipe(recipes, components) {
  if (!Array.isArray(components) || components.length !== 3) return undefined;
  return recipes.find(recipe => recipe.components.every((component, index) => component === components[index]));
}
