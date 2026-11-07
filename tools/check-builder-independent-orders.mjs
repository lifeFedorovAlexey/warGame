import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Mission} from '../campaign/mission.js';
import {vehicleClearance,vehicleEnvelope,footprintSupport} from '../campaign/vehicle-collision.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';

// Exact public construction commands on the authored mission's initial five
// vehicles. No move/path injection, relocated starter, collision override or
// substitute flat field. AI/building updates remain production code.
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const config=json('assets/campaign/alpha/mission01/gameplay.json');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),round=n=>Number.isFinite(n)?+n.toFixed(4):null;
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const sources=['campaign/mission.js','campaign/main.js','campaign/group-command.js','campaign/pickup-orders.js',
 'campaign/command-planner.js','campaign/vehicle-motion.js','campaign/vehicle-dynamics.js','campaign/vehicle-collision.js','campaign/traffic-start.js',
 'campaign/traffic-coordinator.js','campaign/road-traffic.js','campaign/road-merge.js','campaign/turning-headway.js','campaign/maneuver-admission.js',
 'assets/campaign/alpha/mission01/gameplay.json','assets/maps/alpha/heightfield.json','assets/maps/alpha/roads.json'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
let field;
function realField(){
 if(!field){const raw=createHeightfield(json('assets/maps/alpha/heightfield.json'));shapeMesaRims(raw);
  field=refineRoadHeightfield(raw);applyRoadGrades(field,json('assets/maps/alpha/roads.json'));}
 return field;
}
function setup(){const m=new Mission(config,realField());m.state.pendingCinematics=[];return m;}
function generatorSite(m){
 const start=m.field.gridToWorld(config.startGrid),candidates=[];
 for(let dx=-240;dx<=240;dx+=config.buildingGridMetres)for(let dy=-240;dy<=240;dy+=config.buildingGridMetres){
  if(Math.hypot(dx,dy)<80)continue;
  candidates.push({x:start.x+dx,y:start.y+dy});
 }
 candidates.sort((a,b)=>distance(a,start)-distance(b,start)||a.x-b.x||a.y-b.y);
 // Placement legality is the only selection criterion. A slow/failed route
 // never causes a site to be retried at a more convenient location.
 const rejected=[];
 for(const candidate of candidates){const p=m.placement('generator',candidate.x,candidate.y);
  if(p.ok&&!p.blockers.length)return {point:{x:p.x,y:p.y},rejected};
  rejected.push({point:candidate,reason:p.reason??'occupied-construction-site'});
 }
 return {point:null,rejected};
}
const plans={
 'two-derricks':{secondKind:'derrick',secondDelay:0},
 'two-derricks-staggered':{secondKind:'derrick',secondDelay:1},
 'derrick-generator':{secondKind:'generator',secondDelay:0},
 'builder-leader-independent':{secondKind:'derrick',secondDelay:0,group:true},
};
function solidGap(unit,solid,m){
 const shape=vehicleEnvelope(unit,config.worldScale,m.field);let gap=-Infinity;
 for(const [x,y] of [[1,0],[0,1],[shape.c,shape.s],[-shape.s,shape.c]])gap=Math.max(gap,
  Math.abs((shape.x-solid.x)*x+(shape.y-solid.y)*y)-footprintSupport(shape,x,y)-solid.halfWidth*Math.abs(x)-solid.halfDepth*Math.abs(y));
 return gap;
}
export function runBuilderCase(name,{seconds=120}={}){
 const beforeSources=hashes(),m=setup(),plan=plans[name];assert(plan,`Unknown builder case ${name}`);
 const initial=m.state.units.filter(u=>u.owner==='rai'),workers=initial.filter(u=>u.kind==='builder');
 assert.equal(workers.length,2,'Use both actual initial builders');
 const initialPoses=new Map(initial.map(u=>[u.id,{x:u.x,y:u.y,heading:u.heading,hp:u.hp}]));
 const initialLegal=initial.map(u=>({id:u.id,clear:m.vehicleMotionClear(u,u,u)}));
 if(plan.group)assert(m.configureGroup(initial.map(u=>u.id),{leaderId:workers[0].id,formation:'auto'}).ok);
 const generated=plan.secondKind==='generator'?generatorSite(m):null;
 const secondPoint=generated?.point??m.field.gridToWorld(config.oilFields[1]);
 const commands=[{at:0,selected:[workers[0].id],kind:'derrick',point:m.field.gridToWorld(config.oilFields[0])},
  {at:plan.secondDelay,selected:[workers[1].id],kind:plan.secondKind,point:secondPoint}];
 const initialSave=JSON.parse(m.save()),orders=[],assignmentEvents=[],contacts=[],damage=[],solidViolations=[],unrelatedOrders=[];
 const metrics=new Map(initial.map(u=>[u.id,{id:u.id,kind:u.kind,selected:workers.includes(u),firstMotion:null,firstPreparing:null,firstActivity:null,
  travelled:0,maxDisplacement:0,idle:0,longestIdle:0,reasons:{},lastTask:null,workingAt:null}]));
 const expected=new Map(),cpu=[],history=[];let minGap=Infinity,frame=0,lastSample=-1;
 const collision=m.vehicleCollision.bind(m);m.vehicleCollision=(u,speed,blockers)=>{
  contacts.push({time:m.state.time,unit:u.id,speed,blockers:[...blockers].map(v=>v.id),pose:{x:u.x,y:u.y,heading:u.heading},task:structuredClone(u.task)});
  return collision(u,speed,blockers);
 };
 const applyDamage=m.damage.bind(m);m.damage=(target,amount,source,contact)=>{
  const before=target.hp,result=applyDamage(target,amount,source,contact);
  if(initial.includes(target)&&target.hp<before)damage.push({time:m.state.time,unit:target.id,amount,before,after:target.hp,
   source:source&&{id:source.id,kind:source.kind,owner:source.owner},collision:contacts.at(-1)?.time===m.state.time});
  return result;
 };
 const order=m.order.bind(m);m.order=(ids,action,target)=>{
  const before=initial.map(u=>({id:u.id,task:structuredClone(u.task)})),result=order(ids,action,target);
  assignmentEvents.push({time:m.state.time,action,ids:[...ids],target:target?.id,result:structuredClone(result),before,
   after:initial.map(u=>({id:u.id,task:structuredClone(u.task)}))});return result;
 };
 const snapshot=()=>({time:m.state.time,units:initial.map(u=>({id:u.id,x:u.x,y:u.y,heading:u.heading,hp:u.hp,
  task:structuredClone(u.task),path:structuredClone(u.path),detour:structuredClone(u.detour),navigation:structuredClone(u.navigation),
  yieldReturn:structuredClone(u.yieldReturn),siteExit:structuredClone(u.siteExit),working:u.builderWorking})),
  buildings:orders.filter(o=>o.result.ok).map(o=>{const b=m.entity(o.result.id);return {id:b.id,kind:b.kind,progress:b.progress,
   completed:b.completed,clearing:b.clearing,awaitingWorkers:b.awaitingWorkers,builderIds:b.builderIds};})});
 while(frame/80<seconds){
  for(const command of commands)if(!command.issued&&m.state.time+1e-6>=command.at){
   command.issued=true;const start=performance.now(),result=m.build(command.selected,command.kind,command.point.x,command.point.y);
   orders.push({time:m.state.time,frameSeconds:frame/80,...command,result:structuredClone(result),cpuMs:performance.now()-start});
   if(result.ok)expected.set(command.selected[0],result.id);
  }
  const previous=new Map(initial.map(u=>[u.id,{x:u.x,y:u.y}])),start=performance.now();
  m.advance(1/80,{budgetMs:config.simulationCpuBudgetMs});cpu.push(performance.now()-start);frame++;
  for(const u of initial){
   const row=metrics.get(u.id),travelled=distance(u,previous.get(u.id)),displacement=distance(u,initialPoses.get(u.id));
   row.travelled+=travelled;row.maxDisplacement=Math.max(row.maxDisplacement,displacement);
   const command=orders.find(o=>o.selected.includes(u.id));
   if(command&&row.firstMotion===null&&displacement>=.5)row.firstMotion={simulation:m.state.time-command.time,frame:frame/80-command.frameSeconds};
   const task=JSON.stringify(u.task);if(task!==row.lastTask){
    if(u.task?.type==='build'&&u.task.targetId!==expected.get(u.id))unrelatedOrders.push({time:m.state.time,unit:u.id,task:structuredClone(u.task),expected:expected.get(u.id)??null});
    if(!workers.includes(u)&&['move','attack-move','build','repair'].includes(u.task?.type)&&!u.yieldReturn&&!u.siteExit)
     unrelatedOrders.push({time:m.state.time,unit:u.id,task:structuredClone(u.task),expected:null});
    row.lastTask=task;
   }
   if(u.builderWorking)row.workingAt??=m.state.time;
   if(u.navigation?.reason==='preparing-projector')row.firstPreparing??=m.state.time;
   if(command&&row.firstActivity===null&&(row.firstMotion||u.builderWorking||u.navigation?.reason==='preparing-projector'))
    row.firstActivity={simulation:m.state.time-command.time,frame:frame/80-command.frameSeconds,
     action:row.firstMotion?'driving':u.builderWorking?'working':'preparing-projector'};
   const active=u.task||u.path.length||u.detour||u.yieldReturn||u.pendingOrder;
   if(active&&!u.builderWorking&&travelled<1e-4){row.idle+=1/80;row.longestIdle=Math.max(row.longestIdle,row.idle);
    const reason=u.navigation?.reason??'missing-diagnostic';row.reasons[reason]=(row.reasons[reason]??0)+1/80;
   }else row.idle=0;
   if(travelled>0){for(const solid of m.nav.nearbySolids(u,config.worldScale*5))if(solidGap(u,solid,m)<-1e-6)
    solidViolations.push({time:m.state.time,unit:u.id,building:solid.id,gap:solidGap(u,solid,m)});}
  }
  for(let i=0;i<initial.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,vehicleClearance(initial[i],initial[j],config.worldScale,m.field));
  if(Math.floor(m.state.time)>lastSample){lastSample=Math.floor(m.state.time);history.push(snapshot());}
  m.effects=[];
  if(commands.every(c=>c.issued)&&orders.every(o=>o.result.ok&&m.entity(o.result.id)?.completed))break;
 }
 const failures=[];
 if(initialLegal.some(u=>!u.clear))failures.push('An authored initial vehicle pose fails its full-hull legality check');
 if(orders.length!==2||orders.some(o=>!o.result.ok))failures.push('Both independent construction placements must be accepted');
 if(orders.some(o=>o.result.ok&&!m.entity(o.result.id)?.completed))failures.push('Both selected builders must physically complete their own structure');
 if(unrelatedOrders.length)failures.push('A command changed an unselected vehicle or stole the other construction job');
 if(workers.some(u=>!metrics.get(u.id).firstActivity||metrics.get(u.id).firstActivity.frame>.50001))failures.push('A builder did not begin physical travel or verified projector work within 500 ms');
 if(contacts.length)failures.push(`${contacts.length} physical contacts`);
 if(minGap<0||solidViolations.length)failures.push('Physical hull penetration');
 if(damage.length)failures.push('Damage during the construction approach; see recorded sources');
 const sourceChanged=JSON.stringify(beforeSources)!==JSON.stringify(hashes());if(sourceChanged)failures.push('Production sources changed during the run');
 const sorted=cpu.slice().sort((a,b)=>a-b),result={name,passed:!failures.length,failures,realTerrain:true,
  seconds:round(m.state.time),frameSeconds:round(frame/80),deadline:seconds,initialLegal,orders,
  assignments:assignmentEvents,unrelatedOrders,contacts,damage,minGap:round(minGap),solidViolations,
  units:[...metrics.values()].map(r=>({...r,travelled:round(r.travelled),maxDisplacement:round(r.maxDisplacement),longestIdle:round(r.longestIdle)})),
  buildings:snapshot().buildings,cpuMs:{total:round(cpu.reduce((a,b)=>a+b,0)),p95:round(sorted[Math.floor(sorted.length*.95)]),max:round(sorted.at(-1)),
   scope:'Actual Mission.advance at 80 Hz with configured CPU budget; no renderer'},sourceHashes:beforeSources,sourceChanged};
 fs.mkdirSync('tools/fixtures',{recursive:true});const fixturePath=`tools/fixtures/builder-independent-${name}.json`;
 fs.writeFileSync(fixturePath,JSON.stringify({replay:`node tools/check-builder-independent-orders.mjs --case ${name}`,config,
  initialSave,commands,generatorSelection:generated,history,finalSave:JSON.parse(m.save()),result},null,2));
 result.fixture=fixturePath;return result;
}
export function commandScopeChecks(){
 const m=setup(),[first,second]=m.state.units.filter(u=>u.kind==='builder'&&u.owner==='rai');
 assert(m.configureGroup([first.id,second.id],{leaderId:first.id}).ok);
 const a=m.field.gridToWorld(config.oilFields[0]),b=m.field.gridToWorld(config.oilFields[1]);
 const aBuild=m.build([first.id],'derrick',a.x,a.y),bBuild=m.build([second.id],'derrick',b.x,b.y);
 assert(aBuild.ok&&bBuild.ok);assert.equal(first.task?.targetId,aBuild.id);assert.equal(second.task?.targetId,bBuild.id);
 const preserve=()=>JSON.stringify({task:second.task,path:second.path,pending:second.pendingOrder});let original=preserve();
 assert(m.submitOrder([first.id],'build',m.entity(aBuild.id)).ok);assert.equal(preserve(),original,'Explicit Build cannot retask the other grouped builder');
 const damaged=m.state.units.find(u=>u.kind==='bukhanka'&&u.owner==='rai');damaged.hp-=10;
 assert(m.submitOrder([first.id],'repair',damaged).ok);assert.equal(preserve(),original,'Explicit Repair cannot retask the other grouped builder');
 const artifact={id:'scope-artifact',key:'mg-tower',x:first.x-40,y:first.y-40,collected:false};m.state.artifacts.push(artifact);
 assert(m.submitOrder([first.id],'move',artifact).ok);assert.equal(preserve(),original,'Collecting with a leader cannot stop another builder');
 m.stop([first.id]);assert(!first.task&&!second.task,'The explicitly issued group Stop keeps its tactical meaning');
 return {passed:true,checks:['build-selected','repair-selected','pickup-selected','explicit-group-stop']};
}
const obstacleHeadings={'two-obstacles':0,'two-obstacles-reverse':Math.PI,'two-obstacles-quarter':Math.PI/2,'two-obstacles-diagonal':Math.PI/4};
export function runObstacleCase({seconds=60,name='two-obstacles'}={}){
 const beforeSources=hashes(),m=setup(),origin=m.field.gridToWorld(config.startGrid),rejected=[],candidates=[];
 const heading=obstacleHeadings[name];assert(Number.isFinite(heading),'Known obstacle start orientation');
 for(let dx=-320;dx<=320;dx+=16)for(let dy=-240;dy<=240;dy+=16){
  if(Math.hypot(dx,dy)<100)continue;candidates.push({x:Math.round((origin.x+dx)/8)*8,y:Math.round((origin.y+dy)/8)*8});
 }
 candidates.sort((a,b)=>distance(a,origin)-distance(b,origin)||a.x-b.x||a.y-b.y);
 let selected;
 for(const point of candidates){
  const car={...point,kind:'bukhanka',heading,hp:320},goal={x:point.x,y:point.y+200},shape=vehicleEnvelope(car,config.worldScale,m.field);
  const buildingHalf=config.buildings.generator.footprintMetres[0]*config.worldScale/2,
   separation=Math.ceil((buildingHalf+footprintSupport(shape,1,0)+3)/config.buildingGridMetres)*config.buildingGridMetres;
  const sides=[m.placement('generator',point.x-separation,point.y),m.placement('generator',point.x+separation,point.y)];
  // Choose by lawful placement and physical starting pose only; no route or
  // simulated success is considered when choosing this first deterministic site.
  const why=sides.some(p=>!p.ok||p.blockers.length)?'building-placement':!m.inBounds(goal.x,goal.y)||!m.nav.terrainAllowed(goal.x,goal.y)?'goal-terrain':
   !m.vehicleMotionClear(car,car,car)||sides.some(p=>solidGap(car,p,m)<config.worldScale*.055)?'initial-full-hull':null;
  if(why){rejected.push({point,reason:why});continue;}
  selected={point,goal,sides,heading,separation};break;
 }
 assert(selected,'No physically legal two-obstacle starting site found in the authored explored region');
 const buildings=selected.sides.map(p=>m.addStructure('generator','rai',p,{completed:true,progress:1}));
 m.rebuildNavigation();const unit=m.addUnit('bukhanka','rai',selected.point,{heading}),initialSave=JSON.parse(m.save());
 const initialLegal=m.vehicleMotionClear(unit,unit,unit),initialGap=Math.min(...buildings.map(b=>solidGap(unit,b,m)));
 const contacts=[],damage=[],history=[],penetrations=[],cpu=[];let firstMotion=null,arrival=null,longestIdle=0,idle=0,travelled=0,minGap=initialGap,lastSample=-1;
 const reasons={},collision=m.vehicleCollision.bind(m);m.vehicleCollision=(u,speed,blockers)=>{
  if(u===unit)contacts.push({time:m.state.time,speed,blockers:[...blockers].map(b=>b.id),pose:{x:u.x,y:u.y,heading:u.heading}});
  return collision(u,speed,blockers);
 };
 const originalDamage=m.damage.bind(m);m.damage=(u,amount,source,contact)=>{const before=u.hp,result=originalDamage(u,amount,source,contact);
  if(u===unit&&u.hp<before)damage.push({time:m.state.time,before,after:u.hp,source:source&&{id:source.id,kind:source.kind}});return result;};
 const commandStart=performance.now(),order=m.submitOrder([unit.id],'move',selected.goal),commandCpuMs=performance.now()-commandStart;
 let frame=0;
 while(frame/80<seconds){
  const previous={x:unit.x,y:unit.y},start=performance.now();m.advance(1/80,{budgetMs:config.simulationCpuBudgetMs});cpu.push(performance.now()-start);frame++;
  const step=distance(unit,previous);travelled+=step;
  if(firstMotion===null&&distance(unit,selected.point)>=.5)firstMotion={simulation:m.state.time,frame:frame/80};
  if(step<1e-4&&(unit.path.length||unit.pendingOrder||unit.task||unit.detour)){
   idle+=1/80;longestIdle=Math.max(longestIdle,idle);const reason=unit.navigation?.reason??'missing-diagnostic';reasons[reason]=(reasons[reason]??0)+1/80;
  }else idle=0;
  for(const b of buildings){const gap=solidGap(unit,b,m);minGap=Math.min(minGap,gap);if(gap<0)penetrations.push({time:m.state.time,building:b.id,gap});}
  if(Math.floor(m.state.time)>lastSample){lastSample=Math.floor(m.state.time);history.push({time:m.state.time,x:unit.x,y:unit.y,heading:unit.heading,hp:unit.hp,
   task:structuredClone(unit.task),path:structuredClone(unit.path),detour:structuredClone(unit.detour),navigation:structuredClone(unit.navigation),pendingOrder:structuredClone(unit.pendingOrder)});}
  m.effects=[];
  if(distance(unit,selected.goal)<2&&!unit.path.length&&!unit.pendingOrder&&!unit.detour&&!unit.task){arrival={simulation:m.state.time,frame:frame/80};break;}
 }
 const failures=[];if(!initialLegal||initialGap<0)failures.push('Physically legal full-hull start was not preserved');
 if(!order.ok)failures.push('Public Move rejected the physically legal starting corridor');
 if(!firstMotion||firstMotion.frame>.50001)failures.push('Meaningful first motion exceeds 500 ms');
 if(!arrival)failures.push('Vehicle did not reach the original goal within the deadline');
 if(contacts.length||penetrations.length||damage.length)failures.push('Physical contact, penetration or damage; inspect retained evidence');
 const sourceChanged=JSON.stringify(beforeSources)!==JSON.stringify(hashes());if(sourceChanged)failures.push('Production sources changed during the run');
 const result={name,passed:!failures.length,failures,realTerrain:true,seconds:round(m.state.time),frameSeconds:round(frame/80),deadline:seconds,
  initialLegal,initialGap:round(initialGap),order,commandCpuMs,firstMotion,arrival,goal:selected.goal,goalError:round(distance(unit,selected.goal)),travelled:round(travelled),
  longestIdle:round(longestIdle),reasons,minGap:round(minGap),contacts,penetrations,damage,sourceHashes:beforeSources,sourceChanged,
  cpuMs:{total:round(cpu.reduce((a,b)=>a+b,0)),max:round(Math.max(...cpu)),scope:'Actual Mission.advance at 80 Hz; no renderer'}};
 const fixture=`tools/fixtures/builder-independent-${name}.json`;fs.mkdirSync('tools/fixtures',{recursive:true});
 fs.writeFileSync(fixture,JSON.stringify({replay:`node tools/check-builder-independent-orders.mjs --case ${name}`,config,selected,rejected,
  initialSave,history,finalSave:JSON.parse(m.save()),result},null,2));result.fixture=fixture;return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const scope=commandScopeChecks();
 if(args.includes('--scope-only'))console.log(JSON.stringify(scope));
 else{
  const names=option('--case',[...Object.keys(plans),...Object.keys(obstacleHeadings)].join(',')).split(','),results=[];
  for(const name of names){const settings={seconds:Number(option('--seconds',120)),name},result=name in obstacleHeadings?runObstacleCase(settings):runBuilderCase(name,settings);results.push(result);
   console.log(JSON.stringify({name,passed:result.passed,failures:result.failures,seconds:result.seconds,
    buildings:result.buildings,firstMotion:result.units?.filter(u=>u.selected).map(u=>u.firstMotion)??result.firstMotion,contacts:result.contacts.length,
    unintended:result.unrelatedOrders?.length,others:result.units?.filter(u=>!u.selected).map(u=>({id:u.id,displacement:u.maxDisplacement})),fixture:result.fixture}));}
  fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/builder-independent-orders.json',JSON.stringify({scope,results},null,2));
  if(!args.includes('--diagnose'))assert(results.every(r=>r.passed),'Independent builder orders failed; exact initial saves and all results retained');
 }
}
