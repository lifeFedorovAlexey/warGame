// Traffic physics uses the same rules on and off screen in every mission.
// Keep the existing public hook for diagnostics and frame-boundary callers.
export function createTrafficVisibility(){
 const stats={calls:0,frustumBuilds:0,bodyChecks:0,cacheHits:0};
 function update(mission){
  stats.calls++;
  for(const unit of mission.state.units){
   if(unit.trafficOnScreen===true){stats.cacheHits++;continue;}
   unit.trafficOnScreen=true;stats.bodyChecks++;
  }
 }
 return {update,stats};
}
