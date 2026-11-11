import {rankName,rankInsignia,personnelRankProgress} from './personnel-ranks.js';
import {personnelAwards,personnelServiceDetails,personnelAwardIcon} from './personnel-awards.js';

export function personnelServiceTitle(soldier){
 const {experience,next,remaining}=personnelRankProgress(soldier);
 return [soldier.name,rankName(soldier.rank),
  `Боевой опыт: ${soldier.historyComplete===false?'не менее ':''}${experience} · техника ${soldier.kills??soldier.knownKills??0}, постройки ${soldier.structuresDestroyed??0}`,
  !soldier.death&&(next?`До звания «${next.name}»: ${remaining}`:'Высшее звание'),
  'Повышение за уничтоженные вражеские цели; звание и награды сохраняются между миссиями.',
  ...personnelServiceDetails(soldier)].filter(Boolean).join('\n');
}

function appendAwards(node,soldier){
 const awards=personnelAwards(soldier);
 for(const id of ['hero','breacher','participant']){
  const group=awards.filter(a=>a.id===id);if(!group.length)continue;
  const mark=document.createElement('span');mark.className='personnel-award';
  mark.title=group[0].description+'\n'+group.map(a=>a.label+(a.result!==null?` · ${a.result}`:'')).join('\n');
  mark.setAttribute('aria-label',mark.title);mark.innerHTML=personnelAwardIcon(id);
  if(group.length>1){const count=document.createElement('small');count.textContent=group.length;mark.append(count);}
  node.append(mark);
 }
}

// Reuse the existing rank/selection text node: no panel, extra HUD field or bar.
export function renderPersonnelService(node,soldier,{prefix='',insignia=true,awardNames=false,details=false}={}){
 const title=personnelServiceTitle(soldier),key=JSON.stringify([prefix,insignia,awardNames,details,soldier.rank,title]);
 if(node.dataset.personnelKey===key)return;
 node.dataset.personnelKey=key;node.replaceChildren();node.title=title;
 node.setAttribute('aria-label',[prefix,title].filter(Boolean).join('\n'));
 if(prefix){const identity=document.createElement('span');identity.className='personnel-identity';identity.textContent=prefix+' · ';node.append(identity);}
 const service=document.createElement('span');service.className='personnel-service';
 const rank=document.createElement('span');rank.className='personnel-rank';
 if(insignia&&!['private','navy-private'].includes(soldier.rank)){
  const mark=document.createElement('span');mark.className='personnel-rank-mark';mark.innerHTML=rankInsignia(soldier.rank);rank.append(mark);
 }
 const label=document.createElement('span');label.textContent=rankName(soldier.rank);rank.append(label);service.append(rank);appendAwards(service,soldier);node.append(service);
 if(details){
  const {next,remaining}=personnelRankProgress(soldier),record=document.createElement('span');record.className='personnel-record';
  const name=document.createElement('span');name.textContent=soldier.name;
  const score=document.createElement('span');score.textContent=`Личный счёт: ${soldier.historyComplete===false?'≥ ':''}${soldier.kills??soldier.knownKills??0} · Постройки: ${soldier.structuresDestroyed??0}`;
  const progress=document.createElement('span');progress.textContent=next?`До «${next.name}»: ${remaining}`:'Высшее звание';
  record.append(name,score,progress);node.append(record);
 }
 // Memorial details already open on hover/tap. Spell out distinctions there
 // so touch users can read them without a second hover-only surface.
 if(awardNames&&personnelAwards(soldier).length){
  const names=document.createElement('span');names.className='personnel-award-names';
  names.textContent=awardNames==='compact'?[...new Set(personnelAwards(soldier).map(a=>a.id))].map(id=>{const group=personnelAwards(soldier).filter(a=>a.id===id);return group[0].name+(group.length>1?' ×'+group.length:'');}).join('\n'):personnelServiceDetails(soldier).join(' · ');node.append(names);
 }
}

export function renderPersonnelSelection(node,mission,unit,label){
 const p=mission.state.campaign?.personnel,crew=p?.crews[unit?.id];
 const soldier=crew?.memberIds.length===1?p.soldiers[crew.memberIds[0]]:null;
 if(soldier){renderPersonnelService(node,soldier,{prefix:label,details:true,awardNames:'compact'});return;}
 if(node.textContent!==label||node.dataset.personnelKey){node.textContent=label;delete node.dataset.personnelKey;node.removeAttribute('title');node.removeAttribute('aria-label');}
}
