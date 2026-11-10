// Art progression is cosmetic. Rank is read from the casualty's saved record;
// this module never changes experience, honours or the number of graves.
const army=[
 ['private','Простой деревянный крест','wood'],
 ['lance-corporal','Дубовый крест с железными скобами','wood'],
 ['junior-sergeant','Дубовый крест с окованными концами','wood'],
 ['sergeant','Окованный дуб на каменном основании','wood'],
 ['senior-sergeant','Кованый крест на грубом камне','iron'],
 ['starshina','Кованый крест на тесаном основании','iron'],
 ['warrant-officer','Известняк с бронзовой вставкой','limestone'],
 ['senior-warrant-officer','Резной известняк на двух ступенях','limestone'],
 ['junior-lieutenant','Серый гранит с фасками','granite'],
 ['lieutenant','Гранит с двойной фаской','granite'],
 ['senior-lieutenant','Тёмный гранит с бронзовым поясом','granite'],
 ['captain','Гранит с бронзовой инкрустацией','granite'],
 ['major','Угольный гранит с бронзовыми соединениями','granite'],
 ['lieutenant-colonel','Ступенчатый гранит с бронзовой кромкой','granite'],
 ['colonel','Гранит с лавровым рельефом','granite'],
 ['major-general','Чёрный гранит с бронзовыми гранями','granite'],
 ['lieutenant-general','Чёрный гранит с двойными ступенями','granite'],
 ['colonel-general','Гранит с бронзой и развитым лавровым рельефом','granite'],
 ['army-general','Бронзовый крест на чёрном граните','bronze'],
 ['marshal','Рельефная бронза на парадном гранитном основании','bronze'],
];
const appearance=(row,order,naval=false)=>{
 const [baseId,name,material]=row,id=(naval?'navy-':'')+baseId;
 return Object.freeze({id,order,service:naval?'navy':'army',material,name:name+(naval?' · морская отделка':''),
  url:new URL('../assets/campaign/personnel/'+(id==='private'?'grave-private-v2.png':'graves/'+id+'.png'),import.meta.url).href,
  light:({wood:1,iron:1.12,limestone:.97,granite:1.1,bronze:1.06})[material]});
};
export const graveAppearances=Object.freeze([...army.map((row,i)=>appearance(row,i)),...army.slice(0,19).map((row,i)=>appearance(row,i,true))]);
const byRank=new Map(graveAppearances.map(a=>[a.id,a]));
export function graveAppearance(soldier){
 const rank=typeof soldier==='string'?soldier:soldier?.death?.rank??soldier?.rank;
 return byRank.get(rank)??byRank.get('private');
}

// Decode only the ranks present on the hill. Keep small cached sprites, not
// dozens of full-resolution generated PNGs, and repaint once after a load batch.
export class MemorialGraveArt{
 constructor(onChange){this.entries=new Map();this.onChange=onChange;this.notifyFrame=0;}
 ensure(soldiers){
  const appearances=[...new Map(soldiers.map(s=>{const a=graveAppearance(s);return [a.id,a];})).values()];
  return Promise.all(appearances.filter(a=>a.id!=='private').map(a=>this.load(a)));
 }
 load(appearance){
  if(this.entries.has(appearance.id))return this.entries.get(appearance.id).promise;
  const entry={status:'loading',image:null};this.entries.set(appearance.id,entry);
  entry.promise=new Promise(resolve=>{
   const source=new Image();
   const finish=()=>{
    source.onload=source.onerror=null;source.src='';
    if(!this.notifyFrame)this.notifyFrame=requestAnimationFrame(()=>{this.notifyFrame=0;this.onChange();});
    resolve(entry);
   };
   source.onload=()=>{
    const sprite=document.createElement('canvas'),ratio=512/Math.max(source.naturalWidth,source.naturalHeight);
    sprite.width=Math.max(1,Math.round(source.naturalWidth*ratio));sprite.height=Math.max(1,Math.round(source.naturalHeight*ratio));
    const ctx=sprite.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,sprite.width,sprite.height);
    entry.image=sprite;entry.status='ready';finish();
   };
   source.onerror=()=>{entry.status='failed';finish();};source.src=appearance.url;
  });
  return entry.promise;
 }
 get(soldier){return this.entries.get(graveAppearance(soldier).id)?.image??null;}
 status(soldiers){
  const ids=[...new Set(soldiers.map(s=>graveAppearance(s).id))];
  return {ready:ids.every(id=>id==='private'||this.entries.get(id)?.status==='ready'),failed:ids.filter(id=>this.entries.get(id)?.status==='failed')};
 }
}
