import assert from 'node:assert/strict';
import {parkRadioStory,restoreRadioStory} from '../campaign/radio-save.js';

const legacy=()=>({
  flags:{},statistics:{produced:0},buildings:[],
  camps:Array.from({length:4},()=>({cleared:false})),
  seenCinematics:[],pendingCinematics:[],artifactKeys:[],research:{},
});

const late=legacy();
late.flags={raidWon:true,lastRevealed:true};
late.statistics.produced=14;
late.buildings=['generator','factory','lab'].map(kind=>({kind,owner:'rai',completed:true,hp:100}));
for(const camp of late.camps.slice(0,3))camp.cleared=true;
late.research={flamethrower:true,'mg-ammo-1':true,'mg-tower':true};
late.seenCinematics=['intro','briefing','arrival','first-contact','raid-won','artifact-flamethrower',
  'research-flamethrower','camp3-sighted','last-camp','artifact-mg-ammo-1','research-mg-ammo-1','research-mg-tower'];
restoreRadioStory(late);
for(const id of ['01','01a','01b','03','04','12','13','16-alt','18','20','21']){
  assert.equal(late.radioStory.scenes[id].status,'skipped',id);
}
assert.equal(late.radioStory.scenes['22'],undefined,'The new meeting at the headquarters is still ahead');

const beforeDebrief=legacy();
beforeDebrief.flags.raidWon=true;
beforeDebrief.pendingCinematics=['raid-won'];
restoreRadioStory(beforeDebrief);
assert.equal(beforeDebrief.radioStory.scenes['12'],undefined,'A pending debrief is not an old broadcast');
assert.deepEqual(beforeDebrief.pendingCinematics,['raid-won']);

const complete=legacy();
complete.camps.forEach(camp=>{camp.cleared=true;});
complete.seenCinematics=['victory','outro'];
restoreRadioStory(complete);
for(const id of ['22','25','26','27','28','29','d04'])assert.equal(complete.radioStory.scenes[id].status,'skipped',id);

const native=legacy();
native.radioStory={clock:12500,active:'22',scenes:{'12':{status:'skipped',cursor:0},'22':{status:'playing',cursor:2}}};
const original=native.radioStory;
restoreRadioStory(native);
assert.equal(native.radioStory,original);
assert.deepEqual(native.radioStory,{clock:12500,active:null,scenes:{'12':{status:'skipped',cursor:0},'22':{status:'pending',cursor:2}}});
native.radioStory.active='22';
native.radioStory.scenes['22'].status='playing';
parkRadioStory(native.radioStory);
assert.equal(native.radioStory.scenes['22'].cursor,2,'Muting leaves completed lines behind');
native.flags.lastRevealed=true;
native.radioStory.active='01b';
native.radioStory.scenes['01b']={status:'playing',cursor:1};
restoreRadioStory(native);
assert.equal(native.radioStory.scenes['01b'].status,'skipped','Do not resume the opening in the final sector');
assert.deepEqual(native.radioStory.scenes['22'],{status:'pending',cursor:2});
console.log('Radio save migration and paused dialogue checks passed');
