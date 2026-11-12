"""Import the owner's M03 brief and render only new local temporary voices."""
from pathlib import Path
import json,re,sys,shutil
from hashlib import sha256
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'assets/campaign/alpha/mission03'
SOURCE=ROOT/'docs/campaign/alpha/m03/request.txt'
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
 BASE.mkdir(parents=True,exist_ok=True)
 original=json.loads((ROOT/'assets/campaign/alpha/mission01/story-v2.json').read_text(encoding='utf-8'))
 speakers=original['speakers'].copy();speakers['pilot']={**speakers['radio'],'name':'Пилот «Коровника»'}
 names={'Генерал':'general','Командир':'commander','Прапорщик':'warrant','Радист':'radio','Пилот':'pilot','Разведчик':'scout','Учёный':'scientist'}
 scenes=[];dialogue=[]
 for block in re.split(r'(?=^### S\d+)',SOURCE.read_text(encoding='utf-8'),flags=re.M):
  match=re.match(r'### S(\d+) — (.+)',block)
  if not match:continue
  sid='m03-s'+match[1];cues=[]
  for i,line in enumerate(re.finditer(r'\*\*([^*:]+):\*\*\s*\[([^]]+)\]\s*«(.+?)»[.?]?',block,re.S)):
   speaker,emotion,text=line.groups();key=sid+'-'+str(i+1)
   if speaker not in names:continue
   cues.append(key);dialogue.append({'id':key,'speaker':names[speaker],'text':text.strip(),'emotion':emotion,'pauseAfter':.25,'recordingStatus':'temporary-synthesis'})
  trigger=re.search(r'\*\*Когда:\*\* (.+)',block)
  scenes.append({'id':sid,'title':match[2],'cues':cues,'triggerDescription':trigger[1] if trigger else '', 'presentation':{'type':'radio'}})
 extra=[('five-minutes','Осталось пять минут','pilot','Альфа, до конца операции пять минут. Рассчитывайте время на погрузку.'),('one-minute','Осталась минута','pilot','Альфа, осталась минута. Срочно на эвакуацию.'),('s07-clear','Склад без охраны','scout','Довоенный склад перед нами. Подступы свободны. Проверяем документацию.'),('s12-losses','Исследование после потерь','scientist','Тяжёлый пулемёт восстановили по документации. Теперь можем производить свой.')]
 for key,title,speaker,text in extra:
  sid='m03-'+key;scenes.append({'id':sid,'title':title,'cues':[sid+'-1'],'presentation':{'type':'radio'}});dialogue.append({'id':sid+'-1','speaker':speaker,'text':text,'pauseAfter':.25,'recordingStatus':'temporary-synthesis'})
 story={'version':1,'id':'alpha-m03','name':'Миссия 03 — Первый вылет','campaign':'Альфа','audioStatus':'temporary-synthesis','speakers':speakers,'scenes':scenes,'dialogue':dialogue,'barks':[],'source':{'path':SOURCE.relative_to(ROOT).as_posix()}}
 write(BASE/'story.json',story)
 if not (BASE/'reviewed-dialogue.json').exists():write(BASE/'reviewed-dialogue.json',{'version':1,'scenes':[],'dialogue':[],'clips':{}})
 manifest=json.loads((BASE/'audio.json').read_text(encoding='utf-8')) if (BASE/'audio.json').exists() else {'version':1,'clips':{}}
 write(BASE/'audio.json',manifest)
 if '--voices' in sys.argv:
  from radio_speech import speech,run,RUNTIME
  sys.path.insert(0,str(RUNTIME/'python'))
  import imageio_ffmpeg
  profiles={'commander':'voice-1','general':'voice-6','warrant':'voice-2','radio':'voice-6','pilot':'voice-1','scout':'voice-4','scientist':'voice-6'}
  edits=json.loads((BASE/'reviewed-dialogue.json').read_text(encoding='utf-8'))
  for line in dialogue:
   old=edits['clips'].get(line['id']) or manifest['clips'].get(line['id'])
   if old and old.get('origin')!='temporary-synthesis':continue
   emotion='urgent' if 'minute' in line['id'] else 'dry' if line['speaker']=='warrant' else 'calm'
   source=speech(line['text'],profiles[line['speaker']],emotion);digest=sha256(source.read_bytes()).hexdigest()
   target=BASE/'audio-temp'/f"{line['id']}-{digest[:12]}.ogg";target.parent.mkdir(exist_ok=True)
   if not target.exists():shutil.copyfile(source,target)
   pcm=run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',target,'-f','f32le','-ar','48000','-ac','1','-']).stdout
   manifest['clips'][line['id']]={'file':target.relative_to(BASE).as_posix(),'text':line['text'],'speaker':line['speaker'],'duration':len(pcm)/(48000*4),'origin':'temporary-synthesis','generator':'local Piper + FFmpeg','sha256':digest}
  manifest['status']='temporary-synthesis';write(BASE/'audio.json',manifest)
 print(f"M03: {len(scenes)} scenes, {len(dialogue)} lines, {len(manifest['clips'])} clips")
if __name__=='__main__':main()
