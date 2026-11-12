import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {vehicleRecipes} from '../campaign/vehicle-designs.js';
import {modernizationPlan,modernizationSelection,setFactoryModernization} from '../campaign/factory-modernization.js';
const checks=[];
const kinds=m=>m.availableVehicleRecipes().map(r=>r.kind);
function setup(kind='bukhanka'){
 const m=fixture(),f=m.addStructure('factory','rai',{x:0,y:250},{completed:true,progress:1});
 const u=m.addUnit(kind,'rai',{x:0,y:100},{experience:91,paint:'sand',engineUpgradeLevel:2});
 m.rebuildNavigation();m.state.energy=1000;return {m,f,u};
}
function run(m,u){
 let transitions=[];
 for(let i=0;i<800;i++){
  const kind=u.kind,inside=u.factoryVisit?.phase==='inside';m.advance(.1);m.drainEffects();
  if(u.kind!==kind){assert(inside);transitions.push({from:kind,to:u.kind,time:m.state.time});}
  if(transitions.length&&!u.factoryVisit)break;
 }
 assert.equal(transitions.length,1,'Exactly one physical refit, no intermediate oil charge');assert(!u.factoryVisit);
 return transitions;
}
{
 const {m}=setup();m.state.research.flamethrower=m.state.research.sensor=true;
 const initial=kinds(m);assert(initial.includes('bukhanka'));assert(!initial.includes('twin-machinegun'));assert(!initial.includes('heavy-machinegun'));
 m.state.research['twin-machinegun']=true;const twin=kinds(m);assert(!twin.includes('bukhanka'));assert(twin.includes('twin-machinegun'));
 m.state.research['heavy-machinegun']=true;const heavy=kinds(m);assert(!heavy.includes('bukhanka'));assert(!heavy.includes('twin-machinegun'));assert(heavy.includes('heavy-machinegun'));
 for(const kind of ['flamer','sensor','builder'])assert(heavy.includes(kind));
 assert(!m.saveDesign('Устаревшая спарка',['C01','B01','U02'],'olive').ok);
 assert(m.saveDesign('Тяжёлый',['C01','B01','mission-heavy-mg'],'olive').ok);
 assert(m.factoryProjects().some(p=>p.id==='bukhanka'),'Previously saved projects remain loadable');
 checks.push({case:'designer advances along studied tiers and keeps independent roles',initial,twin,heavy});
}
for(const [kind,heavy,expected,cost] of [['bukhanka',false,'twin-machinegun',15],['twin-machinegun',true,'heavy-machinegun',65],['bukhanka',true,'heavy-machinegun',80]]){
 const {m,u}=setup(kind);m.state.research['twin-machinegun']=true;m.state.research['heavy-machinegun']=heavy;
 const plan=modernizationPlan(m,u);assert.equal(plan.recipe.kind,expected);assert.equal(plan.cost,cost);
 const id=u.id,damage=u.damage;u.projectId='old-custom-project';u.designName='Старая сборка';
 assert(m.modernize([id]).ok);assert.equal(u.kind,kind);assert.equal(m.state.energy,1000);
 const transitions=run(m,u);assert.equal(u.kind,expected);assert.equal(m.state.energy,1000-cost);
 assert.equal(u.id,id);assert.equal(u.experience,91);assert.equal(u.paint,'sand');assert.equal(u.engineUpgradeLevel,2);assert.equal(u.damage,damage);
 assert(!u.projectId);assert(!u.designName);assert(!u.modernizationRequested);assert.equal(modernizationPlan(m,u),null);
 assert.equal(m.drainEvents().filter(e=>e.type==='vehicle-modernized').length,1);
 m.load(m.save());assert.equal(m.entity(id).kind,expected);assert.equal(m.entity(id).components[2],expected==='heavy-machinegun'?'mission-heavy-mg':'U02');
 checks.push({case:kind+' → '+expected,cost,transitions});
}
{
 const {m,u}=setup('twin-machinegun');m.state.research['heavy-machinegun']=true;
 assert(!kinds(m).includes('bukhanka'));assert.equal(modernizationPlan(m,u).recipe.kind,'heavy-machinegun');
 checks.push({case:'legacy research state with heavy unlocked does not offer inferior machineguns'});
}
{
 const {m,f,u}=setup('twin-machinegun');m.state.research['twin-machinegun']=m.state.research['heavy-machinegun']=true;
 assert(setFactoryModernization(m,f.id,true).ok);assert(m.retreat([u.id]).ok);run(m,u);
 assert.equal(u.kind,'heavy-machinegun');assert.equal(m.state.energy,935);
 checks.push({case:'factory auto-update accepts a healthy twin and upgrades it to heavy'});
}
{
 const {m,u}=setup('twin-machinegun');m.state.research['heavy-machinegun']=true;m.state.energy=64;m.modernize([u.id]);m.advance(25);
 assert.equal(u.kind,'twin-machinegun');assert.equal(u.factoryVisit.phase,'inside');assert.equal(m.state.energy,64);
 m.state.energy=65;run(m,u);assert.equal(u.kind,'heavy-machinegun');assert.equal(m.state.energy,0);
 checks.push({case:'heavy refit waits for its own price, then charges once'});
}
{
 const {m,u}=setup();m.state.research['twin-machinegun']=true;m.modernize([u.id]);m.advance(.5);
 m.state.research['heavy-machinegun']=true;run(m,u);assert.equal(u.kind,'heavy-machinegun');assert.equal(m.state.energy,920);
 checks.push({case:'research completed en route is considered when refitting inside the factory'});
}
{
 const {m,u}=setup();m.state.research['twin-machinegun']=m.state.research['heavy-machinegun']=true;
 const twin=m.addUnit('twin-machinegun','rai',{x:200,y:0}),heavy=m.addUnit('heavy-machinegun','rai',{x:250,y:0}),flamer=m.addUnit('flamer','rai',{x:300,y:0});
 const selection=modernizationSelection(m,[u.id,twin.id,heavy.id,flamer.id]);
 assert.deepEqual(selection.units.map(u=>u.id),[u.id,twin.id]);assert.equal(selection.cost,145);
 assert.equal(modernizationPlan(m,heavy),null);assert.equal(modernizationPlan(m,flamer),null);
 checks.push({case:'mixed tiers report the total price and preserve independent weapons',cost:selection.cost});
}
{
 // A test-only future cannon: higher damage and price do not imply replacing
 // a machinegun. Only its explicitly authored successor may obsolete it.
 const {m}=setup();m.config.units['test-light-cannon']={...m.config.units.bukhanka,components:['C01','B01','test-cannon'],cost:250,damage:100};
 m.config.units['test-better-cannon']={...m.config.units['test-light-cannon'],components:['C01','B01','test-better-cannon'],cost:280,requires:'test-cannon-research'};
 m.config.vehicleComponents['test-better-cannon']={upgrades:'test-cannon'};
 m.config.buildings.factory.production.push('test-light-cannon','test-better-cannon');m.vehicleRecipes=vehicleRecipes(m.config);
 m.state.research['twin-machinegun']=m.state.research['heavy-machinegun']=true;
 const cannon=m.addUnit('test-light-cannon','rai',{x:200,y:0});assert(kinds(m).includes('test-light-cannon'));assert.equal(modernizationPlan(m,cannon),null);
 m.state.research['test-cannon-research']=true;assert(!kinds(m).includes('test-light-cannon'));assert(kinds(m).includes('test-better-cannon'));
 assert(kinds(m).includes('heavy-machinegun'));assert.equal(modernizationPlan(m,cannon).recipe.kind,'test-better-cannon');assert.equal(modernizationPlan(m,cannon).cost,30);
 checks.push({case:'independent cannon line stays separate; its own declared successor uses the same update system'});
}
const folder='docs/playtest-evidence/wg060/upgrade-lines';fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(folder+'/mechanics.json',JSON.stringify({checks},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,checks}));
