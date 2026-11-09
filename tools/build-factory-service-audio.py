"""Build only the temporary factory service barks; leave owner recordings intact."""
from pathlib import Path
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mission_audio', ROOT/'tools/build-mission-v2-audio.py')
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)

cues = [
    {'id':'factory-repair-start', 'event':'factory-repair-start', 'speaker':'builder', 'text':'Загоняй. Сейчас подварим.'},
    {'id':'factory-repair-start-alt', 'event':'factory-repair-start-alt', 'speaker':'warrant', 'text':'Рано списывать. Эта ещё поездит.'},
    {'id':'factory-repair-complete', 'event':'factory-repair-complete', 'speaker':'builder', 'text':'Готово. Только краску не трогай.'},
]
story = audio.read(audio.BASE/'story-v2.json')
raw = audio.RUNTIME/'factory-service'
out = audio.BASE/'audio-factory-service'
raw.mkdir(parents=True, exist_ok=True)
out.mkdir(parents=True, exist_ok=True)
for cue in cues:
    profile = story['speakers'][cue['speaker']]
    source, target = raw/(cue['id']+'.wav'), out/(cue['id']+'.ogg')
    line = json.dumps({'text':cue['text'], 'output_file':str(source)}, ensure_ascii=False)+'\n'
    audio.run([audio.RUNTIME/'piper/piper.exe', '--model', audio.RUNTIME/f'voices/ru_RU-{profile["voice"]}-medium.onnx',
        '--json-input', '--length_scale', profile['lengthScale'], '--sentence_silence', .16, '--quiet'],
        input=line.encode('utf-8'), cwd=audio.RUNTIME/'piper')
    ratio = 2**(profile['pitchSemitones']/12)
    filters = [f'asetrate=22050*{ratio:.8f}', 'aresample=22050', f'atempo={1/ratio:.8f}', 'highpass=f=65', 'lowpass=f=10000']
    if profile['effect']=='radio':
        filters += ['highpass=f=260', 'lowpass=f=3300', 'acompressor=threshold=.12:ratio=3:attack=10:release=80']
    filters += ['loudnorm=I=-19:TP=-2:LRA=9', 'afade=t=in:d=0.015']
    audio.run([audio.imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
        '-af', ','.join(filters), '-c:a', 'libopus', '-b:a', '40k', '-ar', '24000', target])
    cue['clip'] = {**audio.metadata(target, cue['speaker'], {}), 'origin':'temporary-synthesis', 'generator':'local Piper + FFmpeg', 'voice':profile['voice']}
audio.write_json(audio.BASE/'factory-service-voice.json', {'barks':cues})
print('Factory service: 3 temporary voice lines generated')
