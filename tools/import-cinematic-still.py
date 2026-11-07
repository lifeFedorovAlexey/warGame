"""Package a selected built-in ImageGen output as a local game asset."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'assets/campaign/alpha/mission01'
sys.path.insert(0,str(ROOT/'tools/.runtime-media/python'))
import imageio_ffmpeg

parser=argparse.ArgumentParser();parser.add_argument('--scene',type=int,required=True);parser.add_argument('--image',required=True);args=parser.parse_args()
story=json.loads((BASE/'story.json').read_text(encoding='utf-8'));scene=next(s for s in story['scenes'] if s['number']==args.scene)
target=BASE/scene['art'];target.parent.mkdir(parents=True,exist_ok=True)
if target.exists():raise FileExistsError('Use a new version instead of overwriting selected artwork: '+str(target))
source=Path(args.image)
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-i',str(source),'-vf','scale=1600:900:force_original_aspect_ratio=increase,crop=1600:900','-c:v','libwebp','-quality','90',str(target)],check=True)
manifest=BASE/'stills/manifest.json';data=json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else {'provider':'built-in image_gen','assets':[]}
data['assets'].append({'scene':scene['id'],'file':scene['art'],'width':1600,'height':900,'promptFile':target.with_suffix('.prompt.txt').name,'sourceGeneratedPath':str(source),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'scene':scene['id'],'file':str(target),'bytes':target.stat().st_size},ensure_ascii=False))
