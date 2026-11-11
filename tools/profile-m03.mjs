import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {createM03Field} from '../campaign/mission03-terrain.js';
import {updateTransport} from '../campaign/korovnik-transport.js';
const source=JSON.parse(fs.readFileSync('campaign/previews/m03/travel.json','utf8')),rows=[];
for(const count of [1,5,10,20]){
 const m=makeMission(createM03Field()),snapshot=structuredClone(source);snapshot.state.transport.manifest=snapshot.state.transport.manifest.slice(0,Math.min(10,count));snapshot.state.m03.launchedIds=snapshot.state.transport.manifest.map(c=>c.unit.id);m.load(snapshot);m.advance(190);
 const pad=m.transportSite();
 // Remaining ten are real field units around the original LZ, never extra
 // manifest slots. Find physically clear positions instead of overlapping.
 for(let i=10;i<count;i++){
  let position=null;outer:for(let y=pad.y+105;y<pad.y+300;y+=28)for(let x=pad.x+175;x<pad.x+360;x+=28){const pose={kind:'bukhanka',x,y,heading:pad.heading,hp:320};if(m.inBounds(x,y)&&m.vehicleMotionClear(pose,pose,pose)){position=pose;break outer;}}
  assert(position);m.addUnit('bukhanka','rai',position,{heading:pad.heading});
 }
 const t=m.state.transport;t.phase='ready';t.door=1;m.rebuildNavigation();
 const ids=m.state.units.filter(u=>u.owner==='rai').map(u=>u.id),result=m.loadTransport(ids);assert.equal(result.accepted,Math.min(count,10));
 let missionMs=0,missionCalls=0,navMs=0,navCalls=0;
 const missionUpdate=m.updateMission.bind(m);m.updateMission=()=>{const start=performance.now();try{return missionUpdate();}finally{missionMs+=performance.now()-start;missionCalls++;}};
 const find=m.nav.findPath.bind(m.nav);m.nav.findPath=(...args)=>{const start=performance.now();try{return find(...args);}finally{navMs+=performance.now()-start;navCalls++;}};
 const start=performance.now();m.advance(20);const cpuMs=performance.now()-start;
 // Profile the actual transport animation state update, without queue work.
 const saved=m.state.transport;m.state.transport={...saved,phase:'ready',queue:[],manifest:[],unloading:false};const animationStart=performance.now();for(let i=0;i<10000;i++)updateTransport(m,.001);const animationUs=(performance.now()-animationStart)*1000/10000;m.state.transport=saved;
 rows.push({vehicles:count,accepted:result.accepted,rejected:result.rejected.length,simulationSeconds:20,cpuMs,missionMs,missionCalls,navMs,navCalls,transportUpdateMicroseconds:animationUs});
}
fs.writeFileSync('campaign/previews/m03/performance.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
