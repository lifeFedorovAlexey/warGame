from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json

root = Path('campaign/reports/frame-budget/minimal-command-latency')
files = sorted(p for p in root.rglob('*') if p.is_file())
frozen = Path('campaign/reports/frame-budget/path-search/variants')
files += [frozen / 'manifest.json']
files += sorted(p for p in (frozen / 'baseline').rglob('*') if p.is_file())
files += [Path('campaign/reports/frame-budget/baseline-final/convoy-fixture.json')]
prior = Path('campaign/reports/frame-budget/command-latency')
files += [prior / 'control/baseline.json', prior / 'control/summary.json',
          prior / 'tools/check-combat-frame-safety.mjs']
for name in ['profile-minimal-command-latency.mjs', 'minimal-command-marks.mjs',
             'minimal-command-source.mjs', 'check-minimal-command-marks.mjs',
             'analyze-minimal-command-latency.mjs', 'check-minimal-command-equivalence.mjs',
             'check-command-publication-boundaries.mjs', 'profile-minimal-command-bridge.mjs',
             'check-frame-determinism.mjs', 'frame-benchmark-conditions.mjs', 'frame-latency-probe.mjs',
             'package-minimal-command-latency.py']:
    files.append(Path('tools') / name)
files = sorted(set(files))
manifest = [{'file': p.as_posix(), 'bytes': p.stat().st_size,
             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
target = root.with_suffix('.zip')
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as z:
    for row in manifest:
        z.write(row['file'], row['file'])
    z.writestr('artifact-manifest.json', json.dumps(manifest, indent=2))
with ZipFile(target) as z:
    assert z.testzip() is None
print(json.dumps({'file': str(target), 'bytes': target.stat().st_size,
                  'files': len(files), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}))
