import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
const reference=process.argv.includes('--reference');
if(reference){
  // Restore only the full-distance raster oracle, keeping every other path
  // rule identical. Compare the actual published occupancy bits at A* entry.
  const source=fs.readFileSync('campaign/mission.js','utf8')
    .replace('shape,exact?Infinity:padding)-padding','shape)-padding')
    .replace('const cacheable=startGap>=0;','const cacheable=false;');
  registerHooks({load(url,context,next){return url.endsWith('/campaign/mission.js')?{format:'module',source,shortCircuit:true}:next(url,context);}});
}
const {progressMission}=await import('./check-navigation-public-progress.mjs');
const {collisionStatistics}=await import('../campaign/vehicle-collision.js');
const m=progressMission(),blocker=m.addUnit('scav-bus','rai',{x:0,y:0}),u=m.addUnit('bukhanka','rai',{x:60,y:0});
let mask;m.nav.findPathSteps=function*(from,to){mask=[];for(let i=0;i<this.occupied.length;i++)if(this.occupied[i])mask.push(i);return [{x:to.x,y:to.y}];};
const masks=[];
for(const kind of ['bukhanka','scav-bus','scav-firetruck'])for(const angle of [0,.4,Math.PI/2])for(const start of [{x:60,y:0},{x:5,y:0},{x:0,y:20},{x:17,y:17}]){
  blocker.kind=kind;blocker.heading=angle;Object.assign(u,start);u.path=[];u.task=null;
  m.vehiclePath(u,{x:150,y:150},{obstacles:[blocker],fallback:false});
  masks.push({kind,angle,start,mask});assert.equal(m.nav.occupied.reduce((a,b)=>a+b,0),0,'Temporary body cells must not leak out of a search');
}
const result={masks,penetrationQueries:collisionStatistics.penetrationQueries};
if(reference)console.log(JSON.stringify(result));
else{
  const oracle=JSON.parse(execFileSync(process.execPath,[import.meta.filename,'--reference'],{encoding:'utf8'}));
  assert.deepEqual(masks,oracle.masks,'Threshold proofs must publish exactly the full-distance body mask, including embedded starts');
  assert(result.penetrationQueries<oracle.penetrationQueries);
  console.log(JSON.stringify({passed:masks.length,exactPenetrations:oracle.penetrationQueries,thresholdPenetrations:result.penetrationQueries}));
}
