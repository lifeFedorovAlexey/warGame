"""Versioned dynamic library. Original campaign and workshop files are read-only here."""
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from threading import RLock
from urllib.parse import urlsplit, parse_qs
import json
import re
import subprocess
import zipfile
import dialogue_editor as legacy
from radio_speech import speech

ROOT = legacy.ROOT
STORE = ROOT / 'docs/campaign/dialogue-drafts/dynamic-radio'
SEED = ROOT / 'assets/radio/situations_catalog.json'
LOCK = RLock()
MAX_BODY = 10 * 1024 * 1024

def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    temp.replace(path)

def original_snapshot():
    mapping = read(ROOT/'assets/radio/legacy_25_mapping.json')
    info = legacy.mission_info('alpha-m01')
    document = legacy.catalog(info)
    draft = legacy.load_draft(info)
    scenes = {s['id']: s for s in document['scenes']}
    missing = set(mapping)-set(scenes)
    if missing: raise ValueError('Не найдены оригинальные ID: '+', '.join(sorted(missing)))
    files = {}
    paths = list(info['path'].rglob('*.json'))
    draft_root = legacy.DRAFTS/'alpha-m01'
    paths += list(draft_root.rglob('*'))
    # Preserve all linked audio and portraits, including shared recordings and archived cues.
    for doc in (document, draft['document']):
        for line in doc['lines'].values():
            for field in ('audio','portrait'):
                if line.get(field): paths.append(legacy.asset_path(line[field]['file'], info))
        for portrait in doc['portraits'].values(): paths.append(legacy.asset_path(portrait['file'], info))
    for path in sorted(set(paths)):
        if path.is_file(): files[path.relative_to(ROOT).as_posix()] = sha256(path.read_bytes()).hexdigest()
    return {'schemaVersion':1,'mapping':mapping,'scenes':{k:scenes[k] for k in mapping},
            'catalog':document,'draft':draft,'checksums':files}

def migrate():
    with LOCK:
        manifest = STORE/'migration-v1.json'
        if manifest.exists(): return read(manifest)
        snapshot = original_snapshot()
        STORE.mkdir(parents=True, exist_ok=True)
        temp = STORE/'originals-v1.tmp'
        with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('manifest.json',json.dumps(snapshot,ensure_ascii=False,indent=2))
            for name in snapshot['checksums']: archive.write(ROOT/name, name)
        temp.replace(STORE/'originals-v1.zip')
        write(manifest,snapshot)
        return snapshot

def integrity():
    snapshot = migrate()
    changed = [name for name,digest in snapshot['checksums'].items()
               if not (ROOT/name).is_file() or sha256((ROOT/name).read_bytes()).hexdigest()!=digest]
    return {'legacyIds':list(snapshot['mapping']),'checkedFiles':len(snapshot['checksums']),
            'unchanged':not changed,'changed':changed,'backup':'originals-v1.zip'}

def load(published=False):
    path = STORE/('published.json' if published else 'draft.json')
    result = read(path) if path.exists() else {'revision':0,'savedAt':None,'document':read(SEED)}
    # New game sources become editable in older drafts without replacing the
    # owner's existing wording, recordings, disabled rules or publication file.
    seed = read(SEED)
    additions = {'traffic.retreat_contact','traffic.panic_blocked','traffic.panic_escaped','damage.panic_failed'}
    document = result['document']
    existing = {r['id'] for r in document['rules']}
    for rule in seed['rules']:
        if rule['id'] not in additions or rule['id'] in existing: continue
        document['rules'].append(rule)
        for tier in rule['tiers']:
            for graph in tier['graphs']:
                for node in graph['nodes']:
                    phrase = node['phraseId']
                    document['phrases'].setdefault(phrase, seed['phrases'][phrase])
    return result

def validate(document):
    if not isinstance(document,dict): raise ValueError('Нужен JSON библиотеки')
    # Both editor preview and server run the exact same typed validation.
    result = subprocess.run(['node',str(ROOT/'tools/validate-radio-library.mjs')],input=json.dumps(document),
                            text=True,capture_output=True,cwd=ROOT,timeout=15,encoding='utf-8')
    if result.returncode: raise ValueError(result.stderr.strip() or 'Некорректная библиотека')
    seed = {r['eventType']:r for r in read(SEED)['rules']}
    for rule in document['rules']:
        actual = seed.get(rule['eventType'])
        # Editing JSON cannot create a gameplay source or promote an unavailable mechanic.
        rule['support'] = actual['support'] if actual else 'unavailable'
        rule['source'] = actual['source'] if actual else ''
        rule['reason'] = actual['reason'] if actual else 'Нужен игровой источник'
        if rule['support']!='wired': rule['enabled']=False
    for phrase in [*document['phrases'].values(),*document['characters']]:
        for field in ('audio','portrait'):
            media=phrase.get(field)
            if not media: continue
            file=media.get('file') if isinstance(media,dict) else media
            if not isinstance(file,str) or '\\' in file or '?' in file or '#' in file: raise ValueError('Некорректная ссылка на медиа')
            path=(ROOT/file).resolve()
            allowed=[(STORE/'media').resolve(),(ROOT/'assets/campaign').resolve()]
            if not path.is_file() or not any(path.is_relative_to(p) for p in allowed): raise ValueError('Медиа вне разрешённых материалов')
    return document

