// Keep the terrain walls and physical sweeps, but reserve a person's width
// around buildings. The vehicle grid's 15-unit margin seals walkable alleys.
const navigators=new WeakMap(),contexts=new WeakMap();
export function infantryNavigator(source){
 const base=source.baseNavigator??source;let record=navigators.get(base);
 if(!record){
  const nav=base.createSearchContext();delete nav.baseNavigator;
  Object.assign(nav,{clearance:5,footprintCounts:new Uint16Array(base.size*base.size),staticFootprints:new Map(),
   regionVersions:new Map(),exhaustedReachability:new Map(),staticComponents:[],topologyRevision:0,topologyBounds:base.bounds.join(','),sharedCorridors:true});
  nav.occupied.fill(0);record={nav,revision:-1};navigators.set(base,record);
 }
 if(record.revision!==base.topologyRevision){
  record.nav.bounds=base.bounds;record.nav.rebuild(base.solids);record.revision=base.topologyRevision;
 }
 if(source===base)return record.nav;
 let context=contexts.get(source);
 if(!context){context=record.nav.createSearchContext();contexts.set(source,context);}
 context.refreshContext();return context;
}
