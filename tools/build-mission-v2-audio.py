"""Compile the owner's radio v3 screenplay, keeping audited original recordings intact."""
from pathlib import Path
import argparse
from array import array
import hashlib
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets/campaign/alpha/mission01'
SOURCE = ROOT / 'docs/campaign/alpha/mission01-radio-v3.md'
REPORT = ROOT / 'docs/campaign/alpha/voice/mission01-v2-status.txt'
RUNTIME = ROOT / 'tools/.runtime-media'
sys.path.insert(0, str(RUNTIME / 'python'))
import imageio_ffmpeg

ROLES = {
    'Командир':'commander', 'Прапорщик':'warrant', 'Генерал':'general',
    'Разведчик':'scout', 'Радист':'radio', 'Учёный':'scientist',
    'Строитель':'builder', 'Петрович':'chief', 'Отброс':'raider',
    'Солдат':'soldier', 'Офицер':'officer', 'Голос из прошлого':'past',
    'Водитель':'driver',
}
# One exchange stays atomic even when the author split it into numbered sections.
BUNDLES = {'r06':['r07'], 'r11':['r12'], 'r14':['r15'], 'r16':['r17'],
    'r19':['r20'], 'r27':['r28'], 'r29':['r30'], 'r33':['r34'],
    'r36':['r37'], 'r42':['r43','r44'], 'r50':['r51','r52','r53'], 'u02':['u03']}


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def run(args, **kwargs):
    result = subprocess.run([str(arg) for arg in args], capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[-2500:])
    return result


