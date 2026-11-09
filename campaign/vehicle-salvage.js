import {createDamageState,partMissing} from './damage-state.js';
import {vehicleToWorld,vehiclePose,angleDelta} from './builder-kinematics.js';

export const SALVAGE_LIMITS={items:24,lifetime:240,settleSeconds:2,pickupMarginMetres:2.5,cellMetres:8};
export function salvagePickupReach(scale=1){
  const side=(1.177+SALVAGE_LIMITS.pickupMarginMetres)*scale,front=(2.425+SALVAGE_LIMITS.pickupMarginMetres)*scale;
  return {side,front,radius:Math.hypot(side,front)};
}
// Original model attachments, in metres. These are part anchors, not wreck meshes.
const modularStock={7:[0,2.25,.96],8:[0,-2.25,.96]};
const raiderStock={7:[0,2.024,.85],8:[0,-2.02,.85],24:[-.84,-1.4,1.95],25:[.84,-1.4,1.95]};
const stockFor=(mission,unit)=>unit.kind==='raider'?raiderStock:unit.kind!=='command'&&mission.config.units[unit.kind]?.components?.includes('B01')?modularStock:null;
export const canInstallRecipe=(mission,unit,recipe)=>unit.kind!=='command'&&!!mission.config.units[unit.kind]?.components?.includes(recipe.body);
export const FIELD_RECIPES={
  'hood-guard':{name:'Защита передка',part:22,stock:'guard-stock',body:'B01',strength:120,hpBonus:120,bulletMultiplier:.65},
  'window-grille':{name:'Решётки лобовых стёкол',part:23,stock:'guard-stock',body:'B01',strength:80,hpBonus:80,bulletMultiplier:.75},
  'tube-bumper':{name:'Трубчатый бампер',icon:'armor-upgrade',part:26,stock:'tube-stock',body:'B01',strength:150,hpBonus:80,bulletMultiplier:.8},
};
export function ensureSalvage(mission){
  const state=mission.state.salvage??={enabled:true,recipes:[...(mission.config.salvage?.initialRecipes??[])],wanted:Object.keys(FIELD_RECIPES),items:[],serial:0};
  // Previous saves had an implicit off default. Keep explicit user choices.
  if(!state.preferenceVersion){if(!state.userConfigured)state.enabled=true;state.preferenceVersion=1;}
  if(!state.recipeVersion){
    for(const id of mission.config.salvage?.initialRecipes??[])if(!state.recipes.includes(id)){
      state.recipes.push(id);if(!state.userConfigured&&!state.wanted.includes(id))state.wanted.push(id);
    }
    state.recipeVersion=1;
  }
  return state;
}
export function availableFieldRecipes(mission){
  const state=ensureSalvage(mission);
  return Object.entries(FIELD_RECIPES).filter(([id])=>state.recipes.includes(id)).map(([id,r])=>({id,...r}));
}
export function modificationInstalled(unit,part){return !!unit.damage?.parts?.[part]?.installed&&!partMissing(unit.damage,part);}
export function salvageRecipe(mission,unit,item){
  const state=ensureSalvage(mission);
  if(!state.enabled||unit.hp<=0||unit.owner!=='rai'||item.sourceUnit===unit.id)return null;
  return availableFieldRecipes(mission).find(recipe=>state.wanted.includes(recipe.id)&&recipe.stock===item.stock
    &&canInstallRecipe(mission,unit,recipe)&&!modificationInstalled(unit,recipe.part))??null;
}
export function syncFieldHp(mission,unit){
  const previous=unit.fieldHpBonus??0;
  const bonus=unit.hp>0&&!unit.damage?.wreck?Object.values(FIELD_RECIPES)
    .filter(recipe=>canInstallRecipe(mission,unit,recipe)&&modificationInstalled(unit,recipe.part))
    .reduce((sum,recipe)=>sum+recipe.hpBonus,0):0;
  if(bonus===previous)return;
  const base=(unit.maxHp??mission.config.units[unit.kind]?.hp??unit.hp)-previous;
  unit.maxHp=base+bonus;
  // New steel adds its own HP, preserving existing hull damage. Losing a part
  // lowers the cap; the hit already dealt damage and must not be charged twice.
  if(unit.hp>0)unit.hp=Math.min(unit.maxHp,unit.hp+Math.max(0,bonus-previous));
  unit.fieldHpBonus=bonus;
}
export function salvageFromImpact(mission,unit,hit,result){
  if(!mission.state||!stockFor(mission,unit))return;
  const state=ensureSalvage(mission),ids=[...(result.detached?[result.partId]:[]),...result.secondaryFailures];
  for(const part of ids){
    // Recover structural guards only. Glass, tyres and pulverised pieces have
    // no usable stock. No chance roll tied to IDs or camera visibility.
    const anchor=stockFor(mission,unit)[part];
    if(!anchor||hit.power>600||unit.damage.parts[part].salvageId)continue;
    const scale=mission.config.worldScale,pose=mission.field?vehiclePose(unit,mission.field,scale):{position:[unit.x,unit.y,0],heading:unit.heading??0,pitch:0,roll:0,scale};
    const p=mission.damagePartWorldPosition?.(unit,part)??vehicleToWorld(anchor,pose);
    const outward=[p[0]-unit.x,p[1]-unit.y],length=Math.hypot(...outward)||1;
    const x=p[0]+outward[0]/length*scale*.8,y=p[1]+outward[1]/length*scale*.8;
    const id='scrap-'+(++state.serial);
    if(state.items.length>=SALVAGE_LIMITS.items)state.items.shift();
    state.items.push({id,stock:'guard-stock',sourceKind:unit.kind,sourcePart:part,sourceUnit:unit.id,x,y,origin:p,bornAt:mission.state.time,heading:unit.heading??0,readyAt:mission.state.time+SALVAGE_LIMITS.settleSeconds,expiresAt:mission.state.time+SALVAGE_LIMITS.lifetime});
    unit.damage.parts[part].salvageId=id;
  }
}
export function salvageFromWreck(mission,unit,hit){
  const stock=stockFor(mission,unit);if(!stock||!unit.damage||!hit||hit.power>600||unit.damage.burn>.8)return;
  // Loss of the frame releases the closest surviving reusable attachment to
  // the lethal contact. Preserve all earlier failures and the deformed body.
  const point=hit.restPoint??hit.point;
  if(!point)return;
  const candidates=Object.entries(stock).filter(([id])=>!partMissing(unit.damage,id));
  candidates.sort((a,b)=>Math.hypot(...a[1].map((v,k)=>v-point[k]))-Math.hypot(...b[1].map((v,k)=>v-point[k])));
  if(!candidates.length)return;
  const part=Number(candidates[0][0]);unit.damage.parts[part]={...unit.damage.parts[part],damage:1,detached:true};unit.damage.revision++;
  salvageFromImpact(mission,unit,hit,{detached:true,partId:part,secondaryFailures:[]});
}

