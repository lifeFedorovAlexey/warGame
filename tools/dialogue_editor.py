"""Local dialogue workshop. Drafts never overwrite the playable campaign."""
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from threading import RLock
from urllib.parse import urlsplit, unquote
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DRAFTS = ROOT / 'docs/campaign/dialogue-drafts'
LOCK = RLock()
MAX_UPLOAD = 25 * 1024 * 1024


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def relative(path):
    return path.relative_to(ROOT).as_posix()


def missions():
    result = []
    for path in sorted((ROOT / 'assets/campaign').glob('*/mission*/story.json')):
        story = read_json(path)
        result.append({'id': story['id'], 'title': story['name'],
                       'campaign': story.get('campaign', ''), 'path': path.parent})
    return result


def mission_info(mission_id):
    return next((item for item in missions() if item['id'] == mission_id), None)


def source_sections(story):
    path = ROOT / story.get('source', {}).get('path', '')
    if not path.is_file():
        return {}
    text = path.read_text(encoding='utf-8-sig')
    result, section = {}, 'Сюжет'
    for block in re.split(r'(?=^#{1,3} )', text, flags=re.M):
        heading = block.splitlines()[0] if block else ''
        if heading.startswith('# '):
            section = heading[2:].capitalize()
        match = re.match(r'### ([ПАУ]?)(\d+)(?:[-−](ALT))?\.', heading, re.I)
        if not match:
            continue
        prefix, number, alternate = match.groups()
        key = {'П': 'p', 'А': 'a', 'У': 'u'}.get(prefix.upper(), 'r') + number.zfill(2)
        if alternate:
            key += '-alt'
        trigger = re.search(r'\*\*(?:Триггер|Условие):\*\*\s*(.+)', block)
        result[key] = {'section': section, 'trigger': trigger.group(1) if trigger else ''}
    return result


