// Russian military ranks: Federal Law 53-FZ, art. 46; insignia: Decree 293,
// appendix 3 and Ministry of Defence Order 525 (2020), paras. 66–69.
// See docs/campaign/personnel/insignia.md for sources and UI scale conventions.
// Both services are represented; current land vehicles enlist as privates.
const land=[
 ['private','Рядовой','soldiers',0,0],['lance-corporal','Ефрейтор','soldiers',0,1],
 ['junior-sergeant','Младший сержант','sergeants',0,2],['sergeant','Сержант','sergeants',0,3],
 ['senior-sergeant','Старший сержант','sergeants',0,'wide'],['starshina','Старшина','sergeants',0,'lengthwise'],
 ['warrant-officer','Прапорщик','warrant',2,0],['senior-warrant-officer','Старший прапорщик','warrant',3,0],
 ['junior-lieutenant','Младший лейтенант','junior-officers',1,0,1],['lieutenant','Лейтенант','junior-officers',2,0,1],
 ['senior-lieutenant','Старший лейтенант','junior-officers',3,0,1],['captain','Капитан','junior-officers',4,0,1],
 ['major','Майор','senior-officers',1,0,2],['lieutenant-colonel','Подполковник','senior-officers',2,0,2],
 ['colonel','Полковник','senior-officers',3,0,2],['major-general','Генерал-майор','generals',1,0],
 ['lieutenant-general','Генерал-лейтенант','generals',2,0],['colonel-general','Генерал-полковник','generals',3,0],
 ['army-general','Генерал армии','generals',1,0,0,'large'],['marshal','Маршал Российской Федерации','generals',1,0,0,'emblem']
];
const naval=['Матрос','Старший матрос','Старшина 2 статьи','Старшина 1 статьи','Главный старшина','Главный корабельный старшина','Мичман','Старший мичман','Младший лейтенант','Лейтенант','Старший лейтенант','Капитан-лейтенант','Капитан 3 ранга','Капитан 2 ранга','Капитан 1 ранга','Контр-адмирал','Вице-адмирал','Адмирал','Адмирал флота'];
export const personnelRanks=land.map(([id,name,group,stars,bars,stripes=0,special=null],order)=>({id,name,group,stars,bars,stripes,special,order,service:'army'}));
personnelRanks.push(...personnelRanks.slice(0,19).map((r,i)=>({...r,id:'navy-'+r.id,name:naval[i],service:'navy',special:i===18?'large':r.special})));
const byId=new Map(personnelRanks.map(r=>[r.id,r]));
export const rankById=id=>byId.get(id);
export const rankName=id=>rankById(id)?.name??'Звание не указано';
// Warzone 2100 campaign milestones (0/4/8/16/32/64/128/256/512),
// with intermediate and senior steps for the complete Russian rank ladder.
// Experience uses the existing confirmed kill/building counters, not a second balance.
export const rankThresholds=Object.freeze([0,4,8,16,24,32,48,64,96,128,160,192,256,384,512,768,1024,1536,2048,3072]);
export const personnelExperience=soldier=>Math.max(0,soldier.kills??soldier.knownKills??0)+Math.max(0,soldier.structuresDestroyed??0);
export function earnedRank(soldier){
 const service=rankById(soldier.rank)?.service??'army',experience=personnelExperience(soldier);
 return personnelRanks.filter(r=>r.service===service&&rankThresholds[r.order]<=experience).at(-1);
}
export function promotePersonnel(soldier){
 if(soldier.death)return false;
 const earned=earnedRank(soldier),current=rankById(soldier.rank);
 if(current&&current.order>=earned.order)return false;
 soldier.rank=earned.id;return true;
}
export function personnelRankProgress(soldier){
 const current=rankById(soldier.rank)??earnedRank(soldier);
 const next=personnelRanks.find(r=>r.service===current.service&&r.order===current.order+1);
 return {experience:personnelExperience(soldier),next,remaining:next?Math.max(0,rankThresholds[next.order]-personnelExperience(soldier)):0};
}
export function rankGroups(soldiers){
 const counts=new Map();for(const s of soldiers)counts.set(s.rank,(counts.get(s.rank)??0)+1);
 return personnelRanks.filter(r=>counts.has(r.id)).map(r=>({...r,count:counts.get(r.id)}));
}
const star=(x,y,size)=>'<polygon points="'+Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?size*.4:size;return (x+Math.cos(a)*r).toFixed(2)+','+(y+Math.sin(a)*r).toFixed(2);}).join(' ')+'"/>';
export function rankInsignia(id,{compact=false}={}){
 const r=rankById(id);if(!r)return '';
 if(compact)return rankSymbol(r);
 let marks='';
 // Normalized 50 × 140 shoulder board; marks use the prescribed diameters,
 // 25 mm longitudinal spacing and distances from the lower edge.
 const ground=r.service==='navy'?'#252921':'#424a36';
 marks+=`<path d="M2 140V15L25 2l23 13v125z" fill="${ground}"/>`;
 if(r.stripes)for(const x of r.stripes===1?[25]:[12.5,37.5])marks+=`<path d="M${x} 15v125" stroke="${r.service==='navy'?'#b6a268':'#984f3e'}" stroke-width="4"/>`;
 marks+='<circle cx="25" cy="15" r="3" opacity=".65"/>';
 if(typeof r.bars==='number')for(let i=0;i<r.bars;i++)marks+=`<path d="M2 ${90-i*12}h46" stroke="currentColor" stroke-width="10"/>`;
 else if(r.bars==='wide')marks+='<path d="M2 80h46" stroke="currentColor" stroke-width="30"/>';
 else if(r.bars==='lengthwise')marks+='<path d="M25 24v116" stroke="currentColor" stroke-width="30"/>';
 const axial=r.group==='warrant'||r.group==='generals',size=r.special?20:r.group==='generals'?11:r.group==='senior-officers'?10:6.5;
 const bottom=r.id==='marshal'?105:r.stars===1?95:115;
 const positions=!r.stars?[]:axial?Array.from({length:r.stars},(_,i)=>[25,bottom-i*25]):r.stars===1?[[25,95]]:r.stars===2?[[12.5,115],[37.5,115]]:r.stars===3?[[12.5,115],[37.5,115],[25,90]]:[[12.5,115],[37.5,115],[25,90],[25,65]];
 for(const [x,y] of positions)marks+=star(x,y,size);
 if(r.id==='army-general')marks+=wreath(25,45,17.5);
 if(r.special==='emblem')marks+='<image href="../assets/campaign/personnel/insignia/russian-eagle.svg" x="5" y="26" width="40" height="44"/>';
 return `<svg class="rank-insignia" viewBox="0 0 50 140" aria-hidden="true" fill="currentColor">${marks}</svg>`;
}
function wreath(x,y,size){
 return `<g fill="#ad5742">${star(x,y,size*.72)}</g><g fill="none" stroke="currentColor" stroke-width="${size*.11}"><path d="M${x-size*.7} ${y-size*.6}q${-size*.8} ${size*1.5} ${size*.7} ${size*1.6}q${size*1.5} ${-size*.1} ${size*.7} ${-size*1.6}"/>${[-1,1].flatMap(side=>[0,.3,.6].map(v=>`<path d="M${x+side*size*(.8-v*.2)} ${y+size*v}l${side*size*.22} ${-size*.24}"/>`)).join('')}</g>`;
}
// Map marker: rank marks only, no cloth/trim. Spacing is optically condensed
// for 20 × 28 CSS pixels; counts, orientation and star-size classes are kept.
function rankSymbol(r){
 let marks='';
 if(typeof r.bars==='number')for(let i=0;i<r.bars;i++)marks+=`<path d="M4 ${17-i*3}h12" stroke="currentColor" stroke-width="1.6"/>`;
 else if(r.bars==='wide')marks+='<path d="M4 14h12" stroke="currentColor" stroke-width="4.8"/>';
 else if(r.bars==='lengthwise')marks+='<path d="M10 5v18" stroke="currentColor" stroke-width="4.8"/>';
 const axial=r.group==='warrant'||r.group==='generals',size=r.special?6:r.group==='generals'?4.4:r.group==='senior-officers'?4:2.6;
 const positions=!r.stars?[]:axial?Array.from({length:r.stars},(_,i)=>[10,r.special?20:r.stars===1?14:22-i*8.5]):r.stars===1?[[10,14]]:r.stars===2?[[4.8,18],[15.2,18]]:r.stars===3?[[4.8,20],[15.2,20],[10,11]]:[[4.8,22],[15.2,22],[10,14],[10,6]];
 for(const [x,y] of positions)marks+=star(x,y,size);
 if(r.id==='army-general')marks+=wreath(10,7,5);
 // The atlas draws the same local official emblem separately (SVG <image>
 // references are not loaded when an SVG itself is decoded into a canvas).
 if(r.special==='emblem')marks+='<image href="../assets/campaign/personnel/insignia/russian-eagle.svg" x="5" y="1" width="10" height="11"/>';
 return `<svg class="rank-insignia rank-symbol" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 28" aria-hidden="true" fill="currentColor">${marks}</svg>`;
}
