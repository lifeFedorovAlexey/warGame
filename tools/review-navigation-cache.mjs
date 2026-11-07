import fs from 'node:fs';
import {TerrainNavigator} from '../campaign/navigation.js';
import {vehicleSweep} from '../campaign/vehicle-collision.js';
const field={extent:512,half:256,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0})};
const nav=new TerrainNavigator(field,{bounds:[0,0,16,16]}),solids=[{x:0,y:0,hp:1,halfWidth:31.5,halfDepth:27}];nav.rebuild(solids);
let result=null;
for(const x of [36,38,40,42,44,46])for(const y of [0,10,20,28,30,32,34,36,40]){
 if(result)break;
 const samples=[];
 for(let i=0;i<8;i++){
  const u={x,y,heading:i*Math.PI/4,kind:'bukhanka'},to={x:-100,y:80};
  if(!nav.clearSolidSweep(vehicleSweep(u,u,4.5,field),solids))continue;
  const path=nav.computePath(u,to);samples.push({u,to,path});
 }
 for(const a of samples)for(const b of samples){
  if(JSON.stringify(a.path)===JSON.stringify(b.path))continue;
  nav.pathCache?.clear();const first=nav.findPath(a.u,a.to),cached=nav.findPath(b.u,b.to);
  const sweepClear=path=>!!path?.length&&nav.clearSolidSweep(vehicleSweep(b.u,{...b.u,...path[0]},4.5,field),solids);
  result={firstPose:a.u,secondPose:b.u,target:a.to,first,cached,correct:b.path,cachedConnectorClear:sweepClear(cached),freshConnectorClear:sweepClear(b.path)};break;
 }
}
fs.writeFileSync('campaign/reports/navigation-review-cache.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
