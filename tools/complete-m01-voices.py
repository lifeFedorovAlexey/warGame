"""Plan and apply missing M01 performances without overwriting original recordings."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from collections import Counter
import argparse
import copy
import importlib.util
import json
import shutil
from dialogue_editor import catalog, mission_info, load_draft

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'assets/campaign/alpha/mission01'
WORK = ROOT/'tools/.runtime-media/elevenlabs-m01'
PLAN = WORK/'plan.json'
REPORT = ROOT/'docs/campaign/alpha/voice/elevenlabs-m01-completion.json'
SOURCES = ['story-v2.json', 'audio-v2.json', 'reviewed-dialogue.json', 'factory-service-voice.json']
# IDs verified against the owner's authenticated ElevenLabs voice collection.
VOICES = {
    'commander': ('5mJA7umOnM5ycymymd6P', 'comandorNig'),
    'warrant': ('6A9D8WSMm4rFsg2DWFeE', 'Egor Gadzhiyev - Clear and Commanding'),
    'builder': ('txnCCHHGKmYIwrn7HfHQ', 'Alexandr Vlasov - Vibrant and Energetic'),
    'scientist': ('1KGG4Q8LqRdNII9xBurw', 'M. Danisch - Narrator'),
    'scout': ('RLRdvNFwJJct2XZOgfzy', 'Mishka Yaponcik - Odessa Rogue Charm'),
    'radio': ('RLRdvNFwJJct2XZOgfzy', 'Mishka Yaponcik - Odessa Rogue Charm'),
    'raider': ('hD8aK7CmEPgH3mbFO08e', 'Ivo - Calming, chill and narrative'),
    'chief': ('hD8aK7CmEPgH3mbFO08e', 'Ivo - Calming, chill and narrative'),
    'soldier': ('JKtNvDNrWu33P1xzttP2', 'Ivan - Energetic and Sassy'),
    'driver': ('JKtNvDNrWu33P1xzttP2', 'Ivan - Energetic and Sassy'),
}

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
    temp.replace(path)

def active_lines(document):
    keys = dict.fromkeys(key for scene in document['scenes']
        if scene['kind'] != 'archive' and scene.get('enabled', True)
        and scene.get('presentation', {}).get('type') != 'video'
        for key in scene['cues'] if document['lines'][key].get('enabled', True))
    return {key:document['lines'][key] for key in keys}

def prepare():
    if PLAN.exists():
        raise ValueError('Plan already exists; reuse it to avoid paid duplicate generations')
    info = mission_info('alpha-m01')
    current = active_lines(catalog(info))
    snapshot = load_draft(info)
    draft = snapshot['document']
    lines, original_files = [], {}
    for key, line in current.items():
        audio = line.get('audio') or {}
        if audio.get('file'):
            original_files[audio['file']] = sha256((ROOT/audio['file']).read_bytes()).hexdigest()
        if audio.get('origin') != 'temporary-synthesis' and key != 'm01-s07-l014':
            continue
        latest = draft['lines'][key]
        if latest['speaker'] != line['speaker'] or not latest.get('enabled', True):
            raise ValueError('Draft participant/enabled status differs: '+key)
        voice_id, voice_name = VOICES[latest['speaker']]
        text = latest['text'].strip()
        # Audio-only direction; subtitles and the owner's wording stay intact.
        direction = '[announcing] ' if key == 'm01-s14-l001' else '[sarcastic] ' if latest['speaker']=='chief' else ''
        lines.append({'id':key,'speaker':latest['speaker'],'text':text,
            'spokenText':direction+text,'voiceId':voice_id,'voiceName':voice_name,
            'previousFile':audio.get('file'),'previousText':line['text']})
    lines.sort(key=lambda line:line['id']!='m01-s07-l014')
    plan = {'mission':'alpha-m01','draftRevision':snapshot['revision'],
        'modelId':'eleven_v4','voiceSettings':{'stability':.5,'similarityBoost':.75},
        'sourceHashes':{name:sha256((BASE/name).read_bytes()).hexdigest() for name in SOURCES},
        'originalFiles':original_files,'lines':lines}
    write(PLAN, plan)
    backup = WORK/'before';backup.mkdir(exist_ok=True)
    for name in SOURCES:shutil.copyfile(BASE/name, backup/name)
    write(backup/'draft.json',snapshot)
    print(json.dumps({'lines':len(lines),'characters':sum(len(l['spokenText']) for l in lines),
        'roles':dict(Counter(l['speaker'] for l in lines)),'plan':str(PLAN)},ensure_ascii=False))

def apply(server_url):
    plan = read(PLAN);info = mission_info('alpha-m01');snapshot = load_draft(info)
    if snapshot['revision'] != plan['draftRevision']:
        raise ValueError('Workshop changed since preparation; reconcile before applying')
    for name, digest in plan['sourceHashes'].items():
        if sha256((BASE/name).read_bytes()).hexdigest() != digest:
            raise ValueError('Game content changed since preparation: '+name)
    results = {r['id']:r for p in (WORK/'renders').glob('*.json') for r in [read(p)]}
    missing = [line['id'] for line in plan['lines'] if line['id'] not in results]
    if missing:raise ValueError('Missing generated performances: '+', '.join(missing))
    spec = importlib.util.spec_from_file_location('apply_dialogue',ROOT/'tools/apply-dialogue-draft.py')
    module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    audio = read(BASE/'audio-v2.json');edits = read(BASE/'reviewed-dialogue.json')
    service = read(BASE/'factory-service-voice.json');document = copy.deepcopy(snapshot['document'])
    clips = {}
    for line in plan['lines']:
        result = results[line['id']]
        for field in ('text','spokenText','voiceId','voiceName'):
            if result[field] != line[field]:raise ValueError('Generation does not match plan: '+line['id'])
        source = Path(result['file']);data = source.read_bytes();digest = sha256(data).hexdigest()
        if digest != result['sha256']:raise ValueError('Generated file changed: '+line['id'])
        target = BASE/'recordings/elevenlabs'/f"{line['id']}-{digest[:12]}.mp3"
        clip = {'file':target.relative_to(BASE).as_posix(),**module.measured(source),
            'speaker':line['speaker'],'text':line['text'],'sha256':digest,'bytes':len(data),
            'origin':'elevenlabs-synthesis','voiceId':line['voiceId'],'voiceName':line['voiceName'],
            'modelId':plan['modelId'],'voiceSettings':plan['voiceSettings'],
            'generatedAt':result['createdAt'],'draftRevision':plan['draftRevision']}
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists() and target.read_bytes()!=data:raise ValueError('Recording conflict: '+str(target))
        if not target.exists():target.write_bytes(data)
        clips[line['id']] = clip
        entry = document['lines'][line['id']]
        entry['audio'] = {**clip,'file':target.relative_to(ROOT).as_posix()}
        entry['recordingStatus'] = 'Т'
        if line['id'].startswith('factory-'):
            next(b for b in service['barks'] if b['id']==line['id'])['clip'] = clip
        else:
            audio['clips'][line['id']] = clip
            if line['id'] in edits['clips']:edits['clips'][line['id']] = clip
            if line['text'] != line['previousText']:
                replacement = {k:entry[k] for k in ('id','speaker','text','pauseAfter','recordingStatus') if k in entry}
                edits['dialogue'] = [l for l in edits['dialogue'] if l['id']!=line['id']]+[replacement]
    # Save through the editor API so its live revision check and history apply.
    import urllib.request
    import urllib.error
    payload = json.dumps({'revision':snapshot['revision'],'document':document},ensure_ascii=False).encode('utf-8')
    # Prove that the editor serves these new assets before updating its draft.
    sample = next(iter(clips.values()))
    sample_url = server_url+'/assets/campaign/alpha/mission01/'+sample['file']
    with urllib.request.urlopen(sample_url,timeout=30) as response:
        if sha256(response.read()).hexdigest()!=sample['sha256']:
            raise ValueError('Review server serves another checkout')
    req = urllib.request.Request(server_url+'/api/dialogues/alpha-m01',data=payload,
        headers={'Content-Type':'application/json','X-Dialogue-Editor':'1',
                 'Origin':server_url},method='PUT')
    try:
        with urllib.request.urlopen(req,timeout=30) as response:saved=json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError('Workshop rejected save: '+error.read().decode('utf-8')) from None
    for name, value in [('audio-v2.json',audio),('reviewed-dialogue.json',edits),('factory-service-voice.json',service)]:
        write(BASE/name,value)
    modified = [p for p,digest in plan['originalFiles'].items() if sha256((ROOT/p).read_bytes()).hexdigest()!=digest]
    if modified:raise ValueError('Original recordings changed: '+', '.join(modified))
    remaining = [key for key,l in active_lines(catalog(info)).items() if not l.get('audio') or l['audio'].get('origin')=='temporary-synthesis']
    report = {'mission':'alpha-m01','completedAt':datetime.now(timezone.utc).isoformat(),
        'sourceDraftRevision':plan['draftRevision'],'savedDraftRevision':saved.get('revision'),
        'generatedLines':len(clips),'originalAudioFilesPreserved':len(plan['originalFiles']),
        'remainingTemporaryOrMissing':remaining,'voices':{role:{'id':v[0],'name':v[1]} for role,v in VOICES.items()},'clips':clips}
    write(REPORT,report)
    print(json.dumps({k:v for k,v in report.items() if k not in ('voices','clips')},ensure_ascii=False))
    if remaining:raise ValueError('Some active lines remain temporary or missing')

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','apply'])
    parser.add_argument('--url',default='http://127.0.0.1:8766');args=parser.parse_args()
    prepare() if args.action=='prepare' else apply(args.url.rstrip('/'))
