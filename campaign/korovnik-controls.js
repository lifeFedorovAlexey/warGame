// Transport actions appear only during an actual visit. The arrival control is
// restricted to the explicit model review URL until mission three calls it.
export function installKorovnikControls(campaign){
 const {mission:m,world:w}=campaign,review=new URLSearchParams(location.search).has('transport');
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
 if(review)action('arrive','Вызвать МУ-26 на посадочную площадку',()=>{const r=m.requestTransport();if(r.ok)w.centre(m.transportSite(),480);return r;});
 action('load','Погрузить выбранную технику в МУ-26 (до 10 машин)',()=>m.loadTransport(campaign.selected));
 action('cancel','Отменить очередь погрузки',()=>m.cancelTransportLoading());
 action('unload','Выгрузить технику из МУ-26',()=>m.unloadTransport());
 action('depart','Закрыть грузовой отсек и вылететь',()=>m.departTransport());
 const count=document.createElement('output');root.append(count);
 const names={absent:'Ожидание',approaching:'Подлёт',landing:'Посадка',opening:'Открытие рампы',ready:'Готов к погрузке',closing:'Закрытие рампы',spooling:'Раскрутка винтов',departing:'Вылет',departed:'В рейсе'};
 function update(){const t=m.state.transport,phase=t?.phase??'absent';root.hidden=!campaign.state.active||(!review&&['absent','departed'].includes(phase));
  // Leave the objective list readable on a narrow screen, including extra rows.
  const top=innerWidth<=700?Math.max(106,(document.querySelector('#field-tasks')?.getBoundingClientRect().bottom??0)+10):95;
  root.style.top=top+'px';message.style.top=(top+45)+'px';
  const ready=phase==='ready';buttons.load.disabled=!ready||!campaign.selected.length||t?.unloading;buttons.cancel.disabled=!t?.queue.length;
  buttons.unload.disabled=!ready||!t?.manifest.length||!!t?.queue.length||!!t?.unloading;
  buttons.depart.disabled=!ready||!!t?.queue.length||!!t?.unloading||t?.manifest.some(c=>c.phase!=='aboard');
  if(buttons.arrive)buttons.arrive.disabled=!['absent','departed'].includes(phase);
  count.value=`${t?.manifest.length??0}/10`;count.title=names[phase]+(t?.queue.length?` • в очереди: ${t.queue.length}`:'')+(t?.blocked?` • ${t.blocked}`:'');count.setAttribute('aria-label',count.title+' • '+count.value);
  if(t?.blocked&&t.blocked!==lastBlocked){message.textContent=t.blocked;clearAt=performance.now()+4500;}lastBlocked=t?.blocked??'';
  if(message.textContent&&performance.now()>clearAt)message.textContent='';}
 const timer=setInterval(update,200);update();return {root,update,dispose(){clearInterval(timer);root.remove();css.remove();message.remove();}};
}
