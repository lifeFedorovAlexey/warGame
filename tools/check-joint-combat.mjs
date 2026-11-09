import assert from 'node:assert/strict';
import {progressMission} from './check-navigation-public-progress.mjs';
import {jointIntent,jointPose,jointTopology} from '../campaign/traffic-joint.js';
import {rememberYieldHome} from '../campaign/traffic-start.js';
import {reserveManeuverCorridor} from '../campaign/traffic-corridor.js';

function scene(){
 const m=progressMission(),owner=m.addUnit('bukhanka','rai',{x:0,y:0}),helper=m.addUnit('bukhanka','rai',{x:80,y:0});
 owner.path=[{x:0,y:20}];owner.task={type:'move',x:0,y:20};owner.routeOrder={destination:{x:0,y:20}};
 helper.routeOrder={destination:{x:80,y:0}};
 const enemy=m.addUnit('raider','scavs',{x:140,y:0});
 const token='combat-contract',legs=[{direction:1,curve:0,remaining:20}],
  corridor=reserveManeuverCorridor(m,helper,legs);
 assert(corridor);rememberYieldHome(helper,[owner],false,m.state.time,m);helper.yieldReturn.jointToken=token;
 for(const u of [owner,helper])u.jointTraffic={owner:owner.id,token,revision:u.commandRevision};
 owner.detour={legs:[],reservedCorridor:corridor,joint:{token,topology:jointTopology(m),goal:{x:0,y:20},cursor:0,
  members:[owner,helper].map(u=>({id:u.id,intent:jointIntent(u),pose:jointPose(u)})),
  phases:[{id:helper.id,legs,corridor}]}};
 return {m,owner,helper,enemy};
}
{
 const {m,helper,enemy}=scene(),before=enemy.hp;
 m.updateUnit(helper,.1);
 assert(enemy.hp<before,'A participant must keep automatic fire while executing a traffic manoeuvre');
 assert(helper.y>0,'Firing does not consume or cancel the movement step');
}
{
 const {m,owner,helper}=scene();helper.combatPolicy={retreat:'light',response:'ignore'};helper.hp=helper.maxHp*.5;
 m.updateUnit(helper,.1);
 assert(helper.combatRetreat,'Damage-triggered retreat must preempt a joint manoeuvre');
 // Updating another member must revoke the old transaction as well.
 m.updateUnit(owner,.1);
 assert(!owner.detour?.joint&&!helper.jointTraffic&&!owner.jointTraffic,'Retreat releases the old joint reservation');
}
console.log(JSON.stringify({passed:true,checks:['automatic-fire-during-manoeuvre','automatic-retreat-preempts-manoeuvre']}));
