import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {runMapSample} from './check-navigation-map-samples.mjs';

// Instrumented discovery only; capture overhead is not a performance result.
// Captures complete tick boundaries, preserving all original map bodies.
const seed=Number(process.argv[2]??20261111),firstBlock=process.argv.includes('--first-block'),root='tools/fixtures/navigation-map-samples/navigation-only-2026-11-07T22-45-44-093Z-79443d1f0df3';
const replay=JSON.parse(fs.readFileSync(`${root}/seed-${seed}-n6.json`)),captures=[],seen=new Set(),tick=Mission.prototype.continueTick;
Mission.prototype.continueTick=function(...args){
 const result=tick.apply(this,args);
 if(result&&!this.pendingTick)for(const unit of this.state.units){
  if(!replay.ids.includes(unit.id))continue;
  const kind=firstBlock?(unit.detour?.blocked>0&&unit.detour.blocked<.11?'detour-blocked':unit.driveWatch?.blocked>0&&unit.driveWatch.blocked<.11?'recovery-delay':null)
   :unit.traffic?.phase==='parked'&&!unit.traffic.cycle?'parked'
   :unit.detour?.blocked>.5?'detour-blocked'
    :unit.driveWatch?.trafficWaitAt!==undefined?'clearing-wait'
     :unit.driveWatch?.blocked>.5?'recovery-delay':null;
  if(!kind)continue;
  const key=[unit.id,kind,unit.traffic?.since??unit.driveWatch?.trafficWaitAt??0,Math.floor(this.state.time*2)].join('|');
  if(seen.has(key)||captures.length>=160)continue;seen.add(key);
  captures.push({unitId:unit.id,kind,time:this.state.time,
   save:structuredClone({version:1,mission:this.config.id,serial:this.serial,randomState:this.randomState,
    accumulator:this.accumulator,fogTimer:this.fogTimer,state:this.state,explored:Array.from(this.explored)})});
 }
 return result;
};
const directory=`tools/fixtures/navigation-map-samples/hold-audit-${seed}-${Date.now()}`;
const result=runMapSample(seed,6,{replay,navigationOnly:true,directory});
fs.writeFileSync(`campaign/reports/map-holds-${seed}${firstBlock?'-first-block':''}.json`,JSON.stringify({config:replay.config,result,captures}));
console.log(JSON.stringify({seed,result:result.fixture,arrived:result.arrived,captures:captures.length,
 kinds:captures.reduce((sum,c)=>(sum[c.kind]=(sum[c.kind]??0)+1,sum),{})}));
