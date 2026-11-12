// Delivery time and importance are different: summaries keep their full window.
export const NOTIFICATIONS=['construction.complete','research.complete','factory.vehicle_complete',
 'factory.modernization_complete','repair.complete','repair.mobility_restored','construction.refused','construction.cancelled'];
export const ACK_RULES=['command.move','command.attack','command.attack_move','command.build','command.stop'];
export const DISPATCH_RULES=[...NOTIFICATIONS,...ACK_RULES,'combat.target_destroyed','combat.kill_confirmed','combat.kill_banter'];
export const promptDelivery=q=>q.delivery==='notification'||q.delivery==='reaction';
export const dispatchPriority=(q,now)=>q.delivery==='notification'&&now-q.createdAt>=6?Math.max(94,q.priority):q.priority;
export function upgradeDispatch(library,seed){
 const retired=new Set([...(library.settings.retiredTexts??[]),...(seed.settings.retiredTexts??[])]);
 library.settings.retiredTexts=[...retired].sort();
 const ids=new Set(Object.values(library.phrases).filter(p=>retired.has(p.text)).map(p=>p.id));
 for(const id of ids)library.phrases[id].archived=true;
 for(const rule of library.rules)for(const tier of rule.tiers)tier.graphs=tier.graphs.filter(g=>!g.nodes.some(n=>ids.has(n.phraseId)));
 if((library.settings.dispatchRevision??0)>=1)return library;
 for(const rule of seed.rules.filter(r=>DISPATCH_RULES.includes(r.id))){
  const index=library.rules.findIndex(r=>r.id===rule.id),current=library.rules[index];
  if(current&&ACK_RULES.includes(rule.id)){
   for(const t of current.tiers)for(const g of rule.tiers.find(s=>s.id===t.id)?.graphs??[]){
    if(!g.id.includes('.ack-plus-')||t.graphs.some(old=>old.id===g.id))continue;
    t.graphs.push(structuredClone(g));for(const n of g.nodes)library.phrases[n.phraseId]=structuredClone(seed.phrases[n.phraseId]);
   }
   continue;
  }
  if(current&&NOTIFICATIONS.includes(rule.id)){
   for(const field of ['delivery','priority','windowSimSeconds','cooldown'])current[field]=rule[field];
   continue;
  }
  const replacement=structuredClone(rule);if(current)replacement.enabled=current.enabled;
  if(index<0)library.rules.push(replacement);else library.rules[index]=replacement;
  for(const t of rule.tiers)for(const g of t.graphs)for(const n of g.nodes)library.phrases[n.phraseId]=structuredClone(seed.phrases[n.phraseId]);
 }
 library.settings.dispatchRevision=1;return library;
}
