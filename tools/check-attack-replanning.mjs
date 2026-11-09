import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
const m=fixture(),unit=m.addUnit('bukhanka','rai',{x:0,y:0},{heading:0}),
 target=m.addStructure('camp-core','scavs',{x:0,y:600},{completed:true,progress:1,hp:100000});
m.rebuildNavigation();m.visible.fill(1);assert(m.order([unit.id],'attack',target).ok);
const attackPath=m.attackPathSteps;let replans=0;
m.attackPathSteps=function*(...args){replans++;return yield* attackPath.apply(this,args);};
for(let i=0;i<50;i++){m.advance(.1);m.effects=[];}
assert.equal(replans,0,'An unchanged attack route must not be recalculated every three seconds');
assert(unit.y>80,'The route is physically being driven');
target.x+=60;m.rebuildNavigation();m.advance(.1);
assert.equal(replans,1,'A materially moved target updates its approach');
assert.equal(unit.hp,unit.maxHp);
m.damage(target,100001);m.advance(.1);
assert(!unit.task&&!unit.path.length,'A destroyed target releases the obsolete approach');
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/attack-replanning.json',JSON.stringify({passed:true,stationaryTargetReplans:0,movedTargetReplans:replans}));
console.log(JSON.stringify({passed:true,replans}));
