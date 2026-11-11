import {cargoUsed,transportCargoSpec} from './korovnik-transport.js';
import {setButtonIcon} from '../assets/ui/icons.js';
// Transport actions appear only during an actual visit. The arrival control is
// restricted to the explicit model review URL until mission three calls it.
export function installKorovnikControls(campaign){
 const {mission:m,world:w}=campaign,review=new URLSearchParams(location.search).has('transport');
 try{m.config.transport.animations=localStorage.getItem('warGame.transportAnimations')!=='off';}catch{}
 const root=document.createElement('div');root.className='korovnik-controls';root.setAttribute('aria-label','МУ-26 «Коровник»');
 const css=document.createElement('style');css.textContent=`
 .korovnik-controls{position:fixed;right:16px;top:95px;display:flex;gap:10px;align-items:center;z-index:25;pointer-events:none}
 .korovnik-controls[hidden]{display:none}.korovnik-controls button{pointer-events:auto;width:38px;height:38px;padding:5px;border:0;border-radius:0;background:none;box-shadow:none;color:#d2b37e;cursor:pointer}
 .korovnik-controls button:hover{color:#efa954}.korovnik-controls button:focus-visible{outline:1px solid #d2b37e;outline-offset:2px}.korovnik-controls button:disabled{opacity:.3;cursor:default}.korovnik-controls svg{display:block;width:28px;height:28px}
 .korovnik-controls output{color:#d2b37e;font:13px sans-serif;text-shadow:0 1px 3px #000}.korovnik-message{position:fixed;top:146px;right:18px;max-width:min(330px,85vw);color:#e3c99c;font:14px sans-serif;text-shadow:0 1px 3px #000;pointer-events:none;z-index:26}
 @media(max-width:700px){.korovnik-controls{top:106px;right:10px;gap:4px}.korovnik-controls button{width:32px;height:34px;padding:3px}.korovnik-message{top:151px}}
 `;document.head.append(css);document.body.append(root);
 const message=document.createElement('div');message.className='korovnik-message';message.setAttribute('role','status');document.body.append(message);let clearAt=0,lastBlocked='';
 const icons={arrive:'M4 6h24M16 3v6M7 14h16l4 6H5zM10 23h12M16 10v8m-4-4 4 4 4-4',
  load:'M4 11h12v11H4zM6 25h2m4 0h2M18 16h11m-4-4 4 4-4 4',
  unload:'M16 11h12v11H16zM18 25h2m4 0h2M3 16h10m-6-4-4 4 4 4',
  depart:'M4 20h24M16 27V7m-6 6 6-6 6 6',cancel:'M7 7l18 18M7 25 25 7'};
 const buttons={};
 function action(key,label,fn){const button=document.createElement('button');button.title=label;button.setAttribute('aria-label',label);button.innerHTML=`<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[key]}"/></svg>`;
  button.onclick=()=>{const r=fn();if(!r.ok){message.textContent=r.reason;clearAt=performance.now()+4500;}};root.append(button);buttons[key]=button;}
 action('arrive','Вызвать МУ-26 на посадочную площадку',()=>m.requestTransport());
 action('load','Погрузить выбранную технику в МУ-26',()=>{const r=m.loadTransport(campaign.selected);if(r.ok&&r.rejected?.length){message.textContent=`В очередь: ${r.accepted}. Остались вне погрузки: ${r.rejected.length}`;clearAt=performance.now()+4500;}return r;});
 action('cancel','Отменить очередь погрузки',()=>m.cancelTransportLoading());
 action('unload','Выгрузить технику из МУ-26',()=>m.unloadTransport());
 action('depart','Закрыть грузовой отсек и вылететь',()=>m.departTransport());
 const count=document.createElement('output');root.append(count);
 const rosterButton=document.createElement('button');setButtonIcon(rosterButton,'bukhanka','Состав транспорта и доступная техника');root.append(rosterButton);
 const animation=document.createElement('button');animation.innerHTML='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 7 10 9L5 25zm13 0 10 9-10 9z"/></svg>';root.append(animation);
 function animationLabel(){animation.title='Анимация перелёта: '+(m.config.transport.animations?'вкл.':'выкл.');animation.setAttribute('aria-label',animation.title);animation.setAttribute('aria-pressed',String(m.config.transport.animations));}animationLabel();
 animation.onclick=()=>{m.config.transport.animations=!m.config.transport.animations;try{localStorage.setItem('warGame.transportAnimations',m.config.transport.animations?'on':'off');}catch{}animationLabel();};
 const roster=document.createElement('div');roster.hidden=true;roster.className='korovnik-roster';root.append(roster);let rosterKey='';
 rosterButton.onclick=()=>{roster.hidden=!roster.hidden;rosterButton.setAttribute('aria-expanded',String(!roster.hidden));rosterKey='';};
 css.textContent+=`.korovnik-roster{position:absolute;top:48px;right:0;width:304px;max-height:calc(100dvh - 245px);overflow-y:auto;display:flex;flex-wrap:wrap;gap:6px;pointer-events:none}.korovnik-roster[hidden]{display:none}.korovnik-roster button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative;width:44px;height:56px;padding:4px;pointer-events:auto}.korovnik-roster button svg{width:30px;height:30px}.korovnik-roster small{display:block;font:10px sans-serif;white-space:nowrap;text-shadow:0 1px 3px #000}.korovnik-roster button>svg{margin:0 auto;flex-shrink:0}.korovnik-roster meter{flex-shrink:0}.korovnik-roster meter{display:block;width:36px;height:4px;border:0}.korovnik-roster button[data-boarded=true]{outline:1px solid #c7b58b66;outline-offset:-1px}`;
 function updateRoster(t){
  if(roster.hidden)return;
  const units=[...t.manifest.map(c=>c.unit),...m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&transportCargoSpec(m,u))];
  const key=JSON.stringify(units.map(u=>[u.id,Math.round(u.hp),t.manifest.some(c=>c.unit.id===u.id),t.queue.some(q=>q.id===u.id)]));if(key===rosterKey)return;rosterKey=key;roster.replaceChildren();
  for(const u of units){const aboard=t.manifest.some(c=>c.unit.id===u.id),queued=t.queue.some(q=>q.id===u.id),crew=m.state.campaign?.personnel?.crews[u.id],soldiers=(crew?.memberIds??[]).map(id=>m.state.campaign.personnel.soldiers[id]),kills=soldiers.reduce((sum,s)=>sum+(s.kills??0),0),button=document.createElement('button'),name=u.designName??m.config.units[u.kind].name;
   const label=`${name} · ${Math.round(u.hp)}/${u.maxHp} · личный счёт ${kills} · ${aboard?'на борту — выгрузить':queued?'в очереди — отменить':'погрузить'}`;
   setButtonIcon(button,u.kind==='builder'?'builder':'bukhanka',label);button.dataset.boarded=String(aboard||queued);
   const bar=document.createElement('meter');bar.min=0;bar.max=u.maxHp;bar.value=u.hp;bar.setAttribute('aria-label','Здоровье');const score=document.createElement('small');score.textContent=`${Math.round(u.hp/u.maxHp*100)}%`;button.append(bar,score);
   button.onclick=()=>{const r=aboard?m.unloadTransport([u.id]):queued?m.cancelTransportLoading([u.id]):m.loadTransport([u.id]);if(!r.ok){message.textContent=r.reason;clearAt=performance.now()+4500;}rosterKey='';};roster.append(button);
  }
 }
 const names={absent:'Ожидание',approaching:'Подлёт',landing:'Посадка',opening:'Открытие рампы',ready:'Готов к погрузке',closing:'Закрытие рампы',spooling:'Раскрутка винтов',departing:'Вылет',departed:'В рейсе'};
 function update(){const t=m.state.transport,phase=t?.phase??'absent';root.hidden=!campaign.state.active||(!review&&!m.state.m03&&['absent','departed'].includes(phase));
  // Leave the objective list readable on a narrow screen, including extra rows.
  const top=innerWidth<=700?Math.max(106,(document.querySelector('#field-tasks')?.getBoundingClientRect().bottom??0)+10):95;
  root.style.top=top+'px';message.style.top=(top+45)+'px';
  const ready=phase==='ready';buttons.load.disabled=!ready||!campaign.selected.length||t?.unloading;buttons.cancel.disabled=!t?.queue.length;
  buttons.unload.disabled=!ready||!t?.manifest.length||!!t?.queue.length||!!t?.unloading;
  buttons.depart.disabled=!ready||!!t?.queue.length||!!t?.unloading||t?.manifest.some(c=>c.phase!=='aboard');
  buttons.arrive.hidden=!review&&!m.state.m03;buttons.arrive.disabled=!['absent','departed'].includes(phase);
  count.value=`${cargoUsed(t)}/${m.config.transport.capacity}`;count.title=names[phase]+(t?.queue.length?` • в очереди: ${t.queue.length}`:'')+(t?.blocked?` • ${t.blocked}`:'');count.setAttribute('aria-label',count.title+' • '+count.value);
  if(t)updateRoster(t);
  if(t?.blocked&&t.blocked!==lastBlocked){message.textContent=t.blocked;clearAt=performance.now()+4500;}lastBlocked=t?.blocked??'';
  if(message.textContent&&performance.now()>clearAt)message.textContent='';}
 const timer=setInterval(update,200);update();return {root,update,dispose(){clearInterval(timer);root.remove();css.remove();message.remove();}};
}
