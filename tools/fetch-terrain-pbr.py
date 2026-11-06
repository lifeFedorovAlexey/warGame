"""Fetch four explicitly selected CC0 terrain materials from Poly Haven."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'assets/maps/alpha/materials/pbr'
HEADERS = {'User-Agent': 'warGame-local-terrain-review'}
ASSETS = ['gravelly_sand', 'sandy_gravel', 'asphalt_03', 'quarry_wall_02']

def fetch(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read()

def main():
    manifest = {'license': 'CC0-1.0', 'licenseUrl': 'https://polyhaven.com/license', 'resolution': 1024, 'assets': []}
    for asset in ASSETS:
        metadata = json.loads(fetch('https://api.polyhaven.com/files/' + asset))
        entry = {'id': asset, 'source': 'https://polyhaven.com/a/' + asset, 'files': {}}
        folder = ROOT / asset
        folder.mkdir(parents=True, exist_ok=True)
        for channel, key in [('albedo', 'Diffuse'), ('normal', 'nor_gl'), ('orm', 'arm')]:
            remote = metadata[key]['1k']['jpg']
            if not remote['url'].startswith('https://dl.polyhaven.org/file/ph-assets/Textures/'):
                raise ValueError('Unexpected asset host')
            path = folder / (channel + '.jpg')
            data = path.read_bytes() if path.exists() else fetch(remote['url'])
            if hashlib.md5(data).hexdigest() != remote['md5']:
                raise ValueError('Checksum mismatch: ' + asset + '/' + channel)
            path.write_bytes(data)
            entry['files'][channel] = {'path': asset + '/' + channel + '.jpg', 'url': remote['url'], 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        manifest['assets'].append(entry)
        print(asset, sum(f['bytes'] for f in entry['files'].values()), 'bytes', flush=True)
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