def compile_story():
    profiles = dict(read(BASE / 'story.json')['speakers'])
    profiles['driver'] = {'name':'Водитель', 'voice':'denis', 'lengthScale':1.05,
        'pitchSemitones':-.8, 'effect':'radio'}
    scenes, cues = [], {}
    scene = actor = marker = source_id = None

    def new_scene(scene_id, title, source_line):
        value = {'id':scene_id, 'title':title, 'cues':[], 'sourceLine':source_line, 'sections':[scene_id]}
        scenes.append(value)
        return value

    def add_line(target, speaker, text, line, status='Н', original=None):
        cue_id = original or f'm01-v3-{target["id"]}-l{len(target["cues"])+1:03}'
        cue = {'id':cue_id, 'speaker':speaker, 'text':text, 'pauseAfter':.2,
            'sourceLine':line, 'recordingStatus':status}
        if cue_id in cues and any(cues[cue_id][key]!=cue[key] for key in ['speaker','text']):
            raise ValueError('Contradictory source ID: '+cue_id)
        cues.setdefault(cue_id, cue)
        target['cues'].append(cue_id)

    for number, raw in enumerate(SOURCE.read_text(encoding='utf-8-sig').splitlines(), 1):
        line = raw.strip()
        heading = re.match(r'^### ([ПАУ]?\d{2})\. (.+)$', line)
        if heading:
            label = heading[1]
            scene_id = label.translate(str.maketrans({'П':'p','А':'a','У':'u'})) if not label.isdigit() else 'r'+label
            scene = new_scene(scene_id, heading[2], number)
            actor = None
        role = re.match(r'^(.+?) \[([ТВН])(?:, ([^\]]+))?\]:$', line)
        if role:
            actor, marker, source_id = ROLES[role[1]], role[2], role[3]
        if line.startswith('— '):
            if not scene or not actor:
                raise ValueError('Missing speaker at '+str(number))
            add_line(scene, actor, line[2:], number, marker, source_id)
        # The fast research variant is authored inside section 30.
        if scene and scene['id']=='r30' and line.startswith('Если обнаружение'):
            scene = new_scene('r30-alt', 'Огнемёт — самостоятельный доклад', number)
            actor = None

    expected = {*[f'p{n:02}' for n in range(1,5)], *[f'r{n:02}' for n in range(1,55)],
        *[f'a{n:02}' for n in range(1,15)], *[f'u{n:02}' for n in range(1,5)], 'r30-alt'}
    if {s['id'] for s in scenes} != expected or any(not s['cues'] for s in scenes):
        raise ValueError('Unexpected/empty radio v3 sections: '+str([(s['id'],len(s['cues'])) for s in scenes]))
    for suffix,text in [('a','Строится? Хорошо. Тогда к делу.'),('b','Со светом разобрались. Теперь к делу.')]:
        alt=new_scene('r01'+suffix,'Кофе — электростанция уже '+('строится' if suffix=='a' else 'готова'),108)
        add_line(alt,'general',text,108)
    alternate=new_scene('r24a','Лагерь с огнемётом — другой порядок наступления',442)
    add_line(alternate,'scout','Лагерь обнаружен. Машины за укрытиями.',442)
    alternate['cues']+=next(s for s in scenes if s['id']=='r24')['cues'][1:]
    by_id={s['id']:s for s in scenes}
    for head, tails in BUNDLES.items():
        for tail in tails:
            by_id[head]['cues'] += by_id[tail]['cues']
            by_id[head]['sections'].append(tail)
            scenes.remove(by_id[tail])
    barks=[]
    for scene in scenes[:]:
        if scene['id'].startswith('a') and int(scene['id'][1:])>=5:
            cue=cues[scene['cues'][0]]
            barks.append({**cue,'event':scene['id'],'title':scene['title']})
            scenes.remove(scene)
    spoken_ids={cue for scene in scenes for cue in scene['cues']}
    return {'schemaVersion':2, 'revision':5, 'edition':'owner-radio-v3',
        'source':{'path':SOURCE.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
        'speakers':profiles,'scenes':scenes,'dialogue':[c for key,c in cues.items() if key in spoken_ids],'barks':barks}


def existing_recordings():
    """Only same-character performances with a confirmed transcript enter this index."""
    old_story, old_audio = read(BASE/'story.json'), read(BASE/'audio.json')
    records = []

    def add(cue_id, actor, text, entry, folder, catalog):
        file = (folder / entry['file']).resolve()
        if not file.is_relative_to(BASE.resolve()) or not file.is_file():
            raise ValueError('Missing or external existing audio: ' + str(file))
        data = file.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if entry.get('sha256') and digest != entry['sha256']:
            raise ValueError('Existing audio checksum mismatch: ' + cue_id)
        records.append({'id':cue_id, 'speaker':actor, 'text':text,
            'file':file.relative_to(BASE.resolve()).as_posix(),
            'sha256':digest, 'bytes':len(data),
            'origin':'user-recording' if entry.get('origin') == 'user-recording' else 'temporary-synthesis',
            'catalog':catalog})

    for cue in old_story['dialogue'] + old_story['barks']:
        clip = old_audio['clips'].get(cue['id'])
        if clip:
            if clip.get('speaker') != cue['speaker']:
                raise ValueError('Existing speaker mismatch: ' + cue['id'])
            add(cue['id'], cue['speaker'], cue['text'], clip, BASE, 'audio.json')
    add('m01-s14-warrant-sigh','warrant','[Тяжёлый вздох, без слов.]',
        old_audio['reactions']['m01-s14-warrant-sigh'],BASE,'audio.json')
    for cue_id, clip in read(BASE/'field-radio/manifest.json').items():
        if 'speaker' in clip and 'text' in clip:
            add(cue_id, clip['speaker'], clip['text'], clip, BASE/'field-radio', 'field-radio/manifest.json')
    warrant = read(BASE/'warrant-radio/manifest.json')
    for cue_id, clip in warrant['clips'].items():
        add(cue_id, warrant['speaker'], clip['text'], {**clip, 'origin':'user-recording'},
            BASE/'warrant-radio', 'warrant-radio/manifest.json')
    archive_story=read(BASE/'archive/story-opening-v4.json')
    archive_audio=read(BASE/'archive/audio-opening-v4.json')
    for cue in archive_story['dialogue']+archive_story['barks']:
        add(cue['id'],cue['speaker'],cue['text'],archive_audio['clips'][cue['id']],BASE,'archive/audio-opening-v4.json')
    return sorted(records, key=lambda item: item['origin'] != 'user-recording')


def choose_existing(cue, records):
    if cue['id']=='m01-s14-warrant-sigh':
        return next(item for item in records if item['id']==cue['id'] and item['origin']=='user-recording'), 'nonverbal-sigh'
    exact = [item for item in records if item['speaker'] == cue['speaker'] and item['text'] == cue['text']]
    if exact:
        return exact[0], 'exact'
    # Typography is not a change of spoken wording; never match by filename alone.
    words = lambda text: re.findall(r'\w+', text.casefold().replace('ё','е'), flags=re.UNICODE)
    for item in records:
        if item['speaker'] == cue['speaker'] and words(item['text']) == words(cue['text']):
            return item, 'punctuation-only'
    return None, None


def metadata(path, speaker, durations):
    file = path.resolve()
    if file not in durations:
        pcm = run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error',
            '-i', file, '-f', 's16le', '-ac', '1', '-ar', '24000', 'pipe:1']).stdout
        samples=array('h',pcm)
        windows=[sum(x*x for x in samples[i:i+240])/max(1,len(samples[i:i+240])) for i in range(0,len(samples),240)]
        audible=[i for i,energy in enumerate(windows) if energy>327.68**2]
        durations[file]={'duration':len(pcm)/48000,
            'leadingSilence':audible[0]*.01 if audible else 0,
            'trailingSilence':max(0,len(pcm)/48000-(audible[-1]+1)*.01) if audible else 0}
    if durations[file]['duration'] <= .15:
        raise ValueError('Empty or truncated speech: ' + str(file))
    data = file.read_bytes()
    return {'file':file.relative_to(BASE.resolve()).as_posix(), **durations[file],
        'speaker':speaker, 'sha256':hashlib.sha256(data).hexdigest(), 'bytes':len(data)}


