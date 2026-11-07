"""Compile the user's v2 screenplay and fill missing recordings with local Piper voices."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'assets/campaign/alpha/mission01'
SOURCE = ROOT / 'docs/campaign/alpha/mission01-script-v3.md'
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
EXPECTED_SCENES = {'p01','p02','p03','01a','01b','10-alt','16-alt',
    *[f'{number:02}' for number in range(1,30)], *[f'd{number:02}' for number in range(1,5)]}


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
    old_story = read(BASE / 'story.json')
    profiles = dict(old_story['speakers'])
    # Separate character identity; do not borrow the scout's actual recordings.
    profiles['driver'] = {'name':'Водитель', 'voice':'denis', 'lengthScale':1.05,
        'pitchSemitones':-.8, 'effect':'radio'}
    scenes, dialogue, barks = [], [], []
    scene = speaker = None
    units = False

    def new_scene(scene_id, title, source_line):
        value = {'id':scene_id, 'title':title, 'cues':[], 'sourceLine':source_line}
        scenes.append(value)
        return value

    def add_line(target, actor, text, source_line):
        cue = {'id':f'm01v2-{target["id"]}-l{len(target["cues"])+1:03}',
            'speaker':actor, 'text':text, 'pauseAfter':.2, 'sourceLine':source_line}
        dialogue.append(cue)
        target['cues'].append(cue['id'])
        return cue

    for number, raw in enumerate(SOURCE.read_text(encoding='utf-8-sig').splitlines(), 1):
        line = raw.strip()
        heading = re.match(r'^#{2,3}\s+([ПД]?\d{2}[АБ]?)\.\s*(.+)$', line)
        if heading:
            scene_id = heading[1].translate(str.maketrans({'П':'p','Д':'d','А':'a','Б':'b'}))
            scene = new_scene(scene_id, heading[2], number)
            speaker = None
        if line.startswith('# КОРОТКИЕ РЕПЛИКИ ЮНИТОВ'):
            units = True
            scene = None
        elif line.startswith('# ') and units:
            units = False
        if units and line.startswith('|'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if len(cells) == 3 and cells[1] in ROLES:
                barks.append({'id':f'm01v2-b{len(barks)+1:03}', 'event':cells[0],
                    'speaker':ROLES[cells[1]], 'text':cells[2], 'sourceLine':number})
            continue
        if scene and scene['id'] == '10' and line.startswith('**Условие:**'):
            quoted = re.search('«([^»]+)»', line)
            if not quoted:
                raise ValueError('No alternative direction line at ' + str(number))
            alternative = new_scene('10-alt', scene['title'] + ' — другое направление', number)
            add_line(alternative, 'scout', quoted[1], number)
            # The source explicitly replaces only the first line of the same exchange.
            originals = [cue for cue in dialogue if cue['id'] in scene['cues'][1:]]
            for cue in originals:
                add_line(alternative, cue['speaker'], cue['text'], cue['sourceLine'])
        if scene and scene['id'] == '16' and line.startswith('Если предыдущие разговоры были пропущены'):
            scene = new_scene('16-alt', 'Огнемёт исследован — самостоятельный доклад', number)
            speaker = None
        role = re.match(r'^\*\*([^*]+):\*\*$', line)
        if role:
            name = role[1].split(',')[0].strip()
            if name in ROLES:
                speaker = ROLES[name]
        if line.startswith('— '):
            if not scene or not speaker:
                raise ValueError('Spoken line without scene/speaker at ' + str(number))
            add_line(scene, speaker, line[2:], number)
        pause = re.match(r'^\*Пауза (\d+(?:,\d+)?) секунд', line)
        if pause and scene and scene['cues']:
            dialogue[-1]['pauseAfter'] = float(pause[1].replace(',', '.'))
    if {scene['id'] for scene in scenes} != EXPECTED_SCENES or len(scenes) != 40:
        raise ValueError('Unexpected v2 scenes: ' + str([scene['id'] for scene in scenes]))
    if len(barks) != 18 or any(not scene['cues'] for scene in scenes):
        raise ValueError('Missing v2 lines or unit barks')
    ids = [cue['id'] for cue in dialogue + barks]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate cue IDs')
    return {'schemaVersion':2, 'source':{'path':SOURCE.relative_to(ROOT).as_posix(),
        'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
        'speakers':profiles, 'scenes':scenes, 'dialogue':dialogue, 'barks':barks}


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
    for cue_id, clip in read(BASE/'field-radio/manifest.json').items():
        if 'speaker' in clip and 'text' in clip:
            add(cue_id, clip['speaker'], clip['text'], clip, BASE/'field-radio', 'field-radio/manifest.json')
    warrant = read(BASE/'warrant-radio/manifest.json')
    for cue_id, clip in warrant['clips'].items():
        add(cue_id, warrant['speaker'], clip['text'], {**clip, 'origin':'user-recording'},
            BASE/'warrant-radio', 'warrant-radio/manifest.json')
    return sorted(records, key=lambda item: item['origin'] != 'user-recording')


def choose_existing(cue, records):
    exact = [item for item in records if item['speaker'] == cue['speaker'] and item['text'] == cue['text']]
    if exact:
        return exact[0], 'exact'
    # This approved stop recording differs only by the dash before "запрещено".
    if cue['id'] == 'm01v2-b018' and cue['speaker'] == 'warrant':
        words = lambda text: re.findall(r'\w+', text, flags=re.UNICODE)
        for item in records:
            if item['speaker'] == cue['speaker'] and words(item['text']) == words(cue['text']):
                return item, 'punctuation-only'
    return None, None


def metadata(path, speaker, durations):
    file = path.resolve()
    if file not in durations:
        pcm = run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error',
            '-i', file, '-f', 's16le', '-ac', '1', '-ar', '24000', 'pipe:1']).stdout
        durations[file] = len(pcm) / 48000
    if durations[file] <= .15:
        raise ValueError('Empty or truncated speech: ' + str(file))
    data = file.read_bytes()
    return {'file':file.relative_to(BASE.resolve()).as_posix(), 'duration':durations[file],
        'speaker':speaker, 'sha256':hashlib.sha256(data).hexdigest(), 'bytes':len(data)}


def build(story, compile_only=False):
    write_json(BASE/'story-v2.json', story)
    cues = story['dialogue'] + story['barks']
    records = existing_recordings()
    chosen = {cue['id']:choose_existing(cue, records) for cue in cues}
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
    manifest = {'schemaVersion':2, 'language':'ru-RU', 'source':story['source'],
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
        'ОПЕРАЦИЯ «РАЙ» — МИССИЯ 1, СЦЕНАРИЙ V3',
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
            summary.append('Совпадение всех слов; в записи тире перед «запрещено», в новом тексте тире отсутствует.')
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
