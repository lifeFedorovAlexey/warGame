import assert from 'node:assert/strict';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleClearance} from '../campaign/vehicle-collision.js';
const m=fixture(),cars=[-6,6].map(x=>m.addUnit('bukhanka','rai',{x,y:0}));
for(const car of cars)assert(m.submitOrder([car.id],'move',{x:car.x,y:260}).ok);
let gap=Infinity,stops=0;
for(let i=0;i<300&&cars.some(u=>u.path.length||u.pendingOrder||u.task);i++){
 m.advance(.1);gap=Math.min(gap,vehicleClearance(cars[0],cars[1],m.config.worldScale,m.field));
 if(i>20&&cars.some(u=>u.path.length&&u.driveSpeed<.01))stops++;
}
assert(gap>0,'A fast accepted rollout must retain actual hull clearance');
for(const car of cars){assert(Math.abs(car.y-260)<2,'Both closely spaced vehicles reach their destinations');assert.equal(car.hp,car.maxHp);}
console.log(JSON.stringify({passed:true,minimumGap:gap,stoppedTicks:stops,simulationSeconds:m.state.time,projections:m.trafficCoordinator.stats.projections}));
