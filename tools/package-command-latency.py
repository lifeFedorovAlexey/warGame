from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json

root = Path('campaign/reports/frame-budget/command-latency')
target = root.with_suffix('.zip')
files = sorted(p for p in root.rglob('*') if p.is_file())
frozen = Path('campaign/reports/frame-budget/path-search/variants')
files += [frozen / 'manifest.json']
files += sorted(p for p in (frozen / 'baseline').rglob('*') if p.is_file())
files += [Path('campaign/reports/frame-budget/baseline-final/convoy-fixture.json')]
for name in ['analyze-command-latency.mjs', 'check-command-latency-equivalence.mjs',
             'check-frame-determinism.mjs', 'frame-latency-probe.mjs',
             'frame-benchmark-conditions.mjs', 'package-command-latency.py',
             'analyze-command-latency-stacks.mjs', 'analyze-combat-frame-safety.mjs',
             'frame-trace-alignment.mjs', 'frame-acceptance-contract.mjs']:
    files.append(Path('tools') / name)
manifest = [{'file': p.as_posix(), 'bytes': p.stat().st_size,
             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for item in manifest:
        archive.write(item['file'], item['file'])
    archive.writestr('artifact-manifest.json', json.dumps(manifest, indent=2))
with ZipFile(target) as archive:
    assert archive.testzip() is None
print(json.dumps({'file': str(target), 'bytes': target.stat().st_size,
                  'files': len(files), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}))
