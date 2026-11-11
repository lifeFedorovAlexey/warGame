import assert from 'node:assert/strict';
import {createVehiclePresentation} from '../campaign/vehicle-presentation.js';
const sample=createVehiclePresentation(),unit={hp:100,x:10,y:0,previousX:0,previousY:0,heading:0,previousHeading:0,wheelDistance:10,previousWheelDistance:0};
const mission={config:{simulationStep:.1},accumulator:0,presentationRate:1,unitFrameTimes:new WeakMap([[unit,0]])};
assert.equal(sample(mission,unit,50).x,5);
// The controller starts and yields while its previous fields already changed.
unit.previousX=10;unit.previousWheelDistance=10;
assert.equal(sample(mission,unit,60).x,6,'Suspended physics cannot snap the rendered pose to its endpoint');
unit.x=20;unit.wheelDistance=20;mission.unitFrameTimes.set(unit,70);
assert.equal(sample(mission,unit,70).x,7,'An early publication is continuous');
let last=7;
for(let now=71;now<=170;now++){const p=sample(mission,unit,now);assert(p.x>=last&&p.x<=20);last=p.x;}
assert.equal(last,20);
unit.previousX=20;unit.x=30;mission.unitFrameTimes.set(unit,250);
assert.equal(sample(mission,unit,250).x,20);
assert(sample(mission,unit,350).x<30,'Late updates lengthen interpolation without extrapolation');
const before=structuredClone(unit);sample(mission,unit,500);assert.deepEqual(unit,before,'Rendering never edits physics');
unit.hp=0;assert.equal(sample(mission,unit,500).x,30);
unit.hp=100;mission.unitFrameTimes=new WeakMap();mission.accumulator=.04;unit.previousX=20;
assert.equal(sample(mission,unit,0).x,24,'Fixed-step and loaded worlds retain their accumulator phase');
console.log('PASS continuous vehicle presentation across suspended, early, late, dead and reloaded states');
