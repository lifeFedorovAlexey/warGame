import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
const events=[],emit=Mission.prototype.emit;
Mission.prototype.emit=function(type,data){
 if(type==='navigation-wait-cycle'||type==='navigation-stalled')events.push({type,data,time:this.state.time,
  units:structuredClone(this.state.units.filter(u=>data.units?.includes(u.id)||data.unit===u.id)),
  traffic:structuredClone(this.trafficCoordinator.statistics),state:structuredClone(this.state)});
 return emit.call(this,type,data);
};
let failure;
try{await import('./check-combat-sight.mjs');}catch(error){failure=error.message;}
fs.writeFileSync('campaign/reports/combat-wait-events.json',JSON.stringify({events,failure},null,2));
console.log(JSON.stringify({failure,events:events.map(e=>({time:e.time,type:e.type,data:e.data}))}));
