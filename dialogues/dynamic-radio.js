import {METRICS,validateLibrary} from '../campaign/radio/conditions.js';
import {simulateRadio} from '../campaign/radio/simulator.js';
import {radioClip} from '../campaign/radio/audio.js';
import {renderRadioLine} from '../campaign/radio/wording.js';

const copy=structuredClone;
const sections={conversation:'Разговор',trigger:'Когда звучит',simulator:'Проверить'};
const roleNames={driver:'Экипаж',builder:'Строитель',commander:'Командир',radio:'Радист',scout:'Разведчик',technician:'Техник'};
const triggers={command:'После принятого приказа',movement:'Когда машины завершают движение или меняют маршрут',traffic:'После подтверждённого события на дороге',combat:'После подтверждённого боевого события',damage:'При реальном повреждении или потере',repair:'Когда начинается или заканчивается ремонт',construction:'После изменения состояния стройки',factory:'Когда завод заканчивает работу',research:'После начала или завершения исследования',idle:'Когда экипажи долго стоят без задачи',loot:'После получения трофея',recon:'После подтверждённого события разведки',mission:'Когда меняется состояние задачи'};
const sceneHelp={'command.move':'Игрок приказал ехать. Выбранные экипажи отвечают на общий приказ.','command.attack':'Игрок назначил цель. Экипажи коротко подтверждают атаку.','command.retreat':'Машины начали отход. Экипажи переговариваются на ходу.','command.auto_retreat':'Повреждённые машины уходят в ремонт.','damage.hit':'По своим машинам попали. Несколько попаданий собираются в один доклад.','damage.vehicle_destroyed':'Юнит уничтожен. В эфире — один короткий доклад о потере.','combat.target_destroyed':'Своя машина уничтожила видимую вражескую цель.','traffic.queue_blocked':'Машины действительно застряли в одном заторе.','traffic.jam_resolved':'Участники затора снова поехали.','idle.group_no_order':'Экипажи долго стоят без задачи. В бою эти разговоры замолкают.','repair.complete':'Ремонт закончился. Экипаж снова готов к работе.'};
const categories={command:'Приказы',movement:'Движение',traffic:'Дорога',combat:'Бой',damage:'Повреждения',repair:'Ремонт',economy:'Хозяйство',loot:'Трофеи',construction:'Стройка',factory:'Завод',research:'Наука',recon:'Разведка',mission:'Задачи',idle:'Тихий эфир',environment:'Окружение'};
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const $=id=>document.getElementById(id);