// Sweep the pickup area around the hull, including stock beside a wreck.
// Routing, arrival and collection share this reach; no exact parking is needed.
export function touchesSalvage(unit,item,scale){
  const heading=unit.heading??0,oldHeading=unit.previousHeading??heading,turn=angleDelta(heading,oldHeading);
  const ax=unit.previousX??unit.x,ay=unit.previousY??unit.y,dx=unit.x-ax,dy=unit.y-ay;
  const length=Math.hypot(dx,dy),steps=Math.max(1,Math.ceil(length/(scale*.35)),Math.ceil(Math.abs(turn)/.10));
  const {side:halfWidth,front:halfLength}=salvagePickupReach();
  for(let i=0;i<=steps;i++){
    const t=i/steps,h=oldHeading+turn*t,c=Math.cos(h),s=Math.sin(h),x=(item.x-ax-dx*t)/scale,y=(item.y-ay-dy*t)/scale;
    if(Math.abs(x*c+y*s)<=halfWidth&&Math.abs(-x*s+y*c)<=halfLength)return true;
  }
  return false;
}
const indices=new WeakMap();
export function updateSalvage(mission){
  const state=mission.state.salvage;if(!state?.items.length)return;
  const now=mission.state.time;
  state.items=state.items.filter(item=>item.expiresAt>now);
  if(!state.enabled||!state.items.length)return;
  const recipes=availableFieldRecipes(mission).filter(r=>state.wanted.includes(r.id));if(!recipes.length)return;
  // Rebuilt only when the bounded item list changes, not once per vehicle.
  let index=indices.get(state);const key=state.items.map(i=>i.id).join('|'),scale=mission.config.worldScale,cell=SALVAGE_LIMITS.cellMetres*scale;
  if(!index||index.key!==key){index={key,buckets:new Map()};for(const item of state.items){const key=Math.floor(item.x/cell)+','+Math.floor(item.y/cell);if(!index.buckets.has(key))index.buckets.set(key,[]);index.buckets.get(key).push(item);}indices.set(state,index);}
  const consumed=new Set(),radius=salvagePickupReach(scale).radius,reservations=new Map();
  for(const unit of mission.state.units)if(unit.task?.salvageId){
    const item=state.items.find(item=>item.id===unit.task.salvageId);
    if(item&&salvageRecipe(mission,unit,item)&&!unit.combatRetreat)reservations.set(item.id,unit.id);
  }
  for(const unit of mission.state.units){
    if(unit.hp<=0||unit.owner!=='rai')continue;
    const compatible=recipes.filter(r=>canInstallRecipe(mission,unit,r)&&!modificationInstalled(unit,r.part));if(!compatible.length)continue;
    const ax=unit.previousX??unit.x,ay=unit.previousY??unit.y;
    for(let cy=Math.floor((Math.min(ay,unit.y)-radius)/cell);cy<=Math.floor((Math.max(ay,unit.y)+radius)/cell);cy++)for(let cx=Math.floor((Math.min(ax,unit.x)-radius)/cell);cx<=Math.floor((Math.max(ax,unit.x)+radius)/cell);cx++){
      for(const item of index.buckets.get(cx+','+cy)??[]){
        if(consumed.has(item.id)||item.readyAt>now||item.sourceUnit===unit.id)continue;
        if(reservations.has(item.id)&&reservations.get(item.id)!==unit.id)continue;
        if(!touchesSalvage(unit,item,scale))continue;
        const recipe=compatible.find(r=>r.stock===item.stock&&!modificationInstalled(unit,r.part));if(!recipe)continue;
        syncFieldHp(mission,unit);
        const damage=unit.damage??=createDamageState();damage.parts[recipe.part]={installed:true,detached:false,damage:0};damage.revision++;
        syncFieldHp(mission,unit);
        (unit.fieldModifications??={})[recipe.id]={source:item.id,installedAt:now};consumed.add(item.id);
        if(unit.task?.salvageId===item.id){unit.task=null;unit.path=[];unit.driveSpeed=0;delete unit.detour;}
        mission.emit?.('field-modification',{unit:unit.id,recipe:recipe.id,name:recipe.name,hpBonus:recipe.hpBonus,
          item:item.id,pickupDistance:Math.hypot(unit.x-item.x,unit.y-item.y),pickupMarginMetres:SALVAGE_LIMITS.pickupMarginMetres});
      }
    }
  }
  if(consumed.size)state.items=state.items.filter(item=>!consumed.has(item.id));
}
export function armorMultiplier(hit,unit){
  if(hit?.type!=='bullet')return 1;
  const recipe=Object.values(FIELD_RECIPES).find(r=>r.part===hit.partId);
  // The contact was resolved against an installed guard before its durability
  // changed. The last hit receives protection; later rays hit exposed metal.
  return recipe&&unit.damage?.parts?.[recipe.part]?.installed?recipe.bulletMultiplier:1;
}
