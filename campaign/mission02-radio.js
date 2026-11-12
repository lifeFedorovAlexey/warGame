export function appendM02Story(story,addition){
 return {...story,scenes:[...story.scenes,...addition.scenes],dialogue:[...story.dialogue,...addition.dialogue]};
}
export function m02RadioRules(director){
 const mission=director.mission,s=mission.state,m=s.m02,bases=Object.values(m.bases),o=m.observer;
 const bunkers=m.entranceIds.slice(0,2).filter(id=>mission.entity(id)).length;
 const running=s.status==='running',rules={};
 const add=(id,trigger,valid=true,priority=1)=>rules['m02-radio-'+id]={trigger,valid,priority,gap:12};
 // The record is created on first selection and survives combat/save pauses.
 // Ninety seconds limits a late start, never the remaining part of a briefing.
 add('start',true,running&&(s.time-m.startedAt<90||!!director.data.scenes['m02-radio-start']));
 add('entrance',m.entranceSeen,running&&bunkers===2,0);
 add('entrance-changed',m.entranceSeen,running&&bunkers===1&&!director.finished('m02-radio-entrance-clear'),0);
 add('entrance-clear',m.entranceSeen,running&&bunkers===0,1);
 add('factory-working',bases.some(b=>b.productionObserved),running&&bases.some(b=>b.productionObserved&&mission.entity(b.factoryId)),0);
 add('factory-destroyed',bases.some(b=>!b.inheritedFrom&&b.production?.stopped),running);
 add('flamer-ready',s.research['flamer-upgrade'],true,2);
 add('twin-ready',s.research['twin-machinegun'],true,2);
 add('sensor-ready',s.research.sensor,true,2);
 add('observer-seen',o.seen,running&&!o.outcome,0);
 add('observer-escaped',o.outcome==='escaped',o.outcome==='escaped',0);
 add('observer-destroyed',o.outcome==='intercepted',o.outcome==='intercepted',0);
 add('energy-source',m.energyFound,running&&!!mission.entity(m.bases.energy_hub.artifact.carrierId),0);
 add('power-recovered',m.bases.energy_hub.artifact.state==='collected',!s.research['power-module']);
 add('power-researched',s.research['power-module'],true,2);
 add('victory',s.status==='victory',s.status==='victory',0);
 return rules;
}
