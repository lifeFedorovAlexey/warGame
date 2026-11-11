"""Replace only missing/temporary M02 voices, preserving texts and original files."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from collections import Counter
import argparse
import copy
import importlib.util
import json
import urllib.request
from dialogue_editor import catalog, mission_info, load_draft

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets/campaign/alpha/mission02'
WORK = ROOT / 'tools/.runtime-media/elevenlabs-m02'
PLAN = WORK / 'plan.json'
REPORT = ROOT / 'docs/campaign/alpha/voice/elevenlabs-m02-completion.json'
SOURCES = ('story.json', 'audio.json', 'reviewed-dialogue.json')


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


m01 = module('m01_voices', 'complete-m01-voices.py')
read, write, active_lines, VOICES = m01.read, m01.write, m01.active_lines, m01.VOICES


def prepare():
    if PLAN.exists():
        raise ValueError('Plan already exists; reuse it to avoid paid duplicate generations')
    info = mission_info('alpha-m02')
    current, snapshot = active_lines(catalog(info)), load_draft(info)
    lines, originals = [], {}
    for key, line in current.items():
        audio = line.get('audio') or {}
        if audio.get('file'):
            originals[audio['file']] = sha256((ROOT / audio['file']).read_bytes()).hexdigest()
        if audio and audio.get('origin') != 'temporary-synthesis':
            continue
        latest = snapshot['document']['lines'][key]
        if latest['speaker'] != line['speaker'] or not latest.get('enabled', True):
            raise ValueError('Draft participant/enabled status differs: ' + key)
        voice_id, voice_name = VOICES[latest['speaker']]
        text = latest['text'].strip()
        spoken = ('[dry] ' if key in ('m02-radio-sensor-ready-2', 'm02-radio-sensor-ready-3') else '') + text
        lines.append({'id': key, 'speaker': latest['speaker'], 'text': text,
                      'spokenText': spoken, 'voiceId': voice_id, 'voiceName': voice_name,
                      'modelId': 'eleven_v4', 'estimatedCredits': len(spoken),
                      'previousFile': audio.get('file'), 'previousText': line['text']})
    if not lines:
        raise ValueError('All active M02 lines already have recorded voices')
    plan = {'mission': 'alpha-m02', 'draftRevision': snapshot['revision'],
            'modelId': 'eleven_v4', 'voiceSettings': {'stability': .5, 'similarityBoost': .75},
            'budgetCredits': sum(line['estimatedCredits'] for line in lines),
            'profiles': [{'profile': role, 'voiceId': VOICES[role][0], 'voiceName': VOICES[role][1]}
                         for role in sorted({line['speaker'] for line in lines})],
            'sourceHashes': {name: sha256((BASE / name).read_bytes()).hexdigest() for name in SOURCES},
            'originalFiles': originals, 'lines': lines}
    write(PLAN, plan)
    write(WORK / 'before/draft.json', snapshot)
    for name in SOURCES:
        write(WORK / 'before' / name, read(BASE / name))
    print(json.dumps({'lines': len(lines), 'reservedBudget': plan['budgetCredits'],
                      'roles': dict(Counter(line['speaker'] for line in lines)), 'plan': str(PLAN)}))


def apply(server):
    plan, ledger = read(PLAN), read(WORK / 'ledger.json')
    info = mission_info('alpha-m02')
    snapshot = load_draft(info)
    if snapshot['revision'] != plan['draftRevision']:
        raise ValueError('Workshop changed; reconcile before applying')
    for name, digest in plan['sourceHashes'].items():
        if sha256((BASE / name).read_bytes()).hexdigest() != digest:
            raise ValueError('Game content changed: ' + name)
    measure = module('measure_dialogue', 'apply-dialogue-draft.py').measured
    story, audio, edits = (read(BASE / name) for name in SOURCES)
    document, clips = copy.deepcopy(snapshot['document']), {}
    for line in plan['lines']:
        key = line['id']
        result = read(WORK / 'renders' / (key + '.json'))
        for field in ('text', 'spokenText', 'speaker', 'voiceId', 'voiceName', 'modelId'):
            if result[field] != line[field]:
                raise ValueError('Generation differs from plan: ' + key)
        data = Path(result['file']).read_bytes()
        digest = sha256(data).hexdigest()
        request = ledger['requests'][key]
        if result['sha256'] != digest or request['status'] != 'complete' or request['sha256'] != digest:
            raise ValueError('Recording/ledger mismatch: ' + key)
        target = BASE / 'recordings/elevenlabs' / f'{key}-{digest[:12]}.mp3'
        clip = {'file': target.relative_to(BASE).as_posix(), **measure(Path(result['file'])),
                'speaker': line['speaker'], 'text': line['text'], 'sha256': digest, 'bytes': len(data),
                'origin': 'elevenlabs-synthesis', 'voiceId': line['voiceId'], 'voiceName': line['voiceName'],
                'modelId': line['modelId'], 'voiceSettings': plan['voiceSettings'],
                'generatedAt': result['createdAt'], 'draftRevision': plan['draftRevision']}
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_bytes() != data:
            raise ValueError('Recording conflict: ' + str(target))
        if not target.exists():
            target.write_bytes(data)
        clips[key] = audio['clips'][key] = clip
        if key in edits['clips']:
            edits['clips'][key] = clip
        entry = document['lines'][key]
        entry['audio'] = {**clip, 'file': target.relative_to(ROOT).as_posix()}
        entry['recordingStatus'] = 'Т'
        for value in [*story['dialogue'], *story.get('barks', []), *edits['dialogue']]:
            if value['id'] == key:
                value.update(text=line['text'], recordingStatus='Т')
    # Verify the intended checkout, then save using the editor's revision protection/history.
    sample = next(iter(clips.values()))
    with urllib.request.urlopen(server + '/assets/campaign/alpha/mission02/' + sample['file'], timeout=30) as response:
        if sha256(response.read()).hexdigest() != sample['sha256']:
            raise ValueError('Server serves another checkout')
    request = urllib.request.Request(server + '/api/dialogues/alpha-m02', method='PUT',
        data=json.dumps({'revision': snapshot['revision'], 'document': document}, ensure_ascii=False).encode(),
        headers={'Content-Type': 'application/json', 'X-Dialogue-Editor': '1', 'Origin': server})
    with urllib.request.urlopen(request, timeout=30) as response:
        saved = json.load(response)
    audio['status'] = story['audioStatus'] = 'recorded'
    for name, value in zip(SOURCES, (story, audio, edits)):
        if value != read(BASE / name):
            write(BASE / name, value)
    for file, digest in plan['originalFiles'].items():
        if sha256((ROOT / file).read_bytes()).hexdigest() != digest:
            raise ValueError('Original recording changed: ' + file)
    remaining = [key for key, line in active_lines(catalog(info)).items()
                 if not line.get('audio') or line['audio'].get('origin') == 'temporary-synthesis']
    report = {'mission': 'alpha-m02', 'completedAt': datetime.now(timezone.utc).isoformat(),
              'sourceDraftRevision': plan['draftRevision'], 'savedDraftRevision': saved['revision'],
              'generatedLines': len(clips), 'originalAudioFilesPreserved': len(plan['originalFiles']),
              'reservedCredits': sum(r['reservedCredits'] for r in ledger['requests'].values()),
              'remainingTemporaryOrMissing': remaining, 'clips': clips}
    write(REPORT, report)
    if remaining:
        raise ValueError('Active M02 lines remain temporary or missing')
    write(ROOT / 'docs/campaign/alpha/m02/voice-pending.json', [])
    print(json.dumps({key: value for key, value in report.items() if key != 'clips'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'apply'])
    parser.add_argument('--url', default='http://127.0.0.1:8766')
    args = parser.parse_args()
    prepare() if args.action == 'prepare' else apply(args.url.rstrip('/'))
