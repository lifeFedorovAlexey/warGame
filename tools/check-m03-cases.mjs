import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeMission} from './m02-fixture.mjs';
import {createM03Field,m03Source,m03Point} from '../campaign/mission03-terrain.js';
import {M03} from '../campaign/mission03-config.js';
import {transportCargoSpec,cargoUsed} from '../campaign/korovnik-transport.js';
import {prepareM03Travel} from '../campaign/mission03.js';
import {StoryDirector} from '../campaign/story-director.js';
const read=name=>JSON.parse(fs.readFileSync(name,'utf8')),travel=read('campaign/previews/m03/travel.json'),passed=[];
function expedition(){const m=makeMission(createM03Field());m.load(structuredClone(travel));for(const spec of [...Object.values(m.config.units),...Object.values(m.config.buildings)])spec.damage=0;return m;}
function check(name,fn){fn();passed.push(name);console.log('PASS '+name);}
check('Lossless rectangular source, no stretching; cliffs block movement',()=>{
 const f=createM03Field();assert.equal(f.heightUnitMetres,.5,'Original ELEVATION_SCALE 2 at 32/128 horizontal scale');for(let y=0;y<93;y++)for(let x=0;x<44;x++)assert.equal(f.samples[(y+17)*128+x+42],m03Source.heights[y*44+x]);
 assert(f.terrainObstacles.length>100);const m=expedition(),cliff=f.terrainObstacles.find(v=>v.halfWidth>16);assert(!m.nav.terrainAllowed.clearSegment({x:cliff.x-40,y:cliff.y},{x:cliff.x+40,y:cliff.y}));
});
check('Medium/heavy slots, oversize refusal and selective cancellation',()=>{
 const m=makeMission();m.state.transport={version:1,kind:'mu26',phase:'ready',manifest:[],queue:[],site:m.transportSite()};
 const ids=[];for(const type of ['medium','heavy','heavy','light'])ids.push(m.addUnit('bukhanka','rai',{x:100,y:100},{transport:type}).id);
 const r=m.loadTransport(ids);assert.equal(r.accepted,3);assert.equal(r.rejected.length,1);assert.equal(cargoUsed(m.state.transport),7);
 const bad=m.addUnit('bukhanka','rai',{x:100,y:100},{transport:{slots:1,width:9,length:4,height:3}});assert.equal(transportCargoSpec(m,bad),null);assert(!m.loadTransport([bad.id]).ok);
 bad.transport={slots:1};assert.equal(transportCargoSpec(m,bad),null);
 m.cancelTransportLoading([ids[1]]);assert.equal(cargoUsed(m.state.transport),3);assert.equal(m.state.transport.queue.length,2);m.cancelTransportLoading();assert.equal(cargoUsed(m.state.transport),0);
});
check('No artifact: no evacuation; pause/save/load keep timer; both warnings; timeout',()=>{
 const m=expedition();assert(!m.requestTransport().ok);m.advance(190);assert(!m.departTransport().ok);
 const time=m.state.m03.remaining;m.advance(0);assert.equal(m.state.m03.remaining,time);m.load(m.save());assert.equal(m.state.m03.remaining,time);
 m.state.m03.remaining=300.3;m.advance(.6);assert(m.state.m03.events.fiveMinutes);m.state.m03.remaining=60.3;m.advance(.6);assert(m.state.m03.events.oneMinute);
 m.load(m.save());assert(m.state.m03.events.fiveMinutes&&m.state.m03.events.oneMinute);m.state.m03.remaining=.3;m.advance(.6);assert.equal(m.state.status,'defeat');assert.equal(m.state.m03.phase,'failed');
});
check('Destroyed carrier drops a real recoverable artifact and preserves casualty',()=>{
 const m=expedition();m.advance(190);const [a,b]=m.state.units.filter(u=>u.owner==='rai');
 Object.assign(a,{...M03.artifact,id:a.id,path:[],task:null});m.advance(.5);assert.equal(m.state.m03.artifact.carrierId,a.id);
 const sid=m.state.campaign.personnel.crews[a.id].memberIds[0];m.damage(a,100000,m.state.units.find(u=>u.owner==='scavs'));m.advance(.5);
 assert.equal(m.state.m03.artifact.state,'available');assert(m.state.campaign.personnel.soldiers[sid].death);assert(m.state.m03.losses.includes(a.id));
 // Fixture isolates pickup from the independent full-route movement test.
 Object.assign(b,{x:M03.artifact.x+20,y:M03.artifact.y,path:[],task:null});m.advance(.5);assert.equal(m.state.m03.artifact.carrierId,b.id);m.load(m.save());assert.equal(m.state.m03.artifact.carrierId,b.id);assert(!m.state.artifactKeys.includes('heavy-machinegun'));
});
check('All expedition units lost ends the mission',()=>{
 const m=expedition();m.advance(190);const enemy=m.state.units.find(u=>u.owner==='scavs');for(const u of m.state.units.filter(u=>u.owner==='rai'))m.damage(u,100000,enemy);m.advance(.5);assert.equal(m.state.status,'defeat');
});
check('Disabled flight animations still unload all ten and start timer once',()=>{
 const m=expedition();m.config.transport.animations=false;m.advance(1);assert.equal(m.state.transport.phase,'ready');assert.equal(m.state.m03.timerStartedAt,undefined);m.advance(160);assert.equal(m.state.transport.manifest.length,0);assert(m.state.m03.timerStartedAt);const began=m.state.m03.timerStartedAt;m.load(m.save());m.advance(1);assert.equal(m.state.m03.timerStartedAt,began);
});
check('Real NII research unlocks assembly; no repeat research; original power upgrade retained',()=>{
 const m=makeMission();m.load(read('campaign/previews/m03/return.json'));const before=structuredClone(m.state.research);for(const spec of Object.values(m.config.units))spec.damage=0;m.advance(190);
 assert(!m.availableVehicleRecipes().some(v=>v.kind==='heavy-machinegun'));assert(m.state.artifactKeys.includes('heavy-machinegun'));
 const lab=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='lab');assert(m.research(lab.id,'heavy-machinegun').ok);m.advance(65);assert(m.state.research['heavy-machinegun']);assert(m.availableVehicleRecipes().some(v=>v.components[2]==='mission-heavy-mg'));for(const key of Object.keys(before))assert.equal(m.state.research[key],before[key]);assert(!m.research(lab.id,'heavy-machinegun').ok);
 fs.writeFileSync('campaign/previews/m03/researched.json',m.save());
 const project=m.saveDesign('М03 — тяжёлый','C01 B01 mission-heavy-mg'.split(' '),'sand');assert(project.ok);
 const factory=m.state.buildings.find(b=>b.owner==='rai'&&b.kind==='factory'&&b.completed);assert(m.produce(factory.id,project.id).ok);m.advance(60);
 const produced=m.state.units.find(u=>u.designName==='М03 — тяжёлый');assert(produced,'The saved project produces a real vehicle');assert.equal(produced.kind,'heavy-machinegun');assert.equal(produced.paint,'sand');assert.equal(produced.components[2],'mission-heavy-mg');
});
check('New local audio is complete; radio scenes are once-only across save/load',()=>{
 const story=read('assets/campaign/alpha/mission03/story.json'),audio=read('assets/campaign/alpha/mission03/audio.json');assert.equal(story.dialogue.length,33);for(const line of story.dialogue){const clip=audio.clips[line.id];assert(clip?.file);assert(fs.statSync('assets/campaign/alpha/mission03/'+clip.file).size>1000);}
 const m=expedition(),director=new StoryDirector(story);director.bind(m);director.data.active='m03-s05';director.end();m.load(m.save());director.bind(m);assert(director.finished('m03-s05'));
});
fs.writeFileSync('campaign/previews/m03/cases.json',JSON.stringify({passed},null,2));
