import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {modernizeAfterRepair,setFactoryModernization,modernizationSelection} from '../campaign/factory-modernization.js';

const checks=[];
function setup(extra={}){
 const m=fixture(),f=m.addStructure('factory','rai',{x:0,y:250},{completed:true,progress:1});
 const u=m.addUnit('bukhanka','rai',{x:0,y:100},{experience:91,paint:'sand',components:['C01','B01','U01'],engineUpgradeLevel:2,...extra});
 m.rebuildNavigation();m.state.research['twin-machinegun']=true;m.state.energy=1000;
 return {m,f,u};
}
function travel(m,id,seconds=70){
 const phases=[],events=[];let previous;
 for(let i=0;i<seconds*10;i++){
  const before=m.entity(id),wasInside=before.factoryVisit?.phase==='inside',kind=before.kind;
  m.advance(.1);const u=m.entity(id);
  if(kind!==u.kind)assert(wasInside,'Weapon replacement only occurs inside the physical factory');
  const phase=u.factoryVisit?.phase??'outside';
  if(phase!==previous){phases.push({time:+m.state.time.toFixed(2),phase,kind:u.kind});previous=phase;}
  events.push(...m.drainEvents());m.drainEffects();
 }
 return {phases,events};
}
for(const hp of [320,200]){
 const {m,f,u}=setup({hp}),id=u.id;assert(!f.autoModernize);
 assert.equal(m.modernize([id]).assigned,1);assert.equal(u.kind,'bukhanka');assert.equal(m.state.energy,1000);
 assert(!m.modernize([id]).ok,'Duplicate orders cannot queue or charge twice');
 const result=travel(m,id);assert.equal(u.kind,'twin-machinegun');assert.equal(u.hp,u.maxHp);
 for(const phase of ['entering','inside','leaving','departure'])assert(result.phases.some(p=>p.phase===phase));
 assert(!u.factoryVisit);assert(!u.modernizationRequested);assert(!f.autoModernize);
 assert.equal(u.experience,91);assert.equal(u.paint,'sand');assert.equal(u.engineUpgradeLevel,2);assert.equal(u.id,id);
 assert.equal(u.components[2],'U02');assert.equal(result.events.filter(e=>e.type==='vehicle-modernized').length,1);
 assert(Math.abs(m.state.energy-(985-(320-hp)*1.5/40))<1e-6);
 const balance=m.state.energy;assert(!modernizeAfterRepair(m,f,u));assert.equal(m.state.energy,balance);
 m.load(m.save());assert.equal(m.entity(id).kind,'twin-machinegun');
 checks.push({case:hp===320?'healthy physical visit':'repair then refit',phases:result.phases,oilSpent:1000-balance});
}
{
 const {m,u}=setup(),mate=m.addUnit('bukhanka','rai',{x:300,y:0}),twin=m.addUnit('twin-machinegun','rai',{x:350,y:0}),enemy=m.addUnit('bukhanka','scavs',{x:1000,y:1000});
 m.state.commandGroups=[{id:'review-group',members:[u.id,mate.id]}];u.commandGroupId=mate.commandGroupId='review-group';
 const result=m.modernize([u.id,twin.id,enemy.id]);assert.deepEqual(result.assignedIds,[u.id]);
 assert(!mate.combatRetreat);assert(!mate.modernizationRequested);assert(!twin.combatRetreat);assert(!enemy.combatRetreat);
 checks.push({case:'mixed selection does not expand to unselected formation members',assigned:result.assignedIds});
}
{
 const {m,u}=setup();u.y=-200;m.modernize([u.id]);m.advance(.2);m.stop([u.id]);
 assert(!u.modernizationRequested);assert(!u.combatRetreat);m.advance(30);assert.equal(u.kind,'bukhanka');assert.equal(m.state.energy,1000);
 checks.push({case:'stop cancels the refit trip without payment'});
}
{
 const {m,u}=setup(),id=u.id;m.modernize([id]);m.advance(.5);m.load(m.save());
 // Loading M01 restores its authored bounds; this flat fixture spans the full
 // map. Restore only the fixture bounds, preserving the saved visit and route.
 m.state.bounds=[0,0,127,127];m.rebuildNavigation();
 assert(m.entity(id).modernizationRequested);travel(m,id);assert.equal(m.entity(id).kind,'twin-machinegun');assert.equal(m.state.energy,985);
 checks.push({case:'save/load en route preserves the request and charges once'});
}
{
 const {m,u}=setup();m.state.energy=0;m.modernize([u.id]);travel(m,u.id,25);
 assert.equal(u.kind,'bukhanka');assert.equal(u.factoryVisit.phase,'inside');assert.equal(u.combatRetreat.service,'waiting-modernization-oil');
 m.state.energy=15;travel(m,u.id,35);assert.equal(u.kind,'twin-machinegun');assert.equal(m.state.energy,0);assert(!u.factoryVisit);
 checks.push({case:'insufficient oil waits inside, resumes when funded, then physically exits'});
}
{
 const {m,f,u}=setup({hp:50});m.retreat([u.id]);
 for(let i=0;i<400&&u.factoryVisit?.phase!=='inside';i++)m.advance(.1);
 assert.equal(u.factoryVisit.phase,'inside');const visit=u.factoryVisit;
 assert(m.modernize([u.id]).ok);assert.equal(u.factoryVisit,visit,'A new refit request must not reset an occupied bay');
 travel(m,u.id);assert.equal(u.kind,'twin-machinegun');assert(!f.autoModernize);
 checks.push({case:'request during an existing repair keeps the same garage visit'});
}
{
 const {m,f,u}=setup();m.state.research['twin-machinegun']=false;
 assert(!m.modernize([u.id]).ok);assert(!u.combatRetreat);assert(!u.modernizationRequested);
 m.state.research['twin-machinegun']=true;f.hp=0;
 assert(!m.modernize([u.id]).ok);assert(!u.combatRetreat);assert(!u.modernizationRequested);
 f.hp=f.maxHp;assert(modernizationSelection(m,[]).reason);assert(!m.modernize([]).ok);
 checks.push({case:'research, working factory and eligible selection required'});
}
{
 const {m,u}=setup();u.x=-35;u.y=50;
 const second=m.addUnit('bukhanka','rai',{x:35,y:50},{hp:200});
 assert.equal(m.modernize([u.id,second.id]).assigned,2);travel(m,u.id,100);
 assert.equal(u.kind,'twin-machinegun');assert.equal(second.kind,'twin-machinegun');assert(!u.factoryVisit);assert(!second.factoryVisit);
 assert(Math.abs(m.state.energy-965.5)<1e-6);checks.push({case:'two selected cars share the factory entrance and both exit upgraded'});
}
{
 const {m,u}=setup();u.y=-200;m.modernize([u.id]);m.advance(.2);
 assert(m.order([u.id],'move',{x:300,y:-200}).ok);assert(!u.modernizationRequested);assert(!u.combatRetreat);
 m.advance(30);assert.equal(u.kind,'bukhanka');assert.equal(m.state.energy,1000);
 checks.push({case:'new movement order cancels the trip without a later surprise upgrade'});
}
{
 const {m,f,u}=setup({hp:200});assert(setFactoryModernization(m,f.id,true).ok);m.retreat([u.id]);travel(m,u.id);
 assert.equal(u.kind,'twin-machinegun');assert.equal(u.hp,u.maxHp);assert(Math.abs(m.state.energy-980.5)<1e-6);
 checks.push({case:'existing factory auto-modernization still works'});
}
const folder='docs/playtest-evidence/wg060';fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(folder+'/mechanics.json',JSON.stringify({checks},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,checks}));