def catalog(info):
    base = info['path']
    legacy = read_json(base / 'story.json')
    current = base / 'story-v2.json'
    story = read_json(current) if current.exists() else legacy
    audio_path = base / ('audio-v2.json' if current.exists() else 'audio.json')
    clips = read_json(audio_path).get('clips', {})
    applied_path = base / 'reviewed-dialogue.json'
    if applied_path.exists():
        applied = read_json(applied_path)
        scenes = {scene['id']: scene for scene in story['scenes']}
        for scene in applied['scenes']:
            scenes[scene['id']] = {**scenes.get(scene['id'], {}), **scene}
        lines = {line['id']: line for line in story['dialogue']}
        lines.update({line['id']: line for line in applied['dialogue']})
        referenced = {key for scene in scenes.values() for key in scene['cues']}
        story = {**story, 'scenes': list(scenes.values()),
                 'dialogue': [line for key, line in lines.items() if key in referenced]}
        clips.update(applied['clips'])
    sections = source_sections(story)
    document = {key: info[key] for key in ('id', 'title', 'campaign')}
    document.update(schemaVersion=1, sourceRevision=story.get('revision', 1),
                    source=relative(current if current.exists() else base / 'story.json'),
                    speakers=story['speakers'], scenes=[], lines={}, portraits={})

    def line_entry(line, key, clip=None):
        value = {'enabled': True, 'notes': '', 'portraitState': '', 'portrait': None, **line, 'key': key}
        clip = clip or line.get('clip')
        value['audio'] = {**clip, 'text': line.get('text', ''), 'file': relative(base / clip['file'])} if clip else None
        document['lines'][key] = value

    for line in [*story['dialogue'], *story.get('barks', [])]:
        line_entry(line, line['id'], clips.get(line['id']))
    for scene in sorted(story['scenes'], key=lambda s: s.get('sourceLine', 0)):
        kind = 'situation' if scene['id'].startswith(('a', 'u')) else 'sequence'
        meta = sections.get(scene['id'], sections.get({'r01a': 'r01', 'r01b': 'r01', 'r24a': 'r24'}.get(scene['id']), {}))
        trigger = meta.get('trigger', '')
        if scene['id'].startswith('p'):
            trigger = 'Вступление, до передачи управления.'
        if scene['id'] == 'p04':
            trigger = 'Строитель завершил стену с вывеской «РАЙ». После диалога — передача управления.'
        overrides = {
            'r01a': 'Начало миссии: электростанция уже строится. Вариант вместо «Кофе для генерала».',
            'r01b': 'Начало миссии: электростанция уже готова. Вариант вместо «Кофе для генерала».',
            'r24a': 'Обнаружен лагерь с огнемётом; другой лагерь уже уничтожен.',
            'a01': 'После первого боя: колонна из двух или более машин движется, среди них есть «Буханка». Спокойный эфир.',
            'a02': 'Машина уступила дорогу и встречная техника действительно проехала. Спокойный эфир.',
            'a03': 'Не менее двух машин стоят в дорожной очереди дольше 10 секунд. Спокойный эфир.',
            'a04': 'Очередь стояла больше 8 секунд, затем машины снова поехали. Спокойный эфир.',
            'u01': 'Зафиксирована авария при испытании в лаборатории.',
            'u02': 'Получено трофейное продовольствие. Спокойный эфир.',
            'u04': 'Зафиксирована поломка генератора.',
        }
        document['scenes'].append({**scene, 'kind': kind, 'section': meta.get('section', 'Ситуации' if kind == 'situation' else 'Сюжет'),
                                   'trigger': scene.get('triggerDescription') or overrides.get(scene['id'], trigger),
                                   'notes': scene.get('notes', ''), 'enabled': scene.get('enabled', True)})
    service_path = base / 'factory-service-voice.json'
    services = read_json(service_path).get('barks', []) if service_path.exists() else []
    for line in [*story.get('barks', []), *services]:
        if line['id'] not in document['lines']:
            line_entry(line, line['id'])
        title = line.get('title') or {'factory-repair-start': 'Ремонт на заводе',
                'factory-repair-start-alt': 'Ремонт на заводе · ответ прапорщика',
                'factory-repair-complete': 'Ремонт завершён'}.get(line['id'], line['event'])
        document['scenes'].append({'id': 'event:' + line['id'], 'title': title, 'kind': 'situation',
            'section': 'Ответы на события', 'trigger': sections.get(line.get('event'), {}).get('trigger') or title,
            'notes': '', 'enabled': True, 'cues': [line['id']]})
    voice_titles = {'select': 'Выбор машины', 'move': 'Приказ двигаться', 'attack': 'Приказ атаковать',
                    'build': 'Приказ строить', 'stop': 'Приказ остановиться'}
    for event, title in voice_titles.items():
        path = base / 'unit-radio' / (event + '.ogg')
        if path.exists():
            key = 'unit:' + event
            line_entry({'id': key, 'speaker': 'scout', 'text': '', 'notes': ''}, key,
                       {'file': 'unit-radio/' + event + '.ogg', 'origin': 'unit-recording'})
            document['lines'][key]['notes'] = 'Короткий звуковой ответ техники; субтитры в игре не заданы.'
            document['scenes'].append({'id': key, 'title': title, 'kind': 'situation', 'section': 'Приказы технике',
                'trigger': title, 'notes': '', 'enabled': True, 'cues': [key]})
    if current.exists():
        old_audio = read_json(base / 'audio.json').get('clips', {})
        for line in [*legacy['dialogue'], *legacy.get('barks', [])]:
            line_entry(line, 'archive:' + line['id'], old_audio.get(line['id']))
        for scene in legacy['scenes']:
            document['scenes'].append({'id': 'archive:' + scene['id'], 'title': scene['title'],
                'kind': 'archive', 'section': 'Ранний сценарий', 'trigger': 'Архивная версия сценария.',
                'notes': '', 'enabled': True, 'cues': ['archive:' + key for key in scene['cues']]})
        if legacy.get('barks'):
            document['scenes'].append({'id': 'archive:barks', 'title': 'Ранние ответы на события', 'kind': 'archive',
                'section': 'Ранний сценарий', 'trigger': 'Архивная версия.', 'notes': '', 'enabled': True,
                'cues': ['archive:' + line['id'] for line in legacy['barks']]})
    for archived_path in sorted((base / 'archive').glob('story-*.json')):
        archived = read_json(archived_path)
        recordings = archived_path.with_name(archived_path.name.replace('story-', 'audio-', 1))
        archived_clips = read_json(recordings).get('clips', {}) if recordings.exists() else {}
        prefix = 'archive:' + archived_path.stem + ':'
        for speaker, spec in archived.get('speakers', {}).items():
            document['speakers'].setdefault(speaker, spec)
        for line in [*archived.get('dialogue', []), *archived.get('barks', [])]:
            line_entry(line, prefix + line['id'], archived_clips.get(line['id']))
        for scene in archived.get('scenes', []):
            document['scenes'].append({'id': prefix + scene['id'], 'title': scene['title'], 'kind': 'archive',
                'section': 'Архив · ' + archived_path.stem.removeprefix('story-'),
                'trigger': 'Предыдущая редакция. Источник: ' + relative(archived_path),
                'notes': '', 'enabled': True, 'cues': [prefix + key for key in scene['cues']]})
        if archived.get('barks'):
            document['scenes'].append({'id': prefix + 'barks', 'title': 'Ответы на события', 'kind': 'archive',
                'section': 'Архив · ' + archived_path.stem.removeprefix('story-'), 'trigger': 'Предыдущая редакция.',
                'notes': '', 'enabled': True, 'cues': [prefix + line['id'] for line in archived['barks']]})
    portraits = base / 'portraits/manifest.json'
    if portraits.exists():
        document['portraits'] = read_json(portraits)['characters']
        for portrait in document['portraits'].values():
            portrait['file'] = relative(base / 'portraits' / portrait['file'])
    return sync_game_presentation(document, info)


