import {rankName,rankInsignia} from './personnel-ranks.js';
import {personnelAwardTypes,personnelAwardIcon} from './personnel-awards.js';

// Independent of construction/story toasts. Coalesce rapid promotions of the
// same fighter, keep other recipients queued, never move the camera or focus.
export class PersonnelNotices{
 constructor(root,onSignal=()=>{}){this.root=root;this.onSignal=onSignal;this.reset();}
 reset(){this.queue=[];this.current=null;this.until=0;this.root.hidden=true;this.root.replaceChildren();}
 consume(events,mission,now){
  if(this.state!==mission.state){this.reset();this.state=mission.state;}
  const p=mission.state.campaign?.personnel;if(!p)return;
  for(const event of events){
   if(event.type==='personnel-promoted'){
    const s=p.soldiers[event.soldierId];if(!s)continue;
    this.enqueue({key:s.id,icon:rankInsignia(event.rank),eyebrow:'Присвоено звание',name:`«${s.callsign}»`,detail:rankName(event.rank)},now);
   }else if(event.type==='personnel-awarded'){
    // Individual honours first; mass participation is one acknowledgement.
    for(const id of ['hero','breacher','participant']){
     const recipients=event.awards.filter(a=>a.id===id).map(a=>p.soldiers[a.soldierId]).filter(Boolean);if(!recipients.length)continue;
     this.enqueue({key:event.mission+id,icon:personnelAwardIcon(id),eyebrow:'Вручена награда',name:personnelAwardTypes[id].name,
      detail:id==='participant'?`Награждено бойцов: ${recipients.length}`:recipients.map(s=>`«${s.callsign}»${s.death?' · посмертно':''}`).join(', ')},now);
    }
   }
  }
 }
 enqueue(item,now){
  if(this.current?.key===item.key){this.show(item,now,false);return;}
  const index=this.queue.findIndex(n=>n.key===item.key);if(index<0)this.queue.push(item);else this.queue[index]=item;
 }
 show(item,now,signal=true){
  this.current=item;this.until=now+6500;this.root.replaceChildren();this.root.hidden=false;this.root.dataset.kind=item.eyebrow;
  const icon=document.createElement('span');icon.className='personnel-notice-icon';icon.innerHTML=item.icon;
  const copy=document.createElement('span');
  for(const [tag,className,text] of [['small','',item.eyebrow],['strong','',item.name],['span','personnel-notice-detail',item.detail]]){
   const line=document.createElement(tag);line.className=className;line.textContent=text;copy.append(line);
  }
  this.root.append(icon,copy);if(signal)this.onSignal();
 }
 update(now,{hidden=false}={}){
  if(hidden){this.root.hidden=true;if(this.current)this.until=now+6500;return;}
  if(this.current&&now>=this.until){this.current=null;this.root.hidden=true;}
  if(!this.current&&this.queue.length)this.show(this.queue.shift(),now);
  else if(this.current)this.root.hidden=false;
 }
}
