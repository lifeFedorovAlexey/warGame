"""Identify the checkout actually served by the local game server."""
import json
import subprocess
from pathlib import Path


def build_info(directory):
    root = Path(directory).resolve()
    version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']

    def git(*args):
        return subprocess.run(
            ['git', '-C', str(root), *args], check=True, capture_output=True,
            text=True, encoding='utf-8', timeout=5,
        ).stdout.strip()

    commit = git('rev-parse', 'HEAD')
    number = int(git('rev-list', '--count', commit))
    branch = git('branch', '--show-current') or 'detached'
    dirty = bool(git('status', '--porcelain', '--untracked-files=normal'))
    dirty = dirty or git('rev-parse', 'HEAD') != commit
    return {
        'schemaVersion': 1,
        'version': version,
        'buildNumber': number,
        'buildId': f'{version}+build.{number}.{commit[:7]}' + ('.dirty' if dirty else ''),
        'commit': commit,
        'branch': branch,
        'dirty': dirty,
    }