def sync_game_presentation(document, info):
    """The opening is owned by OpeningTelevision, not by the two legacy cues."""
    if info['id'] != 'alpha-m01':
        return document
    opening = next((scene for scene in document['scenes'] if scene['id'] == 'p01'), None)
    if opening is None:
        return document
    replaced = {'m01-s01-l003', 'm01-s01-l004'}
    opening['cues'] = [key for key in opening['cues'] if key not in replaced]
    opening['presentation'] = {'type': 'video', 'file': relative(info['path'] / 'opening-television.mp4'),
                               'title': 'Видео в телевизоре', 'replaces': sorted(replaced)}
    if opening['title'] == 'Последний сон':
        opening['title'] = 'Видео в телевизоре'
    referenced = {key for scene in document['scenes'] for key in scene['cues']}
    for key in replaced - referenced:
        document['lines'].pop(key, None)
    return document


def draft_path(info):
    return DRAFTS / info['id'] / 'draft.json'


def load_draft(info):
    path = draft_path(info)
    saved = read_json(path) if path.exists() else {'revision': 0, 'savedAt': None, 'document': catalog(info)}
    saved['document'] = sync_game_presentation(saved['document'], info)
    return saved


def asset_path(file, info):
    if not isinstance(file, str) or '\\' in file or '?' in file or '#' in file:
        raise ValueError('Некорректный путь к файлу')
    path = (ROOT / file).resolve()
    roots = [info['path'].resolve(), (DRAFTS / info['id'] / 'media').resolve()]
    if not any(path.is_relative_to(root) for root in roots) or not path.is_file():
        raise ValueError('Файл отсутствует или находится вне материалов миссии')
    return path


