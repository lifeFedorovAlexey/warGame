"""Promote a bounded, owner-approved part of the workshop draft into the game."""
from array import array
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets/campaign/alpha/mission01'
DRAFT = ROOT / 'docs/campaign/dialogue-drafts/alpha-m01/draft.json'
TARGET = BASE / 'reviewed-dialogue.json'
sys.path.insert(0, str(ROOT / 'tools/.runtime-media/python'))
import imageio_ffmpeg


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def measured(path):
    result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error',
        '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', '24000', 'pipe:1'], capture_output=True)
    if result.returncode:
        raise ValueError('Cannot decode ' + str(path) + ': ' + result.stderr.decode(errors='replace'))
    pcm = array('h', result.stdout)
    duration = len(pcm) / 24000
    windows = [sum(x*x for x in pcm[i:i+240]) / len(pcm[i:i+240]) for i in range(0,len(pcm),240)]
    audible = [i for i, energy in enumerate(windows) if energy > 327.68**2]
    if duration <= .15 or not audible:
        raise ValueError('Empty recording: ' + str(path))
    return {'duration':duration,'leadingSilence':audible[0]*.01,
            'trailingSilence':max(0,duration-(audible[-1]+1)*.01)}


def apply(through_scene, expected_revision=None, from_scene=None, report_name='applied-stage-iii.json', mission_id='alpha-m01', allow_subtitles=False):
    from dialogue_editor import mission_info
    info = mission_info(mission_id)
    if not info:
        raise ValueError('Unknown mission: ' + mission_id)
    BASE = info['path']
    DRAFT = ROOT / 'docs/campaign/dialogue-drafts' / mission_id / 'draft.json'
    TARGET = BASE / 'reviewed-dialogue.json'
    if not re.fullmatch(r'[a-zA-Z0-9_-]+\.json', report_name):
        raise ValueError('Report must be a JSON filename')
    raw = DRAFT.read_bytes()
    snapshot = json.loads(raw)
    if expected_revision is not None and snapshot['revision'] != expected_revision:
        raise ValueError('Draft revision changed; inspect the new edits before applying')
    document = snapshot['document']
    selected = []
    in_scope = from_scene is None
    for scene in document['scenes']:
        if scene['kind'] != 'sequence':
            continue
        if scene['id'] == from_scene:
            in_scope = True
        if not in_scope:
            continue
        selected.append(scene)
        if scene['id'] == through_scene:
            break
    else:
        raise ValueError('Scope boundary not found: ' + through_scene)
    previous = read(TARGET) if TARGET.exists() else {'scenes':[],'dialogue':[],'clips':{}}
    result = {'schemaVersion':1, 'draftRevision':snapshot['revision'], 'draftSha256':hashlib.sha256(raw).hexdigest(),
              'throughScene':through_scene,'appliedAt':datetime.now(timezone.utc).isoformat(),
              'scenes':[],'dialogue':[],'clips':{}}
    base_story = read(BASE/('story-v2.json' if (BASE/'story-v2.json').exists() else 'story.json'))
    base_scenes = {scene['id']:scene for scene in base_story['scenes']}
    stale_transcripts, removed, uploads = [], [], []
    promoted = set()
    copies = {}
    for scene in selected:
        original = base_scenes.get(scene['id'], {})
        keys = [key for key in scene['cues'] if document['lines'][key].get('enabled',True)] if scene.get('enabled',True) else []
        value = {**original, 'id':scene['id'],'title':scene['title'], 'cues':keys,
                 'triggerDescription':scene.get('trigger',''),'notes':scene.get('notes',''), 'enabled':scene.get('enabled',True)}
        if scene.get('presentation'):
            value['presentation'] = {**scene['presentation'],
                'file':(ROOT/scene['presentation']['file']).relative_to(BASE).as_posix()}
        if scene['id'] == 'r05' and keys:
            value['announcementCue'] = keys[-1]
        result['scenes'].append(value)
        removed.extend(key for key in original.get('cues',[]) if key not in keys)
        for key in keys:
            if key in promoted:
                continue
            promoted.add(key)
            line = document['lines'][key]
            if line.get('portrait'):
                raise ValueError('Per-line portrait requires a separate reviewed image import: ' + key)
            clip = line.get('audio')
            if not clip:
                if allow_subtitles:
                    result['clips'][key] = None
                    result['dialogue'].append({'id':key,'speaker':line['speaker'],'text':line['text'],
                        'pauseAfter':line.get('pauseAfter',.2),'recordingStatus':'missing','notes':line.get('notes',''),
                        **({'portraitState':line['portraitState']} if line.get('portraitState') else {})})
                    continue
                raise ValueError('Missing audio: ' + key)
            file = (ROOT/clip['file']).resolve()
            allowed = [BASE.resolve(), (DRAFT.parent/'media').resolve()]
            if not any(file.is_relative_to(folder) for folder in allowed) or not file.is_file():
                raise ValueError('Missing or external audio: ' + str(file))
            data = file.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            if clip.get('sha256') and clip['sha256'] != digest:
                raise ValueError('Audio checksum mismatch: ' + key)
            if clip.get('origin') == 'editor-upload':
                safe = re.sub(r'[^a-zA-Z0-9_-]', '-', key)
                target = BASE/'recordings/reviewed'/(safe+'-'+digest[:12]+file.suffix.lower())
                copies[target] = data
                audio = {'file':target.relative_to(BASE).as_posix(), **measured(file), 'speaker':line['speaker'],
                         'sha256':digest,'bytes':len(data),'origin':'user-recording','sourceName':clip.get('name',''),
                         'draftRevision':snapshot['revision'],'transcriptSource':'owner-workshop', 'text':line['text']}
                uploads.append(key)
                if clip.get('text') != line['text']:
                    audio['textEditedAfterUpload'] = True
                    stale_transcripts.append({'id':key,'text':line['text'],'textAtUpload':clip.get('text','')})
            else:
                audio = {**clip, 'file':file.relative_to(BASE).as_posix()}
            if audio.get('origin') == 'temporary-synthesis':
                raise ValueError('A selected line still uses a placeholder: ' + key)
            result['clips'][key] = audio
            result['dialogue'].append({'id':key,'speaker':line['speaker'],'text':line['text'],
                'pauseAfter':line.get('pauseAfter',.2),'recordingStatus':'Т','notes':line.get('notes',''),
                **({'portraitState':line['portraitState']} if line.get('portraitState') else {})})
    selected_ids = {scene['id'] for scene in selected}
    preserved = [scene for scene in previous['scenes'] if scene['id'] not in selected_ids]
    result['scenes'] = sorted(result['scenes'] + preserved, key=lambda scene: scene.get('sourceLine', 0))
    preserved_keys = {key for scene in preserved for key in scene['cues']} - promoted
    result['dialogue'] += [line for line in previous['dialogue'] if line['id'] in preserved_keys]
    result['clips'].update({key:value for key,value in previous['clips'].items() if key in preserved_keys})
    if DRAFT.read_bytes() != raw:
        raise ValueError('Draft changed during audio verification; no changes applied')
    for path, data in copies.items():
        path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists() and path.read_bytes() != data:
            raise ValueError('Conflicting recording: ' + str(path))
        path.write_bytes(data)
    write(TARGET,result)
    report = {'draftRevision':snapshot['revision'],'throughScene':through_scene,
              'sceneIds':[scene['id'] for scene in selected], 'activeLines':len(promoted),
              'importedRecordings':uploads,'removedActiveCues':removed,
              'textEditedAfterUpload':stale_transcripts,
              'note':'Original audio bytes preserved. Earlier recordings remain available to archived scripts.'}
    if from_scene:
        report['fromScene'] = from_scene
    write(ROOT/'docs/campaign/alpha/voice'/report_name,report)
    print(json.dumps({key:report[key] for key in ['draftRevision','throughScene','activeLines','removedActiveCues']}))
    print('Imported recordings:',len(uploads),'Text edited after upload:',len(stale_transcripts))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--through-scene', required=True)
    parser.add_argument('--revision',type=int)
    parser.add_argument('--from-scene')
    parser.add_argument('--report',default='applied-stage-iii.json')
    parser.add_argument('--mission',default='alpha-m01')
    parser.add_argument('--allow-subtitles',action='store_true',help='Explicitly publish missing recordings as subtitles')
    args = parser.parse_args()
    apply(args.through_scene,args.revision,args.from_scene,args.report,args.mission,args.allow_subtitles)
