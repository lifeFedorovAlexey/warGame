import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {createM03Field,m03Point} from '../campaign/mission03-terrain.js';
import {M03} from '../campaign/mission03-config.js';
import {prepareM03Travel} from '../campaign/mission03.js';
const m=makeMission(createM03Field());m.load(JSON.parse(fs.readFileSync('campaign/previews/m03/travel.json','utf8')));
// A legal M02 loadout: nine researched twin-gun vehicles and one builder.
for(const c of m.state.transport.manifest)if(c.unit.kind==='bukhanka'){c.unit.kind='twin-machinegun';c.unit.components=[...m.config.units['twin-machinegun'].components];}
const events=[];m.advance(190);const ids=m.state.m03.launchedIds,alive=()=>m.state.units.filter(u=>ids.includes(u.id)&&u.hp>0),began=m.state.time;
function advanceUntil(test,max){for(let t=0;t<max;t+=.5){m.advance(.5);if(test())return true;if(m.state.status!=='running')return false;}return false;}
function move(point,attack=true){const group=alive();assert(group.length);const r=m.submitOrder(group.map(u=>u.id),attack?'attack-move':'move',point,{expandGroup:false});assert(r.ok);const cargo=m.state.m03.artifact.carrierId;if(!attack&&cargo){assert(m.entity(cargo)?.hp>0,'Artifact carrier survived');assert(m.submitOrder([cargo],'move',point,{expandGroup:false}).ok);}const done=advanceUntil(()=>point.id===M03.artifact.id?m.state.m03.artifact.state==='carried':alive().filter(u=>Math.hypot(u.x-point.x,u.y-point.y)<135).length>=Math.ceil(alive().length*.6)&&(!cargo||attack||m.entity(cargo)?.hp>0&&Math.hypot(m.entity(cargo).x-point.x,m.entity(cargo).y-point.y)<100),180);events.push({point,done,time:m.state.time-began,alive:alive().length,remaining:m.state.m03.remaining});if(!done)fs.writeFileSync('campaign/previews/m03/combat-stuck.json',m.save());assert(done,JSON.stringify(events));}
for(const grid of [[19,65],[19,43],[18,22]])move(m03Point(grid));
move({...M03.artifact,id:undefined},true);const collector=alive().sort((a,b)=>Math.hypot(a.x-M03.artifact.x,a.y-M03.artifact.y)-Math.hypot(b.x-M03.artifact.x,b.y-M03.artifact.y))[0];
if(m.state.m03.artifact.state!=='carried')assert(m.submitOrder([collector.id],'move',M03.artifact,{expandGroup:false}).ok);assert(advanceUntil(()=>m.state.m03.artifact.state==='carried',120),JSON.stringify(events));
const carrierId=m.state.m03.artifact.carrierId;for(const grid of [[18,22],[19,43],[19,65],[15,79]])move(m03Point(grid),false);
assert(advanceUntil(()=>m.entity(carrierId)?.hp>0&&Math.hypot(m.entity(carrierId).x-m.transportSite().x,m.entity(carrierId).y-m.transportSite().y)<M03.evacuationRadius,60));
assert(m.requestTransport().ok);m.advance(29);assert(m.loadTransport(alive().map(u=>u.id)).ok);
assert(advanceUntil(()=>!m.state.transport.queue.length&&m.state.transport.manifest.every(c=>c.phase==='aboard'),280));
assert(m.departTransport().ok);assert(advanceUntil(()=>m.state.m03.travelTo==='home',26));
const back=prepareM03Travel(m),report={events,returned:back.state.transport.manifest.length,losses:m.state.m03.losses,remaining:m.state.m03.remaining,enemyUnitsDestroyed:m.state.campaign.personnel.missions.m03.enemyUnitsDestroyed,elapsed:m.state.time-began};
fs.writeFileSync('campaign/previews/m03/combat-return.json',JSON.stringify(back));fs.writeFileSync('campaign/previews/m03/combat.json',JSON.stringify(report,null,2));console.log('PASS',JSON.stringify(report));