def validate(document, info):
    if not isinstance(document, dict) or document.get('id') != info['id'] or document.get('schemaVersion') != 1:
        raise ValueError('Неверный формат слепка')
    scenes, lines = document.get('scenes'), document.get('lines')
    if not isinstance(scenes, list) or not isinstance(lines, dict) or len(scenes) > 2000 or len(lines) > 10000:
        raise ValueError('Неверный список диалогов')
    if not isinstance(document.get('speakers'), dict) or not isinstance(document.get('portraits'), dict):
        raise ValueError('Неверный список персонажей')
    ids = set()
    for scene in scenes:
        if not isinstance(scene.get('id'), str) or scene['id'] in ids or scene.get('kind') not in ('sequence', 'situation', 'archive'):
            raise ValueError('Неверная или повторяющаяся сцена')
        ids.add(scene['id'])
        if not isinstance(scene.get('cues'), list) or any(key not in lines for key in scene['cues']):
            raise ValueError('В сцене есть неизвестная реплика')
        for key in ('title', 'trigger', 'notes', 'section'):
            if not isinstance(scene.get(key, ''), str) or len(scene.get(key, '')) > 20000:
                raise ValueError('Слишком длинное описание сцены')
        if scene.get('presentation'):
            if scene['presentation'].get('type') != 'video':
                raise ValueError('Неизвестный формат сцены')
            asset_path(scene['presentation']['file'], info)
    for key, line in lines.items():
        if not isinstance(line, dict) or line.get('key') != key or line.get('speaker') not in document['speakers']:
            raise ValueError('Неизвестный персонаж или реплика')
        for field in ('text', 'notes'):
            if not isinstance(line.get(field, ''), str) or len(line.get(field, '')) > 20000:
                raise ValueError('Слишком длинная реплика')
        for field in ('audio', 'portrait'):
            if line.get(field):
                asset_path(line[field]['file'], info)
    for portrait in document['portraits'].values():
        asset_path(portrait['file'], info)


