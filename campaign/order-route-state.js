import {expandCommandIds} from './group-command.js';
import {vehicleEnvelope} from './vehicle-collision.js';

const actions=new Set(['move','attack-move','attack','build','repair','demolish','upgrade-power']);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const pointKey=p=>p.action+':'+(p.targetId??[p.x.toFixed(1),p.y.toFixed(1)].join(','));

// Read intent, never infer completion from an empty geometric path: an
// attacking, blocked or repairing vehicle can be stationary on a live order.
function targetPoint(m,entities,action,target,state){
 if(!actions.has(action)||!target)return null;
 const id=target.targetId??target.id,entity=id&&entities.get(id);
 if(id&&!entity)return null;
 if(entity&&(action==='build'&&entity.completed||action==='repair'&&entity.hp>=entity.maxHp))return null;
 // An enemy's live position is not UI data until visible. Retain the known
 // position stored in the command instead of exposing movement through fog.
 const position=entity&&(entity.owner==='rai'||m.visibleAt(entity.x,entity.y))?entity:target;
 if(!finite(position))return null;
 const radius=entity&&action==='attack'?(entity.halfWidth!==undefined?Math.hypot(entity.halfWidth,entity.halfDepth):
  vehicleEnvelope(entity,m.config.worldScale??1,m.field).depth):undefined;
 return {action,x:position.x,y:position.y,state,...(id?{targetId:id}:{}),...(radius?{radius}: {})};
}
function arrivalPlacement(m,u){
 if(u.pendingOrder||u.combatRetreat||u.factoryVisit)return null;
 const deployment=u.combatDeployment,task=deployment?.resume??u.task;
 let goal,path=u.path??[];
 if(deployment?.goal){goal=deployment.goal;path=u.path??[];}
 else if(['move','attack-move'].includes(task?.type)&&!task.artifactId&&!task.salvageId){
  // A streamed route's frontier is not a parking slot. Wait for its tail.
  goal=u.routeContinuation?u.routeContinuation.destination:u.routeOrder?.destination??task;
 }else if(task?.type==='attack')goal=path.at(-1);
 if(!finite(goal))return null;
 const last=path.at(-1),previous=path.length>1?path.at(-2):u;
 const heading=Number.isFinite(goal.heading)?goal.heading:last&&Math.hypot(last.x-previous.x,last.y-previous.y)>.05
  ?Math.atan2(previous.x-last.x,last.y-previous.y):u.heading??0;
 const box=vehicleEnvelope(u,m.config.worldScale??1,m.field);
 return {unit:u.id,x:goal.x,y:goal.y,heading,width:box.width*2,depth:box.depth*2};
}
function unitRoute(m,entities,u){
 let active=null;
 const pending=u.proposedOrder??u.pendingOrder,task=u.combatDeployment?.resume??u.task;
 if(!u.combatRetreat&&!u.factoryVisit){
  if(pending)active=targetPoint(m,entities,pending.type,pending.target,pending.status==='blocked'?'blocked':'planning');
  else if(task){
   if(task.artifactId||task.salvageId){
    const item=(task.artifactId?m.state.artifacts:m.state.salvage?.items??[]).find(item=>item.id===(task.artifactId??task.salvageId)
     &&!item.collected&&(task.artifactId||item.expiresAt>m.state.time));
    if(item)active={action:'move',x:item.x,y:item.y,state:'active',targetId:item.id};
   }else{
    const destination=['move','attack-move'].includes(task.type)?u.routeOrder?.request??task:task;
    active=targetPoint(m,entities,task.type,destination,'active');
   }
  }
 }
 const points=active?[active]:[];
 for(const order of u.orderQueue??[]){
  let p;
  if(order.pickup){
   const item=(order.pickup==='artifact'?m.state.artifacts:m.state.salvage?.items??[]).find(item=>item.id===order.target.id
    &&!item.collected&&(order.pickup==='artifact'||item.expiresAt>m.state.time));
   if(item)p={action:'move',x:item.x,y:item.y,state:'queued',targetId:item.id};
  }else p=targetPoint(m,entities,order.action,order.target,'queued');
  if(p)points.push(p);
 }
 if(!points.length)return null;
 const placement=arrivalPlacement(m,u);
 return {unit:u.id,units:[u.id],points,placements:placement?[placement]:[]};
}

export function selectedOrderRoutes(m,selected){
 if(!selected.size)return [];
 const entities=new Map([...m.state.units,...m.state.buildings].filter(e=>e.hp>0).map(e=>[e.id,e]));
 const routes=new Map();
 for(const id of expandCommandIds(m,[...selected])){
  const u=entities.get(id);
  if(!u||u.owner!=='rai'||!m.config.units[u.kind]||['entering','inside','leaving'].includes(u.factoryVisit?.phase))continue;
  const route=unitRoute(m,entities,u);if(!route)continue;
  const key=route.points.map(p=>pointKey(p)+':'+p.state).join('|'),same=routes.get(key);
  if(same){same.units.push(id);same.placements.push(...route.placements);}else routes.set(key,route);
 }
 return [...routes.values()];
}
