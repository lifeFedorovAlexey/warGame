import assert from 'node:assert/strict';
import {armySelectionIds} from '../campaign/army-selection.js';
import {expandCommandIds} from '../campaign/group-command.js';
const specs={car:{role:'combat',damage:9},worker:{role:'builder',damage:0},command:{role:'command',damage:0},truck:{role:'support',damage:0}};
const unit=(id,changes={})=>({id,kind:'car',owner:'rai',hp:100,maxHp:100,combatPolicy:{retreat:'light',response:'free',priority:'nearest'},...changes});
const units=[unit('ready'),unit('offscreen',{x:9999,y:9999}),unit('worker',{kind:'worker'}),unit('command',{kind:'command'}),unit('truck',{kind:'truck'}),unit('enemy',{owner:'scavs'}),unit('wreck',{hp:0}),unit('light',{hp:80}),unit('heavy',{hp:35,combatPolicy:{retreat:'heavy'}}),unit('above-heavy',{hp:36,combatPolicy:{retreat:'heavy'}}),unit('hold',{hp:1,combatPolicy:{retreat:'never'}}),unit('ignore',{combatPolicy:{retreat:'never',response:'ignore'}}),unit('manual-override',{hp:20,retreatSuppressed:true}),unit('retreating',{combatRetreat:{status:'travelling'}}),unit('forced',{combatRetreat:{status:'planning',forced:true}}),...['approach','waiting','gate','entering','inside','leaving','departure'].map(phase=>unit(phase,{factoryVisit:{phase}}))];
const mission={state:{units},unitSpec:u=>specs[u.kind]};
units.push(
 unit('stranded-apron',{hp:45,factoryVisit:{phase:'waiting'},navigation:{reason:'factory-apron-full'},path:[]}),
 unit('stranded-route',{hp:45,combatRetreat:{status:'blocked'},path:[]}),
 unit('normal-queue',{hp:45,factoryVisit:{phase:'waiting'},navigation:{reason:'factory-door-in-use'},path:[]}),
);
const snapshot=structuredClone(units);
assert.deepEqual(armySelectionIds(mission),['ready','offscreen','command','above-heavy','hold','ignore']);
assert.deepEqual(expandCommandIds(mission,['ready','stranded-apron','stranded-route','normal-queue','entering'],{action:'attack-move'}),
 ['ready'],'An attack respects the HP threshold even for explicitly selected stranded cars');
assert.deepEqual(expandCommandIds(mission,['ready','stranded-apron','stranded-route','normal-queue','entering'],{action:'move'}),
 ['ready','stranded-apron','stranded-route','normal-queue'],'Manual movement controls selected cars outside the garage');
assert.deepEqual(units,snapshot,'Selection cannot mutate orders, policies, repairs or units');
units.find(u=>u.id==='light').combatPolicy.retreat='heavy';
assert(armySelectionIds(mission).includes('light'),'A new retreat threshold applies on the next selection');
const repaired=units.find(u=>u.id==='inside');delete repaired.factoryVisit;
repaired.combatRetreat={status:'arrived',service:'complete',forced:true};
assert(armySelectionIds(mission).includes('inside'),'Fully repaired vehicles return to mass selection after leaving the garage');
assert.deepEqual(armySelectionIds({...mission,state:{units:[]}}),[]);
console.log('PASS: army selection, retreat thresholds, repair phases, manual movement, commanders, offscreen units, unchanged policies and orders');
