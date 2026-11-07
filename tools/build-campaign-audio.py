"""Build Russian dialogue and quiet diegetic sound from the canonical screenplay."""
from pathlib import Path
import argparse
import array
import hashlib
import json
import math
import random
import subprocess
import sys
import wave

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'tools/.runtime-media'
BASE=ROOT/'assets/campaign/alpha/mission01'
sys.path.insert(0,str(RUNTIME/'python'))
import imageio_ffmpeg

def run(args,**kwargs):
    result=subprocess.run([str(arg) for arg in args],capture_output=True,**kwargs)
    if result.returncode:raise RuntimeError(result.stderr.decode('utf-8',errors='replace')[-1800:])
    return result

def ffmpeg():return imageio_ffmpeg.get_ffmpeg_exe()

def recording_metadata(cue_id,entry):
    source=(BASE/entry['file']).resolve()
    if not source.is_relative_to(BASE.resolve()):raise ValueError('Recording outside mission assets: '+cue_id)
    data=source.read_bytes();digest=hashlib.sha256(data).hexdigest()
    if digest!=entry['sha256']:raise ValueError('Recording checksum changed: '+cue_id)
    pcm=run([ffmpeg(),'-hide_banner','-loglevel','error','-i',source,'-f','s16le','-ac','1','-ar','24000','pipe:1']).stdout
    duration=len(pcm)/48000
    if duration<=.15:raise ValueError('Recording is empty or too short: '+cue_id)
    return {'file':entry['file'],'duration':duration,'speaker':entry['speaker'],
        'sha256':digest,'bytes':len(data),'origin':'user-recording'}

def recorded_clips(story):
    """Keep supplied performances intact, including when rebuilding Piper placeholders."""
    index=BASE/'audio-overrides.json'
    if not index.exists():return {}
    cues={cue['id']:cue for cue in story['dialogue']+story['barks']}
    clips={}
    for cue_id,entry in json.loads(index.read_text(encoding='utf-8'))['clips'].items():
        cue=cues.get(cue_id)
        if not cue or entry['text']!=cue['text'] or entry['speaker']!=cue['speaker']:
            raise ValueError('Recorded dialogue no longer matches screenplay: '+cue_id)
        clips[cue_id]=recording_metadata(cue_id,entry)
    return clips

def recorded_reactions(story):
    index=BASE/'audio-overrides.json'
    if not index.exists():return {}
    cues={cue['id'] for cue in story['dialogue']}
    reactions={}
    for cue_id,entry in json.loads(index.read_text(encoding='utf-8')).get('reactions',{}).items():
        if entry['afterCue'] not in cues or entry['speaker'] not in story['speakers']:
            raise ValueError('Unknown reaction speaker or dialogue anchor: '+cue_id)
        reactions[cue_id]={**recording_metadata(cue_id,entry),'afterCue':entry['afterCue']}
    return reactions

