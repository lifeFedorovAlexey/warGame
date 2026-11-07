"""Render the same measured cinematic timeline to a standalone H.264/AAC film."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'assets/campaign/alpha/mission01'
RUNTIME=ROOT/'tools/.runtime-media'
sys.path.insert(0,str(RUNTIME/'python'))
import imageio_ffmpeg
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
FPS=24

def run(args):
    result=subprocess.run([FFMPEG,'-hide_banner','-loglevel','error',*map(str,args)],cwd=ROOT,capture_output=True,encoding='utf-8',errors='replace')
    if result.returncode:raise RuntimeError(result.stderr[-5000:])

def clock(seconds):
    cs=round(seconds*100);return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'

def escape(text):return text.replace('\\','\\\\').replace('{','\\{').replace('}','\\}').replace('\n',r'\N')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--chapter',default='all');parser.add_argument('--output');args=parser.parse_args()
    story=json.loads((BASE/'story.json').read_text(encoding='utf-8'))
    audio=json.loads((BASE/'audio.json').read_text(encoding='utf-8'))
    if args.chapter!='all' and args.chapter not in story['chapters']:raise ValueError('Unknown chapter')
    # Import the actual browser timeline rather than re-estimating dialogue times.
    code="import fs from 'node:fs';import{buildTimeline}from'./campaign/cinematics.js';const b='assets/campaign/alpha/mission01/';const s=JSON.parse(fs.readFileSync(b+'story.json','utf8')),a=JSON.parse(fs.readFileSync(b+'audio.json','utf8'));console.log(JSON.stringify(buildTimeline(s,a,process.argv[1]==='all'?s.scenes.map(s=>s.id):s.chapters[process.argv[1]])));"
    timeline=json.loads(subprocess.check_output(['node','--input-type=module','-e',code,args.chapter],cwd=ROOT,encoding='utf-8'))
    cache=RUNTIME/'renders';cache.mkdir(parents=True,exist_ok=True)
    outputs=[]
    for segment in timeline['segments']:
        scene=segment['scene'];duration=math.ceil((segment['end']-segment['start'])*FPS)/FPS;frames=round(duration*FPS)
        signature=hashlib.sha256(json.dumps({'segment':segment,'audio':audio,'renderer':'mp4-v1-720p24'},sort_keys=True).encode()+(BASE/scene['art']).read_bytes()).hexdigest()[:16]
        output=cache/f'{scene["id"]}-{signature}.mp4';outputs.append(output)
        if output.exists() and output.stat().st_size>1000:print('Cached',scene['id'],flush=True);continue
        ass=cache/f'{scene["id"]}-{signature}.ass'
        header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Speech,Segoe UI,26,&H00EEEFF1,&H00EEEFF1,&H00101515,&H90080B0B,0,0,0,0,100,100,0,0,1,2,1,2,100,100,64,1
Style: Card,Segoe UI,30,&H00D6DFB9,&H00D6DFB9,&H00101515,&H00080B0B,0,0,0,0,100,100,0,0,1,0,0,8,50,50,180,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
        lines=[header]
        for cue in segment['lines']:
            label=story['speakers'][cue['speaker']]['name'].upper();text=r'{\fs16\c&HA6D1C7&}'+escape(label)+r'\N{\fs26\c&HE4EEF1&}'+escape(cue['text'])
            lines.append(f'Dialogue: 0,{clock(cue["start"]-segment["start"])},{clock(cue["end"]-segment["start"])},Speech,,0,0,0,,{text}\n')
        card=segment.get('card');card_start=segment.get('cardStart',segment['end'])-segment['start']
        if card:
            text=r'{\fad(500,500)\fs30}'+escape(card['title'])+r'\N\N{\fs20}'+escape(card['subtitle'])+r'\N\N{\fs23}'+r'\N'.join(escape(line) for line in card['lines'])
            lines.append(f'Dialogue: 1,{clock(card_start)},{clock(duration)},Card,,0,0,0,,{text}\n')
        ass.write_text(''.join(lines),encoding='utf-8-sig')
        args_ff=['-y','-loop','1','-framerate',str(FPS),'-i',BASE/scene['art'],'-f','lavfi','-i','anullsrc=r=24000:cl=mono','-stream_loop','-1','-i',BASE/audio['ambience'][scene['ambience']]['file']]
        filters=[];voice_labels=[]
        for index,cue in enumerate(segment['lines'],3):
            args_ff+=['-i',BASE/cue['clip']['file']];delay=round((cue['start']-segment['start'])*1000);label=f'voice{index}';filters.append(f'[{index}:a]adelay={delay}:all=1[{label}]');voice_labels.append(f'[{label}]')
        filters.append(''.join(voice_labels)+f'amix=inputs={len(voice_labels)}:normalize=0:dropout_transition=0,apad,atrim=duration={duration},asplit=2[speech][duck]')
        filters.append(f'[2:a]volume=0.6,atrim=duration={duration},afade=t=in:st=0:d=0.5,afade=t=out:st={duration-.5}:d=0.5[ambience]')
        filters.append('[ambience][duck]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[background]')
        filters.append(f'[1:a]atrim=duration={duration}[silence]')
        filters.append('[speech][background][silence]amix=inputs=3:normalize=0:dropout_transition=0,alimiter=limit=0.95[outa]')
        motion=scene['motion'];dx=motion['to'][0];dy=motion['to'][1];denom=max(1,frames-1);zoom=f'{motion["from"][2]}+{motion["to"][2]-motion["from"][2]}*on/{denom}'
        video=f"[0:v]zoompan=z='{zoom}':x='iw/2-iw/zoom/2-({dx})*iw/zoom*on/{denom}':y='ih/2-ih/zoom/2-({dy})*ih/zoom*on/{denom}':d=1:s=1280x720:fps={FPS},fade=t=in:st=0:d=0.75,fade=t=out:st={max(0,(card_start if card else duration)-.75)}:d=0.75"
        if scene['number']==1:
            flash=segment['lines'][-1]['end']-segment['start'];video+=f",drawbox=x=0:y=0:w=iw:h=ih:color=0xfffae2:t=fill:enable='between(t,{flash},{flash+.20})'"
        if card:video+=f",drawbox=x=0:y=0:w=iw:h=ih:color=0x080b0c:t=fill:enable='gte(t,{card_start})'"
        video+=f",ass='{ass.relative_to(ROOT).as_posix()}',format=yuv420p[outv]";filters.append(video)
        graph=cache/f'{scene["id"]}-{signature}.filters';graph.write_text(';\n'.join(filters),encoding='utf-8')
        print('Rendering',scene['id'],f'{duration:.2f}s',flush=True)
        temporary=output.with_name(output.stem+'.partial.mp4')
        run([*args_ff,'-filter_complex_script',graph,'-map','[outv]','-map','[outa]','-t',duration,'-c:v','libx264','-preset','veryfast','-crf','21','-threads','2','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart',temporary]);temporary.replace(output)
    playlist=cache/f'{args.chapter}.concat.txt';playlist.write_text(''.join("file '"+file.as_posix().replace("'","'\\''")+"'\n" for file in outputs),encoding='utf-8')
    destination=Path(args.output) if args.output else ROOT/f'campaign/previews/mission01-{args.chapter}.mp4'
    if not destination.is_absolute():destination=ROOT/destination
    destination=destination.resolve()
    if not destination.is_relative_to(ROOT):raise ValueError('Output must stay in the project')
    destination.parent.mkdir(parents=True,exist_ok=True)
    run(['-y','-f','concat','-safe','0','-i',playlist,'-c','copy','-movflags','+faststart',destination])
    report={'chapter':args.chapter,'file':str(destination),'scenes':len(outputs),'timelineSeconds':timeline['duration'],'width':1280,'height':720,'fps':FPS,'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
    destination.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
