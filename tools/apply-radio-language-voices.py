"""Apply the verified language-review batch to radio and three M01 scenes."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import argparse
import copy
import importlib.util
import json
import urllib.request
from dialogue_editor import catalog, mission_info, load_draft

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'tools/.runtime-media/elevenlabs-radio-language'
BASE = ROOT / 'assets/campaign/alpha/mission01'
REPORT = ROOT / 'docs/campaign/radio-language-review.json'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
    temp.replace(path)


def main(server):
    if REPORT.exists():
        raise ValueError('Batch already applied; do not overwrite a later editor revision')
    plan, ledger = read(WORK / 'plan.json'), read(WORK / 'ledger.json')
    reserved = sum(r['reservedCredits'] for r in ledger['requests'].values())
    assert reserved <= plan['budgetCredits'] <= 10000
    assert len(ledger['requests']) == len(plan['lines'])
    assert all(r['status'] == 'complete' for r in ledger['requests'].values())
    for file, digest in plan['sourceHashes'].items():
        assert sha256((ROOT / file).read_bytes()).hexdigest() == digest, 'Source changed: '+file
    spec = importlib.util.spec_from_file_location('measure_dialogue', ROOT / 'tools/apply-dialogue-draft.py')
    measurement = importlib.util.module_from_spec(spec); spec.loader.exec_module(measurement)
    original_bank = read(ROOT / 'assets/radio/recorded-speech.json')
    original_files = {clip['file']:clip['sha256'] for clips in original_bank['clips'].values() for clip in clips.values()}
    info = mission_info('alpha-m01'); before = catalog(info); snapshot = load_draft(info)
    assert snapshot['revision'] == plan['draftRevision']
    for line in before['lines'].values():
        audio = line.get('audio') or {}
        if audio.get('file'):
            file = audio['file']; original_files[file] = sha256((ROOT / file).read_bytes()).hexdigest()
    write(WORK / 'before-draft.json', snapshot)
    for file in plan['sourceHashes']:
        write(WORK / 'before' / file, read(ROOT / file))

    def verify(line):
        result = read(WORK / 'renders' / (line['id']+'.json'))
        for key in ('text','profile','voiceId','voiceName','modelId','spokenText','kind'):
            assert result[key] == line[key], line['id']+'/'+key
        data = Path(result['file']).read_bytes(); digest = sha256(data).hexdigest()
        assert digest == result['sha256'] == ledger['requests'][line['id']]['sha256']
        metrics = measurement.measured(Path(result['file']))
        assert metrics['duration'] < max(12, len(line['text'])/3), line['id']
        if line['kind']=='radio':
            target = ROOT / 'assets/radio/recordings/language-review' / f"{line['profile']}-{digest[:16]}.mp3"
        else:
            target = BASE / 'recordings/elevenlabs' / f"{line['id']}-{digest[:12]}.mp3"
        clip = {'file':target.relative_to(ROOT if line['kind']=='radio' else BASE).as_posix(),
                'text':line['text'],'voiceId':line['voiceId'],'voiceName':line['voiceName'],
                'modelId':line['modelId'],'voiceSettings':plan['voiceSettings'],
                'origin':'elevenlabs-synthesis','sha256':digest,'bytes':len(data),**metrics}
        if line['kind']=='radio':clip['voice'] = line['profile']
        else:clip.update(speaker=line['speaker'],generatedAt=result['createdAt'],draftRevision=plan['draftRevision'])
        return line,target,data,clip

    with ThreadPoolExecutor(max_workers=4) as pool:
        verified = list(pool.map(verify, plan['lines']))
    for _, target, data, _ in verified:
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():assert target.read_bytes()==data, 'Immutable recording changed'
        else:target.write_bytes(data)
    radio_rows = [row for row in verified if row[0]['kind']=='radio']
    story_rows = [row for row in verified if row[0]['kind']=='story']
    radio_credits = sum(row[0]['estimatedCredits'] for row in radio_rows)
    story_credits = sum(row[0]['estimatedCredits'] for row in story_rows)
    assert radio_credits + story_credits == reserved
    batches = original_bank.get('batches', [{'id':'elevenlabs-10k','budgetCredits':original_bank['budgetCredits'],
         'reservedCredits':original_bank['reservedCredits'],'radioCredits':original_bank['reservedCredits'],'storyCredits':0}])
    batches.append({'id':'language-review','budgetCredits':plan['budgetCredits'],
                    'reservedCredits':reserved,'radioCredits':radio_credits,'storyCredits':story_credits})
    bank = {'schemaVersion':1,'profiles':plan['radioProfiles'],'clips':copy.deepcopy(plan['retainedClips']),
            'budgetCredits':sum(b['budgetCredits'] for b in batches),
            'reservedCredits':sum(b['reservedCredits'] for b in batches),'batches':batches}
    for line, _, _, clip in radio_rows:bank['clips'][line['profile']][line['text']] = clip
    bank['recordings'] = sum(len(clips) for clips in bank['clips'].values())

    edits = read(BASE / 'reviewed-dialogue.json'); document = copy.deepcopy(snapshot['document'])
    new_clips = {line['id']:clip for line,_,_,clip in story_rows}
    new_lines = {line['id']:{'id':line['id'],'speaker':line['speaker'],'text':line['text'],
                            'pauseAfter':.25,'recordingStatus':'Т'} for line,_,_,_ in story_rows}
    retired = []
    for planned in plan['scenes']:
        scene = next(s for s in document['scenes'] if s['id']==planned['id'])
        retired.extend(scene['cues']);scene.update(title=planned['title'],cues=planned['cues'])
        replacement = next((s for s in edits['scenes'] if s['id']==planned['id']), None)
        if replacement is None:
            replacement = {k:v for k,v in scene.items() if k not in ('kind','section','trigger')}
            edits['scenes'].append(replacement)
        replacement.update(title=planned['title'],cues=planned['cues'])
        if 'announcementCue' in replacement:replacement['announcementCue']=planned['cues'][-1]
    for line, target, _, clip in story_rows:
        document['lines'][line['id']] = {**new_lines[line['id']],'key':line['id'],
            'enabled':True,'notes':'','portraitState':'','portrait':None,
            'audio':{**clip,'file':target.relative_to(ROOT).as_posix()}}
    edits['dialogue'] = [line for line in edits['dialogue'] if line['id'] not in new_lines]+list(new_lines.values())
    edits['clips'].update(new_clips)
    # API revision guard protects a user who starts editing while rendering is in progress.
    sample = story_rows[0]
    with urllib.request.urlopen(server+'/'+sample[1].relative_to(ROOT).as_posix(), timeout=30) as response:
        assert sha256(response.read()).hexdigest()==sample[3]['sha256'], 'Wrong review checkout'
    request = urllib.request.Request(server+'/api/dialogues/alpha-m01', method='PUT',
        data=json.dumps({'revision':snapshot['revision'],'document':document},ensure_ascii=False).encode(),
        headers={'Content-Type':'application/json','X-Dialogue-Editor':'1','Origin':server})
    with urllib.request.urlopen(request,timeout=30) as response:saved=json.load(response)
    edits['draftRevision'] = saved['revision']
    edits['appliedAt'] = datetime.now(timezone.utc).isoformat()
    # Other scene overrides, drawings, original audio and the underlying story remain intact.
    write(BASE / 'reviewed-dialogue.json', edits)
    write(ROOT / 'assets/radio/recorded-speech.json', bank)
    for file, digest in original_files.items():
        assert sha256((ROOT / file).read_bytes()).hexdigest()==digest, 'Original asset changed: '+file
    active = catalog(info)
    for planned in plan['scenes']:
        actual = next(s for s in active['scenes'] if s['id']==planned['id'])
        assert actual['cues']==planned['cues']
        for key in actual['cues']:assert active['lines'][key]['audio']['sha256']==new_clips[key]['sha256']
    changes = read(WORK / 'changes.json')
    report = {'completedAt':datetime.now(timezone.utc).isoformat(),'budgetCredits':plan['budgetCredits'],
              'reservedCredits':reserved,'radioCredits':radio_credits,'storyCredits':story_credits,
              'generatedRadioRecordings':len(radio_rows),'generatedStoryRecordings':len(story_rows),
              'activeRadioRecordings':bank['recordings'],'reusedRadioRecordings':sum(len(v) for v in plan['retainedClips'].values()),
              'retiredRadioRecordings':plan['retiredRecordings'],'preservedOriginalFiles':len(original_files),
              'sourceDraftRevision':snapshot['revision'],'savedDraftRevision':saved['revision'],
              'profiles':plan['radioProfiles'],'scenes':plan['scenes'],'storyClips':new_clips,
              'retiredStoryIds':retired,'changes':changes,'exchanges':plan['exchanges'],
              'note':'Conservative reservations, not verified account charges. Original files retained. Fixed cast including Russian Odessa voice. Language ru. No runtime API calls.'}
    write(REPORT, report)
    print(json.dumps({k:v for k,v in report.items() if k not in ('profiles','scenes','storyClips','retiredStoryIds','changes','exchanges')},ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8769')
    args=parser.parse_args();main(args.url.rstrip('/'))
