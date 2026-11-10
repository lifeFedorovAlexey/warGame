import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const option=(n,d)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)??d;
const folder=path.resolve(option('output','campaign/reports/frame-budget/safety-isolation')),seconds=+option('seconds',180),repeats=+option('repeats',2);
const policies=option('policies','legacy,pre,pre-post').split(','),snapshots=option('snapshots','full,selective').split(','),quantum=+option('quantum',.002),scenario=option('scenario','column');
const combat=option('combat','false')==='true';
const hash=data=>createHash('sha256').update(data).digest('hex');
fs.mkdirSync(folder,{recursive:true});
const runtime=path.resolve(option('runtime',path.join(folder,'runtime')));
if(process.argv.some(a=>a.startsWith('--runtime='))){
 const index=path.join(runtime,'..','sources.json');
 if(fs.existsSync(index))fs.copyFileSync(index,path.join(folder,'sources.json'));
 else{const manifest=JSON.parse(fs.readFileSync(path.join(runtime,'../..','manifest.json'))),sources=manifest.files[path.basename(path.dirname(runtime))];
  for(const [file,digest] of Object.entries(sources))assert.equal(hash(fs.readFileSync(path.join(runtime,file))),digest,file);
  fs.writeFileSync(path.join(folder,'sources.json'),JSON.stringify(sources,null,2));}
}
if(!fs.existsSync(path.join(folder,'sources.json'))){
 const sources={};
 for(const directory of ['campaign','demo','demo/vendor'])for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.js'))){
  const file=directory+'/'+name,target=path.join(runtime,file),data=fs.readFileSync(file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);sources[file]=hash(data);
 }
 const old='campaign/reports/frame-budget/baseline-v2/source/traffic-planner.js';
 fs.copyFileSync(old,path.join(runtime,'campaign/traffic-planner-legacy.js'));sources['legacySnapshot']=hash(fs.readFileSync(old));
 for(const file of ['assets/campaign/alpha/mission01/gameplay.json','assets/maps/alpha/heightfield.json','assets/maps/alpha/roads.json','assets/maps/alpha/route.json','assets/maps/alpha/road-detail.png']){
  const target=path.join(runtime,file),data=fs.readFileSync(file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);sources[file]=hash(data);
 }
 fs.writeFileSync(path.join(folder,'sources.json'),JSON.stringify(sources,null,2));
}
const fixture=JSON.parse(fs.readFileSync('campaign/reports/frame-budget/baseline-final/convoy-fixture.json'));
const save=JSON.parse(fixture.initialSave);
if(!combat){save.state.units=save.state.units.filter(u=>u.owner==='rai');save.state.buildings=save.state.buildings.filter(b=>b.owner==='rai');
save.state.camps.forEach(c=>c.cleared=true);save.state.raidReserve=[];save.state.flags.raidWon=true;}
const initialSave=JSON.stringify(save),budgets=[5,5,5,2,5,0,5,8,5,5,3,5];
const input={initialSave,origin:fixture.origin,seconds,rate:4,fps:60,budgets,quantum,scenario,pan:option('pan','true')==='true',saveEvery:+option('saveEvery',0),...(combat?{combat:true}:{})};
fs.writeFileSync(path.join(folder,'input.json'),JSON.stringify(input));
const summary={method:'Virtual monotonic clock: each production performance.now read costs a fixed quantum. This tests behavior, not CPU performance. Identical budgets, frame-indexed orders and absolute camera positions.',inputHash:hash(JSON.stringify(input)),sources:JSON.parse(fs.readFileSync(path.join(folder,'sources.json'))),results:[]};
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
try{
 for(const snapshot of snapshots)for(const policy of policies)for(let repeat=0;repeat<repeats;repeat++){
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',route=>{const rel=new URL(route.request().url()).pathname.slice(1),file=path.join(runtime,rel);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.continue();});
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8766')+'/campaign/');
  try{await page.waitForFunction(()=>window.campaign?.ready&&typeof document.querySelector('#load').onclick==='function',null,{timeout:+option('startupTimeout',120000)});}
  catch(error){fs.writeFileSync(path.join(folder,'startup-error.json'),JSON.stringify({errors,body:await page.locator('body').innerText()},null,2));throw error;}
  await page.evaluate(async save=>{campaign.radio.setEnabled(false);localStorage.setItem('warGame.alpha.mission01.v1',save);await document.querySelector('#load').onclick();campaign.renderSuspended=true;},initialSave);
  const result=await page.evaluate(async({input,policy,snapshot})=>{
   const c=campaign,m=c.mission,w=c.world,ids=m.state.units.filter(u=>u.owner==='rai'&&u.kind==='bukhanka').map(u=>u.id);
   let combatHits=0;const damage=m.damage;
   if(input.combat)m.damage=function(target,amount,source,contact){const hp=target.hp,result=damage.call(this,target,amount,source,contact);if(target.hp<hp&&contact?.type!=='collision')combatHits++;return result;};
   const {vehicleContact}=await import('/campaign/vehicle-impact.js');
   const {bodyEnvelope,bodyContact}=await import('/campaign/vehicle-overlap.js');
   const {trafficCollisionRequired}=await import('/campaign/vehicle-collision.js');
   if(snapshot==='full'){const {TrafficPlanner:LegacyPlanner}=await import('/campaign/traffic-planner-legacy.js');m.trafficCoordinator.planner.snapshot=LegacyPlanner.prototype.snapshot;}
   w.controls.enableDamping=false;w.centre(input.origin,600);w.keys.clear();
   const near={position:w.camera.position.toArray(),target:w.controls.target.toArray()},far={position:near.position.map((v,i)=>v+(i===0?1200:0)),target:near.target.map((v,i)=>v+(i===0?1200:0))};
   // Determine the initial edge once; subsequent camera inputs are absolute,
   // independent of each variant's vehicle trajectories.
   let edge;
   for(let dx=0;dx<900;dx+=5){w.centre({x:input.origin.x+dx,y:input.origin.y},600);w.updateTrafficVisibility(m);const n=ids.filter(id=>m.entity(id).trafficOnScreen).length;if(n>0&&n<ids.length){edge={position:w.camera.position.toArray(),target:w.controls.target.toArray()};break;}}
   if(!edge)throw Error('No frustum edge in fixture');
   const cameras=input.scenario==='edge'?[edge,far,near]:[near,far,edge],trace=[],ticks=[],stops=[],contacts=[],reads={};
   let frame=-1,phase='setup',clockReads=0,virtualActive=false,virtualBase=0,virtualTail=0;
   const realNow=performance.now.bind(performance),descriptor=Object.getOwnPropertyDescriptor(performance,'now');
   Object.defineProperty(performance,'now',{configurable:true,value:()=>virtualActive?(virtualTail=virtualBase+(++clockReads)*input.quantum):realNow()});
   const timed=fn=>{const old=virtualActive;virtualActive=true;try{return fn();}finally{virtualActive=old;}};
   const audit=()=>{
    const previous=virtualActive;virtualActive=false;
    try{
     const units=m.state.units.filter(u=>u.hp>0&&u.factoryVisit?.phase!=='inside'),pairs=[],shapes=input.combat?units.map(u=>bodyEnvelope(u,m.config.worldScale,m.field)):null;let gap=Infinity,bodyGap=Infinity,requiredGap=Infinity,pairCount=0;
     for(let i=0;i<units.length;i++)for(let j=0;j<i;j++){
      pairCount++;
      if(shapes){const a=shapes[i],b=shapes[j],bound=Math.hypot(a.x-b.x,a.y-b.y)/Math.SQRT2-Math.hypot(a.width,a.depth)-Math.hypot(b.width,b.depth);if(bound>Math.max(0,gap,bodyGap,requiredGap))continue;}
      const a=units[i],b=units[j],actual=vehicleContact(a,b,m.config.worldScale,m.field),body=bodyContact(bodyEnvelope(a,m.config.worldScale,m.field),bodyEnvelope(b,m.config.worldScale,m.field));
      const required=trafficCollisionRequired(a,b);gap=Math.min(gap,actual.gap);bodyGap=Math.min(bodyGap,body.gap);if(required)requiredGap=Math.min(requiredGap,body.gap);
      if(!input.combat)pairs.push({a:a.id,b:b.id,gap:actual.gap,bodyGap:body.gap,required});
      if(actual.gap<-.001||body.gap<-.001)contacts.push({frame,time:m.state.time,a:a.id,b:b.id,gap:actual.gap,bodyGap:body.gap,required:trafficCollisionRequired(a,b)});
     }
     ticks.push({frame,time:m.state.time,stops:m.trafficCoordinator.stats.emergencyStops,pairs:input.combat?{gap,bodyGap,requiredGap,pairCount}:pairs,
      units:units.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,hp:u.hp,speed:u.driveSpeed,visible:u.trafficOnScreen,path:u.path,task:u.task,navigation:u.navigation,...(input.combat?{kind:u.kind,owner:u.owner,factoryPhase:u.factoryVisit?.phase}:{})}))});
    }finally{virtualActive=previous;}
   };
   const originalContinue=m.continueTick;
   m.continueTick=function(...args){const had=this.pendingTick,result=originalContinue.apply(this,args);if(had&&!this.pendingTick)audit();return result;};
   // Accessors retain normal data semantics. Count and sample real production
   // readers after the render phase, including submitOrder/finishPendingStep.
   for(const u of m.state.units){let visible=u.trafficOnScreen;Object.defineProperty(u,'trafficOnScreen',{enumerable:true,configurable:true,get(){if(phase==='between'){const key=new Error().stack.split('\n').slice(2,7).join('\n');reads[key]=(reads[key]??0)+1;}return visible;},set(v){visible=v;}});}
   for(const [i,id] of ids.entries()){
    const u=m.entity(id);if(input.scenario==='headon'){u.x=input.origin.x;u.y=input.origin.y+(i<3?-1:1)*(80+(i%3)*26);u.heading=i<3?0:Math.PI;}
    const goal={x:u.x,y:input.scenario==='headon'?input.origin.y+(i<3?220:-220):u.y+100};u.path=[goal];u.task={type:'move',...goal};u.routeOrder={destination:{...goal}};
   }
   m.rebuildNavigation();
   m.state.navigationSurfaceVersion='obsolete';
   const totalFrames=Math.round(input.seconds*input.fps),startTime=m.state.time;
   try{
    for(frame=0;frame<totalFrames;frame++){
     clockReads=0;virtualBase=Math.max(virtualTail,frame*1000/input.fps);
     phase='between';
     if(input.saveEvery&&frame%input.saveEvery===6)timed(()=>m.save());
     if(input.scenario!=='headon'&&frame>0&&frame%(30*input.fps)===0){const order=frame/(30*input.fps),goal={x:input.origin.x,y:input.origin.y+(order%2?-10:150)};timed(()=>m.submitOrder(ids,'move',goal));}
     if(frame%(5*input.fps)===0){const step=frame/(5*input.fps),camera=cameras[(step+Math.floor(step/6))%3];w.camera.position.fromArray(camera.position);w.controls.target.fromArray(camera.target);w.controls.update();}
     w.keys.clear();if(input.pan&&(input.scenario==='edge'?frame%300<120:frame%300>=280))w.keys.add(frame%600<300?'KeyD':'KeyA');
     phase='prepare';if(policy==='legacy')w.updateTrafficVisibility(m);else w.prepareFrame(m,1/input.fps);
     const visible=ids.map(id=>m.entity(id)?.trafficOnScreen),beforeStops=m.trafficCoordinator.stats.emergencyStops;
     phase='simulation';const budget=input.budgets[frame%input.budgets.length];timed(()=>m.advance(input.rate/input.fps,{rate:input.rate,budgetMs:budget}));
     const stopCount=m.trafficCoordinator.stats.emergencyStops-beforeStops;
     if(stopCount)stops.push({frame,time:m.state.time,count:stopCount,visible,units:ids.map(id=>{const u=m.entity(id);return u?{id,x:u.x,y:u.y,speed:u.driveSpeed,navigation:structuredClone(u.navigation)}:{id,dead:true};})});
     phase='render';if(policy==='legacy')w.prepareFrame(m,1/input.fps);else if(policy==='pre-post')w.updateTrafficVisibility(m);
     trace.push({frame,budget,clockReads,time:m.state.time,pending:m.pendingTick?.cursor??null,visible,stops:m.trafficCoordinator.stats.emergencyStops,poses:ids.map(id=>{const u=m.entity(id);return u?[u.x,u.y,u.heading,u.driveSpeed,u.path.length]:null;})});
     m.effects=[];m.events=[];
     if(frame%240===239)await new Promise(resolve=>setTimeout(resolve,0));
    }
   }finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
   return {policy,snapshot,simSeconds:m.state.time-startTime,emergencyStops:m.trafficCoordinator.stats.emergencyStops,contacts,trace,ticks,stops,betweenReaders:reads,...(input.combat?{combatHits}:{}),
    arrived:ids.filter(id=>{const u=m.entity(id);return u&&!u.task&&!u.path.length&&!u.detour&&!u.pendingOrder;}).length,planner:{...m.trafficCoordinator.planner.stats},controller:{...m.trafficCoordinator.stats},cameras};
  },{input,policy,snapshot});
  result.errors=errors;const file=`${snapshot}-${policy}-${repeat}.json`;fs.writeFileSync(path.join(folder,file),JSON.stringify(result));
  const row={snapshot,policy,repeat,file,traceHash:hash(JSON.stringify(result.trace)),tickHash:hash(JSON.stringify(result.ticks)),emergencyStops:result.emergencyStops,simSeconds:result.simSeconds,arrived:result.arrived,contacts:result.contacts.length,activeContacts:result.contacts.filter(c=>c.required).length,snapshots:result.planner.started,errors,...(combat?{combatHits:result.combatHits}:{})};
  summary.results.push(row);fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(row));await page.close();
 }
}finally{await browser.close();}
for(const snapshot of snapshots)for(const policy of policies){const group=summary.results.filter(r=>r.snapshot===snapshot&&r.policy===policy);assert(group.every(r=>r.errors.length===0&&r.traceHash===group[0].traceHash&&r.tickHash===group[0].tickHash),'Non-deterministic repeat '+snapshot+' '+policy);}
