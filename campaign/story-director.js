import {storyFacts,storyRules} from './story-events.js';
import {parkRadioStory} from './radio-save.js';
import {updateStoryConstruction,migrateStoryOpening} from './story-construction.js';

const terminal = status => ['done','skipped','cancelled'].includes(status);
const sceneSignal = {r01:'intro',r14:'first-contact',r18:'raid-won',r36:'camp3-sighted',r41:'last-camp',r50:'outro'};
const finalScene = id => ['r48','r49','r50','r54','u01','u02','u04'].includes(id);
const prologueScenes=['p01','p02','p03','p04'];

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
  get prologueDone(){return this.mode==='prologue'&&prologueScenes.every(id=>this.finished(id));}
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
    if(event.type==='generator-breakdown')f.generatorBroken=true;
    if(event.type==='unit-damaged'&&mission.entity(event.target)?.campId===mission.state.camps[3]?.id)f.chiefAssault=true;
  }
  facts(mission) {return storyFacts(mission,this.data);}
  rules(f) {return storyRules(this,f);}
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
    if(id==='r19'&&status==='done'&&!d.journal.some(item=>item.id==='outcasts'))
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
      if(!d.active){const id=prologueScenes.find(id=>!this.finished(id));if(id){d.active=id;this.record(id).status='playing';}}
      return this.cue();
    }
    const f=this.facts(mission),rules=this.rules(f);
    if(!enabled||mission.state.status==='defeat'){this.suspend();return null;}
    if(d.active){
      const rule=rules[d.active];
      if(!rule?.valid||f.victory&&!finalScene(d.active))this.end('cancelled');
      else if(rule.priority>0&&f.battle)this.interrupt();
    }
    const eligible=[];
    for(const [id,rule] of Object.entries(rules)){
      if(!this.scenes.has(id)||this.finished(id)||id===d.active)continue;
      if(!rule.valid){
        if(this.data.scenes[id]){const record=this.record(id);record.status='cancelled';record.endedAt=d.clock;}
        continue;
      }
      if(!rule.trigger||rule.priority>0&&f.battle||rule.priority>=2&&(f.quiet<8000||d.clock-d.lastEnd<rule.gap*1000))continue;
      if(rule.priority===3&&d.clock-(d.facts.lastChatterAt??-Infinity)<45000)continue;
      if(f.victory&&!finalScene(id))continue;
      eligible.push({id,...rule});
    }
    eligible.sort((a,b)=>a.priority-b.priority);
    const next=eligible[0];
    if(next&&(!d.active||next.priority===0&&rules[d.active].priority>0)){
      this.interrupt();d.active=next.id;this.record(next.id).status='playing';
      if(next.priority===3)d.facts.lastChatterAt=d.clock;
    }
    return this.cue(rules);
  }
  cue(rules={}) {
    const d=this.data,id=d.active;if(!id)return null;
    const record=this.record(id),cueId=this.scenes.get(id).cues[record.cursor],line=this.lines.get(cueId);
    const order={r01:2,r02:2,r05:1,r21:0,r23:1};
    if(record.cursor>=order[id])(d.announced??={})[id]=true;
    return {...line,storyScene:id,story:true,dialogue:true,chapter:sceneSignal[id]??'story-'+id,
      token:`${id}:${record.cursor}`,priority:4-(rules[id]?.priority??2),station:this.script.speakers[line.speaker].name,
      portrait:line.speaker==='commander'?(finalScene(id)?'relaxed':'radio'):line.speaker==='warrant'?(finalScene(id)?'tea':'neutral'):'radio'};
  }
}

export async function loadMissionStory() {
  const base=new URL('../assets/campaign/alpha/mission01/',import.meta.url);
  const load=async file=>{const response=await fetch(new URL(file,base));if(!response.ok)throw new Error(file+': '+response.status);return response.json();};
  const [story,audio]=await Promise.all([load('story-v2.json'),load('audio-v2.json')]);
  return {...story,dialogue:story.dialogue.map(line=>({...line,clip:audio.clips[line.id]})),barks:story.barks.map(line=>({...line,clip:audio.clips[line.id]}))};
}
