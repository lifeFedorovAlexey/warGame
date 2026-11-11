import {missionResults} from './personnel.js';
import {hasPendingCampDemolition} from './camp-demolition.js';
import {rankGroups,rankInsignia} from './personnel-ranks.js';
import {personnelMissionName,personnelServiceDetails,personnelAwards,personnelAwardIcon,personnelAwardTypes} from './personnel-awards.js';
import {renderPersonnelService} from './personnel-presentation.js';
import {MemorialScene} from './memorial-scene.js';
export {gravePosition} from './memorial-scene.js';

const clock=seconds=>[Math.floor(seconds/3600),Math.floor(seconds/60)%60,Math.floor(seconds)%60].map(n=>String(n).padStart(2,'0')).join(':');
const missionName=personnelMissionName;
export function resultsPresentationReady(mission,radio){
 if(mission.state.status==='running')return false;
 if(mission.state.status==='victory'&&hasPendingCampDemolition(mission))return false;
 if(mission.state.status==='defeat'||!radio?.enabled||!radio.director)return true;
 const id=mission.state.m03?'m03-s11':mission.state.m02?'m02-radio-victory':'r54',director=radio.director;
 // The final exchange keeps its portraits, captions and full recordings on
 // the map. End-of-operation choices wait for the exchange to finish.
 return !director.scenes.has(id)||director.finished(id);
}
export class MissionResultsView{
 constructor(root,{onVisibility=()=>{}}={}){
  this.root=root;this.onVisibility=onVisibility;this.canvas=root.querySelector('canvas');this.scene=new MemorialScene(this.canvas);
  this.current=-1;this.pinned=false;
  this.tooltipResize=new ResizeObserver(()=>this.positionDetails());this.tooltipResize.observe(this.canvas);
  this.rankResize=new ResizeObserver(()=>this.fitRanks());
  for(const node of root.querySelectorAll('#result-survivor-ranks,#result-loss-ranks'))this.rankResize.observe(node);
  this.canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'&&!this.pinned)this.pick(e);});
  this.canvas.addEventListener('pointerleave',()=>{if(!this.pinned)this.inspect(-1);});
  this.canvas.addEventListener('click',e=>{this.pinned=false;this.pick(e);this.pinned=this.current>=0;});
  this.canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();this.pinned=true;this.inspect(e.key==='Home'?0:e.key==='End'?this.data.memorial.length-1:(this.current+(e.key==='ArrowLeft'?-1:1)+this.data.memorial.length)%this.data.memorial.length);}});
  root.addEventListener('keydown',e=>{if(e.key==='Tab'){const focusable=[...root.querySelectorAll('button:not([hidden]),canvas')].filter(e=>!e.disabled&&e.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 }
 show(mission){
  const data=missionResults(mission);if(!data)return false;
  this.data=data;this.current=-1;this.pinned=false;
  const $=id=>this.root.querySelector('#'+id),victory=data.outcome==='victory';
  $('result-title').textContent=victory?'Миссия завершена':'Операция прервана';
  $('result-message').textContent=missionName(data.missionId);
  $('result-continue').hidden=!victory||!['m01','m02'].includes(data.missionId);
  $('result-continue').title=data.missionId==='m02'?'Миссия 03 — Первый вылет':'Продолжить кампанию';
  $('result-continue').setAttribute('aria-label',$('result-continue').title);
  $('result-campaign-end').hidden=!victory||data.missionId!=='m03';
  $('result-history-note').hidden=data.historyComplete&&data.campaignHistoryComplete;
  $('result-history-note').textContent='Старое сохранение: потери и личный счёт учтены с момента обновления игры.';
  const stat=(id,value)=>$(id).textContent=String(value);
  stat('result-enemies',(data.historyComplete?'':'≥ ')+data.statistics.enemyUnitsDestroyed);
  stat('result-buildings',(data.historyComplete?'':'≥ ')+data.statistics.enemyStructuresDestroyed);
  stat('result-time',clock(data.durationSeconds));
  stat('result-lost',(data.historyComplete?'':'≥ ')+data.statistics.personnelLost);
  stat('result-total-lost',(data.campaignHistoryComplete?'':'≥ ')+data.memorial.length);
  stat('result-alive',data.survivors.length);
  this.ranks($('result-loss-ranks'),data.casualties,'Потерь нет');
  this.ranks($('result-survivor-ranks'),data.survivors,'В строю никого не осталось');
  this.honours($('result-honours'),[...data.survivors,...data.casualties]);
  $('result-empty').hidden=data.memorial.length>0;
  this.canvas.setAttribute('aria-label',`Холм памяти. Погибших: ${data.memorial.length}. Стрелки влево и вправо — выбрать бойца, Home и End — первый и последний.`);
  this.inspect(-1);this.root.hidden=false;this.scene.setData(data.memorial);this.onVisibility(true);this.scene.start();
  this.fitRanks();
  $('result-continue').hidden?$('result-close').focus():$('result-continue').focus();return true;
 }
 honours(node,soldiers){
  const list=node.querySelector('div');list.replaceChildren();
  for(const id of ['hero','breacher','participant']){
   const recipients=soldiers.filter(s=>personnelAwards(s).some(a=>a.id===id&&a.missionId===this.data.missionId));if(!recipients.length)continue;
   const row=document.createElement('p'),icon=document.createElement('span'),copy=document.createElement('span'),label=document.createElement('strong'),names=document.createElement('span');
   row.className='result-honour';icon.innerHTML=personnelAwardIcon(id);label.textContent=personnelAwardTypes[id].name;
   names.textContent=String(recipients.length);
   row.title=personnelAwardTypes[id].name+' · '+recipients.length+'\n'+recipients.map(s=>`${s.name} «${s.callsign}»`).join('\n');row.setAttribute('aria-label',row.title);copy.append(label,names);row.append(icon,copy);list.append(row);
  }
  node.hidden=!list.childElementCount;
 }
 ranks(node,soldiers,empty){
  node.replaceChildren();const groups=rankGroups(soldiers);node.classList.add('result-rank-grid');node.classList.toggle('result-many-ranks',groups.length>5);
  for(const rank of groups){
   const row=document.createElement('div'),icon=document.createElement('span'),label=document.createElement('span'),count=document.createElement('b');
   row.className='result-rank';row.title=rank.name+' · '+rank.count;row.setAttribute('aria-label',row.title);icon.innerHTML=rankInsignia(rank.id,{compact:!!(rank.stars||rank.bars)});label.textContent=rank.name;count.textContent=rank.count;
   const decorated=soldiers.filter(s=>s.rank===rank.id&&personnelServiceDetails(s).length);
   if(decorated.length){
    row.title+='\n'+decorated.map(s=>`${s.name} «${s.callsign}»\n${personnelServiceDetails(s).join('\n')}`).join('\n\n');
    const honours=document.createElement('small');honours.className='personnel-rank-honours';
    for(const id of ['hero','breacher','participant']){
     const recipients=decorated.filter(s=>personnelAwards(s).some(a=>a.id===id&&a.missionId===this.data.missionId));
     if(!recipients.length)continue;
     const mark=document.createElement('span');mark.className='personnel-award';mark.innerHTML=personnelAwardIcon(id);
     mark.title=recipients.map(s=>`«${s.callsign}» · ${personnelAwards(s).filter(a=>a.id===id&&a.missionId===this.data.missionId).map(a=>a.label).join(', ')}`).join('\n');
     mark.setAttribute('aria-label',mark.title);mark.append(document.createTextNode(String(recipients.length)));honours.append(mark);
    }
    label.append(honours);
   }
   row.append(icon,label,count);node.append(row);
  }
  if(!soldiers.length){const p=document.createElement('p');p.className='result-muted';p.textContent=empty;node.append(p);}
 }
 fitRanks(){
  if(this.root.hidden)return;
  const landscape=matchMedia('(max-height:520px) and (orientation:landscape)').matches;
  const narrow=landscape||matchMedia('(max-width:700px)').matches;
  for(const node of this.root.querySelectorAll('.result-rank-grid')){
   const n=node.querySelectorAll('.result-rank').length,w=node.clientWidth,h=node.clientHeight;if(!n||!w||!h)continue;
   const css=getComputedStyle(node),gx=parseFloat(css.columnGap)||0,gy=parseFloat(css.rowGap)||0;
   const desired=narrow?33:66,minimum=narrow?29:46,preferredRow=landscape?18:narrow?24:40;
   const natural=Math.max(1,Math.floor((w+gx)/(desired+gx))),maximum=Math.max(1,Math.floor((w+gx)/(minimum+gx)));
   if(n<=5){node.style.gridTemplateColumns=`repeat(${natural},minmax(0,1fr))`;node.style.setProperty('--rank-cell-height',preferredRow+'px');node.style.setProperty('--rank-count-size',(narrow?13:20)+'px');continue;}
   const needed=Math.ceil(n/Math.max(1,Math.floor((h+gy)/(preferredRow+gy)))),columns=Math.min(maximum,Math.max(natural,needed)),rows=Math.ceil(n/columns);
   const height=Math.max(1,Math.min(preferredRow,(h-(rows-1)*gy)/rows));
   node.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;
   node.style.setProperty('--rank-cell-height',height+'px');node.style.setProperty('--rank-count-size',Math.min(narrow?13:20,height*.8)+'px');
  }
  this.scene.resize();
 }
 hide(){this.scene.stop();this.root.hidden=true;this.onVisibility(false);}
 pick(e){
  const box=this.canvas.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;
  let found=-1,score=Infinity;
  for(const g of this.scene.hitAreas??[]){const distance=Math.hypot((x-g.x)/Math.max(14,g.size*.34),(y-(g.y-g.size*.37))/Math.max(22,g.size*.55));if(distance<=1&&distance<score){found=g.index;score=distance;}}
  this.inspect(found);
 }
 inspect(index){
  this.current=index;const soldier=this.data?.memorial[index],node=this.root.querySelector('#result-person');node.hidden=!soldier;
  if(soldier){
   node.querySelector('.result-person-rank').innerHTML=rankInsignia(soldier.rank);
   node.querySelector('.result-person-rank').hidden=['private','navy-private'].includes(soldier.rank);
   node.querySelector('h3').textContent=soldier.name;
   node.querySelector('.result-person-callsign').textContent='«'+soldier.callsign+'»';
   renderPersonnelService(node.querySelector('.result-person-service'),soldier,{insignia:false,awardNames:true});
   node.querySelector('.result-person-score').textContent='Личный счёт: '+(soldier.kills??(soldier.knownKills?'не менее '+soldier.knownKills:'не сохранился'));
   node.querySelector('.result-person-mission').textContent='Погиб: '+missionName(soldier.death.missionId);
  }
  this.scene.inspect(index);
  this.positionDetails();
 }
 positionDetails(){
  const g=this.scene.hitAreas?.find(g=>g.index===this.current),node=this.root.querySelector('#result-person');if(!g||node.hidden)return;
  const width=Math.min(300,this.canvas.clientWidth-32),left=Math.max(16,Math.min(this.canvas.clientWidth-width-16,g.x-width*.45));
  node.style.width=width+'px';node.style.left=(this.canvas.offsetLeft+left)+'px';
  const height=node.offsetHeight,top=Math.max(12,g.y-g.size-height-22);
  node.style.top=(this.canvas.offsetTop+top)+'px';
 }
}
