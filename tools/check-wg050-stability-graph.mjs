import assert from 'node:assert/strict';
import {createStabilityGraph} from '../campaign/stability-graph.js';
const lines=[],bars=[];
const ctx={setTransform(){},clearRect(){},strokeText(){},fillText(v){lines.push(v);},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(...a){bars.push(a);}};
let canvas;
globalThis.window={devicePixelRatio:1};
globalThis.document={body:{append(c){canvas=c;}},createElement(){return {style:{},setAttribute(){},getContext(){return ctx;},getBoundingClientRect(){return {width:260,height:108};}};}};
const graph=createStabilityGraph(),unit={hp:10,path:[{}]},times=new WeakMap();
const mission={state:{units:[unit]},unitFrameTimes:times};
let now=1000,frame=0;
function sample(delta=1000/60,options={}){
 now+=delta;frame++;times.set(unit,now-(options.age??95));
 graph.sample(now,{mission,running:true,speed:1,ticks:frame%6===0?1:0,step:.1,finishedAt:now,simulationMs:4,worldMs:3,otherMs:2,...options});
}
function run(seconds){for(let i=0;i<Math.round(seconds*60);i++)sample();}
function has(s){return lines.slice(-4).some(v=>v.includes(s));}
graph.sample(now,{});assert.equal(canvas,undefined);graph.toggle();sample();run(2);
assert(has('60 FPS'));assert(has('Игра 1.0× / 1×'));assert(has('Юниты 95 мс'));assert(bars.length);
// One bad frame, a CPU spike and a late unit must survive subsequent good frames.
sample(300,{simulationMs:42,age:500});run(.3);
assert(has('пик 15с 300 мс'));assert(has('сим 42.0'));assert(has('пик 15с 500 мс'));
run(13);assert(has('пик 15с 300 мс'));assert(has('сим 42.0'));assert(has('пик 15с 500 мс'));
run(3);assert(!has('пик 15с 300 мс'));assert(!has('сим 42.0'));assert(!has('пик 15с 500 мс'));
// A stalled simulation remains in the minimum after frame rate and time recover.
for(let i=0;i<180;i++)sample(1000/60,{ticks:0});
assert(has('60 FPS')&&has('Игра 0.0× / 1×'),'Stable FPS must not hide a stalled simulation');run(4);
assert(has('Игра 1.0× / 1×')&&has('мин 0.0×'),'Recovered simulation must retain its minimum: '+JSON.stringify(lines.slice(-4)));
for(let i=0;i<30;i++)sample(1000/60,{running:false});assert(has('Игра: пауза'));run(.3);
const paints=lines.length;graph.toggle();graph.sample(now+100,{});assert.equal(lines.length,paints);assert(canvas.hidden);
graph.toggle();sample();sample(2000);assert(has('0.5 FPS'));
console.log('PASS: peaks persist for 15 seconds then expire; simulation minimum, paused and disabled behavior');
