"""Generate complete temporary M02 lines, preserving any recorded performances."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import json
import shutil
import sys
from radio_speech import speech,run,RUNTIME

BASE = Path(__file__).resolve().parents[1] / 'assets/campaign/alpha/mission02'
VOICES = {'commander':'voice-1', 'warrant':'voice-2', 'scout':'voice-4', 'scientist':'voice-6', 'radio':'voice-6'}

def audio_duration(path):
    # Decode exactly what the browser plays, including Opus end padding.
    import imageio_ffmpeg
    pcm=run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',path,'-f','f32le','-ar','48000','-ac','1','-']).stdout
    return len(pcm)/(48000*4)

def main():
    sys.path.insert(0,str(RUNTIME/'python'))
    story=json.loads((BASE/'story.json').read_text(encoding='utf-8'))
    manifest=json.loads((BASE/'audio.json').read_text(encoding='utf-8'))
    edits=json.loads((BASE/'reviewed-dialogue.json').read_text(encoding='utf-8'))
    lines={line['id']:line for line in story['dialogue']};lines.update({line['id']:line for line in edits['dialogue']})
    def render(line):
        old=edits['clips'].get(line['id']) or manifest['clips'].get(line['id'])
        if old and old.get('origin')!='temporary-synthesis':return line['id'],None
        voice=VOICES[line['speaker']];emotion='dry' if line['speaker']=='warrant' else 'calm'
        source=speech(line['text'],voice,emotion);data=source.read_bytes();digest=sha256(data).hexdigest()
        target=BASE/'audio-temp'/f"{line['id']}-{digest[:12]}.ogg";target.parent.mkdir(exist_ok=True)
        if not target.exists():shutil.copyfile(source,target)
        return line['id'],{'file':target.relative_to(BASE).as_posix(),'speaker':line['speaker'],'text':line['text'],
            'voice':voice,'emotion':emotion,'duration':audio_duration(target),'sha256':digest,
            'origin':'temporary-synthesis','generator':'local Piper + FFmpeg'}
    with ThreadPoolExecutor(max_workers=2) as pool:
        for key,clip in pool.map(render,lines.values()):
            if clip:manifest['clips'][key]=clip
    manifest['status']='temporary-synthesis'
    (BASE/'audio.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    story['audioStatus']='temporary-synthesis'
    for line in story['dialogue']:
        if manifest['clips'].get(line['id'],{}).get('origin')=='temporary-synthesis':line['recordingStatus']='temporary-synthesis'
    (BASE/'story.json').write_text(json.dumps(story,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"M02: {len(lines)} lines covered; {len(manifest['clips'])} clips in manifest")

if __name__=='__main__':main()
