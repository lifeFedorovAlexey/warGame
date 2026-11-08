// Deliberately fixed paint catalogue: no arbitrary RGB colours in projects/saves.
export const VEHICLE_PAINTS = Object.freeze([
  {id:'gray', name:'Буханочный серый', color:'#929793'},
  {id:'olive', name:'Армейский оливковый', color:'#5c644c'},
  {id:'khaki', name:'Выцветший хаки', color:'#858064'},
  {id:'sand', name:'Песочный', color:'#b3a180'},
  {id:'slate', name:'Серо-синий', color:'#647679'},
  {id:'earth', name:'Земляной', color:'#806757'},
].map(Object.freeze));

export function vehiclePaint({paint, kind, components} = {}) {
  return VEHICLE_PAINTS.find(entry => entry.id === paint)
    ?? VEHICLE_PAINTS[kind === 'builder' || components?.[2] === 'U25' ? 0 : 1];
}

export const isVehiclePaintMaterial = material => material?.name === 'paint_olive';

// GLB paint is #5c644c in every LOD. A separate instance tint affects only
// that material, retaining the original glass, tyres, metal and light lenses.
export function vehiclePaintTint(T, paint) {
  const base = new T.Color('#5c644c'), target = new T.Color(paint.color);
  return target.setRGB(target.r / base.r, target.g / base.g, target.b / base.b);
}

export function paintVehicleModel(root, paint) {
  const materials = new Map();
  root.traverse(node => {
    if (!node.isMesh || !isVehiclePaintMaterial(node.material)) return;
    const source = node.material;
    if (!materials.has(source)) {
      const material = source.clone();
      material.color.set(paint.color);
      materials.set(source, material);
    }
    node.material = materials.get(source);
  });
  return () => { for (const material of materials.values()) material.dispose(); };
}
