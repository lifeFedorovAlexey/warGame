import {setButtonIcon} from '../assets/ui/icons.js';
import {COMBAT_OPTIONS,armyCombatPolicy} from './combat-policy.js';
import {modernizationSelection} from './factory-modernization.js';

export class CombatMenu {
  constructor({button,mission,selection=()=>[],onOpen,onChange}) {
    this.selection=selection;
    this.button=button;this.mission=mission;this.onOpen=onOpen;this.onChange=onChange;
    this.element=document.getElementById('combat-menu');this.controls=[];
    this.hint=document.createElement('div');this.hint.id='combat-hint';this.hint.setAttribute('role','tooltip');this.hint.hidden=true;
    this.hintTitle=document.createElement('strong');this.hintDetail=document.createElement('span');
    this.hint.append(this.hintTitle,this.hintDetail);document.body.append(this.hint);
    const names={retreat:'Условия отхода',response:'Реакция на противника',priority:'Приоритет целей'};
    for(const [key,options] of Object.entries(COMBAT_OPTIONS)) {
      const group=document.createElement('div');group.className='combat-options';group.setAttribute('role','radiogroup');group.setAttribute('aria-label',names[key]);
      for(const option of options) {
        const control=document.createElement('button');control.type='button';control.setAttribute('role','radio');
        control.dataset.policy=key;control.dataset.value=option.value;
        setButtonIcon(control,option.icon,option.label,option.detail);
        const describe=()=>this.showHint(control,names[key],option);
        control.addEventListener('pointerenter',describe);control.addEventListener('focus',describe);
        control.addEventListener('pointerleave',()=>this.hideHint());control.addEventListener('blur',()=>this.hideHint());
        control.onclick=()=>{
          const result=this.mission.setArmyCombatPolicy({[key]:option.value});
          this.refresh();this.onChange(result);
        };
        control.addEventListener('keydown',event=>{
          const siblings=[...group.children],index=siblings.indexOf(control);
          let next;
          if(['ArrowLeft','ArrowUp'].includes(event.key))next=siblings[(index+siblings.length-1)%siblings.length];
          if(['ArrowRight','ArrowDown'].includes(event.key))next=siblings[(index+1)%siblings.length];
          if(event.key==='Home')next=siblings[0];if(event.key==='End')next=siblings.at(-1);
          if(next){event.preventDefault();event.stopPropagation();next.focus();next.click();}
        });
        this.controls.push({control,key,option});group.append(control);
      }
      this.element.append(group);
    }
    const repairs=document.createElement('div');repairs.className='combat-options';
    const repair=document.createElement('button');repair.type='button';repair.dataset.autoRepair='';
    const repairOption={label:'Авторемонт построек',detail:'Свободные строители чинят повреждённые постройки рядом'};
    setButtonIcon(repair,'repair',repairOption.label,repairOption.detail);
    repair.addEventListener('pointerenter',()=>this.showHint(repair,'Ремонтники',repairOption));
    repair.addEventListener('focus',()=>this.showHint(repair,'Ремонтники',repairOption));
    repair.addEventListener('pointerleave',()=>this.hideHint());repair.addEventListener('blur',()=>this.hideHint());
    repair.onclick=()=>{const result=this.mission.setBuilderAutoRepair(!this.mission.state.builderAutoRepair);this.refresh();this.onChange(result);};
    repairs.append(repair);this.element.append(repairs);this.repairControl=repair;
    const modernize=document.createElement('button');modernize.type='button';modernize.dataset.modernize='';
    const modernizationOption={label:'Переоснастить на спарку',detail:'Выбранные машины заедут на завод для замены пулемёта'};
    setButtonIcon(modernize,'twin-machinegun',modernizationOption.label,modernizationOption.detail);
    modernize.addEventListener('pointerenter',()=>this.showHint(modernize,'Переоснащение',modernizationOption));
    modernize.addEventListener('focus',()=>this.showHint(modernize,'Переоснащение',modernizationOption));
    modernize.addEventListener('pointerleave',()=>this.hideHint());modernize.addEventListener('blur',()=>this.hideHint());
    modernize.onclick=()=>{const result=this.mission.modernize(this.selection());this.refresh();this.onChange(result);};
    repairs.append(modernize);this.modernizeControl=modernize;
    button.onclick=()=>{if(this.element.hidden)this.open();else this.close();};
    button.addEventListener('contextmenu',event=>{event.preventDefault();this.open();});
    button.addEventListener('keydown',event=>{
      if(event.key!=='ArrowUp')return;
      event.preventDefault();event.stopPropagation();this.open();this.controls.find(({control})=>control.tabIndex===0)?.control.focus();
    });
    this.element.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();button.focus();}
    });
    document.addEventListener('pointerdown',event=>{
      if(!this.element.hidden&&!this.element.contains(event.target)&&!button.contains(event.target))this.close();
    },true);
    window.addEventListener('resize',()=>this.position());
    this.resizeObserver=new ResizeObserver(()=>this.position());
    this.resizeObserver.observe(button.closest('.tactical-dock'));
    this.refresh();
  }
  open(){this.onOpen?.();this.element.hidden=false;this.button.setAttribute('aria-expanded','true');this.refresh();}
  close(){this.element.hidden=true;this.button.setAttribute('aria-expanded','false');this.hideHint();}
  hideHint(){this.hint.hidden=true;this.hintOwner?.removeAttribute('aria-describedby');this.hintOwner=null;}
  showHint(control,group,option){
    if(this.element.hidden)return;
    this.hideHint();this.hintOwner=control;
    this.hintTitle.textContent=option.label;
    this.hintDetail.textContent=control.getAttribute('aria-description')??option.detail;
    this.hint.hidden=false;control.setAttribute('aria-describedby',this.hint.id);this.positionHint();
  }
  positionHint(){
    if(this.hint.hidden||!this.hintOwner)return;
    const r=this.hintOwner.getBoundingClientRect(),menu=this.element.getBoundingClientRect(),width=this.hint.offsetWidth,height=this.hint.offsetHeight;
    const right=menu.right+16,left=menu.left-width-16,beside=right+width<=innerWidth-8;
    const besideLeft=!beside&&left>=8&&(this.sideLayout||menu.top<height+20);
    this.hint.style.left=Math.max(8,Math.min(innerWidth-width-8,beside?right:besideLeft?left:menu.left))+'px';
    this.hint.style.top=Math.max(8,Math.min(innerHeight-height-8,besideLeft&&this.sideLayout?menu.top:beside||besideLeft?r.top:menu.top-height-12))+'px';
  }
  position(){
    if(this.element.hidden)return;
    const anchor=this.button.getBoundingClientRect(),dock=this.button.closest('.tactical-dock').getBoundingClientRect();
    const width=this.element.offsetWidth,height=this.element.offsetHeight,above=Math.min(anchor.top,dock.top)-height-10;
    this.sideLayout=above<48&&dock.left>=width+20;
    this.element.style.left=Math.max(8,Math.min(innerWidth-width-8,this.sideLayout?dock.left-width-12:anchor.right-width))+'px';
    this.element.style.top=Math.max(8,Math.min(innerHeight-height-8,this.sideLayout?Math.max(128,above):above))+'px';
    this.positionHint();
  }
  refresh(){
    if(this.element.hidden)return;
    const autoRepair=!!this.mission.state.builderAutoRepair;
    this.repairControl.setAttribute('aria-pressed',String(autoRepair));
    this.repairControl.setAttribute('aria-description',(autoRepair?'Включён':'Выключен')+' · Свободные строители чинят повреждённые постройки рядом');
    this.repairControl.removeAttribute('title');
    const refit=modernizationSelection(this.mission,this.selection());
    this.modernizeControl.setAttribute('aria-disabled',String(!!refit.reason));
    this.modernizeControl.setAttribute('aria-description',refit.reason||`Выбрано для переоснащения: ${refit.units.length}. Заезд на завод; ${refit.cost} нефти за машину. При нехватке нефти ждут в цехе.`);
    this.modernizeControl.removeAttribute('title');
    if(this.hintOwner===this.modernizeControl)this.hintDetail.textContent=this.modernizeControl.getAttribute('aria-description');
    const policy=armyCombatPolicy(this.mission);
    for(const key of Object.keys(COMBAT_OPTIONS)) {
      const group=this.controls.filter(item=>item.key===key);let checked=false;
      for(const {control,option} of group) {
        const all=policy[key]===option.value;
        control.disabled=false;control.setAttribute('aria-checked',String(all));control.classList.remove('mixed');
        control.tabIndex=all?0:-1;checked ||= all;
        control.removeAttribute('title');
        control.setAttribute('aria-description',(all?'Выбрано · ':'')+option.detail+' · Для всей армии, включая новые машины');
        if(this.hintOwner===control)this.hintDetail.textContent=control.getAttribute('aria-description');
      }
      if(!checked)group[0].control.tabIndex=0;
    }
    this.position();
  }
}
