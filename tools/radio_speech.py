"""Local temporary radio speech; never edits a recording or calls a cloud service."""
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore, Lock
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
# Resolve the shared runtime junction before invoking native Piper on Windows.
# Its model loader cannot reliably open a Cyrillic worktree alias.
RUNTIME = (ROOT/'tools/.runtime-media').resolve()
CACHE = RUNTIME/'dynamic-radio'
# Six temporary performances: four male and two female profiles.
# These are placeholders for the owner's six additional recorded voices.
PROFILES = {
    'voice-1': {'model':'denis', 'pace':1.04, 'pitch':-.8},
    'voice-2': {'model':'dmitri', 'pace':1.08, 'pitch':-1.2},
    'voice-3': {'model':'irina', 'pace':1.0, 'pitch':0},
    'voice-4': {'model':'dmitri', 'pace':1.12, 'pitch':-.5},
    'voice-5': {'model':'irina', 'pace':1.06, 'pitch':-.8},
    'voice-6': {'model':'dmitri', 'pace':1.0, 'pitch':.6},
}
WORKERS = BoundedSemaphore(2)
LOCKS = [Lock() for _ in range(32)]

def run(args, **kwargs):
    result = subprocess.run([str(arg) for arg in args], capture_output=True, timeout=30,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), **kwargs)
    if result.returncode:
        raise RuntimeError('Не удалось создать временную озвучку: '+result.stderr.decode('utf-8', errors='replace')[-600:])
    return result

def speech(text, voice, emotion='calm'):
    if not isinstance(text, str) or not text.strip() or len(text)>600 or any(ord(c)<32 for c in text) or '{' in text or '}' in text:
        raise ValueError('Нужна готовая реплика до 600 символов, без шаблонов и управляющих символов')
    if voice not in PROFILES:
        raise ValueError('Неизвестный временный голос')
    if emotion not in ('calm','urgent','dry','relieved','somber'): raise ValueError('Неизвестная манера речи')
    profile = dict(PROFILES[voice])
    if emotion=='urgent': profile.update(pace=profile['pace']*.92,pitch=profile['pitch']+.5)
    elif emotion=='dry': profile.update(pace=profile['pace']*1.03,pitch=profile['pitch']-.3)
    elif emotion=='relieved': profile.update(pace=profile['pace']*.98,pitch=profile['pitch']+.2)
    elif emotion=='somber': profile.update(pace=profile['pace']*1.14,pitch=profile['pitch']-.4)
    key = sha256(json.dumps([1, text, profile], ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
    target = CACHE/(key+'.ogg')
    if target.exists(): return target
    if not WORKERS.acquire(timeout=10): raise RuntimeError('Синтезатор занят. Повторите прослушивание.')
    try:
        with LOCKS[int(key[:2], 16)%len(LOCKS)]:
            if target.exists(): return target
            model = RUNTIME/f'voices/ru_RU-{profile["model"]}-medium.onnx'
            executable = RUNTIME/'piper/piper.exe'
            if not executable.is_file() or not model.is_file():
                raise RuntimeError('Локальный Piper или русская модель не установлены')
            sys.path.insert(0, str(RUNTIME/'python')) if str(RUNTIME/'python') not in sys.path else None
            import imageio_ffmpeg
            CACHE.mkdir(parents=True, exist_ok=True)
            with TemporaryDirectory(prefix='render-', dir=CACHE) as folder:
                source, output = Path(folder)/'speech.wav', Path(folder)/'speech.ogg'
                line = json.dumps({'text':text, 'output_file':str(source)}, ensure_ascii=False)+'\n'
                run([executable, '--model', model, '--json-input', '--length_scale', profile['pace'],
                     '--sentence_silence', .12, '--quiet'], input=line.encode('utf-8'), cwd=executable.parent)
                ratio = 2**(profile['pitch']/12)
                filters = [f'asetrate=22050*{ratio:.8f}', 'aresample=24000', f'atempo={1/ratio:.8f}',
                           'highpass=f=260', 'lowpass=f=3300', 'acompressor=threshold=.12:ratio=3:attack=10:release=80',
                           'loudnorm=I=-19:TP=-2:LRA=9', 'afade=t=in:d=0.015']
                run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
                     '-af', ','.join(filters), '-c:a', 'libopus', '-b:a', '40k', '-ar', '24000', output])
                if output.stat().st_size<1000: raise RuntimeError('Синтезатор вернул пустую запись')
                output.replace(target)
            return target
    finally:
        WORKERS.release()
