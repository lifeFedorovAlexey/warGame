import {storyFacts,storyRules} from './story-events.js';
import {parkRadioStory} from './radio-save.js';
import {updateStoryConstruction,migrateStoryOpening} from './story-construction.js';
import {openingConstructionReady} from './opening-construction.js';
import {applyStoryEdits} from './story-edits.js';
import {appendM02Story,m02RadioRules} from './mission02-radio.js';
import {m03RadioRules} from './mission03-radio.js';

const terminal = status => ['done','skipped','cancelled'].includes(status);
const sceneSignal = {r01:'intro',r14:'first-contact',r18:'raid-won',r36:'camp3-sighted',r41:'last-camp',r50:'outro'};
const finalScene = id => ['r48','r49','r50','r54','u01','u02','u04'].includes(id);
const milestoneScenes=new Set(['r25','r26','r27','r29','r30-alt','r32','r33','r38','r39','r47']);
const followUp={r14:'r16',r25:'r26',r26:'r27',r27:'r29',r32:'r33',r38:'r39',r41:'r42'};
const prologueScenes=['p01','p02','p03','p04'];
const sceneGapMs=2000;

export class StoryDirector {
  constructor(script) {
    this.script=script;
    this.scenes=new Map(script.scenes.map(scene=>[scene.id,scene]));
    this.lines=new Map(script.dialogue.map(cue=>[cue.id,cue]));
  }
  bind(mission) {
    const state=mission.state.radioStory ??= {
      version:2,clock:0,scenes:{},facts:{},journal:[],lastEnd:-30000,lastCombat:-30000,
    };
    if(this.data!==state){
      this.data=state;this.lastNow=null;
      parkRadioStory(state);
      migrateStoryOpening(mission,state);
      // Disabled material stays editable, but cannot resume from an old save
      // or consume a radio slot before the next enabled scene.
      for(const scene of this.scenes.values())if(scene.enabled===false){
        const record=this.record(scene.id);
        if(!terminal(record.status)){record.status='skipped';record.endedAt=state.clock;}
      }
      // Older saves retain the actual retrofit on the car, even without the
      // campaign milestone. A newly produced twin has no such record.
      const retrofitted=(mission.state.units??[]).find(u=>u.modernization?.from==='U01'&&u.modernization.to==='U02');
      if(retrofitted){
        const campaign=mission.state.campaign??={version:1,results:{}};
        campaign.firstTwinModernization??={unitId:retrofitted.id,factoryId:retrofitted.modernization.factoryId,at:retrofitted.modernization.at,radioPlayed:false};
      }
      // A revised exchange may have fewer lines than the saved version.
      for(const [id,record] of Object.entries(state.scenes)){
        if(!terminal(record.status)&&record.cursor>=(this.scenes.get(id)?.cues.length??Infinity))record.cursor=0;
      }
    }
    this.mission=mission;
    return state;
  }
  beginStory(mission,{enabled=true}={}) {
    // New games include the opening; a loaded game keeps its saved place.
    this.bind(mission).includeOpening=enabled;
  }
  record(id){return this.data.scenes[id]??={status:'pending',cursor:0};}
  finished(id){return terminal(this.data.scenes[id]?.status);}
  heard(id){return this.data.scenes[id]?.status==='done';}
  get openingFinished(){return !this.data?.includeOpening||prologueScenes.every(id=>this.finished(id));}
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
  facts(mission) {return mission.state.m02||mission.state.m03?{battle:this.data.clock-this.data.lastCombat<3000,quiet:this.data.clock-this.data.lastCombat,victory:mission.state.status==='victory'}:storyFacts(mission,this.data);}
  rules(f) {
    const s=this.mission.state,rules=s.m03?m03RadioRules(this):s.m02?m02RadioRules(this):storyRules(this,f);
    const milestone=s.campaign?.firstTwinModernization,id='unit-twin-modernized';
    if(milestone&&!milestone.radioPlayed&&this.scenes.has(id)&&this.scenes.get(id).enabled!==false){
      // Mission transitions cancel old scene records. The campaign event must
      // survive that cancellation independently of the retired r10 trigger.
      const record=this.record(id);
      if(terminal(record.status)){record.status='pending';record.cursor=0;}
      rules[id]={priority:2,gap:0,valid:s.status==='running',trigger:!s.m02||!!s.m03||this.finished('m02-radio-twin-ready')};
    }
    return rules;
  }
  suspend() {
    if(this.data?.active)parkRadioStory(this.data);
  }
  end(status='done') {
    const d=this.data,id=d.active;if(!id)return;
    const record=this.record(id);record.status=status;record.endedAt=d.clock;
    if(id==='unit-twin-modernized'&&['done','skipped'].includes(status)&&this.mission.state.campaign?.firstTwinModernization)
      this.mission.state.campaign.firstTwinModernization.radioPlayed=true;
    d.active=null;d.lastEnd=d.clock;d.lastScene=id;
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
    updateStoryConstruction(mission,{radioEnabled:enabled});
    if(this.lastNow!==null)d.clock+=Math.max(0,Math.min(2000,now-this.lastNow));
    this.lastNow=now;
    const f=this.facts(mission),rules=this.rules(f);
    const opening=d.includeOpening&&prologueScenes.find(id=>!this.finished(id));
    if(opening)rules[opening]={priority:1,trigger:opening!=='p04'||openingConstructionReady(mission),valid:true};
    if(!enabled||mission.state.status==='defeat'){this.suspend();return null;}
    if(d.active){
      const rule=rules[d.active];
      // A started exchange finishes naturally. Attacks use the existing minimap
      // alert; neither combat nor an urgent report rewinds or replaces speech.
      if(!rule||(mission.state.m02||mission.state.m03)&&!rule.valid)this.end('cancelled');
      else if((mission.state.m02||mission.state.m03)&&rule.priority>0&&f.battle){this.record(d.active).cursor=0;this.suspend();}
    }
    const eligible=[];
    for(const [id,rule] of Object.entries(rules)){
      if(!this.scenes.has(id)||this.scenes.get(id).enabled===false||this.finished(id)||id===d.active)continue;
      if(opening&&id!==opening&&rule.priority>0&&!f.victory)continue;
      if(!rule.valid){
        if(this.data.scenes[id]){const record=this.record(id);record.status='cancelled';record.endedAt=d.clock;}
        continue;
      }
      if(!rule.trigger||d.clock-d.lastEnd<sceneGapMs||rule.priority>0&&f.battle||rule.priority>=2&&(f.quiet<8000||d.clock-d.lastEnd<rule.gap*1000))continue;
      if(rule.priority===3&&d.clock-(d.facts.lastChatterAt??-Infinity)<45000)continue;
      if(f.victory&&!finalScene(id)&&!milestoneScenes.has(id)&&!/^m0[23]-/.test(id))continue;
      eligible.push({id,...rule});
    }
    // Start the final contact on the march: acknowledge the third cleared camp,
    // then introduce Petrovich and keep his whole exchange ahead of research.
    // A recording already in progress still finishes intact.
    const chiefContact=f.chief&&(f.firstThreeCleared||this.heard('r41'))&&!this.finished('r42');
    const rank=id=>id==='r14'?0:chiefContact&&[f.chiefContactReport,'r41','r42'].includes(id)?1:id===followUp[d.lastScene]?2:3;
    eligible.sort((a,b)=>a.priority-b.priority||rank(a.id)-rank(b.id));
    const next=eligible[0];
    if(next&&!d.active){
      d.active=next.id;this.record(next.id).status='playing';
      if(next.priority===3)d.facts.lastChatterAt=d.clock;
    }
    return this.cue(rules);
  }
  cue(rules={}) {
    const d=this.data,id=d.active;if(!id)return null;
    const scene=this.scenes.get(id);
    if(scene.presentation?.type==='video')return null;
    if(scene.enabled===false||!scene.cues.length){this.end('skipped');return null;}
    const record=this.record(id),cueId=scene.cues[record.cursor],line=this.lines.get(cueId);
    const order={r01:2,r02:0,r05:1,r21:0,r23:1};
    const announcement=scene.announcementCue?scene.cues.indexOf(scene.announcementCue):order[id];
    if(record.cursor>=announcement)(d.announced??={})[id]=true;
    return {...line,storyScene:id,story:true,dialogue:true,chapter:id.startsWith('m02-')?id:sceneSignal[id]??'story-'+id,
      token:`${id}:${record.cursor}`,priority:4-(rules[id]?.priority??2),station:this.script.speakers[line.speaker].name,
      portrait:line.portraitState||(line.speaker==='commander'?(finalScene(id)?'relaxed':'radio'):line.speaker==='warrant'?(finalScene(id)?'tea':'neutral'):'radio')};
  }
}