export class DynamicWorkshop{
 constructor({button,status,error,openLegacy}){Object.assign(this,{button,status,error,openLegacy});this.tab='conversation';this.ruleId='command.move';this.tierId='group';this.variant=0;this.query='';this.support='wired';this.category='';this.undo=[];this.redo=[];this.audio=new Audio();this.dirty=false;this.serial=0;this.playerToken=0;}
 async request(path,method='GET',body){
  const r=await fetch('/api/radio'+path,{method,headers:{'Content-Type':'application/json','X-Dialogue-Editor':'1'},...(body?{body:JSON.stringify(body)}:{})});
  const json=await r.json();if(!r.ok)throw Error(json.error??'Ошибка API');return json;
 }
 async load(){
  if(this.document)return;
  if(this.loading)return this.loading;
  this.loading=(async()=>{
   try{const saved=await this.request('');this.document=saved.document;this.revision=saved.revision;this.offline=false;}
   catch{this.document=await (await fetch('/assets/radio/situations_catalog.json')).json();this.revision=0;this.offline=true;}
   try{this.legacy=await this.request('/legacy');}catch{this.legacy={mapping:{},scenes:{},lines:{}};}
   if(this.active)this.render();
  })().catch(e=>this.error(e.message)).finally(()=>this.loading=null);return this.loading;
 }
 setActive(active){this.active=active;document.body.classList.toggle('radio-surface',active);
  if(!this.redoButton){this.redoButton=this.button('restart','Повторить изменение эфира',()=>this.history(false));this.redoButton.classList.add('radio-redo');$('undo').after(this.redoButton);}
  this.redoButton.hidden=!active;this.redoButton.disabled=!this.redo.length;
  $('export').title=active?'Экспорт JSON динамического эфира':'Скачать слепок с записями и портретами';
  if(!active)this.stopPlayback();}
 get rule(){return this.document.rules.find(r=>r.id===this.ruleId)??this.document.rules[0];}
 change(fn,render=false){this.undo.push(copy(this.document));if(this.undo.length>30)this.undo.shift();this.redo=[];fn();this.serial++;this.dirty=true;this.status('Динамический эфир · есть правки');if(render)this.render();}
 history(back=true){const from=back?this.undo:this.redo,to=back?this.redo:this.undo;if(!from.length)return;to.push(copy(this.document));this.document=from.pop();this.serial++;this.dirty=true;this.render();}
 async save(){
  if(!this.document||!this.dirty)return;
  if(this.saving)return this.saving;
  const serial=this.serial,document=copy(this.document);
  this.saving=(async()=>{
  try{validateLibrary(document);const result=await this.request('','PUT',{revision:this.revision,document});this.revision=result.revision;
   if(this.serial===serial)this.document=result.document;this.dirty=this.serial!==serial;
   this.status('Эфир · черновик '+this.revision+' сохранён'+(this.dirty?' · есть новые правки':''));this.error('');}
  catch(e){this.error(e.message+' Правки остаются в форме; доступны экспорт JSON и повторное сохранение.');throw e;}
  })().finally(()=>this.saving=null);return this.saving;
 }
 download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 export(){this.download({revision:this.revision,document:this.document},'rai-dynamic-radio.json');}
 async upload(phrase,kind='audio'){
  const input=el('input');input.type='file';input.accept=kind==='audio'?'audio/*':'image/*';
  input.onchange=async()=>{const file=input.files[0];if(!file)return;try{
   const r=await fetch('/api/radio/media',{method:'POST',headers:{'X-Dialogue-Editor':'1','X-Media-Kind':kind},body:file});const value=await r.json();if(!r.ok)throw Error(value.error);
   this.change(()=>{phrase[kind==='audio'?'audio':'portrait']=kind==='audio'?{...value,text:phrase.text}:value;if(kind==='audio')phrase.source='recording';},true);await this.save();
  }catch(e){this.error(e.message);}};input.click();
 }
 field(parent,label,value,change,{type='text',options,min,max}={}){
  const wrap=el('label',label),input=el(options?'select':'input');
  if(options)for(const [v,name] of Array.isArray(options)?options.map(v=>[v,v]):Object.entries(options)){const option=el('option',name);option.value=v;input.append(option);}
  else input.type=type;
  if(type==='checkbox')input.checked=!!value;else input.value=value??'';
  if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(type==='number')input.step='any';
  input.setAttribute('aria-label',label);input.onchange=()=>change(type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value);
  wrap.append(input);parent.append(wrap);return input;
 }
 actions(parent,items){const row=el('div',undefined,'radio-actions');for(const [icon,title,fn] of items)row.append(this.button(icon,title,()=>Promise.resolve().then(fn).catch(e=>this.error(e.message))));parent.append(row);return row;}
 newRule(){if(!this.document)return;const id='custom.'+crypto.randomUUID();this.change(()=>{const r=copy(this.rule);Object.assign(r,{id,eventType:id,title:'Новая ситуация',support:'unavailable',source:'',reason:'Нужен игровой источник',enabled:false,tiers:[{id:'single',min:1,graphs:[]}]});this.document.rules.push(r);this.ruleId=id;this.tab='trigger';this.support='all';},true);}
 renderList(){
  if(!this.document){this.load();return;}
  const nav=$('scenes'),scroll=nav.scrollTop;nav.replaceChildren();$('add-scene').hidden=true;$('search').disabled=false;
  const filters=el('div',undefined,'radio-filters');
  this.field(filters,'Ситуации',this.category,v=>{this.category=v;this.renderList();},{options:{'':'Все темы',...categories}});nav.append(filters);
  const rules=this.document.rules.filter(r=>(this.support==='all'||r.support===this.support)&&(!this.category||r.category===this.category)&&(!this.query||[r.id,r.title,...r.tiers.flatMap(t=>t.graphs.flatMap(g=>g.nodes.map(n=>this.document.phrases[n.phraseId]?.text??'')))].join(' ').toLowerCase().includes(this.query.toLowerCase())));
  $('scene-count').textContent=rules.length+' СИТУАЦИЙ';
  let category;
  for(const r of rules){if(category!==r.category){category=r.category;nav.append(el('p',categories[category]??category,'scene-section'));}
   const a=el('a',undefined,'scene-link');a.href='#dynamic/'+r.id;a.dataset.radioRule=r.id;a.setAttribute('aria-current',String(r.id===this.ruleId));
   a.append(el('span',r.enabled?'·':'–','ordinal'),el('span',r.title));
   a.onclick=e=>{e.preventDefault();this.stopPlayback();this.ruleId=r.id;this.variant=0;this.tab='conversation';document.body.classList.remove('radio-list-open');this.render();if(matchMedia('(max-width:600px)').matches)$('editor').scrollIntoView({block:'start'});};nav.append(a);
  }
  nav.scrollTop=scroll;
 }
 render(){
  if(!this.active)return;
  this.stopPlayback();
  this.renderList();const main=$('editor');main.replaceChildren();main.classList.add('dynamic-editor');
  if(!this.document){main.append(el('p','Загрузка эфира…'));this.load();return;}
  $('undo').disabled=!this.undo.length;this.status('Динамический эфир · '+(this.dirty?'есть правки':'черновик '+this.revision));
  const top=el('div',undefined,'radio-top');
  const mobile=this.button('menu','Выбрать ситуацию',()=>document.body.classList.toggle('radio-list-open'));mobile.className='radio-pick';top.append(mobile);
  const tabs=el('nav',undefined,'radio-tabs');tabs.setAttribute('aria-label','Работа с разговором');
  if(this.tab!=='conversation'){const back=el('a','← К разговору');back.href='#dynamic';back.dataset.radioTab='conversation';back.onclick=e=>{e.preventDefault();this.stopPlayback();this.tab='conversation';this.render();};tabs.append(back);}else tabs.append(el('span','ДИНАМИЧЕСКИЙ ЭФИР','eyebrow'));top.append(tabs);
  this.actions(top,[['radio','Сохранить и применить в игре',()=>this.publish()],['tools','Настройки эфира',()=>{this.tab='settings';this.render();}]]);main.append(top);
  if(this.offline)main.append(el('p','Сервер хранения недоступен. Редактирование и симулятор работают; экспортируйте JSON до закрытия страницы.','radio-offline'));
  const title=sections[this.tab]?this.rule.title:({settings:'Настройки эфира',voices:'Голоса',overview:'Источники и оригиналы',phrases:'Библиотека фраз',graph:'Связи и условия'}[this.tab]??this.rule.title);main.append(el('h2',title));
  if(sections[this.tab])main.append(el('p',this.rule.support!=='wired'?'Пока нет игрового события. Можно подготовить текст.':!this.rule.enabled?'Ситуация выключена. Включить можно ниже, в настройках срабатывания.':sceneHelp[this.rule.id]??triggers[this.rule.category]??'После игрового события','radio-context'));
  this[this.tab](main);
 }
 async publish(){await this.save();if(this.dirty)throw Error('Сначала сохраните новые правки.');await this.request('/publish','POST',{revision:this.revision});this.status('Применено · обновите открытую игру');}
 get tier(){return this.rule.tiers.find(t=>t.id===this.tierId)??this.rule.tiers[0];}
 get selectedGraph(){return this.tier.graphs[Math.min(this.variant,this.tier.graphs.length-1)];}
 scaleLabel(t){const next=this.rule.tiers.find(x=>x.min>t.min);return (this.rule.countMetric==='uniqueObjectCount'?'Объектов':this.rule.countMetric==='distinctOrderCount'?'Приказов':'Машин')+': '+t.min+(next?'–'+(next.min-1):'+');}
 audition(graph=this.selectedGraph){
  if(!graph)return [];
  const count=this.tier.min,context={...Object.fromEntries(METRICS.map(k=>[k,count])),facts:{crewKnown:true,sharedTraffic:true,enemyFire:true,explosionConfirmed:true}};
  const people=['Кедр','Буран','Волга','Грач','Дозор','Вихрь'].map((callSign,i)=>({crewId:'sample-'+i,callSign,name:['Алексей','Сергей','Виктор','Николай','Иван','Пётр'][i]}));
  Object.assign(context.facts,{enemyComposition:'три пикапа с пулемётами и один грузовик с огнемётом',enemyReport:'Три пикапа с пулемётами и один грузовик с огнемётом',attackerComposition:'две пулемётные вышки',attackerReport:'Две пулемётные вышки',lostCallSign:'Грач',lostName:'Иван'});
  return graph.nodes.map((node,i)=>{const slot=node.speakerSlot??i%2,p=this.document.phrases[node.phraseId],gender=p.speakerGender??this.document.characters.find(c=>c.voiceId===p.voiceId)?.gender??'m',speaker={...people[slot],gender,role:p.role,voiceId:p.voiceId??(gender==='f'?'voice-3':p.role==='builder'?'voice-4':slot%2?'voice-2':'voice-1')},other=people[i?(graph.nodes[i-1].speakerSlot??(i-1)%2):(graph.nodes[1]?.speakerSlot??1)];
   const rendered=renderRadioLine(p,context,this.document.dictionaries,speaker,other,{opening:i===0,seed:graph.id});
   return rendered?{...p,...rendered,dynamic:true,clip:radioClip(p,rendered.text,this.document.settings,speaker.voiceId,speaker.role)}:null;}).filter(Boolean);
 }
 conversation(main){
  const picker=el('div',undefined,'radio-picker');main.append(picker);
  this.field(picker,'Масштаб',this.tier.id,v=>{this.stopPlayback();this.tierId=v;this.variant=0;this.render();},{options:Object.fromEntries(this.rule.tiers.map(t=>[t.id,this.scaleLabel(t)]))});
  this.field(picker,'Вариант разговора',Math.min(this.variant,this.tier.graphs.length-1),v=>{this.stopPlayback();this.variant=Number(v);this.render();},{options:Object.fromEntries(this.tier.graphs.map((g,i)=>[i,`${i+1}. ${this.document.phrases[g.nodes[0]?.phraseId]?.text??'Пустой вариант'}`]))});
  const g=this.selectedGraph;
  if(!g){main.append(el('p','Пока нет разговоров для этого масштаба.'));this.actions(main,[['plus','Добавить вариант разговора',()=>this.addVariant()]]);return;}
  const toolbar=el('div',undefined,'radio-listen');main.append(toolbar);
  this.actions(toolbar,[['play','Прослушать разговор',()=>this.play(this.audition())],['stop','Остановить прослушивание',()=>this.stopPlayback()]]);
  toolbar.append(el('span',g.humor?'Разговор с подколом':'Разговор целиком','radio-note'));
  const playback=el('p','', 'radio-playback');playback.setAttribute('role','status');main.append(playback);
  for(const [i,node] of g.nodes.entries()){
   const p=this.document.phrases[node.phraseId],row=el('section',undefined,'radio-turn');row.dataset.phrase=p.id;
   const heading=el('div',undefined,'radio-turn-heading');heading.append(el('span',`${String(i+1).padStart(2,'0')} · ${roleNames[p.role]??p.role} ${(node.speakerSlot??i%2)+1}${i?' · ответ':''}`));row.append(heading);
   const input=el('textarea');input.value=p.text;input.rows=2;input.setAttribute('aria-label','Реплика '+(i+1));input.onchange=()=>{this.stopPlayback();this.change(()=>p.text=input.value);};row.append(input);
   const media=el('div',undefined,'radio-turn-media');row.append(media);
   this.actions(media,[['upload','Загрузить запись реплики '+(i+1),()=>this.upload(p)]]);
   media.append(el('span',p.audio&&(!p.audio.text||p.audio.text===p.text)?'Твоя запись':p.source==='text'?'Только субтитры':p.audio?'Текст изменён · временный голос':'Временный голос','radio-note'));
   if(p.text.includes('{'))row.append(el('p','Пример: '+(this.audition()[i]?.bodyText??p.text),'radio-example'));
   const extra=el('details',undefined,'radio-extra');extra.append(el('summary','Голос и запись'));row.append(extra);
   const fields=el('div',undefined,'radio-fields');extra.append(fields);
   this.field(fields,'Голос',p.voiceId??'',v=>this.change(()=>p.voiceId=v||null),{options:{'':'Голос экипажа',...Object.fromEntries(this.document.characters.map(c=>[c.voiceId,c.name]))}});
   this.field(fields,'Женская форма · реплика '+(i+1),p.femaleTextBase&&p.femaleTextBase!==p.text?'':p.femaleText??'',v=>this.change(()=>{p.femaleText=v||undefined;p.femaleTextBase=v?p.text:undefined;}));
   this.field(fields,'Подача',p.emotion??'calm',v=>this.change(()=>p.emotion=v),{options:{calm:'Спокойно',urgent:'Срочно',dry:'Сухой юмор',relieved:'С облегчением',somber:'Сдержанно, с грустью'}});
   this.field(fields,'Озвучка',p.source,v=>this.change(()=>p.source=v,true),{options:{tts:'Временный голос',recording:'Моя запись',text:'Без голоса'}});
   this.field(fields,'Пауза после реплики, с',p.pauseAfter,v=>this.change(()=>p.pauseAfter=v),{type:'number',min:.06,max:2});
   this.field(fields,'Выровнять громкость записи',p.normalize??false,v=>this.change(()=>p.normalize=v),{type:'checkbox'});
   this.actions(extra,[['play','Прослушать реплику '+(i+1),()=>this.play(this.audition().slice(i,i+1))],['scout','Портрет реплики '+(i+1),()=>this.upload(p,'image')],['up','Поднять реплику '+(i+1),()=>{if(i)this.change(()=>[g.nodes[i-1],g.nodes[i]]=[g.nodes[i],g.nodes[i-1]],true);}],['close','Удалить реплику '+(i+1),()=>{if(g.nodes.length>1)this.change(()=>g.nodes.splice(i,1),true);}]]);
   extra.append(el('small',p.id,'radio-note'));main.append(row);
  }
  const extra=el('details',undefined,'radio-extra');extra.append(el('summary','Изменить состав разговора'));main.append(extra);
  this.field(extra,'С юмором',!!g.humor,v=>this.change(()=>g.humor=v,true),{type:'checkbox'});
  this.actions(extra,[['plus','Добавить ответ',()=>{if(g.nodes.length>=3)throw Error('Обычный разговор — не больше трёх реплик.');this.change(()=>{const id='phrase.'+crypto.randomUUID();this.document.phrases[id]={...copy(this.document.phrases[g.nodes[0].phraseId]),id,text:'',audio:null,source:'tts',kind:'ack'};g.nodes.forEach((n,i)=>n.speakerSlot=i%2);g.nodes.push({phraseId:id,differentSpeaker:true,speakerSlot:g.nodes.length%2});},true);}],['close','Удалить выбранный вариант',()=>this.change(()=>{this.tier.graphs.splice(this.variant,1);this.variant=Math.max(0,this.variant-1);},true)]]);
  this.actions(extra,[['plus','Добавить вариант разговора',()=>this.addVariant()]]);
  const when=el('details',undefined,'radio-extra');when.append(el('summary','Когда звучит · настройки и проверка'));main.append(when);
  when.append(el('p',`Собирает события ${this.rule.windowSimSeconds} с. Сюжетные реплики всегда важнее.`,'radio-note'));
  const links=el('nav',undefined,'radio-settings-nav');when.append(links);for(const [key,title] of [['trigger','Изменить срабатывание'],['simulator','Проверить на примере']]){const a=el('a',title);a.href='#dynamic/'+key;a.dataset.radioTab=key;a.onclick=e=>{e.preventDefault();this.stopPlayback();this.tab=key;this.render();};links.append(a);}
 }
 addVariant(){this.change(()=>{const id=this.rule.id+'.'+crypto.randomUUID(),phraseId=id+'.1';this.document.phrases[phraseId]={id:phraseId,text:'Новая реплика.',role:this.rule.category==='construction'?'builder':'driver',kind:'report',source:'tts',audio:null,portrait:null,voiceId:null,pauseAfter:.18,archived:false};this.tier.graphs.push({id,weight:1,nodes:[{phraseId:phraseId}]});this.variant=this.tier.graphs.length-1;},true);}
 trigger(main){
  const r=this.rule,fields=el('div',undefined,'radio-fields');main.append(fields);
  this.field(fields,'В игре',r.enabled,v=>this.change(()=>r.enabled=v,true),{type:'checkbox'}).disabled=r.support!=='wired';
  this.field(fields,'Название ситуации',r.title,v=>this.change(()=>r.title=v));
  this.field(fields,'Собирать события, секунд',r.windowSimSeconds,v=>this.change(()=>r.windowSimSeconds=v),{type:'number',min:0,max:60});
  this.field(fields,'Важность',r.priority,v=>this.change(()=>r.priority=Number(v)),{options:{[r.priority]:'Текущая · '+r.priority,1:'Фоновый разговор',10:'Обычный доклад',55:'Важное событие',90:'Срочный доклад',98:'Потери'}});
  main.append(el('p','Сюжет всегда первым. Динамический эфир включается через 15 секунд после начала миссии. Раз в 2 секунды он выбирает готовые сообщения по важности.','radio-note'));
  const extra=el('details',undefined,'radio-extra');extra.append(el('summary','Точная настройка срабатывания'));main.append(extra);
  const advanced=el('div',undefined,'radio-fields');extra.append(advanced);
  this.field(advanced,'Объединять',r.scope,v=>this.change(()=>r.scope=v),{options:{order:'По приказу',incident:'По событию',squad:'По группе',global:'Общая сводка'}});
  for(const [key,title] of [['cooldown','Повтор ситуации не раньше, с'],['expiresAfter','Забыть устаревший доклад через, с']])this.field(advanced,title,r[key],v=>this.change(()=>r[key]=v),{type:'number',min:key==='expiresAfter'?1:0,max:600});
  this.field(advanced,'Счётчик',r.countMetric,v=>this.change(()=>r.countMetric=v),{options:METRICS});
  for(const tier of r.tiers)this.field(advanced,'Минимум: '+this.scaleLabel(tier),tier.min,v=>this.change(()=>tier.min=v),{type:'number',min:0});
  this.field(advanced,'Заменить прежнюю ситуационную запись',r.legacyOverride,v=>this.change(()=>r.legacyOverride=v),{type:'checkbox'});
  this.condition(extra,r.preconditions,v=>r.preconditions=v);extra.append(el('p',r.id+' · '+(r.source||r.reason),'radio-note'));
 }
 overview(main){
  const wired=this.document.rules.filter(r=>r.support==='wired'),phrases=Object.values(this.document.phrases),summary=el('div',undefined,'radio-summary');
  for(const [n,title] of [[this.document.rules.length,'ситуаций'],[wired.length,'подключено'],[this.document.rules.length-wired.length,'ожидают источник'],[phrases.filter(p=>p.audio).length,'записей']]){const p=el('span',title);p.prepend(el('strong',String(n)));summary.append(p);}main.append(summary);
  main.append(el('p','Каталог восстановлен по ТЗ: исходные JSON не были предоставлены. Неподключённые ситуации выключены. Статистика ниже относится к последнему запуску симулятора; соединение с запущенной игрой отсутствует.','radio-note'));
  if(this.lastSimulation)main.append(el('pre',JSON.stringify(this.lastSimulation.diagnostics,null,2),'radio-result'));
  this.actions(main,[['shield','Проверить целостность 25 оригиналов',async()=>{const result=await this.request('/integrity');main.append(el('p',`${result.legacyIds.length} ID; ${result.checkedFiles} файлов; ${result.unchanged?'контрольные суммы совпадают':'изменены: '+result.changed.join(', ')}`));}],['download','Скачать резервную копию оригиналов',()=>{location.href='/api/radio/originals';}]]);
  const table=el('table',undefined,'radio-metrics');const head=el('tr');for(const t of ['Событие','Источник','Варианты'])head.append(el('th',t));table.append(head);
  for(const r of wired){const row=el('tr');for(const v of [r.id,r.source,String(r.tiers.reduce((n,t)=>n+t.graphs.length,0))])row.append(el('td',v));table.append(row);}main.append(table);
 }
 condition(parent,condition,replace){
  const row=el('div',undefined,'radio-condition');parent.append(row);
  const mode=condition.all?'all':condition.any?'any':condition.not?'not':'leaf';
  this.field(row,'Связка',mode,v=>this.change(()=>replace(v==='leaf'?{field:'affectedUnitCount',op:'gte',value:1}:v==='not'?{not:{field:'affectedUnitCount',op:'gte',value:1}}:{[v]:[]}),true),{options:{all:'AND',any:'OR',not:'NOT',leaf:'Условие'}});
  if(mode==='all'||mode==='any'){
   condition[mode].forEach((c,i)=>{const branch=el('div');row.append(branch);this.condition(branch,c,v=>condition[mode][i]=v);this.actions(branch,[['close','Удалить условие',()=>this.change(()=>condition[mode].splice(i,1),true)]]);});
   this.actions(row,[['plus','Добавить условие',()=>this.change(()=>condition[mode].push({field:'affectedUnitCount',op:'gte',value:1}),true)]]);
  }else if(mode==='not')this.condition(row,condition.not,v=>condition.not=v);
  else{
   this.field(row,'Поле',condition.field,v=>this.change(()=>condition.field=v),{options:[...METRICS,'firstOccurrence','resolution','combatContext','facts.crewKnown','facts.trafficProgress','facts.jamResolved','facts.aliveCount','facts.mobileCount','facts.hitCount']});
   this.field(row,'Оператор',condition.op,v=>this.change(()=>condition.op=v),{options:['eq','ne','gte','gt','lte','lt','in','known']});
   this.field(row,'Значение',JSON.stringify(condition.value),v=>{try{const value=JSON.parse(v);this.change(()=>condition.value=value);}catch{this.error('Значение: число, true/false, строка в кавычках или список JSON.');}});
  }
 }
 situations(main){
  const r=this.rule;main.append(el('p',r.support==='wired'?r.id+' · '+r.source:r.id+' · '+r.reason,'radio-note'));
  const fields=el('div',undefined,'radio-fields');main.append(fields);
  this.field(fields,'Название',r.title,v=>this.change(()=>r.title=v));
  this.field(fields,'Включено',r.enabled,v=>this.change(()=>r.enabled=v),{type:'checkbox'}).disabled=r.support!=='wired';
  this.field(fields,'Счётчик',r.countMetric,v=>this.change(()=>r.countMetric=v),{options:METRICS});
  this.field(fields,'Объединять события',r.scope,v=>this.change(()=>r.scope=v),{options:{order:'Один приказ',incident:'Один инцидент',squad:'Группа за окно',global:'Общая сводка за окно'}});
  this.field(fields,'Разрешённые роли',r.roles.join(', '),v=>this.change(()=>r.roles=v.split(',').map(s=>s.trim()).filter(Boolean)));
  for(const [key,title,min,max] of [['windowSimSeconds','Окно, секунды симуляции',0,60],['priority','Приоритет',0,100],['cooldown','Повтор через, секунды',0,600],['expiresAfter','Срок актуальности, секунды',1,600]])this.field(fields,title,r[key],v=>this.change(()=>r[key]=v),{type:'number',min,max});
  this.field(fields,'Заменять прежний ответ этим правилом',r.legacyOverride,v=>this.change(()=>r.legacyOverride=v),{type:'checkbox'});
  this.field(fields,'Уступать эфир между репликами',r.interruptible,v=>this.change(()=>r.interruptible=v),{type:'checkbox'});
  main.append(el('h3','Условия'));this.condition(main,r.preconditions,v=>r.preconditions=v);
  main.append(el('h3','Масштабы'));for(const t of r.tiers){const block=el('div',undefined,'radio-tier');main.append(block);this.field(block,t.id+' · минимум',t.min,v=>this.change(()=>t.min=v),{type:'number',min:0});for(const g of t.graphs)this.graphView(block,g);}
  const old=Object.entries(this.legacy?.mapping??{}).filter(([,type])=>type===r.eventType);if(old.length){main.append(el('h3','Существующие записи'));const links=el('div',undefined,'radio-legacy');for(const [id] of old){const a=el('a',this.legacy.scenes[id]?.title??id);a.href='#'+encodeURIComponent(id);a.onclick=e=>{e.preventDefault();this.openLegacy(id);};links.append(a);}main.append(links);}
 }
 graphView(main,graph){const row=el('div',undefined,'radio-graph');graph.nodes.forEach((node,i)=>{if(i)row.append(el('span','→','radio-arrow'));const block=el('div',undefined,'radio-node'),p=this.document.phrases[node.phraseId];block.append(el('small',p?.role??''),el('p',p?.text??'Неизвестная реплика'));row.append(block);});main.append(row);}
 graph(main){
  const r=this.rule;
  for(const tier of r.tiers){const block=el('section',undefined,'radio-tier');main.append(block);block.append(el('h3',tier.id+' · от '+tier.min));
   this.actions(block,[['plus','Добавить вариант '+tier.id,()=>this.change(()=>tier.graphs.push({id:r.id+'.'+crypto.randomUUID(),weight:1,nodes:[]}),true)]]);
   for(const [gi,g] of tier.graphs.entries()){
    this.graphView(block,g);const fields=el('div',undefined,'radio-fields');block.append(fields);
    this.field(fields,'Вес варианта',g.weight,v=>this.change(()=>g.weight=v),{type:'number',min:.01});
    this.field(fields,'Специфичность ветки',g.specificity??0,v=>this.change(()=>g.specificity=v),{type:'number',min:0});
    this.condition(block,g.requires??={all:[]},v=>g.requires=v);
    g.nodes.forEach((node,i)=>{
     const opts=Object.fromEntries(Object.values(this.document.phrases).filter(p=>!p.archived).map(p=>[p.id,p.id+' · '+p.text.slice(0,50)]));
     this.field(block,'Ход '+(i+1),node.phraseId,v=>this.change(()=>node.phraseId=v,true),{options:opts});
     this.field(block,'Другой участник · '+(i+1),node.differentSpeaker,v=>this.change(()=>node.differentSpeaker=v),{type:'checkbox'});
     this.actions(block,[['up','Поднять ход '+(i+1),()=>{if(i)this.change(()=>[g.nodes[i-1],g.nodes[i]]=[g.nodes[i],g.nodes[i-1]],true);}],['close','Удалить ход '+(i+1),()=>this.change(()=>g.nodes.splice(i,1),true)]]);
    });
    this.actions(block,[['plus','Добавить ход',()=>{if(g.nodes.length<6)this.change(()=>g.nodes.push({phraseId:Object.keys(this.document.phrases)[0]}),true);}],['close','Удалить вариант',()=>this.change(()=>tier.graphs.splice(gi,1),true)]]);
   }
  }
 }
 phrases(main){
  this.field(main,'Поиск фраз и ID',this.phraseQuery??'',v=>{this.phraseQuery=v;this.render();});
  this.actions(main,[['plus','Создать фразу',()=>this.change(()=>{const id='phrase.'+crypto.randomUUID();this.document.phrases[id]={id,text:'Новая реплика.',role:'driver',kind:'report',source:'tts',audio:null,portrait:null,voiceId:null,pauseAfter:.12,archived:false};this.phraseQuery=id;},true)]]);
  const refs=new Set(this.rule.tiers.flatMap(t=>t.graphs.flatMap(g=>g.nodes.map(n=>n.phraseId))));
  const phrases=Object.values(this.document.phrases).filter(p=>this.phraseQuery?(p.id+' '+p.text).toLowerCase().includes(this.phraseQuery.toLowerCase()):refs.has(p.id));
  main.append(el('p',this.phraseQuery?phrases.length+' совпадений':'Показаны фразы выбранной ситуации. Поиск проверяет всю библиотеку.','radio-note'));
  for(const p of phrases.slice(0,80)){
   const row=el('section',undefined,'radio-phrase');row.append(el('small',p.id));const text=el('textarea');text.value=p.text;text.setAttribute('aria-label','Текст '+p.id);text.onchange=()=>this.change(()=>p.text=text.value);row.append(text);
   const fields=el('div',undefined,'radio-fields');row.append(fields);
   this.field(fields,'Роль',p.role,v=>this.change(()=>p.role=v),{options:['driver','builder','commander','radio','scout','technician']});
   this.field(fields,'Смысловой блок',p.kind,v=>this.change(()=>p.kind=v),{options:['report','question','answer','ack','clarify','order','dry_joke','close','overradio']});
   this.field(fields,'Факт для вопроса / ответа',p.fact??'',v=>this.change(()=>p.fact=v));
   this.field(fields,'Голос',p.voiceId??'',v=>this.change(()=>p.voiceId=v||null),{options:{'':'По экипажу',...Object.fromEntries(this.document.characters.map(c=>[c.voiceId,c.name]))}});
   this.field(fields,'Подача',p.emotion??'calm',v=>this.change(()=>p.emotion=v),{options:{calm:'Спокойно',urgent:'Срочно',dry:'Сухой юмор',relieved:'С облегчением',somber:'Сдержанно, с грустью'}});
   this.field(fields,'Источник',p.source,v=>this.change(()=>p.source=v),{options:{text:'Только субтитры',recording:'Своя запись',tts:'Временная озвучка'}});
   this.field(fields,'Пауза после, секунды',p.pauseAfter,v=>this.change(()=>p.pauseAfter=v),{type:'number',min:.06,max:2});
   this.field(fields,'Нормализовать громкость при воспроизведении',p.normalize??false,v=>this.change(()=>p.normalize=v),{type:'checkbox'});
   row.append(el('small',p.audio?(p.audio.text&&p.audio.text!==p.text?'Текст изменён · используется временный голос · ':'Твоя запись · ')+p.audio.file:p.source==='text'?'Только субтитры':'Временная озвучка · заменяется вашей записью'));
   if(p.text.includes('{'))row.append(el('small','Учебный пример: '+(this.phrasePreview(p)?.text??'Нужны данные ситуации.')));
   this.actions(row,[['play','Прослушать '+p.id,()=>this.play([this.phrasePreview(p)].filter(Boolean))],['upload','Загрузить запись '+p.id,()=>this.upload(p)],['scout','Загрузить портрет '+p.id,()=>this.upload(p,'image')],['eye-off','Архивировать '+p.id,()=>{if([...this.document.rules].some(r=>r.tiers.some(t=>t.graphs.some(g=>g.nodes.some(n=>n.phraseId===p.id)))))throw Error('Фраза используется в графах. Сначала снимите ссылки.');this.change(()=>p.archived=true,true);}]]);
   this.condition(row,p.requires??={all:[]},v=>p.requires=v);main.append(row);
  }
  main.append(el('h3','Словари'));
  for(const [name,value] of Object.entries(this.document.dictionaries)){const label=el('label',name);const text=el('textarea');text.value=JSON.stringify(value,null,2);text.setAttribute('aria-label','Словарь '+name);text.onchange=()=>{try{const parsed=JSON.parse(text.value);this.change(()=>this.document.dictionaries[name]=parsed);}catch(e){this.error(e.message);}};label.append(text);main.append(label);}
 }
 voices(main){
  main.append(el('p','Шесть временных голосов. Свои записи загружаются рядом с репликой в разговоре. Командир и прапорщик остаются в сюжетных диалогах.','radio-note'));
  const c=this.document.characters.find(c=>c.id===this.characterId)??this.document.characters[0];
  this.field(main,'Выбрать голос',c.id,v=>{this.characterId=v;this.render();},{options:Object.fromEntries(this.document.characters.map(c=>[c.id,c.name]))});
  const fields=el('div',undefined,'radio-fields');main.append(fields);
  this.field(fields,'Название',c.name,v=>this.change(()=>c.name=v));
  this.field(fields,'Кто использует',c.role,v=>this.change(()=>c.role=v),{options:roleNames});
  this.field(fields,'Доступен',c.enabled,v=>this.change(()=>c.enabled=v),{type:'checkbox'});
  this.actions(main,[['play','Прослушать голос',()=>this.play([{text:'На связи. Ну что, поехали. Только без гонки.',source:'tts',voiceId:c.voiceId,role:c.role}])],['stop','Остановить прослушивание',()=>this.stopPlayback()],['scout','Загрузить портрет голоса',()=>this.upload(c,'image')]]);
 }
 phrasePreview(p){
  const speaker={crewId:'example-a',callSign:'Кедр',name:'Алексей',voiceId:p.voiceId??'voice-1',role:p.role},other={crewId:'example-b',callSign:'Буран',name:'Сергей'};
  const context={...Object.fromEntries(METRICS.map(k=>[k,1])),facts:{crewKnown:true,sharedTraffic:true}};
  const rendered=renderRadioLine(p,context,this.document.dictionaries,speaker,other,{opening:true,seed:p.id});
  return rendered?{...p,...rendered,dynamic:true,clip:radioClip(p,rendered.text,this.document.settings,speaker.voiceId)}:null;
 }
 stopPlayback(){this.playerToken++;this.audio.pause();this.endPlayback?.();this.endPlayback=null;document.querySelectorAll('[data-phrase]').forEach(n=>n.classList.remove('is-playing'));const status=document.querySelector('.radio-playback');if(status)status.textContent='';}
 async play(lines){
  this.stopPlayback();this.error('');const token=this.playerToken;
  for(const line of lines){if(token!==this.playerToken)return;
   document.querySelectorAll('[data-phrase]').forEach(n=>n.classList.toggle('is-playing',n.dataset.phrase===line.id));
   const status=document.querySelector('.radio-playback');if(status)status.textContent='Прослушивание · '+line.text;
   const audio=line.dynamic?line.clip:radioClip(line,line.text,this.document.settings);
   if(!audio?.file){this.status(line.text.includes('{')?'Для реплики с числами выберите количество в симуляторе.':'У этой реплики включены только субтитры.');continue;}
   this.audio.src='/'+audio.file;this.audio.volume=this.document.settings.volume;
   let failed=false;
   await new Promise(resolve=>{this.endPlayback=resolve;const fail=()=>{if(token===this.playerToken){failed=true;this.error('Не удалось воспроизвести озвучку. Проверьте локальный сервер и звук браузера.');}resolve();};this.audio.onended=resolve;this.audio.onerror=fail;this.audio.play().catch(fail);});
   if(failed){this.stopPlayback();return;}
  }
  if(token===this.playerToken)this.stopPlayback();
 }
 simulator(main){
  this.simulations??={};
  const values=this.simulation=this.simulations[this.rule.id]??={count:20,hits:20,orders:1,killed:0,wounded:0,losses:0,seed:'rai-preview',squad:'column-1',simTime:0,combat:false,crewKnown:true};
  const fields=el('div',undefined,'radio-fields');main.append(fields);
  main.append(el('p','Задай пример события и послушай, что выберет игра. Это проверка здесь, без изменений в миссии.','radio-note'));
  const type=this.rule.eventType,loss=type==='damage.vehicle_destroyed',remembrance=type==='idle.crew_history';
  const inputs=loss||remembrance?[['losses','Потеряно машин']]:type==='recon.enemy_first_seen'?[]:[['count',this.rule.countMetric==='uniqueObjectCount'?'Сколько объектов':'Затронуто машин']];
  if(remembrance&&this.simulationType!==type)values.losses=Math.max(3,values.losses);
  if(type==='damage.hit')inputs.push(['hits','Попаданий']);
  if(['damage.hit','command.retreat','command.auto_retreat','recon.enemy_first_seen'].includes(type))this.field(fields,'Противник в учебном примере',values.enemyPreset??(type==='recon.enemy_first_seen'?'mixed':'none'),v=>{values.enemyPreset=v;run();},{options:{none:'Источник не установлен',towers:'Две пулемётные вышки',mixed:'Три пикапа и огнемётный грузовик'}});
  if(type==='damage.crew_wounded')inputs.push(['wounded','Раненых']);
  if(type==='traffic.network_overload')inputs.push(['orders','Независимых приказов']);
  for(const [key,title] of inputs)this.field(fields,title,values[key],v=>values[key]=Math.max(key==='orders'?1:0,Math.min(10000,Math.trunc(v))),{type:'number',min:0,max:10000});
  if(loss&&this.simulationType!==type)values.losses=Math.max(1,values.losses);this.simulationType=type;
  if(loss)fields.querySelector('[aria-label="Потеряно машин"]').value=values.losses;
  if(type==='combat.target_destroyed')this.field(fields,'Взрыв подтверждён (пример)',values.explosionConfirmed??false,v=>values.explosionConfirmed=v,{type:'checkbox'});
  if(remembrance){
   this.field(fields,'Погиб опытный экипаж',values.lostVeteran??false,v=>{values.lostVeteran=v;run();},{type:'checkbox'});
   this.field(fields,'Помнят разговор с новичком',values.lostNewcomerRemembered??false,v=>{values.lostNewcomerRemembered=v;run();},{type:'checkbox'});
  }
  this.field(fields,'Манера речи',values.tone??'any',v=>values.tone=v,{options:{any:'Все подходящие варианты',dry:'Сухой юмор',report:'Обычный доклад'}});
  const debug=el('details',undefined,'radio-extra'),debugFields=el('div',undefined,'radio-fields');debug.append(el('summary','Дополнительные условия'),debugFields);main.append(debug);
  for(const [key,title] of [['seed','Зерно'],['squad','Группа']])this.field(debugFields,title,values[key],v=>values[key]=v);
  this.field(debugFields,'Время симуляции',values.simTime,v=>values.simTime=v,{type:'number',min:0});
  this.field(debugFields,'Бой',values.combat,v=>values.combat=v,{type:'checkbox'});
  const controls=el('div'),output=el('div',undefined,'radio-result');main.append(controls,output);
  const run=(fresh=false)=>{validateLibrary(this.document);const request={...values,type:this.rule.eventType};
   if(loss)Object.assign(request,{count:Math.max(1,values.losses),killed:values.losses,crewKnown:true});
   if(fresh){this.previewSerial=(this.previewSerial??0)+1;values.seed=request.seed=values.seed.replace(/ · \d+$/,'')+' · '+this.previewSerial;}
   const input=debugFields.querySelector('[aria-label="Зерно"]');if(input)input.value=request.seed;
   this.lastSimulationRequest=request;const result=simulateRadio(this.document,request);this.lastSimulation=result;output.replaceChildren(el('h3',result.lines.length?'Так прозвучит в эфире':'Эфир промолчит'));
   if(!result.lines.length)output.append(el('p',!this.rule.enabled?'Ситуация выключена.':this.rule.support!=='wired'?'Это событие ещё не подключено к игре.':'Нет подходящего разговора для этих условий. Измени масштаб, потери или манеру речи.','radio-note'));
   for(const line of result.lines)output.append(el('blockquote',line.text));
   const details=el('details');details.append(el('summary','Агрегат и причины выбора'),el('pre',JSON.stringify({contexts:result.contexts,diagnostics:result.diagnostics},null,2)));output.append(details);return result;};
  this.actions(controls,[['play','Проверить и прослушать',()=>this.play(run(true).lines)],['restart','Другой вариант',()=>{this.stopPlayback();run(true);}],['stop','Остановить прослушивание',()=>this.stopPlayback()]]);
  this.actions(debug,[['restart','Повторить с тем же зерном',()=>run()],['produce','Прогнать 1000 сценариев',()=>this.batch(1000,output)],['factory','Прогнать 10000 сценариев',()=>this.batch(10000,output)]]);run();
 }
 async batch(count,output){
  let candidates=0,violations=0;const graphs=new Map();
  for(let i=0;i<count;i++){const result=simulateRadio(this.document,{...this.simulation,type:this.rule.eventType,seed:'batch-'+i});candidates+=result.candidates.length;
   if(result.candidates.length>this.document.settings.maxQueue)violations++;
   for(const q of result.candidates)graphs.set(q.graphId,(graphs.get(q.graphId)??0)+1);
   if(i%100===0){output.textContent=`${i} / ${count}`;await new Promise(r=>setTimeout(r,0));}}
  output.textContent=JSON.stringify({scenarios:count,candidates,queueInvariantViolations:violations,graphs:Object.fromEntries(graphs)},null,2);
 }
 settings(main){
  const links=el('nav',undefined,'radio-settings-nav');main.append(links);for(const [key,title] of [['voices','Голоса'],['overview','Источники и оригиналы']]){const link=el('a',title);link.href='#dynamic/'+key;link.dataset.radioTab=key;link.onclick=e=>{e.preventDefault();this.stopPlayback();this.tab=key;this.render();};links.append(link);}
  const fields=el('div',undefined,'radio-fields');main.append(fields);
  const labels={enabled:'Динамический эфир',channelCooldown:'Пауза канала',unitCooldown:'Пауза экипажа',squadCooldown:'Пауза группы',phraseRepeatSeconds:'Не повторять фразу, секунды',banterRepeatSeconds:'Не повторять шутку, секунды',maxQueuedDuration:'Максимальная длина очереди',maxQueue:'Максимум диалогов',maxPending:'Максимум агрегатов',maxHistory:'Размер памяти',humorLevel:'Доля юмора',banterRate:'Бытовой эфир (источник не подключён)',quietInCombat:'Тишина в бою',volume:'Громкость'};
  Object.assign(labels,{bawdyInterval:'Между подколами, секунды',urgentRepeatSeconds:'Не повторять срочный доклад, секунды',dispatchSeconds:'Выбор новостей, секунды',maxRoutineQueue:'Обычных докладов в очереди',maxRoutineTurns:'Реплик в обычном обмене',maxPacketSeconds:'Длина пачки, секунды'});
  const extra=el('details',undefined,'radio-extra'),advanced=el('div',undefined,'radio-fields');extra.append(el('summary','Очередь и технические ограничения'),advanced);main.append(extra);
  for(const [key,value] of Object.entries(this.document.settings)){if(typeof value!=='number'&&typeof value!=='boolean'||key==='banterRate')continue;this.field(['enabled','volume','humorLevel','quietInCombat','phraseRepeatSeconds','banterRepeatSeconds'].includes(key)?fields:advanced,labels[key]??key,value,v=>this.change(()=>this.document.settings[key]=v),{type:typeof value==='boolean'?'checkbox':'number',min:0});}
  this.field(advanced,'Каталог ситуаций',this.support,v=>{this.support=v;this.renderList();},{options:{wired:'Только подключённые к игре',all:'Все, включая заготовки'}});
  const maintenance=el('details',undefined,'radio-extra');maintenance.append(el('summary','Библиотека, условия и резервные копии'));main.append(maintenance);
  const editors=el('nav',undefined,'radio-settings-nav');maintenance.append(editors);for(const [key,title] of [['phrases','Все фразы и словари'],['graph','Редактор связей']]){const a=el('a',title);a.href='#dynamic/'+key;a.dataset.radioTab=key;a.onclick=e=>{e.preventDefault();this.tab=key;this.render();};editors.append(a);}
  main.append(el('p','Сохранение меняет черновик. Публикация применит его при следующем запуске игры. Временные голоса создаются локально; первое воспроизведение новой реплики может занять несколько секунд. Ваши записи имеют приоритет.','radio-note'));
  this.actions(maintenance,[['plus','Добавить новую ситуацию',()=>this.newRule()],
   ['download','Скачать ZIP с записями',async()=>{await this.save();location.href='/api/radio/export';}],['upload','Импорт JSON библиотеки',()=>{const input=el('input');input.type='file';input.accept='.json';input.onchange=async()=>{try{const value=JSON.parse(await input.files[0].text());const doc=value.document??value;validateLibrary(doc);this.change(()=>this.document=doc,true);}catch(e){this.error(e.message);}};input.click();}],
   ['restart','Показать версии для отката',async()=>{const result=await this.request('/history');const fields=el('div',undefined,'radio-fields');main.append(fields);let target=result.revisions.at(-1);this.field(fields,'Версия для отката',target,v=>target=Number(v),{options:result.revisions.map(String)});this.actions(fields,[['restart','Восстановить выбранный черновик',async()=>{const saved=await this.request('/rollback','POST',{revision:this.revision,targetRevision:target});this.document=saved.document;this.revision=saved.revision;this.dirty=false;this.render();}]]);}]]);
 }
}
