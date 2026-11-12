import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './check-start-latency-coordinator.mjs';
import {makeMission} from './m02-fixture.mjs';
import {updateScavProduction} from '../campaign/scav-production.js';
import {infantryNavigator} from '../campaign/infantry-navigation.js';
import {prepareM02Diagnostic} from '../campaign/mission02-diagnostic.js';
import {updateCampaignProductionSteps} from '../campaign/scav-production.js';
const checks=[];
{
 const m=fixture(),u=m.addUnit('scav-rifleman','scavs',{x:0,y:0}),goal={x:0,y:130};
 for(const x of [-22,22])m.addStructure('scav-barracks','scavs',{x,y:0},{halfWidth:12,halfDepth:80});
 m.rebuildNavigation();const main=m.nav,mask=main.occupied.slice();
 assert.equal(main.findPath(u,goal),null,'Vehicle margins seal the alley in the baseline planner');
 u.path=m.vehiclePath(u,goal);assert(u.path?.length,'Infantry can plan out of the alley');
 assert.equal(m.nav,main);assert.deepEqual(main.occupied,mask,'Infantry search does not change vehicle occupancy');
 for(let i=0;i<160&&u.path.length;i++){const before={...u};m.state.time+=.1;m.walk(u,.1);assert(m.vehicleMotionClear(u,before,u),'Every infantry step clears the real walls');}
 assert(Math.hypot(u.x-goal.x,u.y-goal.y)<2);
 // A suspended producer search must restore its caller's navigator at every yield.
 const context=main.createSearchContext();m.nav=context;context.workDeadline=0;
 const search=m.vehiclePathSteps(u,{x:0,y:0});assert(!search.next().done);assert.equal(m.nav,context);
 context.workDeadline=Infinity;let result;do{result=search.next();assert.equal(m.nav,context);}while(!result.done);
 assert(result.value?.length);m.nav=main;
 const small=infantryNavigator(main),revision=small.topologyRevision;
 m.state.buildings[0].hp=0;m.rebuildNavigation();assert(infantryNavigator(main).topologyRevision>revision);
 checks.push('narrow alley, physical collision sweeps, isolated and suspended searches, topology refresh');
}
{
 const m=makeMission();m.state.openingScene={handedOver:true};updateScavProduction(m);
 assert(m.state.buildings.filter(b=>b.scavProduction).every(b=>b.scavProduction.nextAt===null));
 m.updateRaid(true);assert(m.state.flags.raidStarted);assert.equal(m.state.flags.raidIds.length,4);
 updateScavProduction(m);assert(m.state.buildings.filter(b=>b.scavProduction).every(b=>b.scavProduction.count===0));
 for(const id of m.state.flags.raidIds)m.entity(id).hp=0;m.updateRaid(false);assert(m.state.flags.raidWon);
 updateScavProduction(m);assert(m.state.buildings.filter(b=>b.scavProduction&&b.campId!=='west-south').every(b=>b.scavProduction.nextAt===30));
 const active=m.state.buildings.filter(b=>b.scavProduction&&b.campId!=='west-south');active[0].hp=0;m.state.time=31;
 for(let i=0;i<200;i++)updateScavProduction(m);
 assert.equal(active[0].scavProduction.count,0);assert(active.slice(1).some(b=>b.scavProduction.count>0));
 checks.push('authored four-unit first raid, post-victory reinforcement timer, destroyed producer stays stopped');
}
{
 const m=makeMission();m.state.openingScene={handedOver:true};
 const camp=m.state.camps.find(c=>c.id==='nw-pocket'),u=m.state.units.find(u=>u.owner==='rai');Object.assign(u,camp.gate);
 updateScavProduction(m);assert(m.state.buildings.filter(b=>b.scavProduction&&b.campId===camp.id).every(b=>b.scavProduction.nextAt===30));
 checks.push('early assault activates the attacked camp without activating all camps');
}
{
 const m=prepareM02Diagnostic(makeMission()),base=m.state.m02.bases.hill_factory,p=base.production;
 for(const b of Object.values(m.state.m02.bases))if(b.production)b.production.active=false;
 p.active=true;p.nextAt=Infinity;m.state.time=130;
 const units=base.rally.slice(0,2).map(point=>m.addUnit('scav-zaporozhets','scavs',point,{producerId:base.factoryId,m02Produced:true}));
 units[1].scavContact={id:m.state.units.find(u=>u.owner==='rai').id,time:130};
 // Old saves have no factory ID on the group. A single surviving available
 // patroller can leave; its engaged teammate must remain managed for later.
 m.state.m02.groups=[{id:'legacy-patrol',type:'patrol',units:units.map(u=>u.id)}];
 const search=updateCampaignProductionSteps(m);while(!search.next().done){}
 assert(units[0].raid);assert.equal(m.state.m02.groups[0].type,'raid');
 assert(p.waiting.includes(units[1].id));assert.equal(units[1].scavAssembly,base.factoryId);
 checks.push('legacy patrol, one available survivor, engaged teammate retained for the next sortie');
}
fs.writeFileSync('docs/playtest-evidence/wg031/policy.json',JSON.stringify({checks},null,2));console.log(JSON.stringify({checks}));