def build(story, compile_only=False):
    write_json(BASE/'story-v2.json', story)
    cues = story['dialogue'] + story['barks']
    records = existing_recordings()
    chosen = {cue['id']:choose_existing(cue, records) for cue in cues}
    for cue in cues:
        existing,_=chosen[cue['id']]
        if cue.get('recordingStatus')=='Т' and (not existing or existing['origin']!='user-recording'):
            raise ValueError('User recording requires transcript review: '+cue['id']+' | '+cue['text'])
    reused_user = sum(item is not None and item['origin']=='user-recording' for item,_ in chosen.values())
    reused_temporary = sum(item is not None and item['origin']!='user-recording' for item,_ in chosen.values())
    print(json.dumps({'scenes':len(story['scenes']), 'dialogue':len(story['dialogue']), 'barks':len(story['barks']),
        'reuseUser':reused_user, 'reuseTemporary':reused_temporary,
        'synthesize':len(cues)-reused_user-reused_temporary}), flush=True)
    if compile_only:
        return
    raw, out = BASE/'audio-source-v2', BASE/'audio-v2'
    raw.mkdir(exist_ok=True)
    out.mkdir(exist_ok=True)
    manifest = {'schemaVersion':2, 'revision':story['revision'], 'language':'ru-RU', 'source':story['source'],
        'voices':story['speakers'], 'clips':{}}
    durations = {}
    for actor, profile in story['speakers'].items():
        group = [cue for cue in cues if cue['speaker']==actor]
        if not group:
            continue
        key = lambda cue: hashlib.sha256(json.dumps([cue['text'],profile], ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
        missing = [cue for cue in group if chosen[cue['id']][0] is None]
        pending = [cue for cue in missing if not (raw/(cue['id']+'.wav')).exists()
            or not (raw/(cue['id']+'.key')).exists() or (raw/(cue['id']+'.key')).read_text()!=key(cue)]
        if pending:
            lines = [json.dumps({'text':cue['text'], 'output_file':str(raw/(cue['id']+'.wav'))}, ensure_ascii=False) for cue in pending]
            run([RUNTIME/'piper/piper.exe', '--model', RUNTIME/f'voices/ru_RU-{profile["voice"]}-medium.onnx',
                '--json-input', '--length_scale', profile['lengthScale'], '--sentence_silence', .16, '--quiet'],
                input=('\n'.join(lines)+'\n').encode('utf-8'), cwd=RUNTIME/'piper')
            for cue in pending:
                (raw/(cue['id']+'.key')).write_text(key(cue))
        for cue in group:
            existing, match = chosen[cue['id']]
            if existing:
                manifest['clips'][cue['id']] = {**metadata(BASE/existing['file'], actor, durations),
                    'origin':existing['origin'], 'reusedFrom':{'catalog':existing['catalog'], 'cueId':existing['id']},
                    'textMatch':match}
                continue
            source, target = raw/(cue['id']+'.wav'), out/(cue['id']+'.ogg')
            ratio = 2**(profile['pitchSemitones']/12)
            filters = [f'asetrate=22050*{ratio:.8f}', 'aresample=22050', f'atempo={1/ratio:.8f}',
                'highpass=f=65', 'lowpass=f=10000']
            if profile['effect']=='radio':
                filters += ['highpass=f=260', 'lowpass=f=3300', 'acompressor=threshold=.12:ratio=3:attack=10:release=80']
            elif profile['effect']=='room':
                filters += ['aecho=.8:.5:55:.10']
            elif profile['effect']=='dream':
                filters += ['aecho=.8:.6:360|720|1080:.34|.22|.10']
            filters += ['loudnorm=I=-19:TP=-2:LRA=9', 'afade=t=in:d=0.015']
            process_key = hashlib.sha256((key(cue)+','.join(filters)).encode()).hexdigest()
            stamp = raw/(cue['id']+'.encoded-key')
            if not target.exists() or not stamp.exists() or stamp.read_text()!=process_key:
                run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', source, '-af', ','.join(filters), '-c:a', 'libopus', '-b:a', '40k', '-ar', '24000', target])
                stamp.write_text(process_key)
            manifest['clips'][cue['id']] = {**metadata(target, actor, durations), 'origin':'temporary-synthesis',
                'generator':'local Piper + FFmpeg', 'voice':profile['voice']}
        print(f'Voice ready: {actor} ({len(group)} clips; {len(missing)} new temporary)', flush=True)
    if set(manifest['clips']) != {cue['id'] for cue in cues}:
        raise ValueError('Audio coverage mismatch')
    write_json(BASE/'audio-v2.json', manifest)
    summary = [
        f'ОПЕРАЦИЯ «РАЙ» — МИССИЯ 1, СЦЕНАРИЙ V{story["revision"]}',
        'Источник: '+story['source']['path'], 'SHA-256: '+story['source']['sha256'],
        f'Сцен: {len(story["scenes"])}. Реплик диалогов: {len(story["dialogue"])}. Реплик юнитов: {len(story["barks"])}.',
        f'Твоя запись: {reused_user}. Временная существующая: {reused_temporary}. Новая временная: {len(cues)-reused_user-reused_temporary}.',
        'Все пользовательские MP3 используются целиком, исходные байты сохранены. Длительности измерены декодированием файлов.',
        'Временная озвучка: локальный Piper; водитель — отдельный персонаж, записи разведчика ему не назначены.',
        '',
    ]
    for cue in cues:
        clip = manifest['clips'][cue['id']]
        status = 'ТВОЯ ЗАПИСЬ' if clip['origin']=='user-recording' else 'ВРЕМЕННАЯ'
        reused = clip.get('reusedFrom')
        provenance = f'Повторное использование: {reused["catalog"]} / {reused["cueId"]}' if reused else 'Новая локальная синтезированная запись'
        summary += [f'{cue["id"]} | {story["speakers"][cue["speaker"]]["name"]} | {status}',
            cue['text'], f'{clip["file"]} | {clip["duration"]:.3f} с | {provenance}']
        if clip.get('textMatch')=='punctuation-only':
            summary.append('Все слова совпадают; различается только пунктуация/типографика.')
        summary.append('')
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text('\n'.join(summary), encoding='utf-8')
    print(json.dumps({'clips':len(manifest['clips']), 'speechSeconds':sum(clip['duration'] for clip in manifest['clips'].values()),
        'userRecordings':reused_user, 'temporaryExisting':reused_temporary, 'temporaryNew':len(cues)-reused_user-reused_temporary}), flush=True)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--import-source', type=Path, help='Copy the supplied screenplay byte-for-byte before compiling')
    parser.add_argument('--compile-only', action='store_true', help='Write the story and report reuse counts without generating audio')
    args = parser.parse_args()
    if args.import_source:
        SOURCE.write_bytes(args.import_source.read_bytes())
    build(compile_story(), args.compile_only)
