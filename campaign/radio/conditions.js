// A deliberately small, typed data language. No executable editor expressions.
export const METRICS=['rawEventCount','uniqueActorCount','affectedUnitCount','uniqueAffectedUnitCount','uniqueTargetCount','uniqueObjectCount','distinctOrderCount','incidentCount','concurrentCount','rollingCount','destroyedVehicleCount','woundedCrewCount','killedCrewCount','evacuatedCount','producedUnitCount','completedResearchCount','uniqueObjectiveCount','completedCount','failedCount','severity','durationSimSeconds','historicalFrequency','successRate','coverageRatio'];
const ops=new Set(['eq','ne','gt','gte','lt','lte','in','known']);
METRICS.push('knownEnemyCount','knownAttackerCount','machinegunSourceCount','flamethrowerSourceCount','towerSourceCount');
export function validateCondition(node,depth=0){
 if(!node||typeof node!=='object'||depth>12)throw Error('Некорректное условие');
 for(const key of ['all','any'])if(key in node){if(!Array.isArray(node[key])||node[key].length>32)throw Error('Слишком сложное условие');node[key].forEach(n=>validateCondition(n,depth+1));return;}
 if('not' in node){validateCondition(node.not,depth+1);return;}
 if(!ops.has(node.op)||!(METRICS.includes(node.field)||['resolution','firstOccurrence','combatContext'].includes(node.field)||/^facts\.[a-zA-Z][a-zA-Z0-9_]*$/.test(node.field)))throw Error('Неизвестное поле или оператор');
 if(['gt','gte','lt','lte'].includes(node.op)&&!Number.isFinite(node.value))throw Error('Ожидался числовой порог');
 if(node.op==='in'&&(!Array.isArray(node.value)||node.value.length>64))throw Error('Ожидался список значений');
}
export function compileCondition(node={all:[]}){
 validateCondition(node);
 if(node.all){const parts=node.all.map(compileCondition);return c=>parts.every(f=>f(c));}
 if(node.any){const parts=node.any.map(compileCondition);return c=>parts.some(f=>f(c));}
 if(node.not){const f=compileCondition(node.not);return c=>!f(c);}
 return context=>{
  const actual=node.field.startsWith('facts.')?context.facts?.[node.field.slice(6)]:context[node.field],v=node.value;
  if(node.op==='known')return actual!==undefined&&actual!==null;
  if(actual===undefined||actual===null)return false;
  switch(node.op){case 'eq':return actual===v;case 'ne':return actual!==v;case 'in':return v.includes(actual);
   case 'gt':return typeof actual==='number'&&actual>v;case 'gte':return typeof actual==='number'&&actual>=v;
   case 'lt':return typeof actual==='number'&&actual<v;case 'lte':return typeof actual==='number'&&actual<=v;default:return false;}
 };
}
export function russianCount(count,forms){const n=Math.abs(count)%100;return `${count} ${forms[n>=11&&n<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2]}`;}
// Give speech synthesis the inflected words, not a digit whose gender it must guess.
const numeralGenders=new Set(['masculine','feminine','feminineAccusative','neuter']);
const ones=['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
const teens=['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
const tens=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
const hundreds=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
function numberGroup(value,gender){
 const result=[],last=value%100;if(value>=100)result.push(hundreds[Math.floor(value/100)]);
 if(last>=10&&last<20)result.push(teens[last-10]);
 else{if(last>=20)result.push(tens[Math.floor(last/10)]);const one=last%10;
  if(one)result.push(one===1?({feminine:'одна',feminineAccusative:'одну',neuter:'одно'}[gender]??'один'):one===2&&gender.startsWith('feminine')?'две':ones[one]);}
 return result.join(' ');
}
export function russianNumber(value,gender='masculine'){
 if(!Number.isSafeInteger(value)||value<0||value>999999999||!numeralGenders.has(gender))return null;
 if(value===0)return 'ноль';
 const parts=[];
 const thousand=gender==='feminineAccusative'?['тысячу','тысячи','тысяч']:['тысяча','тысячи','тысяч'];
 for(const [base,forms,g] of [[1000000,['миллион','миллиона','миллионов'],'masculine'],[1000,thousand,gender==='feminineAccusative'?'feminineAccusative':'feminine']]){
  const group=Math.floor(value/base);value%=base;
  if(group)parts.push(russianCount(group,forms).replace(/^\d+/,numberGroup(group,g)));
 }
 if(value)parts.push(numberGroup(value,gender));return parts.join(' ');
}
export function realize(text,context,dictionaries){
 let missing=false;
 const output=text.replace(/\{([\w.]+)(?::(\w+))?\}/g,(_,field,form,offset)=>{
  const value=field.startsWith('facts.')?context.facts[field.slice(6)]:context[field];
  if(value==null||typeof value==='object'){missing=true;return '';}
  if(form){const forms=dictionaries.morphology[form];if(!forms||!Number.isInteger(value)||value<0){missing=true;return '';}
   const gender=dictionaries.spokenCounts?.[form];let phrase=russianCount(value,forms);
   if(gender){const words=russianNumber(value,gender);if(words===null){missing=true;return '';}
    phrase=phrase.replace(/^\d+/,words);const prefix=text.slice(0,offset).trimEnd();
    if(!prefix||/[.!?…]$/.test(prefix))phrase=phrase[0].toLocaleUpperCase('ru')+phrase.slice(1);}
   return phrase;}
  return String(value);
 });
 return missing?null:output;
}
export function stableHash(value){let n=2166136261;for(const ch of String(value)){n^=ch.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
export function validateLibrary(library){
 if(library?.schemaVersion!==1||!Array.isArray(library.rules)||library.rules.length>2000||!library.phrases||!Array.isArray(library.characters))throw Error('Неверный формат библиотеки');
 const ids=new Set();
 for(const rule of library.rules){
  if(!/^[\w.:-]+$/.test(rule.id)||ids.has(rule.id))throw Error('Повторяющийся ID ситуации');ids.add(rule.id);
  if(!METRICS.includes(rule.countMetric)||!['wired','derivable','unavailable'].includes(rule.support))throw Error('Неверный счётчик или статус');
  if(!['order','incident','squad','global'].includes(rule.scope)||!Array.isArray(rule.roles)||!rule.roles.length||rule.roles.some(r=>!['driver','builder','commander','radio','scout','technician','warrant'].includes(r)))throw Error('Неверная область агрегации или роли');
  for(const [key,min,max] of [['windowSimSeconds',0,60],['cooldown',0,600],['expiresAfter',1,600],['priority',0,100]])if(!Number.isFinite(rule[key])||rule[key]<min||rule[key]>max)throw Error('Неверное значение '+key);
  validateCondition(rule.preconditions);
  if(!Array.isArray(rule.tiers)||!rule.tiers.length||rule.tiers.length>20)throw Error('Нужны пороги');
  const minima=new Set();
  for(const tier of rule.tiers){
   if(!Number.isFinite(tier.min)||tier.min<0||minima.has(tier.min))throw Error('Неверный или повторяющийся порог');minima.add(tier.min);
   if(!Array.isArray(tier.graphs)||tier.graphs.length>64)throw Error('Неверные варианты');
   for(const graph of tier.graphs){
    if(!graph.id||!Number.isFinite(graph.weight)||graph.weight<=0||!Array.isArray(graph.nodes)||!graph.nodes.length||graph.nodes.length>6)throw Error('Неверный граф');
    if(graph.requires)validateCondition(graph.requires);
    if(graph.chance!=null&&(!Number.isFinite(graph.chance)||graph.chance<0||graph.chance>1))throw Error('Неверная частота личного разговора');
    for(const flag of ['personal','remembrance','bawdy'])if(graph[flag]!=null&&typeof graph[flag]!=='boolean')throw Error('Неверный признак личного разговора');
    let question=null;
    for(const node of graph.nodes){
     if(node.speakerSlot!=null&&(!Number.isInteger(node.speakerSlot)||node.speakerSlot<0||node.speakerSlot>5))throw Error('Неверный участник разговора');
     if(node.affectedSpeaker!=null&&typeof node.affectedSpeaker!=='boolean')throw Error('Неверная привязка участника к событию');
     if(node.speakerFact!=null&&!['newcomerId','mentorId','panickedId','bumpedId','witnessId'].includes(node.speakerFact))throw Error('Неизвестная роль участника личной истории');
     const phrase=library.phrases[node.phraseId];if(!phrase||phrase.archived)throw Error('Неизвестная/архивная реплика '+node.phraseId);
     if(phrase.kind==='question'){if(!phrase.fact)throw Error('Вопросу нужен тип факта');question=phrase.fact;}
     else if(question){if(phrase.kind!=='answer'||phrase.fact!==question)throw Error('Ответ не соответствует вопросу');question=null;}
    }
    if(question)throw Error('Вопрос без ответа');
   }
  }
 }
 for(const [id,phrase] of Object.entries(library.phrases)){
  if(phrase.femaleText!=null&&(typeof phrase.femaleText!=='string'||phrase.femaleText.length>4000))throw Error('Неверная женская форма реплики');
  if(phrase.femaleTextBase!=null&&(typeof phrase.femaleTextBase!=='string'||phrase.femaleTextBase.length>4000))throw Error('Неверный исходный текст женской формы');
  if(phrase.speakerGender!=null&&!['f','m'].includes(phrase.speakerGender))throw Error('Неверный голос участника');
  if(phrase.id!==id||typeof phrase.text!=='string'||phrase.text.length>4000)throw Error('Неверная реплика');
  if(!['report','question','answer','ack','clarify','order','dry_joke','close','overradio'].includes(phrase.kind))throw Error('Неизвестный смысловой блок');
  if(phrase.requires)validateCondition(phrase.requires);
  if(!Number.isFinite(phrase.pauseAfter)||phrase.pauseAfter<.06||phrase.pauseAfter>2)throw Error('Некорректная пауза');
 }
 if(library.characters.length>10)throw Error('Дополнительных голосов должно быть не более 10');
 const characterIds=new Set(),voices=new Set();
 for(const c of library.characters){if(!c.id||characterIds.has(c.id)||!c.voiceId||voices.has(c.voiceId))throw Error('Повторяющийся персонаж или голос');characterIds.add(c.id);voices.add(c.voiceId);}
 if(!library.dictionaries?.morphology||typeof library.settings!=='object')throw Error('Нужны словари и настройки');
 if(library.dictionaries.radioOpenings&&(!Array.isArray(library.dictionaries.radioOpenings)||!library.dictionaries.radioOpenings.length||library.dictionaries.radioOpenings.some(s=>typeof s!=='string'||!s.includes('{body}')||!s.includes('{speakerCallSign}'))))throw Error('Обращению нужны позывной говорящего и полная реплика');
 for(const key of ['phraseRepeatSeconds','banterRepeatSeconds','urgentRepeatSeconds'])if(library.settings[key]!=null&&(!Number.isFinite(library.settings[key])||library.settings[key]<15||library.settings[key]>600))throw Error('Неверный интервал защиты от повтора');
 if(library.settings.bawdyInterval!=null&&(!Number.isFinite(library.settings.bawdyInterval)||library.settings.bawdyInterval<90||library.settings.bawdyInterval>600))throw Error('Неверный интервал подколов');
 for(const [key,min,max] of [['dispatchSeconds',1,10],['maxRoutineQueue',1,12],['maxRoutineTurns',1,4],['maxPacketSeconds',3,30]])if(library.settings[key]!=null&&(!Number.isFinite(library.settings[key])||library.settings[key]<min||library.settings[key]>max))throw Error('Неверная настройка диспетчера '+key);
 for(const forms of Object.values(library.dictionaries.morphology))if(!Array.isArray(forms)||forms.length!==3||forms.some(v=>typeof v!=='string'))throw Error('Нужны три словоформы');
 if(library.dictionaries.spokenCounts)for(const [form,gender] of Object.entries(library.dictionaries.spokenCounts))if(!library.dictionaries.morphology[form]||!numeralGenders.has(gender))throw Error('Неизвестная форма числительного');
 for(const [key,min,max] of [['maxQueue',1,100],['maxPending',1,1024],['maxHistory',16,4096],['maxQueuedDuration',3,180],['channelCooldown',0,60],['unitCooldown',0,600],['squadCooldown',0,600],['volume',0,1],['humorLevel',0,1]]){
  if(!Number.isFinite(library.settings[key])||library.settings[key]<min||library.settings[key]>max)throw Error('Неверная настройка '+key);
 }
 return library;
}
