export function m03RadioRules(director){
 const m=director.mission,s=m.state,e=s.m03,f=e.events,t=s.transport,rules={},running=s.status==='running';
 const add=(id,trigger,valid=true,priority=1)=>rules['m03-'+id]={trigger,valid,priority,gap:10};
 add('s01',f.briefing,e.location==='home'&&e.phase==='preparation');
 add('s02',f.transportReady,e.location==='home'&&e.phase==='preparation');
 add('s03',f.loading,e.location==='home'&&e.phase==='preparation');
 add('s04',t?.manifest.length&&!t.queue.length&&t.manifest.every(c=>c.phase==='aboard'),e.location==='home'&&e.phase==='preparation');
 add('s05',f.landing,e.location==='expedition');
 add('s06',f.contact,e.location==='expedition');
 const tower=m.entity('m03-flame-tower');
 add('s07',f.warehouse,e.location==='expedition'&&tower?.hp>0);
 add('s07-clear',f.warehouse,e.location==='expedition'&&!(tower?.hp>0)&&!director.finished('m03-s07'));
 add('s08',f.technology,e.location==='expedition');
 add('s09',f.strangeFind,e.location==='expedition');
 add('s10',f.evacuation,e.location==='expedition');
 add('s11',f.returned,e.location==='home'&&e.phase!=='preparation',0);
 const losses=e.losses.length+e.leftBehind.length;
 add('s12',f.researchComplete,e.location==='home'&&!losses);
 add('s12-losses',f.researchComplete,e.location==='home'&&losses>0);
 add('five-minutes',f.fiveMinutes,e.location==='expedition'&&e.remaining>60&&running,0);
 add('one-minute',f.oneMinute,e.location==='expedition'&&e.remaining>0&&running,0);
 return rules;
}
