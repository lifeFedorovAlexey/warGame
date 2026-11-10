import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/memorial-layout';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
let page;const errors=[];
try{
 page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 page.on('console',message=>{if(message.type()==='error')console.error('Browser:',message.text());});
 page.on('requestfailed',request=>console.error('Request:',request.url(),request.failure()?.errorText));
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/');await page.waitForFunction(()=>window.campaign?.ready||document.querySelector('#welcome')?.textContent.includes('Ошибка запуска'),null,{timeout:120000});
 assert(await page.evaluate(()=>!!window.campaign?.ready),'Game startup: '+errors.join('; '));console.log('Game ready');
 await page.locator('#begin').click();await page.waitForFunction(()=>document.querySelector('#welcome').hidden,null,{timeout:120000});
 if(await page.evaluate(()=>campaign.state.dreamPlaying))await page.locator('[data-dream="skip"]').click();
 await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 await page.evaluate(async()=>{
  const c=campaign,m=c.mission,p=m.state.campaign.personnel,{MemorialScene}=await import('./memorial-scene.js'),{personnelRanks}=await import('./personnel-ranks.js');c.radio.setEnabled(false);
  const original=MemorialScene.prototype.setData;MemorialScene.prototype.setData=function(...args){window.rankMemorial=this;return original.apply(this,args);};
  const veteran=m.state.units.find(u=>u.owner==='rai'&&u.kind==='bukhanka'&&u.hp>0),veteranId=p.crews[veteran.id].memberIds[0];
  for(let i=0;i<3;i++){const enemy=m.addUnit('raider','scavs',{x:700,y:700});m.damage(enemy,1e6,veteran);}c.setPersonnelRank(veteranId,'captain');
  // The kill order deliberately has privates first. Placement must follow
  // rank while hit-testing and the archive still identify the right person.
  for(const rank of [...Array(41).fill('private'),...personnelRanks.map(r=>r.id)]){
   const u=m.addUnit('bukhanka','rai',{x:800,y:800});c.setPersonnelRank(p.crews[u.id].memberIds[0],rank);m.damage(u,1e6,{id:'fixture-enemy',kind:'raider',owner:'scavs',x:700,y:700});
  }
  m.state.energy=5432;for(const [key,spec] of Object.entries(m.config.research).filter(([,spec])=>spec.mission!=='m02')){m.state.research[key]=true;if(!m.state.artifactKeys.includes(key))m.state.artifactKeys.push(key);}
  m.state.time=1634;m.state.status='victory';c.getResults();m.load(m.save());c.showResults();
  const state=m.state;window.carryReference={veteranId,veteranUnitId:veteran.id,people:structuredClone(state.campaign.personnel.soldiers),
   crews:structuredClone(state.campaign.personnel.crews),order:[...state.campaign.personnel.graveOrder],report:c.getResults('m01'),research:structuredClone(state.research),oil:state.energy,designs:structuredClone(state.designs),artifacts:[...state.artifactKeys],
   vehicles:state.units.filter(u=>u.owner==='rai'&&u.hp>0).map(u=>({id:u.id,kind:u.kind,hp:u.hp,paint:u.paint})),buildings:state.buildings.filter(b=>b.owner==='rai').map(b=>({id:b.id,hp:b.hp}))};
 });
 await page.waitForFunction(()=>document.querySelector('.memorial-scene').dataset.memorialArtReady==='true',null,{timeout:60000});await page.evaluate(()=>document.fonts.ready);
 async function layoutCheck(name,width,height){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const check=await page.evaluate(()=>{
   const scene=rankMemorial,list=scene.hitAreas,overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
   const pairs=[];for(let i=0;i<list.length;i++)for(let j=0;j<i;j++)if(overlap(list[i].bounds,list[j].bounds))pairs.push([list[i].soldier.id,list[j].soldier.id]);
   const span=(zone,key)=>{const points=list.filter(g=>g.zone===zone).map(g=>g[key]);return (Math.max(...points)-Math.min(...points))/(key==='x'?scene.width:scene.height);};
   return {count:list.length,unique:new Set(list.map(g=>g.soldier.id)).size,pairs,privates:list.filter(g=>g.appearance.order===0).map(g=>g.zone),
    hillWidth:span('hill','x'),hillHeight:span('hill','y'),fieldWidth:span('field','x'),
    largest:Math.max(...list.map(g=>g.size)),ratio:Math.max(...list.filter(g=>g.appearance.order>=15).map(g=>g.size))/Math.max(...list.filter(g=>g.appearance.order===0).map(g=>g.size)),
    overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('#result').scrollHeight>innerHeight};
  });
  assert.equal(check.count,80);assert.equal(check.unique,80);assert.deepEqual(check.pairs,[]);assert(check.privates.every(z=>z==='field'));assert(check.ratio>2);assert(!check.overflow);
  assert(check.hillWidth>.65&&check.hillHeight>.4,'Graves cover the whole visible hill');assert(check.fieldWidth>.45,'Graves cover the valley beyond the hill');
  await page.screenshot({path:folder+'/'+name+'.png'});
  if(name==='wide'){
   // Identical crosses expose inconsistent perspective that different rank
   // ornamentation could conceal. This changes only the isolated view fixture.
   await page.evaluate(()=>{const s=rankMemorial,privateAppearance=s.hitAreas.find(g=>g.appearance.id==='private').appearance;window.perspectiveOriginal=s.hitAreas;s.hitAreas=s.hitAreas.map(g=>({...g,appearance:privateAppearance,soldier:{...g.soldier,rank:'private',death:{...g.soldier.death,rank:'private'}}}));s.resize();});
   await page.screenshot({path:folder+'/perspective-calibration.png'});
   await page.evaluate(()=>{rankMemorial.hitAreas=window.perspectiveOriginal;delete window.perspectiveOriginal;rankMemorial.resize();});
  }
  return check;
 }
 const wide=await layoutCheck('wide',1440,900),narrow=await layoutCheck('narrow',390,844);
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(250);
 const person=await page.evaluate(()=>{const g=rankMemorial.hitAreas.find(g=>g.appearance.id==='marshal');return {id:g.soldier.id,name:g.soldier.name,x:g.x,y:g.y-g.size*.5};});
 await page.mouse.move(person.x,person.y);await page.waitForFunction(name=>document.querySelector('#result-person h3').textContent===name,person.name);
 await page.screenshot({path:folder+'/inspect-senior.png'});await page.mouse.move(20,20);
 await page.locator('#result-continue').click();await page.waitForFunction(()=>campaign.mission.state.m02?.initialized,null,{timeout:60000});
 const inherited=await page.evaluate(()=>{
  const c=campaign,m=c.mission,r=carryReference,p=m.state.campaign.personnel;
  return {people:p.soldiers,crews:p.crews,order:p.graveOrder,report:c.getResults('m01'),research:m.state.research,oil:m.state.energy,designs:m.state.designs,artifacts:m.state.artifactKeys,
   vehicles:r.vehicles.map(a=>{const u=m.state.units.find(u=>u.id===a.id);return {id:u.id,kind:u.kind,hp:u.hp,paint:u.paint};}),buildings:r.buildings.map(a=>{const b=m.state.buildings.find(b=>b.id===a.id);return {id:b.id,hp:b.hp};}),
   phaseKills:p.missions.m02.enemyUnitsDestroyed,phaseLosses:p.missions.m02.personnelLost,reference:r};
 });
 for(const key of ['people','crews','order','report','research','oil','designs','artifacts','vehicles','buildings'])assert.deepEqual(inherited[key],inherited.reference[key],'m01→m02 preserves '+key);
 assert.equal(inherited.oil,5432);assert(Object.keys(inherited.research).length>=3);
 assert.equal(inherited.phaseKills,0);assert.equal(inherited.phaseLosses,0);
 const second=await page.evaluate(()=>{
  const c=campaign,m=c.mission,r=carryReference;m.load(m.save());const veteran=m.state.units.find(u=>u.id===r.veteranUnitId);
  for(let i=0;i<2;i++){const enemy=m.addUnit('raider','scavs',{x:700,y:700});m.damage(enemy,1e6,veteran);}
  m.damage(veteran,1e6,{id:'m02-enemy',kind:'raider',owner:'scavs',x:700,y:700});m.state.time+=200;m.state.status='defeat';const report=c.getResults();
  const save=m.save();m.load(save);m.load(save);c.showResults();return {report,restored:c.getResults(),first:c.getResults('m01'),veteran:m.state.campaign.personnel.soldiers[r.veteranId]};
 });
 assert.deepEqual(second.restored,second.report);assert.deepEqual(second.first,inherited.reference.report);assert.equal(second.report.statistics.enemyUnitsDestroyed,2);assert.equal(second.report.statistics.personnelLost,1);
 assert.equal(second.report.memorial.length,81);assert.equal(second.veteran.kills,5);assert.equal(second.veteran.death.rank,'captain');assert.equal(second.veteran.name,inherited.reference.people[inherited.reference.veteranId].name);
 assert.equal(second.veteran.callsign,inherited.reference.people[inherited.reference.veteranId].callsign);assert.deepEqual(second.veteran.missions.m01.awards,inherited.reference.people[inherited.reference.veteranId].missions.m01.awards);assert(second.veteran.missions.m01.awards.includes('participant'));
 await page.waitForFunction(()=>document.querySelector('.memorial-scene').dataset.memorialGraves==='81');await page.mouse.move(20,20);await page.screenshot({path:folder+'/mission-two.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync(folder+'/verification.json',JSON.stringify({passed:true,wide,narrow,firstDeaths:80,secondDeaths:1,total:81,carryover:['names','callsigns','ranks','kills','awards','crews','graves','reports','vehicles','buildings','research','oil']},null,2));
 console.log('PASS actual Continue button m01→m02: identities, ranks, kills, awards, 80+1 graves, reports, vehicles, buildings, research and oil; repeated load; compact wide/narrow without overlap');
}catch(error){if(page){await page.screenshot({path:folder+'/failure.png'});console.error(errors,await page.evaluate(()=>({state:window.campaign?.state,mission:window.campaign?.mission?.state?.mission})));}throw error;}finally{await browser.close();}
