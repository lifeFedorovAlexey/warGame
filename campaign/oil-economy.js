// The energy/energyRate save fields remain compatible with existing campaigns;
// they represent the stored oil balance and net flow, not electricity.
export function oilPowerStatus(state, config) {
  const ready = state.buildings.filter(b => b.owner === 'rai' && b.hp > 0 && b.completed);
  const stations = ready.filter(b => b.kind === 'generator');
  const wells = ready.filter(b => b.kind === 'derrick').length;
  const perStation = config.buildings.generator.oilSlots ?? 4;
  const capacity = stations.length * perStation;
  return {stations:stations.length, wells, capacity, connected:Math.min(wells,capacity), unpowered:Math.max(0,wells-capacity), perStation};
}

// Missing funding means an older, already paid order. Never charge it twice.
export function oilFundingRemaining(order) {
  return order?.funding ? Math.max(0,(order.cost??0)-order.funding.paid) : 0;
}
function oilOrders(state, activeOnly=false) {
  const orders=[];
  for(const b of state.buildings){
    if(b.owner!=='rai'||b.hp<=0)continue;
    if(!b.completed)orders.push(b);
    if(b.completed||!activeOnly){
      orders.push(...(activeOnly?(b.productionPaused?[]:b.queue.slice(0,1)):b.queue));
      if(b.research)orders.push(b.research);
    }
  }
  return orders;
}
export function oilReserved(state) {
  return oilOrders(state).reduce((sum,order)=>sum+oilFundingRemaining(order),0);
}
export function availableOil(state) {
  return Math.max(0,state.energy-oilReserved(state));
}
export function oilRefund(order) {
  return (order.funding?.paid??order.cost??0)*(1-Math.max(0,Math.min(1,order.progress??0)));
}
export function spendOil(mission,amount,{reserved=false}={}) {
  const state=mission.state,paid=Math.min(Math.max(0,amount),reserved?Math.max(0,state.energy):availableOil(state));
  state.energy=Math.max(0,state.energy-paid);
  mission.oilSpent=(mission.oilSpent??0)+paid;
  return paid;
}
export function beginOilFlow(mission,income,dt) {
  const state=mission.state;
  state.oilIncomeRate=income;
  if(dt>0){
    // Allow this tick's extraction to pay orders before applying storage capacity.
    state.energy+=income*dt;
  }
  state.energyRate=income-(state.oilExpenseRate??0);
}
export function finishOilFlow(mission,dt) {
  const state=mission.state;
  if(dt>0){state.oilExpenseRate=(mission.oilSpent??0)/dt;mission.oilSpent=0;}
  state.energyRate=(state.oilIncomeRate??0)-(state.oilExpenseRate??0);
  state.energy=Math.min(mission.config.energyCapacity,state.energy);
}
export function transferOil(mission,dt) {
  const rate=mission.config.oilTransferPerSecond??25,requests=[];
  mission.oilWorkTime=new WeakMap();
  for(const order of oilOrders(mission.state,true)){
    const remaining=oilFundingRemaining(order);
    if(remaining>1e-8)requests.push({order,remaining,amount:Math.min(remaining,rate*dt)});
  }
  const requested=requests.reduce((sum,item)=>sum+item.amount,0);
  const share=requested>0?Math.min(1,mission.state.energy/requested):0;
  for(const {order,remaining,amount} of requests){
    const paid=spendOil(mission,amount*share,{reserved:true});
    order.funding.paid=Math.min(order.cost,order.funding.paid+paid);
    const ready=oilFundingRemaining(order)<1e-8;
    if(ready)order.funding.paid=order.cost;
    mission.oilWorkTime.set(order,ready?Math.max(0,dt-remaining/rate):0);
  }
}
export function fundedWorkTime(mission,order,dt) {
  return oilFundingRemaining(order)>1e-8?0:Math.min(dt,mission.oilWorkTime?.get(order)??dt);
}
export function repairWithOil(mission,target,dt,hpPerSecond=40,oilPerSecond=1.5) {
  const seconds=Math.min(dt,Math.max(0,target.maxHp-target.hp)/hpPerSecond);
  const paid=spendOil(mission,seconds*oilPerSecond);
  const repaired=oilPerSecond>0?paid/oilPerSecond:seconds;
  target.hp=Math.min(target.maxHp,target.hp+repaired*hpPerSecond);
  return repaired>0;
}
export function oilOrderProgress(order,seconds,config) {
  const rate=config.oilTransferPerSecond??25,funding=oilFundingRemaining(order);
  const transfer=order.funding?(order.cost??0)/rate:0;
  const work=Math.max(0,Math.min(1,order.progress??0));
  return {funding,progress:transfer?(transfer-funding/rate+work*seconds)/(transfer+seconds):work,remaining:funding/rate+(1-work)*seconds};
}
