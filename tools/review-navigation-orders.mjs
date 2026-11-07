import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json'));
const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x:x*32-2048,y:2048-y*32}),worldToGrid:(x,y)=>[(x+2048)/32,(2048-y)/32]};
const results=[];
for(const count of [10,100,500]){
 const m=new Mission(config,field);Object.assign(m.state,{units:[],buildings:[],camps:[],bounds:[0,0,127,127],pendingCinematics:[]});m.updateMission=()=>{};m.rebuildNavigation();m.explored.fill(255);
 for(let i=0;i<count;i++)m.addUnit('bukhanka','rai',{x:-700+(i%25)*28,y:-700+Math.floor(i/25)*30},{heading:0,previousHeading:0});
 const before=performance.now(),order=m.order(m.state.units.map(u=>u.id),'move',{x:200,y:600}),elapsed=performance.now()-before;
 results.push({count,cpuMs:elapsed,order,pathCount:m.state.units.filter(u=>u.path.length).length});
 console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync('campaign/reports/navigation-review-orders.json',JSON.stringify(results,null,2));
