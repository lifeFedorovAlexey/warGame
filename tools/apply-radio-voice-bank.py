"""Publish a verified, budgeted offline voice bank; leave phrases/drafts untouched."""
from pathlib import Path
from hashlib import sha256
import importlib.util
import json
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'tools/.runtime-media/elevenlabs-radio-10k'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,v):
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');tmp.replace(p)

plan=read(WORK/'plan.json');ledger=read(WORK/'ledger.json')
reserved=sum(r['reservedCredits'] for r in ledger['requests'].values())
assert reserved<=plan['budgetCredits']<=10000,'Budget exceeded'
assert len(ledger['requests'])==len(plan['lines']) and all(r['status']=='complete' for r in ledger['requests'].values()),'Incomplete generation'
spec=importlib.util.spec_from_file_location('apply_dialogue',ROOT/'tools/apply-dialogue-draft.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def verify(line):
    result=read(WORK/'renders'/(line['id']+'.json'))
    for key in ('text','profile','voiceId','voiceName','modelId','spokenText'):
        assert result[key]==line[key],f'Changed generation: {line["id"]}/{key}'
    data=Path(result['file']).read_bytes();digest=sha256(data).hexdigest()
    assert digest==result['sha256']==ledger['requests'][line['id']]['sha256']
    metrics=module.measured(result['file'])
    assert metrics['duration']<max(12,len(line['text'])/3),f'Unexpected long audio: {line["id"]}'
    target=ROOT/'assets/radio/recordings/elevenlabs-10k'/f'{line["profile"]}-{digest[:16]}.mp3'
    clip={'file':target.relative_to(ROOT).as_posix(),'text':line['text'],'voice':line['profile'],
          'voiceId':line['voiceId'],'voiceName':line['voiceName'],'modelId':line['modelId'],
          'origin':'elevenlabs-synthesis','sha256':digest,'bytes':len(data),**metrics}
    return target,data,clip
with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(verify,plan['lines']))
bank={'schemaVersion':1,'budgetCredits':plan['budgetCredits'],'reservedCredits':reserved,
      'profiles':plan['profiles'],'clips':{p['profile']:{} for p in plan['profiles']}}
for target,data,clip in results:
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():assert target.read_bytes()==data,'Existing recording conflict'
    else:target.write_bytes(data)
    bank['clips'][clip['voice']][clip['text']]=clip
write(ROOT/'assets/radio/recorded-speech.json',bank)
report={'budgetCredits':plan['budgetCredits'],'reservedCredits':reserved,'recordings':len(results),
        'texts':len(set(l['text'] for l in plan['lines'])),'seconds':sum(c['duration'] for _,_,c in results),
        'profiles':plan['profiles'],'exchanges':plan['exchanges'],
        'note':'Offline assets. Figures are conservative reserved credits; account balance permission is unavailable. No game-time API charges.'}
write(ROOT/'docs/campaign/radio-voice-bank-10k.json',report)
print(json.dumps({k:v for k,v in report.items() if k not in ('profiles','exchanges')},ensure_ascii=False))
