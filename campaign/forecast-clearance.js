import {envelopeClearance} from './vehicle-collision.js';

// Forecast shapes are immutable. Candidate controls often produce the same
// first pose (acceleration limits), or repeat a stationary hull for every step.
// Reuse those comparisons only within the current uninterrupted control slice.
export class ForecastClearance{
 constructor(forecasts,scale,stats={}){
  this.forecasts=forecasts;this.collision=scale*.055+.02;this.proof=scale*.8+.001;
  this.stats=stats;this.cache=new Map();
  const count=forecasts[0]?.shapes.length??0;
  this.frames=Array.from({length:count},(_,i)=>forecasts.every(f=>f.shapes[i]===f.shapes[0])?0:i);
 }
 clear(){this.cache.clear();}
 query(shape,step,cacheable=false){
  const frame=this.frames[step]??step,row=cacheable&&this.cache.get(shape),cached=row&&row[frame];
  if(cached){this.stats.forecastClearanceHits=(this.stats.forecastClearanceHits??0)+1;return cached;}
  let clearance=Infinity,blocker=null;
  for(const forecast of this.forecasts){
   const other=forecast.shapes[step],dx=other.x-shape.x,dy=other.y-shape.y;
   // If even the enclosing circles are farther apart than the current
   // minimum, this pair cannot change the score or be a collision. Preserve
   // neighbour order so the first actual blocker remains exactly the same.
   const radius=shape.boundingRadius+other.boundingRadius+clearance+1e-7;
   if(dx*dx+dy*dy>radius*radius){this.stats.forecastPairsCulled=(this.stats.forecastPairsCulled??0)+1;continue;}
   this.stats.forecastPairChecks=(this.stats.forecastPairChecks??0)+1;
   const gap=envelopeClearance(shape,other,this.proof);clearance=Math.min(clearance,gap);
   if(gap<this.collision){blocker=forecast.other;break;}
  }
  const result={clearance,blocker};
  if(cacheable){let values=row;if(!values){values=[];this.cache.set(shape,values);}values[frame]=result;}
  return result;
 }
}
