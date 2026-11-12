import {setButtonIcon} from '../assets/ui/icons.js';
import {factoryPriority,setFactoryPriority} from './factory-garage.js';
import {factoryRepairQueue} from './factory-routing.js';
import {oilOrderProgress} from './oil-economy.js';
import {setFactoryModernization} from './factory-modernization.js';
import {hasVehicleUpgrades} from './vehicle-upgrades.js';
import {productionFactories} from './factory-production.js';

const hintId='factory-production-hint';

function indicators(control,label){
 const count=document.createElement('span');count.className='production-count';count.hidden=true;count.setAttribute('aria-hidden','true');control.append(count);
 const progress=document.createElement('progress');progress.className='production-progress';progress.max=1;progress.hidden=true;progress.setAttribute('aria-label',label);control.append(progress);
}

function updateHint(menu){
 const hint=menu.querySelector('#'+hintId);
 const control=menu.querySelector('[aria-describedby="'+hintId+'"]');
 hint.hidden=!control||!control.getClientRects().length;
 if(hint.hidden)return;
 hint.querySelector('strong').textContent=control.getAttribute('aria-label');
 hint.querySelector('.factory-hint-summary').textContent=control.dataset.hintSummary;
 hint.querySelector('.factory-hint-distribution').textContent=control.dataset.distribution;
 const anchor=control.getBoundingClientRect(),{offsetWidth:width,offsetHeight:height}=hint;
 const beside=Math.min(menu.getBoundingClientRect().left,menu.closest('#commands').getBoundingClientRect().left)-width-12;
 const above=anchor.top-height-8;
 const besideMenu=above<8&&beside>=8;
 const left=Math.max(8,Math.min(innerWidth-width-8,besideMenu?beside:anchor.right-width));
 let top=above>=8?above:anchor.bottom+8;
 if(besideMenu){
  const objectives=document.getElementById('objectives')?.getBoundingClientRect();
  top=objectives?.right>left?Math.max(32,objectives.bottom+8):32;
 }
 const toast=document.getElementById('toast');
 if(toast&&!toast.hidden){
  const notice=toast.getBoundingClientRect();
  if(left<notice.right&&left+width>notice.left&&top<notice.bottom+6&&top+height>notice.top-6
   &&notice.bottom+8+height<=innerHeight-8)top=notice.bottom+8;
 }
 hint.style.left=left+'px';
 hint.style.top=Math.max(8,Math.min(innerHeight-height-8,top))+'px';
}

export function createFactoryRows(mission,factories,projects,{act,focus,factoryId}){
 const root=document.createElement('div');root.className='factory-queues';
 const catalogue=document.createElement('div');catalogue.className='factory-catalogue';
 catalogue.setAttribute('role','group');catalogue.setAttribute('aria-label','Производство техники');
 const hint=document.createElement('div');hint.id=hintId;hint.hidden=true;hint.setAttribute('role','tooltip');
 const title=document.createElement('strong'),summary=document.createElement('span'),distribution=document.createElement('span');
 summary.className='factory-hint-summary';distribution.className='factory-hint-distribution';
 hint.append(title,summary,distribution);
 for(const {id,kind,name,spec} of projects){
  const control=document.createElement('button');setButtonIcon(control,kind,name);control.removeAttribute('title');
  control.dataset.factoryProduction=control.dataset.production=id;
  control.dataset.baseTitle=spec.cost+' нефти · ЛКМ — заказ · ПКМ — отмена';
  control.onclick=()=>act(()=>mission.produce(factoryId,id,{distributed:true}));
  control.oncontextmenu=event=>{
   event.preventDefault();act(()=>mission.cancelProduction(factoryId,id,{distributed:true}));
  };
  const show=()=>{
   root.querySelector('[aria-describedby="'+hintId+'"]')?.removeAttribute('aria-describedby');
   control.setAttribute('aria-describedby',hintId);updateHint(root);
  };
  const hide=()=>{
   if(!control.hasAttribute('aria-describedby'))return;
   control.removeAttribute('aria-describedby');updateHint(root);
  };
  control.onpointerenter=show;
  control.onpointerleave=()=>{if(!control.matches(':focus-visible'))hide();};
  control.onfocus=show;control.onblur=()=>{if(!control.matches(':hover'))hide();};
  control.onkeydown=event=>{if(event.key==='Escape')hide();};
  indicators(control,'Выпуск · '+name);catalogue.append(control);
 }
 const index=factories.findIndex(f=>f.id===factoryId),label='Завод '+(index+1);
 const row=document.createElement('div');row.className='factory-settings';row.dataset.factoryRow=factoryId;row.setAttribute('role','group');row.setAttribute('aria-label',label);
 const next=(index+1)%factories.length;
 const location=document.createElement('button');setButtonIcon(location,'factory',label);
 location.title=label+(factories.length>1?' · Перейти к заводу '+(next+1):' · Показать');
 location.onclick=()=>focus(factories[next].id);
 const number=document.createElement('span');number.className='factory-number';number.textContent=index+1;number.setAttribute('aria-hidden','true');location.append(number);row.append(location);
 const priority=document.createElement('button');priority.dataset.factoryPriority='';
 priority.onclick=()=>act(()=>{const f=mission.entity(factoryId);return f?.hp>0?setFactoryPriority(mission,factoryId,factoryPriority(f)==='repair'?'production':'repair'):mission.fail('Завод недоступен');});
 indicators(priority,'Ремонт · '+label);row.append(priority);
 if(hasVehicleUpgrades(mission)){
  const upgrade=document.createElement('button');upgrade.dataset.factoryModernization='';
  setButtonIcon(upgrade,'factory-upgrade','Автомодернизация после ремонта');
  upgrade.onclick=()=>act(()=>setFactoryModernization(mission,factoryId,!mission.entity(factoryId)?.autoModernize));row.append(upgrade);
 }
 root.append(catalogue,row,hint);
 return root;
}

