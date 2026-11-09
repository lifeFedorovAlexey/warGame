// One segment per completed preparation stage, not an estimate of time remaining.
export const STARTUP_STAGES=[['resources','Ресурсы миссии'],['terrain','Карта и окружение'],['vehicles','Модели техники'],['simulation','Подготовка мира'],['graphics','Подготовка шейдеров'],['audio','Музыка меню'],['interface','Подготовка интерфейса']];
export const ENTRY_STAGES=[['graphics','Подготовка шейдеров'],['entry','Запуск операции']];
export const loadingPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

export function createLoadingProgress(root){
 const panel=root.querySelector('#loading'),status=root.querySelector('#loading-status'),bar=root.querySelector('#loading-progress'),count=root.querySelector('#loading-step'),art=root.querySelector('.menu-art'),retry=root.querySelector('#loading-retry');
 let stages=STARTUP_STAGES,locked=null,active=false;
 const controls=()=>['begin','resume-save','menu-settings','menu-exit'].map(id=>document.getElementById(id));
 const unlock=()=>{if(locked)for(const [button,disabled] of locked)button.disabled=disabled;locked=null;};
 function begin(next=STARTUP_STAGES){
  stages=next;active=true;panel.hidden=false;status.hidden=false;bar.hidden=false;count.hidden=false;
  root.classList.add('is-loading');art.inert=true;retry.hidden=true;
  bar.max=stages.length;bar.value=0;root.setAttribute('aria-busy','true');panel.classList.add('loading-active');
  locked??=controls().map(button=>[button,button.disabled]);for(const button of controls())button.disabled=true;
  update(stages[0][0]);
 }
 function update(id,completed=0,total=1){
  if(!active)return;
  const index=stages.findIndex(s=>s[0]===id);if(index<0)return;
  const fraction=total>0?Math.max(0,Math.min(1,completed/total)):0,value=index+fraction;
  if(value<bar.value)return;
  panel.dataset.phase=id;bar.value=value;
  status.textContent=stages[index][1]+(total>1?' · '+completed+'/'+total:'…');
  count.textContent=(index+1)+' / '+stages.length;
  bar.setAttribute('aria-valuetext','Этап '+(index+1)+' из '+stages.length+': '+status.textContent);
 }
 async function stage(id){update(id);await loadingPaint();}
 async function finish(){if(!active)return;bar.value=bar.max;panel.dataset.phase='complete';status.textContent='Готово';bar.setAttribute('aria-valuetext','Загрузка завершена');await loadingPaint();}
 function hide(){active=false;panel.hidden=true;root.classList.remove('is-loading');art.inert=false;root.setAttribute('aria-busy','false');panel.classList.remove('loading-active');unlock();}
 function error(text){active=false;panel.hidden=false;status.hidden=false;status.textContent=text;bar.hidden=count.hidden=true;panel.dataset.phase='error';root.setAttribute('aria-busy','false');panel.classList.remove('loading-active');retry.hidden=false;unlock();}
 retry.onclick=()=>location.reload();
 return {begin,update,stage,finish,hide,error};
}