export async function loadMissionStory() {
  const base=new URL('../assets/campaign/alpha/mission01/',import.meta.url);
  const load=async file=>{const response=await fetch(new URL(file,base));if(!response.ok)throw new Error(file+': '+response.status);return response.json();};
  const [original,originalAudio,service,edits]=await Promise.all([load('story-v2.json'),load('audio-v2.json'),load('factory-service-voice.json'),load('reviewed-dialogue.json')]);
  const {story,audio}=applyStoryEdits(original,originalAudio,edits);
  const m02Base=new URL('../assets/campaign/alpha/mission02/',import.meta.url);
  const m02Load=async file=>{const r=await fetch(new URL(file,m02Base));if(!r.ok)throw new Error('m02 '+file+': '+r.status);return r.json();};
  const [m02Script,m02Audio,m02Edits]=await Promise.all(['story.json','audio.json','reviewed-dialogue.json'].map(m02Load));
  const m02=applyStoryEdits(m02Script,m02Audio,m02Edits);
  m02.story.dialogue=m02.story.dialogue.map(line=>({...line,clip:m02.audio.clips[line.id]?.file?{...m02.audio.clips[line.id],base:m02Base.href}:null}));
  const m03Base=new URL('../assets/campaign/alpha/mission03/',import.meta.url);
  const [m03Script,m03Audio,m03Edits]=await Promise.all(['story.json','audio.json','reviewed-dialogue.json'].map(async file=>{const r=await fetch(new URL(file,m03Base));if(!r.ok)throw new Error('m03 '+file+': '+r.status);return r.json();}));
  const m03=applyStoryEdits(m03Script,m03Audio,m03Edits);
  m03.story.dialogue=m03.story.dialogue.map(line=>({...line,clip:m03.audio.clips[line.id]?.file?{...m03.audio.clips[line.id],base:m03Base.href}:null}));
  const merged=appendM02Story(appendM02Story({...story,dialogue:story.dialogue.map(line=>({...line,clip:audio.clips[line.id]})),barks:[...story.barks.map(line=>({...line,clip:audio.clips[line.id]})),...service.barks]},m02.story),m03.story);
  merged.speakers={...story.speakers,...m03.story.speakers};return merged;
}