export function updateProductionButtons(root,mission,factories,projects,paused){
 const queues=new Map();
 for(const [number,factory] of factories.entries())for(const [index,job] of factory.queue.entries()){
  const id=mission.productionProjectId(job,projects);
  if(!id)continue;
  if(!queues.has(id))queues.set(id,{count:0,active:[],distribution:new Map()});
  const queue=queues.get(id);
  queue.count++;queue.distribution.set(number+1,(queue.distribution.get(number+1)??0)+1);
  if(index===0)queue.active.push({factory,job,flow:oilOrderProgress(job,mission.config.units[job.kind].seconds,mission.config)});
 }
 for(const control of root.querySelectorAll(':scope > [data-production], :scope > [data-factory-production]')){
  const id=control.dataset.production??control.dataset.factoryProduction,queue=queues.get(id);
  const count=queue?.count??0,rows=queue?.active??[];
  rows.sort((a,b)=>Number(!!a.factory.productionPaused||!!a.factory.exitBlocked)-Number(!!b.factory.productionPaused||!!b.factory.exitBlocked)||a.flow.remaining-b.flow.remaining);
  const current=rows[0],running=!!current,canProduce=mission.canSpend(projects.find(p=>p.id===id).spec.cost);
  control.disabled=!canProduce&&!count;control.classList.toggle('cannot-produce',!canProduce);
  const badge=control.querySelector('.production-count');badge.hidden=!count;badge.textContent=String(count);
  const progress=control.querySelector('progress');
  const servicing=running&&current.factory.productionPaused,blocked=running&&current.factory.exitBlocked&&!servicing,stopped=paused||servicing;
  const flow=current?.flow,remaining=Math.ceil(flow?.remaining??0);
  progress.hidden=!running;progress.value=flow?.progress??0;
  control.dataset.productionState=running?(blocked?'blocked':stopped?'paused':flow.funding?'funding':'running'):'waiting';
  control.classList.toggle('has-queue',count>0);control.classList.toggle('is-producing',running&&!stopped&&!blocked);
  const phase=running?(flow.funding?'Нефть '+Math.floor(current.job.funding.paid)+'/'+current.job.cost:'Выпуск '+Math.floor((current.job.progress??0)*100)+'%'):'';
  const status=count?'В очереди: '+count+(running?' · '+phase+' · '+remaining+' с'+(servicing?' · Ремонт':blocked?' · Ждёт выезда':paused?' · Пауза':''):' · Ожидание'):'Очередь пуста';
  const distribution=queue?[...queue.distribution].map(([number,total])=>'Завод '+number+' · '+total).join('\n'):'';
  progress.setAttribute('aria-valuetext',status);
  control.dataset.hintSummary=control.dataset.baseTitle+'\n'+status;
  control.dataset.distribution=distribution;
  control.setAttribute('aria-description',[status,distribution.replaceAll('\n',', ')].filter(Boolean).join(' · '));
 }
}

export function updateFactoryRows(root,mission,projects,paused){
 const menu=root.querySelector('.factory-queues');if(!menu)return;
 updateProductionButtons(menu.querySelector('.factory-catalogue'),mission,productionFactories(mission),projects,paused);
 updateHint(menu);
 for(const row of root.querySelectorAll('[data-factory-row]')){
  const factory=mission.entity(row.dataset.factoryRow);if(!factory)continue;
  const control=row.querySelector('[data-factory-priority]'),priority=factoryPriority(factory),visits=factoryRepairQueue(mission,factory);
  if(control.dataset.factoryPriority!==priority){
   const children=[...control.children].filter(c=>!c.classList.contains('game-icon'));
   setButtonIcon(control,priority==='repair'?'repair-depot':'produce','Приоритет: '+(priority==='repair'?'ремонт':'производство'));
   control.append(...children);control.dataset.factoryPriority=priority;
  }
  const inside=visits.filter(u=>u.factoryVisit?.phase==='inside'&&u.factoryVisit.factoryId===factory.id&&!u.factoryVisit.nextFactoryId).length;
  const status='Ремонт: '+visits.length+' (в цехе '+inside+', на подходе '+(visits.length-inside)+') · Сборка: '+factory.queue.length;
  control.title=control.getAttribute('aria-label')+' · '+(priority==='repair'?'Сначала ремонт, затем сборка':'Сначала сборка, затем ремонт')+' · '+status+' · Переключить';
  const count=control.querySelector('.production-count'),progress=control.querySelector('progress');
  count.hidden=!visits.length;count.textContent=String(visits.length);progress.hidden=!factory.activeRepair;progress.value=factory.activeRepair?.progress??0;
  control.setAttribute('aria-description',status);
  const upgrade=row.querySelector('[data-factory-modernization]');
  if(upgrade){
   const enabled=!!factory.autoModernize;upgrade.setAttribute('aria-pressed',String(enabled));
   upgrade.title='Автомодернизация после ремонта: '+(enabled?'включена':'выключена')+' · Лучшие изученные модули своей ветки · Оплата разницы стоимости на заводе';
   upgrade.setAttribute('aria-description',upgrade.title);
  }
 }
}