def save_draft(info, document, revision):
    validate(document, info)
    sync_game_presentation(document, info)
    with LOCK:
        current = load_draft(info)
        if revision != current['revision']:
            return None
        saved = {'revision': revision + 1, 'savedAt': datetime.now(timezone.utc).isoformat(), 'document': document}
        path = draft_path(info)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            history = path.parent / '.history'
            history.mkdir(exist_ok=True)
            (history / f'{revision:06d}.json').write_bytes(path.read_bytes())
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(saved, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(path)
        return saved


def export_snapshot(info):
    with LOCK:
        saved = load_draft(info)
    document = saved['document']
    files = set()
    text = [f"# {document['campaign']} · {document['title']}", '', 'Редакторский слепок. Порядок и условия — пожелания для следующей редакции сценария.', '']
    for scene in document['scenes']:
        text += [f"## {scene['title']} [{scene['id']}]" + (' — исключено' if not scene.get('enabled', True) else ''),
                 f"Тип: {scene['kind']}", f"Условие: {scene.get('trigger', '')}", scene.get('notes', ''), '']
        if scene.get('presentation'):
            media = scene['presentation']
            text += [f"Видео в телевизоре: {media['file']}", 'Звук — из видео; отдельные реплики не воспроизводятся.', '']
            files.add(media['file'])
        for key in scene['cues']:
            line = document['lines'][key]
            text += [f"**{document['speakers'][line['speaker']]['name']}** [{line['id']}]" + (' — исключено' if not line.get('enabled', True) else ''),
                     line['text'], line.get('notes', ''), '']
    for line in document['lines'].values():
        for field in ('audio', 'portrait'):
            if line.get(field):
                files.add(line[field]['file'])
    for portrait in document['portraits'].values():
        files.add(portrait['file'])
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('snapshot.json', json.dumps(saved, ensure_ascii=False, indent=2))
        archive.writestr('dialogues.md', '\n'.join(text))
        for file in sorted(files):
            archive.write(asset_path(file, info), file)
    return buffer.getvalue()


def media_extension(data, kind):
    if kind == 'image':
        if data.startswith(b'\x89PNG\r\n\x1a\n'): return '.png'
        if data.startswith(b'\xff\xd8\xff'): return '.jpg'
        if data.startswith(b'RIFF') and data[8:12] == b'WEBP': return '.webp'
        if data.startswith((b'GIF87a', b'GIF89a')): return '.gif'
    if kind == 'audio':
        if data.startswith(b'OggS'): return '.ogg'
        if data.startswith(b'RIFF') and data[8:12] == b'WAVE': return '.wav'
        if data.startswith(b'fLaC'): return '.flac'
        if data.startswith(b'ID3') or (len(data) > 1 and data[0] == 255 and data[1] & 224 == 224): return '.mp3'
        if data[4:8] == b'ftyp': return '.m4a'
    raise ValueError('Нужен PNG, JPG, WebP, GIF или аудио MP3, OGG, WAV, FLAC, M4A')


def handle(handler):
    path = urlsplit(handler.path).path
    if not path.startswith('/api/dialogues'):
        return False

    def reply(status, data, content_type='application/json; charset=utf-8'):
        payload = json.dumps(data, ensure_ascii=False).encode() if isinstance(data, dict) else data
        handler.send_response(status)
        handler.send_header('Content-Type', content_type)
        handler.send_header('Content-Length', str(len(payload)))
        handler.send_header('X-Content-Type-Options', 'nosniff')
        if content_type == 'application/zip':
            handler.send_header('Content-Disposition', f'attachment; filename="{info["id"]}-dialogues.zip"')
        handler.end_headers()
        handler.wfile.write(payload)

    try:
        if path == '/api/dialogues' and handler.command == 'GET':
            reply(200, {'missions': [{k: v for k, v in item.items() if k != 'path'} for item in missions()]})
            return True
        match = re.fullmatch(r'/api/dialogues/([a-zA-Z0-9_-]+)(?:/(media|export))?', path)
        info = mission_info(match[1]) if match else None
        if not info:
            reply(404, {'error': 'Миссия не найдена'})
            return True
        action = match[2]
        if handler.command == 'GET' and action is None:
            with LOCK:
                result = load_draft(info)
            reply(200, result)
        elif handler.command == 'GET' and action == 'export':
            reply(200, export_snapshot(info), 'application/zip')
        elif handler.command in ('PUT', 'POST'):
            origin = handler.headers.get('Origin')
            if handler.headers.get('X-Dialogue-Editor') != '1' or (origin and origin != 'http://' + handler.headers.get('Host', '')):
                reply(403, {'error': 'Сохранение доступно только из локального редактора'})
                return True
            size = int(handler.headers.get('Content-Length', 0))
            limit = MAX_UPLOAD if action == 'media' else 8 * 1024 * 1024
            if not 0 < size <= limit:
                reply(413, {'error': 'Слишком большой файл (максимум 25 МБ) или пустой запрос'})
                return True
            body = handler.rfile.read(size)
            if action == 'media' and handler.command == 'POST':
                kind = handler.headers.get('X-Media-Kind', '')
                suffix = media_extension(body, kind)
                folder = DRAFTS / info['id'] / 'media'
                folder.mkdir(parents=True, exist_ok=True)
                target = folder / (sha256(body).hexdigest() + suffix)
                if not target.exists():
                    target.write_bytes(body)
                reply(201, {'file': relative(target), 'name': unquote(handler.headers.get('X-File-Name', ''))[:240], 'origin': 'editor-upload'})
            elif action is None and handler.command == 'PUT':
                data = json.loads(body)
                result = save_draft(info, data['document'], data['revision'])
                reply(200, {k: v for k, v in result.items() if k != 'document'}) if result else reply(409, {'error': 'Черновик изменён в другой вкладке. Скачайте свои правки и обновите страницу.'})
            else:
                reply(405, {'error': 'Метод не поддерживается'})
        else:
            reply(405, {'error': 'Метод не поддерживается'})
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        reply(400, {'error': str(error)})
    except OSError:
        reply(500, {'error': 'Не удалось записать или прочитать файл. Правки остаются в этой вкладке.'})
    return True
