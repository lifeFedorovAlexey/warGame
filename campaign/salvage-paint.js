import {vehiclePaint} from './vehicle-paint.js';
import {FIELD_RECIPES} from './field-modifications.js';
export const safeSalvageColor=value=>/^#[0-9a-f]{6}$/i.test(value??'')?value:'#825a46';
export function recoveredPaint(unit,part){
 const id=Object.keys(FIELD_RECIPES).find(id=>FIELD_RECIPES[id].part===part),saved=unit.fieldModifications?.[id]?.paintColor;
 return safeSalvageColor(saved??({'scav-firetruck':'#914c39','scav-zaporozhets':'#718d83','scav-bus':'#b99b45',raider:'#825a46'}[unit.kind]??vehiclePaint(unit).color));
}
export function paintSalvageModel(root,color){
 const seen=new Set();root.traverse(node=>{
  const m=node.material;if(!node.isMesh||seen.has(m)||!['salvage_hood_paint','field_body_paint','field_body_scav','paint_olive'].includes(m?.name))return;
  m.color.set(safeSalvageColor(color));seen.add(m);
 });
}
