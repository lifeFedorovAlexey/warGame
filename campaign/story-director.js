import {waterTower} from './threat-guidance.js';
import {parkRadioStory} from './radio-save.js';
import {updateStoryConstruction,migrateStoryOpening} from './story-construction.js';

const terminal = status => ['done','skipped','cancelled'].includes(status);
const flame = ['16','16-alt'];
const sceneSignal = {o01:'intro',o08:'first-contact',o09:'raid-won','19':'camp3-sighted','22':'last-camp','27':'outro'};
const live = entity => entity.hp > 0;
const finalScene = id => /^(2[5-9]|d0[234])$/.test(id);

export class StoryDirector {
  constructor(script) {
    this.script=script;
    this.scenes=new Map(script.scenes.map(scene=>[scene.id,scene]));
    this.lines=new Map(script.dialogue.map(cue=>[cue.id,cue]));
    this.mode='mission';
  }
  bind(mission) {
    const state=this.mode==='prologue' ? this.prologue : (mission.state.radioStory ??= {
      version:2,clock:0,scenes:{},facts:{},journal:[],lastEnd:-30000,lastCombat:-30000,
    });
    if(this.data!==state){
      this.data=state;this.lastNow=null;
      parkRadioStory(state);
      if(this.mode==='mission')migrateStoryOpening(mission,state);
    }
    this.mission=mission;
    return state;
  }
  startPrologue() {
    this.mode='prologue';this.prologue={version:2,clock:0,scenes:{},facts:{},journal:[],lastEnd:-30000,lastCombat:-30000};
  }
  stopPrologue() {this.mode='mission';this.data=null;}
  get prologueDone(){return this.mode==='prologue'&&['p01','p02','p03'].every(id=>this.finished(id));}
  record(id){return this.data.scenes[id]??={status:'pending',cursor:0};}
  finished(id){return terminal(this.data.scenes[id]?.status);}
  heard(id){return this.data.scenes[id]?.status==='done';}
  anyFinished(ids){return ids.some(id=>['done','skipped'].includes(this.data.scenes[id]?.status));}
  ended(id){return this.data.scenes[id]?.endedAt??-Infinity;}
  note(event,mission) {
    const d=this.bind(mission),f=d.facts;
    if(event.type==='unit-produced'&&event.kind==='bukhanka')f.firstVan=true;
    if(event.type==='field-modification')f.modernized=true;
    if(event.type==='lab-testing-accident')f.labAccident=true;
    if(event.type==='trophy-food-received')f.food=true;
    if(event.type==='unit-damaged')d.lastCombat=d.clock;
  }
  facts(mission) {
    const s=mission.state,d=this.data,b=s.buildings.filter(live),own=b.filter(x=>x.owner==='rai');
    const building=kind=>own.find(x=>x.kind===kind),ready=kind=>own.some(x=>x.kind===kind&&x.completed);
    const visible=e=>mission.visibleAt?.(e.x,e.y)??false;
    const hostiles=s.units.filter(e=>e.owner==='scavs'&&live(e)&&visible(e)&&s.flags.raidIds?.includes(e.id));
    const shots=(mission.effects??[]).filter(e=>e.type==='shot');
    if(shots.length||s.projectiles?.length)d.lastCombat=d.clock;
    if(!d.facts.contact&&hostiles.length){
      d.facts.contact={ids:[...s.flags.raidIds],fired:false,enemyFired:false};
    }
    const detected=d.facts.contact,contactUnits=detected?.ids.map(id=>s.units.find(e=>e.id===id)).filter(Boolean)??[];
    if(detected&&shots.some(e=>detected.ids.includes(e.from)||detected.ids.includes(e.targetId)))detected.fired=true;
    if(detected&&shots.some(e=>detected.ids.includes(e.from)))detected.enemyFired=true;
    const fightWon=!!s.flags.raidWon||!!detected?.fired&&contactUnits.every(e=>!live(e));
    if(fightWon)d.facts.firstWin=true;
    const known=key=>s.artifactKeys.includes(key)||s.artifacts.some(a=>a.key===key&&(a.collected||visible(a)));
    const researching=key=>own.some(x=>x.research?.key===key);
    const tower=waterTower(mission),lastCamp=s.camps[3];
    const chief=b.find(e=>e.owner==='scavs'&&e.campId===lastCamp?.id&&e.kind==='camp-core');
    if(tower&&visible(tower))d.facts.tower=tower.id;
    if(ready('generator'))d.facts.hadPower=true;
    if(s.status==='victory'&&d.facts.hadPower&&!ready('generator'))d.facts.powerFailure=true;
    return {s,d,building,ready,known,researching,contact:detected,contactAlive:contactUnits.some(live),
      battle:d.clock-d.lastCombat<6000,quiet:d.clock-d.lastCombat,
      bunkers:own.filter(e=>e.kind==='bunker'&&e.completed).length,
      tower:!!tower&&d.facts.tower===tower.id,chief:!!chief&&!lastCamp.cleared,
      chiefReachable:!!chief&&visible(chief),victory:s.status==='victory',
      flameStudied:!!s.research.flamethrower,ammoStudied:!!s.research['mg-ammo-1'],towerStudied:!!s.research['mg-tower']};
  }
  rules(f) {
    const {d,s}=f,done=id=>this.finished(id),heard=id=>this.heard(id),after=(id,seconds=0)=>done(id)&&d.clock-this.ended(id)>=seconds*1000;
    const p=(priority,trigger,valid=true,gap=0)=>({priority,trigger,valid,gap});
    const flameChoice=heard('14')&&heard('15')?'16':'16-alt';
    return {
      o01:p(1,!f.ready('generator'),!f.ready('generator')),
      o02:p(1,f.ready('generator'),!f.ready('factory')),
      o03:p(1,f.ready('generator')&&(done('o02')||f.ready('factory')),!s.powered),
      o04:p(1,s.powered),
      o05:p(1,s.powered&&done('o04'),!f.ready('factory')),
      o06:p(1,f.ready('factory')&&s.powered,!f.ready('lab')),
      o07:p(1,f.ready('lab')),
      o08:p(0,!!f.contact?.enemyFired,f.contactAlive),
      o09:p(1,!!d.facts.firstWin&&!f.battle),
      o10:p(1,done('o09')&&!!d.facts.firstWin),
      o11:p(1,f.bunkers>0),
      o12:p(1,f.bunkers>=(s.storyConstruction?.requiredBunkers??2)&&done('o11')&&!!d.facts.firstWin&&!f.battle),
      '14':p(1,f.known('flamethrower'),!f.researching('flamethrower')&&!f.flameStudied),
      '15':p(2,s.artifactKeys.includes('flamethrower')&&heard('14'),!f.researching('flamethrower')&&!f.flameStudied,1),
      '16':p(1,f.flameStudied&&!this.anyFinished(flame)&&flameChoice==='16'),
      '16-alt':p(1,f.flameStudied&&!this.anyFinished(flame)&&flameChoice==='16-alt'),
      '17':p(1,f.known('mg-ammo-1'),!f.ammoStudied),
      '18':p(1,f.ammoStudied),
      '19':p(0,!!d.facts.tower,f.tower),
      '20':p(1,f.towerStudied),
      '21':p(2,after('20',20),true,20),
      '22':p(2,!!s.flags.lastRevealed&&f.chiefReachable,f.chief,15),
      '23':p(2,heard('22'),f.chief,0),
      '24':p(2,heard('23')&&!!s.storyFacts?.enemyGarden&&!!s.storyFacts?.ownThreeHangarsRooflessLatrine,f.chief,20),
      '25':p(1,f.victory),
      '26':p(2,after('25',8),f.victory,8),
      '27':p(1,after('26',5)&&f.victory),
      '28':p(1,done('27')),
      '29':p(2,after('28',20),f.victory,20),
      'd01':p(1,!!d.facts.labAccident),
      'd02':p(2,!!d.facts.food,true,18),
      'd03':p(1,!!d.facts.powerFailure&&f.victory),
      'd04':p(2,after('29',25),f.victory,25),
    };
  }
  suspend() {
    if(this.data?.active)parkRadioStory(this.data);
  }
  interrupt() {
    // A combat interruption must return to the question, not an isolated reply.
    // Explicit pause/mute and save restoration keep their existing cursor semantics.
    if(this.data?.active)this.record(this.data.active).cursor=0;
    this.suspend();
  }
  end(status='done') {
    const d=this.data,id=d.active;if(!id)return;
    const record=this.record(id);record.status=status;record.endedAt=d.clock;
    d.active=null;d.lastEnd=d.clock;
    if(id==='o12'&&status==='done'&&!d.journal.some(item=>item.id==='outcasts'))
      d.journal.push({id:'outcasts',title:'Отбросы',text:'Местные вооружённые формирования. Живут на свалках и используют восстановленную технику.'});
  }
  completeLine() {
    const id=this.data?.active;if(!id)return;
    const record=this.record(id);record.cursor++;
    if(record.cursor>=this.scenes.get(id).cues.length)this.end();
  }
  skip(){this.end('skipped');}
  update(mission,now,{enabled=true}={}) {
    const d=this.bind(mission);
    if(this.mode==='mission')updateStoryConstruction(mission,{radioEnabled:enabled});
    if(this.lastNow!==null)d.clock+=Math.max(0,Math.min(2000,now-this.lastNow));
    this.lastNow=now;
    if(this.mode==='prologue'){
      if(!enabled){this.suspend();return null;}
      if(!d.active){const id=['p01','p02','p03'].find(id=>!this.finished(id));if(id){d.active=id;this.record(id).status='playing';}}
      return this.cue();
    }
    const f=this.facts(mission),rules=this.rules(f);
    if(!enabled||mission.state.status==='defeat'){this.suspend();return null;}
    if(d.active){
      const rule=rules[d.active];
      if(!rule?.valid||f.victory&&!finalScene(d.active))this.end('cancelled');
      else if(rule.priority===2&&f.battle)this.interrupt();
    }
    const eligible=[];
    for(const [id,rule] of Object.entries(rules)){
      if(!this.scenes.has(id)||this.finished(id)||id===d.active)continue;
      if(!rule.valid){
        if(this.data.scenes[id]){const record=this.record(id);record.status='cancelled';record.endedAt=d.clock;}
        continue;
      }
      if(!rule.trigger||rule.priority===2&&(f.battle||f.quiet<8000||d.clock-d.lastEnd<rule.gap*1000))continue;
      if(f.victory&&!finalScene(id))continue;
      eligible.push({id,...rule});
    }
    eligible.sort((a,b)=>a.priority-b.priority);
    const next=eligible[0];
    if(next&&(!d.active||next.priority===0&&rules[d.active].priority>0)){
      this.interrupt();d.active=next.id;this.record(next.id).status='playing';
    }
    return this.cue(rules);
  }
  cue(rules={}) {
    const d=this.data,id=d.active;if(!id)return null;
    const record=this.record(id),cueId=this.scenes.get(id).cues[record.cursor],line=this.lines.get(cueId);
    return {...line,storyScene:id,story:true,dialogue:true,chapter:sceneSignal[id]??'story-'+id,
      token:`${id}:${record.cursor}`,priority:4-(rules[id]?.priority??2),station:this.script.speakers[line.speaker].name,
      portrait:line.speaker==='commander'?(Number(id)>=26?'relaxed':'radio'):line.speaker==='warrant'?(Number(id)>=26?'tea':'neutral'):'radio'};
  }
}

export async function loadMissionStory() {
  const base=new URL('../assets/campaign/alpha/mission01/',import.meta.url);
  const load=async file=>{const response=await fetch(new URL(file,base));if(!response.ok)throw new Error(file+': '+response.status);return response.json();};
  const [story,audio]=await Promise.all([load('story-v2.json'),load('audio-v2.json')]);
  return {...story,dialogue:story.dialogue.map(line=>({...line,clip:audio.clips[line.id]})),barks:story.barks.map(line=>({...line,clip:audio.clips[line.id]}))};
}
