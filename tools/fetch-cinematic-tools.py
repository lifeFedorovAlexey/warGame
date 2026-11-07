"""Fetch pinned offline speech tools and Russian models; never part of the game runtime."""
from pathlib import Path
import hashlib
import json
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'tools/.runtime-media'
LICENSES = ROOT / 'assets/campaign/alpha/mission01/licenses'

def read(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'warGame-asset-builder/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()

def download(url, path, expected=None):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        data = read(url)
        if expected and hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('Source checksum mismatch: '+path.name)
        part = path.with_suffix(path.suffix+'.part')
        part.write_bytes(data)
        part.replace(path)
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    if expected and sha != expected:
        raise ValueError('Cached checksum mismatch: '+path.name)
    return {'url': url, 'sha256': sha, 'bytes': path.stat().st_size}

def main():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    LICENSES.mkdir(parents=True, exist_ok=True)
    api = json.loads(read('https://huggingface.co/api/models/rhasspy/piper-voices'))
    revision = api['sha']
    manifest = {'tool': 'Piper 2023.11.14-2 (offline build tool)', 'voiceRepository': 'rhasspy/piper-voices', 'revision': revision, 'voices': []}
    archive = RUNTIME / 'piper_windows_amd64.zip'
    manifest['runtime'] = download('https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip', archive)
    if not (RUNTIME / 'piper/piper.exe').exists():
        with zipfile.ZipFile(archive) as package:
            for entry in package.infolist():
                target = (RUNTIME / entry.filename).resolve()
                if not target.is_relative_to(RUNTIME.resolve()):
                    raise ValueError('Unsafe archive path')
            package.extractall(RUNTIME)
    for name in ['denis', 'dmitri']:
        remote = f'ru/ru_RU/{name}/medium'
        base = f'https://huggingface.co/rhasspy/piper-voices/resolve/{revision}/{remote}/'
        card = read(base+'MODEL_CARD').decode('utf-8')
        if '* License: CC0' not in card:
            raise ValueError('Unexpected voice dataset terms: '+name)
        (LICENSES / (name+'-MODEL_CARD.md')).write_text(card, encoding='utf-8')
        listing = json.loads(read(f'https://huggingface.co/api/models/rhasspy/piper-voices/tree/{revision}/{remote}'))
        lfs = {entry['path'].split('/')[-1]: entry.get('lfs', {}).get('oid') for entry in listing}
        files = {}
        for suffix in ['.onnx', '.onnx.json']:
            filename = f'ru_RU-{name}-medium{suffix}'
            files[suffix] = download(base+filename, RUNTIME / 'voices' / filename, lfs.get(filename))
        manifest['voices'].append({'id': name, 'datasetLicense': 'CC0 (per upstream model card)', 'modelCard': f'https://huggingface.co/rhasspy/piper-voices/blob/{revision}/{remote}/MODEL_CARD', 'files': files})
        print('Ready:', name, flush=True)
    tool_license = read('https://raw.githubusercontent.com/rhasspy/piper/2023.11.14-2/LICENSE.md').decode('utf-8')
    (LICENSES / 'piper-LICENSE.txt').write_text(tool_license, encoding='utf-8')
    (LICENSES / 'speech-sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Offline speech sources verified.', flush=True)

if __name__ == '__main__':
    main()