def save(document,revision):
    with LOCK:
        current=load()
        if revision!=current['revision']: return None
        validate(document)
        migrate()
        write(STORE/'history'/f'{revision:06d}.json',current)
        saved={'revision':revision+1,'savedAt':datetime.now(timezone.utc).isoformat(),'document':document}
        write(STORE/'draft.json',saved)
        return saved

def handle(handler):
    path=urlsplit(handler.path).path
    if not path.startswith('/api/radio'): return False
    def reply(status,body,kind='application/json; charset=utf-8'):
        data=json.dumps(body,ensure_ascii=False).encode() if not isinstance(body,bytes) else body
        handler.send_response(status);handler.send_header('Content-Type',kind)
        handler.send_header('Content-Length',str(len(data)));handler.send_header('X-Content-Type-Options','nosniff')
        handler.end_headers();handler.wfile.write(data)
    try:
        if handler.command=='GET':
            if path=='/api/radio/speech':
                if handler.headers.get('Sec-Fetch-Site')=='cross-site':
                    reply(403,{'error':'Озвучка доступна из игры и мастерской'});return True
                query=parse_qs(urlsplit(handler.path).query)
                if not {'voice','text'}<=set(query) or set(query)-{'voice','text','emotion'} or any(len(v)!=1 for v in query.values()):
                    raise ValueError('Нужны один текст и один голос')
                reply(200,speech(query['text'][0],query['voice'][0],query.get('emotion',['calm'])[0]).read_bytes(),'audio/ogg')
            elif path in ('/api/radio','/api/radio/published'): reply(200,load(path.endswith('/published')))
            elif path=='/api/radio/integrity': reply(200,integrity())
            elif path=='/api/radio/legacy':
                snapshot=migrate();reply(200,{'mapping':snapshot['mapping'],'scenes':snapshot['scenes'],'lines':snapshot['catalog']['lines']})
            elif path=='/api/radio/history': reply(200,{'revisions':[int(p.stem) for p in sorted((STORE/'history').glob('*.json'))]})
            elif path=='/api/radio/originals': migrate();reply(200,(STORE/'originals-v1.zip').read_bytes(),'application/zip')
            elif path=='/api/radio/export':
                buf=BytesIO()
                with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
                    z.writestr('snapshot.json',json.dumps(load(),ensure_ascii=False,indent=2))
                    for file in (STORE/'media').glob('*'):
                        if file.is_file(): z.write(file,file.relative_to(ROOT).as_posix())
                reply(200,buf.getvalue(),'application/zip')
            else: reply(404,{'error':'Маршрут не найден'})
            return True
        if handler.headers.get('X-Dialogue-Editor')!='1': reply(403,{'error':'Требуется запрос мастерской'});return True
        length=int(handler.headers.get('Content-Length','0'))
        if length<=0 or length>legacy.MAX_UPLOAD: raise ValueError('Неверный размер запроса')
        raw=handler.rfile.read(length)
        if path=='/api/radio/media' and handler.command=='POST':
            kind=handler.headers.get('X-Media-Kind','audio');extension=legacy.media_extension(raw,kind)
            file=STORE/'media'/(sha256(raw).hexdigest()+extension);file.parent.mkdir(parents=True,exist_ok=True)
            if not file.exists(): file.write_bytes(raw)
            reply(200,{'file':file.relative_to(ROOT).as_posix(),'origin':'user-recording','sha256':sha256(raw).hexdigest()});return True
        if length>MAX_BODY: raise ValueError('Слишком большой JSON')
        body=json.loads(raw)
        with LOCK:
            if path=='/api/radio' and handler.command=='PUT':
                saved=save(body['document'],body['revision'])
                reply(200,saved) if saved else reply(409,{'error':'Черновик изменён другой вкладкой. Экспортируйте свои правки.'})
            elif path=='/api/radio/publish' and handler.command=='POST':
                current=load()
                if body['revision']!=current['revision']: reply(409,{'error':'Версия изменилась'});return True
                validate(current['document']);migrate()
                prior=load(True);write(STORE/'published-history'/f'{prior["revision"]:06d}.json',prior)
                write(STORE/'published.json',current);reply(200,current)
            elif path=='/api/radio/rollback' and handler.command=='POST':
                revision=body.get('targetRevision')
                if not isinstance(revision,int) or revision<0: raise ValueError('Неверная версия')
                source=STORE/'history'/f'{revision:06d}.json'
                if not source.exists(): raise ValueError('Версия не найдена')
                saved=save(read(source)['document'],body['revision'])
                reply(200,saved) if saved else reply(409,{'error':'Версия изменилась'})
            else: reply(404,{'error':'Маршрут не найден'})
    except (ValueError,KeyError,TypeError,subprocess.TimeoutExpired) as error: reply(400,{'error':str(error)})
    except (RuntimeError,OSError,ImportError) as error: reply(503,{'error':str(error)})
    return True

if __name__=='__main__':
    print(json.dumps(integrity(),ensure_ascii=False,indent=2))
