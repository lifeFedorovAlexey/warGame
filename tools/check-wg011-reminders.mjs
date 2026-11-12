import assert from 'node:assert/strict';import fs from 'node:fs';
import {MinimapAlerts} from '../campaign/minimap-alerts.js';
const m={state:{status:'running',artifacts:[{id:'sample',key:'tech',x:600,y:200},{id:'secret',key:'secret',x:1800,y:200}],buildings:[],units:[],camps:[{id:'a',x:100,y:200},{id:'b',x:350,y:200},{id:'hidden',x:1800,y:200}]},config:{},inBounds:(x)=>x<2000,exploredAt:(x)=>x<1000,entity:()=>null};
const tasks=[{id:'security',name:'Уничтожить лагеря',progress:'0/3'}],messages=[],a=new MinimapAlerts(t=>messages.push(t),m),checks=[];
let now=0;const tick=(seconds,options={})=>{for(let i=0;i<seconds*4;i++){now+=250;a.observe(m,tasks,now,options);}};
a.observe(m,tasks,now);assert.deepEqual(a.pings.map(p=>p.kind),['artifact','enemyObjective','enemyObjective']);
tick(4);assert.equal(a.active(now).length,0);tick(25);assert.equal(a.active(now).length,0);tick(1);
assert.equal(a.active(now).filter(p=>p.reminder).length,3);assert(!a.pings.some(p=>p.x>=1000));
const notices=messages.length;tick(30);assert.equal(a.active(now).filter(p=>p.reminder).length,3);assert.equal(messages.length,notices,'Reminders do not repeat toasts or dialogue');
checks.push('two known hostile bases red, uncollected artifact blue, hidden sites excluded, thirty-second repeats without messages');
m.state.camps[0].cleared=true;m.state.artifacts[0].collected=true;now++;a.observe(m,tasks,now);
assert.deepEqual(a.active(now).map(p=>p.objectiveKey),['camp:b'],'Completed sites disappear while a pulse is active');
tick(4);tick(60,{paused:true});assert.equal(a.active(now).length,0);tick(25);assert.equal(a.active(now).length,0);tick(1);assert.equal(a.active(now).length,1);
checks.push('completion removes active marks, progress restarts the delay, pause freezes reminder time');
a.event({type:'under-attack',target:'ally',x:750,y:500},now);assert(a.active(now).every(p=>p.kind==='attack'),'Attack interrupts routine reminders');
for(let i=0;i<140;i++){now+=250;a.event({type:'under-attack',x:750,y:500},now);a.observe(m,tasks,now);assert(a.active(now).every(p=>p.kind==='attack'));}
tick(4);assert(a.active(now).some(p=>p.kind==='enemyObjective'));
checks.push('live fire takes priority; reminders resume after combat alerts expire');
const copy={...m,state:structuredClone(m.state)};a.reset(true);a.observe(copy,tasks,now+1);assert.equal(a.pings.length,0);
copy.state.status='victory';a.observe(copy,tasks,now+2);assert.equal(a.pings.length,0);checks.push('loading is silent and mission results clear transient reminders');
{
 const mission={...m,state:{...m.state,status:'running',artifacts:[],m02:{bases:{open:{id:'east',discovered:true,state:'defended',gate:{x:100,y:100}},hidden:{id:'west',discovered:false,state:'defended',gate:{x:600,y:100}},done:{id:'hill',discovered:true,state:'neutralized',gate:{x:300,y:100}}}}}};
 const alerts=new MinimapAlerts(()=>{},mission);alerts.observe(mission,[{id:'m02.suppress_outposts',name:'Подавить опорные пункты'},{id:'m02.intercept_observer',name:'Наблюдатель ушёл',done:true}],0);
 assert.deepEqual(alerts.pings.map(p=>p.objectiveKey),['camp:east']);checks.push('M02 discovered active bases only; neutralized bases and completed tasks stay silent');
}
{
 const alerts=new MinimapAlerts(()=>{},m);for(let i=0;i<16;i++)alerts.event({type:'under-attack',x:i*200,y:1000},0);
 alerts.ping('enemyObjective',{x:100,y:100},1);assert.equal(alerts.pings.filter(p=>p.kind==='attack').length,16);checks.push('objective reminders cannot evict sixteen active attack alerts');
}
{
 const mission={...m,state:{...m.state,status:'running',artifacts:[],m03:{location:'expedition',phase:'extraction',artifact:{state:'carried'}},transport:{site:{x:400,y:400}}}};
 const alerts=new MinimapAlerts(()=>{},mission);
 for(let sec=0;sec<=30;sec++)alerts.observe(mission,[{id:'m03-objective',name:'Вернуться к месту посадки',progress:'14:'+String(59-sec).padStart(2,'0')}],sec*1000);
 assert(alerts.pings.some(p=>p.reminder&&p.x===400),'Mission countdown is not objective progress and must not suppress evacuation reminders');
 checks.push('expedition countdown keeps reminders active at the known evacuation site');
}
fs.mkdirSync('docs/playtest-evidence/wg011',{recursive:true});fs.writeFileSync('docs/playtest-evidence/wg011/reminders.json',JSON.stringify({checks},null,2));console.log(JSON.stringify({checks}));
