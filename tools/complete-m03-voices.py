"""Bounded M03 rewrite/voice batch. Preserve original scripts, clips and trigger IDs."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse, copy, importlib.util, json, urllib.request
from dialogue_editor import catalog, mission_info, load_draft, validate
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'assets/campaign/alpha/mission03'
WORK=ROOT/'tools/.runtime-media/elevenlabs-m03'
PLAN=WORK/'plan.json'
PROPOSAL=ROOT/'docs/campaign/alpha/voice/mission03-language-pass.json'
REPORT=ROOT/'docs/campaign/alpha/voice/elevenlabs-m03-completion.json'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(p)
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def prepare():
 if PLAN.exists():raise ValueError('Immutable plan already exists; reuse cached results')
 proposal=read(PROPOSAL);info=mission_info('alpha-m03');snapshot=load_draft(info);validate(snapshot['document'],info)
 current=catalog(info);cast=read(ROOT/'docs/campaign/alpha/voice/elevenlabs-m01-completion.json')['voices']
 cast['general']={'id':'rQOBu7YxCDxGiFdTm28w','name':'Artem Lebedev - Captivating and Engaging'};cast['pilot']=cast['driver']
 assert {s['id'] for s in current['scenes']}=={s['id'] for s in proposal['scenes']}
 lines=[];cues=[];scenes=[];seen={}
 for scene in proposal['scenes']:
  ids=[]
  for i,row in enumerate(scene['lines'],1):
   key=scene['id'].replace('m03-','m03-v2-',1)+'-'+str(i);voice=cast[row['speaker']]
   spoken=('['+row['direction']+'] ' if row.get('direction') else '')+row['text']
   identity=(voice['id'],spoken)
   line={'id':key,'speaker':row['speaker'],'text':row['text'],'spokenText':spoken,'voiceId':voice['id'],'voiceName':voice['name'],'modelId':'eleven_v4','estimatedCredits':len(spoken)}
   if identity not in seen:seen[identity]=key;lines.append(line)
   cues.append({**line,'renderId':seen[identity]});ids.append(key)
  scenes.append({'id':scene['id'],'title':scene['title'],'cues':ids})
 originals={l['audio']['file']:sha256((ROOT/l['audio']['file']).read_bytes()).hexdigest() for l in current['lines'].values() if l.get('audio')}
 sources=[BASE/n for n in ['story.json','audio.json','reviewed-dialogue.json']]+[PROPOSAL]
 plan={'mission':'alpha-m03','budgetCredits':2000,'estimatedCredits':sum(l['estimatedCredits'] for l in lines),'draftRevision':snapshot['revision'],
 'voiceSettings':{'stability':.5,'similarityBoost':.75},'profiles':[{'profile':role,'voiceId':cast[role]['id'],'voiceName':cast[role]['name']} for role in sorted({l['speaker'] for l in lines})],
 'lines':lines,'cues':cues,'scenes':scenes,'originalFiles':originals,'sourceHashes':{p.relative_to(ROOT).as_posix():sha256(p.read_bytes()).hexdigest() for p in sources}}
 assert plan['estimatedCredits']<=plan['budgetCredits'];write(PLAN,plan);write(WORK/'before-draft.json',snapshot)
 for p in sources:write(WORK/'before'/p.relative_to(ROOT),read(p))
 print(json.dumps({'lines':len(cues),'recordings':len(lines),'estimatedCredits':plan['estimatedCredits'],'budget':2000}))
def apply(server):
 if REPORT.exists():raise ValueError('Already applied; do not overwrite newer editor work')
 plan=read(PLAN);ledger=read(WORK/'ledger.json');info=mission_info('alpha-m03');snapshot=load_draft(info)
 assert snapshot['revision']==plan['draftRevision'],'Editor revision changed'
 assert len(ledger['requests'])==len(plan['lines']) and all(v['status']=='complete' for v in ledger['requests'].values())
 reserved=sum(v['reservedCredits'] for v in ledger['requests'].values());assert reserved==plan['estimatedCredits']<=2000
 for file,digest in plan['sourceHashes'].items():assert sha256((ROOT/file).read_bytes()).hexdigest()==digest,'Source changed: '+file
 measure=module('m03_measure','apply-dialogue-draft.py').measured;renders={}
 for line in plan['lines']:
  result=read(WORK/'renders'/(line['id']+'.json'));data=Path(result['file']).read_bytes();digest=sha256(data).hexdigest()
  for field in ['text','spokenText','voiceId','voiceName','modelId']:assert result[field]==line[field]
  assert digest==result['sha256']==ledger['requests'][line['id']]['sha256']
  target=BASE/'recordings/elevenlabs'/f"{line['id']}-{digest[:12]}.mp3"
  metrics=measure(Path(result['file']));assert metrics['duration']<max(12,len(line['text'])/3)
  target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists():assert target.read_bytes()==data
  else:target.write_bytes(data)
  renders[line['id']]={'file':target.relative_to(BASE).as_posix(),'text':line['text'],'speaker':line['speaker'],'origin':'elevenlabs-synthesis','sha256':digest,'bytes':len(data),**metrics,
    'voiceId':line['voiceId'],'voiceName':line['voiceName'],'modelId':line['modelId'],'voiceSettings':plan['voiceSettings'],'generatedAt':result['createdAt']}
 edits=read(BASE/'reviewed-dialogue.json');document=copy.deepcopy(snapshot['document']);clips={};new_lines=[]
 for cue in plan['cues']:
  key=cue['id'];clip=copy.deepcopy(renders[cue['renderId']]);assert clip['text']==cue['text'];clip['speaker']=cue['speaker'];clips[key]=clip
  line={'id':key,'speaker':cue['speaker'],'text':cue['text'],'pauseAfter':.25,'recordingStatus':'Т'};new_lines.append(line)
  document['lines'][key]={**line,'key':key,'enabled':True,'notes':'','portraitState':'','portrait':None,'audio':{**clip,'file':(BASE/clip['file']).relative_to(ROOT).as_posix()}}
 for scene in plan['scenes']:
  next(s for s in document['scenes'] if s['id']==scene['id']).update(scene)
  old=next((s for s in edits['scenes'] if s['id']==scene['id']),None)
  if old is None:edits['scenes'].append(scene)
  else:old.update(scene)
 edits['dialogue']+=new_lines;edits['clips'].update(clips)
 sample=next(iter(clips.values()))
 with urllib.request.urlopen(server+'/assets/campaign/alpha/mission03/'+sample['file'],timeout=30) as response:assert sha256(response.read()).hexdigest()==sample['sha256'],'Wrong checkout'
 req=urllib.request.Request(server+'/api/dialogues/alpha-m03',method='PUT',data=json.dumps({'revision':snapshot['revision'],'document':document},ensure_ascii=False).encode(),headers={'Content-Type':'application/json','X-Dialogue-Editor':'1','Origin':server})
 with urllib.request.urlopen(req,timeout=30) as response:saved=json.load(response)
 edits.update(draftRevision=saved['revision'],appliedAt=datetime.now(timezone.utc).isoformat());write(BASE/'reviewed-dialogue.json',edits)
 for file,digest in plan['originalFiles'].items():assert sha256((ROOT/file).read_bytes()).hexdigest()==digest
 active=catalog(info);active_ids={key for s in active['scenes'] for key in s['cues']};assert active_ids==set(clips)
 remaining=[key for key in active_ids if active['lines'][key]['audio']['origin']!='elevenlabs-synthesis'];assert not remaining
 report={'mission':'alpha-m03','completedAt':datetime.now(timezone.utc).isoformat(),'budgetCredits':2000,'reservedCredits':reserved,'generatedRecordings':len(renders),'activeLines':len(clips),'scenes':plan['scenes'],
 'sourceDraftRevision':plan['draftRevision'],'savedDraftRevision':saved['revision'],'originalAudioFilesPreserved':len(plan['originalFiles']),'remainingTemporaryOrMissing':remaining,'clips':clips,
 'note':'Conservative reserved credits, not verified account debit. Reused identical research line across both outcomes. No runtime paid API calls.'}
 write(REPORT,report);print(json.dumps({k:v for k,v in report.items() if k not in ('clips','scenes')}))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','apply']);parser.add_argument('--url',default='http://127.0.0.1:8769');args=parser.parse_args()
 prepare() if args.action=='prepare' else apply(args.url.rstrip('/'))