def main(recordings_only=False):
    story=json.loads((BASE/'story.json').read_text(encoding='utf-8'))
    recordings=recorded_clips(story)
    reactions=recorded_reactions(story)
    if recordings_only:
        manifest=json.loads((BASE/'audio.json').read_text(encoding='utf-8'))
        if manifest['source']!=story['source']:raise ValueError('Rebuild audio for the current screenplay first')
        manifest['clips'].update(recordings)
        if reactions:manifest.setdefault('reactions',{}).update(reactions)
        (BASE/'audio.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'recordingsApplied':len(recordings),'reactions':len(reactions)}),flush=True)
        return
    raw=BASE/'audio-source';out=BASE/'audio';raw.mkdir(parents=True,exist_ok=True);out.mkdir(exist_ok=True)
    manifest={'schemaVersion':1,'language':'ru-RU','source':story['source'],'voices':story['speakers'],'clips':{}}
    if reactions:manifest['reactions']=reactions
    cues=story['dialogue']+story['barks']
    for speaker,profile in story['speakers'].items():
        group=[cue for cue in cues if cue['speaker']==speaker]
        if not group:continue
        def key(cue):return hashlib.sha256(json.dumps([cue['text'],profile],ensure_ascii=False,sort_keys=True).encode('utf-8')).hexdigest()
        pending=[cue for cue in group if cue['id'] not in recordings and (not(raw/(cue['id']+'.wav')).exists() or not(raw/(cue['id']+'.key')).exists() or (raw/(cue['id']+'.key')).read_text()!=key(cue))]
        if pending:
            lines=[json.dumps({'text':cue['text'],'output_file':str(raw/(cue['id']+'.wav'))},ensure_ascii=False) for cue in pending]
            args=[RUNTIME/'piper/piper.exe','--model',RUNTIME/f'voices/ru_RU-{profile["voice"]}-medium.onnx','--json-input','--length_scale',profile['lengthScale'],'--sentence_silence',.16,'--quiet']
            run(args,input=('\n'.join(lines)+'\n').encode('utf-8'),cwd=RUNTIME/'piper')
            for cue in pending:(raw/(cue['id']+'.key')).write_text(key(cue))
        for cue in group:
            if cue['id'] in recordings:
                manifest['clips'][cue['id']]=recordings[cue['id']]
                continue
            source=raw/(cue['id']+'.wav');target=out/(cue['id']+'.ogg')
            ratio=2**(profile['pitchSemitones']/12)
            filters=[f'asetrate=22050*{ratio:.8f}','aresample=22050',f'atempo={1/ratio:.8f}','highpass=f=65','lowpass=f=10000']
            if profile['effect']=='radio':filters+=['highpass=f=260','lowpass=f=3300','acompressor=threshold=.12:ratio=3:attack=10:release=80']
            elif profile['effect']=='room':filters+=['aecho=.8:.5:55:.10']
            elif profile['effect']=='dream':filters+=['aecho=.8:.6:360|720|1080:.34|.22|.10']
            filters+=['loudnorm=I=-19:TP=-2:LRA=9','afade=t=in:d=0.015']
            processKey=hashlib.sha256((key(cue)+','.join(filters)).encode()).hexdigest();stamp=raw/(cue['id']+'.encoded-key')
            if not target.exists() or not stamp.exists() or stamp.read_text()!=processKey:
                run([ffmpeg(),'-hide_banner','-loglevel','error','-y','-i',source,'-af',','.join(filters),'-c:a','libopus','-b:a','40k','-ar','24000',target]);stamp.write_text(processKey)
            # Decode the delivered format to measure its real duration, including tails.
            pcm=run([ffmpeg(),'-hide_banner','-loglevel','error','-i',target,'-f','s16le','-ac','1','-ar','24000','pipe:1']).stdout
            manifest['clips'][cue['id']]={'file':'audio/'+target.name,'duration':len(pcm)/(24000*2),'speaker':speaker,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size}
        print(f'Voice ready: {speaker} ({len(group)} clips)',flush=True)
    sounds=BASE/'sfx';sounds.mkdir(exist_ok=True)
    manifest['ambience']={}
    for index,kind in enumerate(['wind','siren','barracks','base','projector','convoy','radio','workshop']):
        randomizer=random.Random(4200+index);rate=24000;duration=12;signal=array.array('h');brown=0
        for i in range(rate*duration):
            t=i/rate;white=randomizer.uniform(-1,1);brown=.986*brown+.014*white
            value=brown*.24+white*.005
            if kind in ['base','convoy']:value+=.022*math.sin(2*math.pi*43*t)+.008*math.sin(2*math.pi*86*t)+white*.009*(.5+.5*math.sin(2*math.pi*18*t))
            if kind=='projector':value+=.014*math.sin(2*math.pi*60*t)+.006*math.sin(2*math.pi*24*t)**9
            if kind=='barracks':value+=.006*math.sin(2*math.pi*50*t)
            if kind=='radio':value+=white*.018*(.5+.2*math.sin(t*2.1))
            if kind=='siren':value+=.04*math.sin(2*math.pi*(290*t-33*math.cos(2*math.pi*t/6)/(2*math.pi/6)))
            if kind=='workshop':
                for hit in [2.1,6.4,9.8]:
                    age=t-hit
                    if 0<=age<.4:value+=.06*math.exp(-age*17)*math.sin(2*math.pi*1450*age)
            envelope=min(1,t/.12,(duration-t)/.12);signal.append(int(max(-.99,min(.99,value*envelope))*32767))
        wav=raw/(kind+'.wav')
        with wave.open(str(wav),'wb') as stream:stream.setparams((1,2,rate,0,'NONE','not compressed'));stream.writeframes(signal.tobytes())
        target=sounds/(kind+'.ogg');run([ffmpeg(),'-hide_banner','-loglevel','error','-y','-i',wav,'-af','loudnorm=I=-34:TP=-9:LRA=7','-c:a','libopus','-b:a','32k',target]);manifest['ambience'][kind]={'file':'sfx/'+target.name,'duration':duration,'source':'Procedural synthesis in build-campaign-audio.py','sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    (BASE/'audio.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'clips':len(manifest['clips']),'speechMinutes':sum(c['duration'] for c in manifest['clips'].values())/60,'ambienceLoops':len(manifest['ambience'])}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recordings-only',action='store_true',help='Apply supplied dialogue without regenerating other voices or ambience')
    main(recordings_only=parser.parse_args().recordings_only)
