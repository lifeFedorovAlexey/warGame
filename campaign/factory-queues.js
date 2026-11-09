import {setButtonIcon} from '../assets/ui/icons.js';
import {factoryPriority,factoryVisitors,setFactoryPriority} from './factory-garage.js';
import {oilOrderProgress} from './oil-economy.js';

function indicators(control,label){
 const count=document.createElement('span');count.className='production-count';count.hidden=true;count.setAttribute('aria-hidden','true');control.append(count);
 const progress=document.createElement('progress');progress.className='production-progress';progress.max=1;progress.hidden=true;progress.setAttribute('aria-label',label);control.append(progress);
}

export function createFactoryRows(mission,factories,projects,{act,focus}){
 const root=document.createElement('div');root.className='factory-queues';
 root.style.setProperty('--factory-projects',projects.length);
 root.style.setProperty('--factory-short-rows',Math.min(factories.length,5));
 for(const [index,factory] of factories.entries()){
  const row=document.createElement('div');row.className='factory-line';row.dataset.factoryRow=factory.id;row.setAttribute('role','group');row.setAttribute('aria-label','Завод '+(index+1));
  const location=document.createElement('button');setButtonIcon(location,'factory','Завод '+(index+1));location.title='Завод '+(index+1)+' · Показать';location.onclick=()=>focus(factory.id);
  const number=document.createElement('span');number.className='factory-number';number.textContent=index+1;location.append(number);row.append(location);
  const priority=document.createElement('button');priority.dataset.factoryPriority='';
  priority.onclick=()=>act(()=>{const f=mission.entity(factory.id);return f?.hp>0?setFactoryPriority(mission,factory.id,factoryPriority(f)==='repair'?'production':'repair'):mission.fail('Завод недоступен');});
  indicators(priority,'Ремонт · Завод '+(index+1));row.append(priority);
  for(const {id,kind,name,spec} of projects){
   const control=document.createElement('button');setButtonIcon(control,kind,name);control.dataset.factoryProduction=control.dataset.production=id;
   control.dataset.baseTitle=name+' · Завод '+(index+1)+' · '+spec.cost+' нефти';
   control.onclick=()=>act(()=>mission.produce(factory.id,id));
   control.oncontextmenu=event=>{event.preventDefault();act(()=>mission.cancelProduction(factory.id,id));};
   indicators(control,'Выпуск · Завод '+(index+1)+' · '+name);row.append(control);
  }
  root.append(row);
 }
 return root;
}

export function updateProductionButtons(root,mission,factories,projects,paused){
 const counts=new Map(),active=new Map();
 for(const factory of factories)for(const [index,job] of factory.queue.entries()){
  const id=mission.productionProjectId(job,projects);counts.set(id,(counts.get(id)??0)+1);
  if(index===0){const rows=active.get(id)??[];rows.push({factory,job,flow:oilOrderProgress(job,mission.config.units[job.kind].seconds,mission.config)});active.set(id,rows);}
 }
 for(const control of root.querySelectorAll(':scope > [data-production], :scope > [data-factory-production]')){
  const id=control.dataset.production??control.dataset.factoryProduction,count=counts.get(id)??0,rows=active.get(id)??[];
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
  const status=count?'В очереди: '+count+(running?' · '+phase+' · '+remaining+' с'+(rows.length>1?' · Заводов: '+rows.length:'')+(servicing?' · Ремонт':blocked?' · Ждёт выезда':paused?' · Пауза':''):' · Ожидание'):'';
  progress.setAttribute('aria-valuetext',status);
  control.title=control.dataset.baseTitle+' · ЛКМ — заказать · ПКМ — отменить'+(status?' · '+status:'');
  if(status)control.setAttribute('aria-description',status);else control.removeAttribute('aria-description');
 }
}

export function updateFactoryRows(root,mission,projects,paused){
 for(const row of root.querySelectorAll('[data-factory-row]')){
  const factory=mission.entity(row.dataset.factoryRow);if(!factory)continue;
  const control=row.querySelector('[data-factory-priority]'),priority=factoryPriority(factory),visits=factoryVisitors(mission,factory);
  if(control.dataset.factoryPriority!==priority){
   const children=[...control.children].filter(c=>!c.classList.contains('game-icon'));
   setButtonIcon(control,priority==='repair'?'repair-depot':'produce','Приоритет: '+(priority==='repair'?'ремонт':'производство'));
   control.append(...children);control.dataset.factoryPriority=priority;
  }
  control.title=control.getAttribute('aria-label')+' · Переключить';
  const count=control.querySelector('.production-count'),progress=control.querySelector('progress');
  count.hidden=!visits.length;count.textContent=String(visits.length);progress.hidden=!factory.activeRepair;progress.value=factory.activeRepair?.progress??0;
  control.setAttribute('aria-description','На обслуживании: '+visits.length);
  updateProductionButtons(row,mission,[factory],projects,paused);
 }
}
