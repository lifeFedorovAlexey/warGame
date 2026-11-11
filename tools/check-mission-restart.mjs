import assert from 'node:assert/strict';
import {rememberMissionStart,missionRestartPlan,missionStartKey} from '../campaign/mission-restart.js';

const entries=new Map(),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
const m01={state:{status:'victory',time:120,campaign:{results:{m01:{report:{survivors:7}}}}}};
assert.deepEqual(missionRestartPlan(m01,storage),{kind:'fresh'});
const start={...structuredClone(m01.state),status:'running',m02:{startedAt:120}};
const snapshot=JSON.stringify({state:start});
await rememberMissionStart({state:start,saveAsync:async()=>snapshot},storage);
const finished={state:{...structuredClone(start),status:'defeat',time:170}};
assert.deepEqual(missionRestartPlan(finished,storage),{kind:'start',data:snapshot});
// A different campaign with the same entry time must not borrow this army.
finished.state.campaign.results.m01.report.survivors=3;
assert.equal(missionRestartPlan(finished,storage),null);
finished.state.campaign.results.m01.report.survivors=7;
// Completed missions cannot overwrite their own starting point.
await rememberMissionStart({...finished,saveAsync:async()=>JSON.stringify(finished)},storage);
assert.equal(storage.getItem(missionStartKey),snapshot);
storage.setItem(missionStartKey,'broken save');
assert.equal(missionRestartPlan(finished,storage),null);
const checkpoint=JSON.stringify(m01);
storage.setItem('warGame.alpha.before-m02.v1',checkpoint);
assert.deepEqual(missionRestartPlan(finished,storage),{kind:'checkpoint',data:checkpoint});
finished.state.m02.startedAt=121;
assert.equal(missionRestartPlan(finished,storage),null);
delete finished.state.m02.startedAt;
assert.equal(missionRestartPlan(finished,storage),null);
console.log('Mission restart: fresh M01, M02 start, older checkpoint, damaged/mismatched saves and checkpoint protection passed.');

const m03={state:{...structuredClone(start),m03:{startedAt:450,phase:'preparation',location:'home'}}};
assert.equal(missionRestartPlan(m03,storage),null,'M03 cannot restart from an M02 snapshot');
const thirdSave=JSON.stringify(m03);await rememberMissionStart({...m03,saveAsync:async()=>thirdSave},storage);
const failedThird={state:{...structuredClone(m03.state),status:'defeat',m03:{...m03.state.m03,phase:'failed',location:'expedition'}}};
assert.deepEqual(missionRestartPlan(failedThird,storage),{kind:'start',data:thirdSave});
assert.equal(storage.getItem(missionStartKey),'broken save','M03 never overwrites the M02 starting point');
failedThird.state.m03.startedAt++;
assert.equal(missionRestartPlan(failedThird,storage),null);
console.log('M03 restart preserves its original home preparation and cannot borrow an M02 or different expedition snapshot.');
