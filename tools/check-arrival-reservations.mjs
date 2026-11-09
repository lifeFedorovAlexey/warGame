import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';

// Opposing files receive separate real clicks. Each rear car's destination
// lies near a departing front car. That transient body is not a parking claim.
const m=progressMission(),orders=[];
for(let i=0;i<5;i++)for(let axis=0;axis<4;axis++){
 const angle=axis*Math.PI/2,dx=Math.cos(angle),dy=Math.sin(angle),goal={x:(180+(5-i)*30)*dx,y:(180+(5-i)*30)*dy};
 const unit=m.addUnit('bukhanka','rai',{x:-(80+i*30)*dx,y:-(80+i*30)*dy},{heading:Math.atan2(-dx,dy)});
 assert(m.submitOrder([unit.id],'move',goal).ok);orders.push({unit,goal});
}
for(let i=0;i<2000&&orders.some(({unit})=>unit.pendingOrder);i++)m.commandPlanner.advance(5);
for(const {unit,goal} of orders){
 assert(!unit.pendingOrder);
 assert.deepEqual(unit.routeOrder.destination,goal,'An unoccupied future destination must not move because another commanded car is currently passing through it');
}
// Stop revokes departure. The same occupied coordinate must now stay reserved.
const stopped=progressMission(),parked=stopped.addUnit('bukhanka','rai',{x:0,y:100}),requester=stopped.addUnit('bukhanka','rai',{x:0,y:0});
stopped.submitOrder([parked.id],'move',{x:0,y:200});stopped.stop([parked.id]);
stopped.submitOrder([requester.id],'move',{x:0,y:100});
for(let i=0;i<1000&&requester.pendingOrder;i++)stopped.commandPlanner.advance(5);
assert(requester.routeOrder&&Math.hypot(requester.routeOrder.destination.x,requester.routeOrder.destination.y-100)>10,
 'A stopped body still occupies its parking space');
console.log(JSON.stringify({passed:true,exactIndividualDestinations:orders.length,stoppedSpaceReserved:true}));
