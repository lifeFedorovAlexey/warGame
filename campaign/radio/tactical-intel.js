import {russianCount,russianNumber} from './conditions.js';

// Observed entities, not shots or silhouettes guessed from damage numbers.
const types={
 raider:[['пикап с пулемётом','пикапа с пулемётами','пикапов с пулемётами'],'masculine'],
 'scav-firetruck':[['грузовик с огнемётом','грузовика с огнемётами','грузовиков с огнемётами'],'masculine'],
 'scav-zaporozhets':[['запорожец с пулемётом','запорожца с пулемётами','запорожцев с пулемётами'],'masculine'],
 'scav-bus':[['автобус с пулемётом','автобуса с пулемётами','автобусов с пулемётами'],'masculine'],
 'mg-tower':[['пулемётная вышка','пулемётные вышки','пулемётных вышек'],'feminine'],
 bunker:[['пулемётный ДОТ','пулемётных ДОТа','пулемётных ДОТов'],'masculine'],
 flamer:[['огнемётная машина','огнемётные машины','огнемётных машин'],'feminine'],
 bukhanka:[['машина с пулемётом','машины с пулемётами','машин с пулемётами'],'feminine'],
 'scav-rifleman':[['стрелок','стрелка','стрелков'],'masculine'],
 'scav-grenadier':[['гранатомётчик','гранатомётчика','гранатомётчиков'],'masculine'],
 'scav-barracks':[['казарма','казармы','казарм'],'feminine'],
 'scav-store':[['склад','склада','складов'],'masculine'],
 'scav-fence':[['секция забора','секции забора','секций забора'],'feminine'],
 'scav-gate':[['ворота','ворот','ворот'],'neuter'],
 generator:[['генератор','генератора','генераторов'],'masculine'],
 derrick:[['нефтяная вышка','нефтяные вышки','нефтяных вышек'],'feminine'],
 factory:[['завод','завода','заводов'],'masculine'],
 lab:[['лаборатория','лаборатории','лабораторий'],'feminine'],
};
const capital=s=>s?s[0].toLocaleUpperCase('ru')+s.slice(1):'';
export function composition(rows){
 const unique=new Map(rows.map(r=>[r.id,r])),counts=new Map();
 for(const row of unique.values())counts.set(row.kind,(counts.get(row.kind)??0)+1);
 const parts=[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([kind,count])=>{
  if(kind==='scav-gate')return count===1?'ворота':({2:'двое',3:'трое',4:'четверо'}[count]??russianNumber(count))+' ворот';
  const [forms,gender]=types[kind]??[['боевая машина','боевые машины','боевых машин'],'feminine'];
  return russianCount(count,forms).replace(/^\d+/,russianNumber(count,gender));
 });
 return parts.length<2?parts[0]??'':parts.slice(0,-1).join(', ')+' и '+parts.at(-1);
}
export function observedEnemy(m,entity){
 if(!entity||entity.owner==='rai'||entity.hp<=0||!m.visibleAt(entity.x,entity.y)||!m.inBounds(entity.x,entity.y))return null;
 const spec=m.config.units[entity.kind]?m.unitSpec(entity):m.config.buildings[entity.kind]?m.buildingSpec(entity):null;
 if(!spec?.damage||spec.infantry)return null;
 return {id:entity.id,kind:entity.kind,weapon:spec.weapon??(entity.kind==='flamer'?'flame':'mg'),x:entity.x,y:entity.y};
}
export class TacticalIntel{
 constructor(saved={}){this.fire=new Map(saved.fire??[]);this.contacts=new Map(saved.contacts??[]);this.groups=saved.groups??[];this.serial=saved.serial??0;this.scannedAt=saved.scannedAt??-Infinity;}
 hit(m,target,source,contact){
  if(target.owner!=='rai'||!source||source.owner==='rai'||contact?.type==='collision')return;
  const row=observedEnemy(m,source);
  // Hidden sources never enter the public composition or counters.
  if(row)this.fire.set(target.id+'|'+source.id,{...row,targetId:target.id,at:m.state.time});
 }
 scan(m,emit){
  const now=m.state.time;if(now-this.scannedAt<1)return;this.scannedAt=now;
  const visible=[...m.state.units,...m.state.buildings].map(e=>observedEnemy(m,e)).filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id));
  const fresh=new Set(visible.filter(e=>now-(this.contacts.get(e.id)??-Infinity)>25).map(e=>e.id));
  const visited=new Set();
  for(const first of visible){
   if(visited.has(first.id))continue;
   const group=[first];visited.add(first.id);
   for(let i=0;i<group.length;i++)for(const e of visible)if(!visited.has(e.id)&&Math.hypot(e.x-group[i].x,e.y-group[i].y)<=150){visited.add(e.id);group.push(e);}
   let record=this.groups.find(g=>g.ids.some(id=>group.some(e=>e.id===id)));
   if(!record){record={id:'contacts-'+(++this.serial),ids:[],at:now};this.groups.push(record);}
   record.ids=group.map(e=>e.id);record.at=now;
   if(group.some(e=>fresh.has(e.id)))emit(record.id,group);
  }
  for(const e of visible)this.contacts.set(e.id,now);
  for(const [id,at] of this.contacts)if(now-at>180)this.contacts.delete(id);
  for(const [id,shot] of this.fire)if(now-shot.at>30)this.fire.delete(id);
  this.groups=this.groups.filter(g=>now-g.at<180).slice(-128);
 }
 enrich(m,c){
  const own=c.affectedIds.map(id=>m.entity(id)).filter(e=>e?.owner==='rai'&&e.hp>0);
  const enemies=c.primaryEventType==='recon.enemy_first_seen'?c.targetIds.map(id=>m.entity(id)):
   ['command.retreat','command.auto_retreat'].includes(c.primaryEventType)?[...m.state.units,...m.state.buildings].filter(e=>own.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<=m.unitSpec(u).vision)):[];
  const observed=enemies.map(e=>observedEnemy(m,e)).filter(Boolean);
  const targets=new Set([...c.affectedIds,...c.targetIds]);
  const fired=[...this.fire.values()].filter(s=>targets.has(s.targetId)&&m.state.time-s.at<=20&&observedEnemy(m,m.entity(s.id)));
  const attackers=[...new Map(fired.map(s=>[s.id,s])).values()];
  c.knownEnemyCount=observed.length;c.knownAttackerCount=attackers.length;
  c.machinegunSourceCount=attackers.filter(s=>s.weapon==='mg').length;c.flamethrowerSourceCount=attackers.filter(s=>s.weapon==='flame').length;
  c.towerSourceCount=attackers.filter(s=>s.kind==='mg-tower').length;
  Object.assign(c.facts,{observedEnemies:observed,observedAttackers:attackers,
   enemyComposition:composition(observed),enemyReport:capital(composition(observed)),
   attackerComposition:composition(attackers),attackerReport:capital(composition(attackers)),
   fireCurrent:fired.some(s=>m.state.time-s.at<=3),enemyHasFlamer:observed.some(s=>s.weapon==='flame')});
  return {contactsRelevant:observed.length>0};
 }
 save(){return {fire:[...this.fire],contacts:[...this.contacts],groups:this.groups,serial:this.serial,scannedAt:this.scannedAt};}
}
