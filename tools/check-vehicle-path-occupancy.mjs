import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {progressMission} from './check-navigation-public-progress.mjs';
const reference=process.env.OCCUPANCY_REFERENCE_SOURCE,fixture='tools/fixtures/vehicle-path-occupancy.json';
let method;
if(reference){
 const base=pathToFileURL(path.resolve('campaign/mission.js'));
 const source=fs.readFileSync(reference,'utf8').replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,base).href));
 const {Mission}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));method=Mission.prototype.vehiclePathSteps;
}
const cases=['parked','moving','avoid-moving','ignore-unit','hidden-enemies','escape-start','avoid-point','command-corridor'],expected=reference?{}:JSON.parse(fs.readFileSync(fixture,'utf8')),actual={},timings=[];
for(const name of cases){
 const m=progressMission(),unit=m.addUnit('bukhanka','rai',{x:0,y:0}),others=[];
 for(let i=0;i<60;i++)others.push(m.addUnit(['bukhanka','command','raider','scav-bus'][i%4],i%3?'rai':'scavs',{x:(i%10-5)*22,y:Math.floor(i/10)*25+30},{heading:i*.19}));
 if(name==='moving'||name==='avoid-moving')for(const u of others)u.path=[{x:u.x,y:u.y+100}];
 if(name==='escape-start'){unit.x=others[11].x;unit.y=others[11].y;}
 m.visibleAt=()=>name!=='hidden-enemies';
 if(name==='command-corridor')m.commandJob={};
 const options={fallback:false,...(name==='avoid-moving'?{avoidMoving:true}:{}),...(name==='ignore-unit'?{ignoreUnits:new Set(others.slice(0,20))}:{}),...(name==='avoid-point'?{avoidPoint:{x:100,y:100}}:{})};
 m.nav.occupied.fill(0);m.nav.occupied[0]=1;const original=m.nav.occupied.slice();let found=null;
 m.nav.findPathSteps=function*(){found={hash:createHash('sha256').update(this.occupied).digest('hex'),cells:this.occupied.reduce((a,b)=>a+b,0)};yield;return [{x:200,y:200}];};
 const iterator=(method??m.vehiclePathSteps).call(m,unit,{x:200,y:200},options);let result,yields=0,maxMs=0;
 do{m.nav.workDeadline=reference?Infinity:performance.now()+.5;const start=performance.now();result=iterator.next();maxMs=Math.max(maxMs,performance.now()-start);assert.deepEqual(m.nav.occupied,original,'No temporary occupancy may leak across a yield or completion');if(!result.done)yields++;}while(!result.done);
 assert.deepEqual(result.value,[{x:200,y:200}]);assert(found);actual[name]=found;timings.push({name,maxSliceMs:maxMs,yields});
 if(!reference)assert.deepEqual(found,expected[name],'Exact occupied cells must match the original geometry: '+name);
 if(!reference){m.nav.workDeadline=-Infinity;const cancelled=m.vehiclePathSteps(unit,{x:200,y:200},options);cancelled.next();cancelled.return();assert.deepEqual(m.nav.occupied,original);}
}
if(reference)fs.writeFileSync(fixture,JSON.stringify(actual,null,2));
else assert(timings.some(t=>t.yields>1),'Preparation must yield before the path search');
const report={passed:true,reference:!!reference,cases:actual,timings};fs.mkdirSync('campaign/previews/playtest-WG-046/checks',{recursive:true});fs.writeFileSync('campaign/previews/playtest-WG-046/checks/occupancy'+(reference?'-before':'-after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
