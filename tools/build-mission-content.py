"""Turn the user's unedited screenplay into stable scene and dialogue records."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/campaign/alpha/mission01-script.md'
OUT = ROOT / 'assets/campaign/alpha/mission01'

SPEAKERS = {
    'КОМАНДИР': 'commander', 'ПРАПОРЩИК': 'warrant', 'ГЕНЕРАЛ': 'general',
    'РАДИСТ': 'radio', 'УЧЁНЫЙ': 'scientist', 'РАЗВЕДЧИК': 'scout',
    'ОТБРОС': 'raider', 'ГЛАВАРЬ ОТБРОСОВ': 'chief', 'ГЛАВАРЬ': 'chief',
    'ГОЛОС ИЗ ПРОШЛОГО': 'past', 'СОЛДАТ': 'soldier', 'ОФИЦЕР': 'officer',
}
SCENES = {
    1: ('Последний сон', 'last-dream', 'intro', 'siren'),
    2: ('Казарма', 'barracks', 'intro', 'barracks'),
    3: ('База «Рай»', 'base-gate', 'intro', 'base'),
    4: ('Штаб организации «Рай»', 'briefing', 'briefing', 'projector'),
    5: ('Западный оперативный район', 'operations-map', 'briefing', 'projector'),
    6: ('«Буханка смерти»', 'convoy', 'arrival', 'convoy'),
    7: ('Появление отбросов', 'first-contact', 'first-contact', 'radio'),
    8: ('Неизвестное устройство', 'artifact', 'first-artifact', 'workshop'),
    9: ('Боеприпасы', 'ammo-cache', 'second-artifact', 'workshop'),
    10: ('Оборонительная башня', 'water-tower', 'third-artifact', 'wind'),
    11: ('Последний опорный пункт', 'last-camp', 'last-camp', 'radio'),
    12: ('Доклад о победе', 'victory-report', 'victory', 'base'),
    13: ('Восстановление цивилизации', 'evening-base', 'outro', 'base'),
    14: ('Энергетическая аномалия', 'energy-anomaly', 'outro', 'radio'),
}
PROFILES = {
    'narrator': ('Диктор', 'dmitri', 1.08, -.8, 'clean'),
    'commander': ('Командир', 'denis', 1.04, -1.0, 'clean'),
    'warrant': ('Прапорщик', 'dmitri', 1.12, -1.6, 'clean'),
    'general': ('Генерал', 'dmitri', 1.16, -.5, 'clean'),
    'radio': ('Радист', 'denis', .97, .5, 'radio'),
    'scientist': ('Учёный', 'dmitri', 1.06, .8, 'clean'),
    'scout': ('Разведчик', 'denis', 1.00, .8, 'radio'),
    'raider': ('Отброс', 'dmitri', .98, -1.4, 'radio'),
    'chief': ('Петрович', 'dmitri', 1.05, -1.7, 'radio'),
    'past': ('Голос из прошлого', 'dmitri', 1.26, -2.0, 'dream'),
    'soldier': ('Солдат', 'denis', .98, 1.2, 'room'),
    'officer': ('Офицер', 'denis', 1.03, -.2, 'room'),
    'builder': ('Строитель', 'denis', 1.06, -.4, 'radio'),
}

def main():
    text = SOURCE.read_text(encoding='utf-8-sig')
    lines = text.splitlines()
    scenes, dialogue, barks = [], [], []
    scene, speaker, extra, bark_event, phase = None, 'narrator', False, None, 'before'
    unit_events = {'При выборе строителя:': 'builder-select', 'При повторном выборе:': 'builder-select-repeat',
        'При начале строительства:': 'construction-start', 'При окончании строительства генератора:': 'generator-complete',
        'При возведении завода:': 'factory-complete', 'При выпуске первой «Буханки»:': 'first-unit-produced'}
    for line_number, raw in enumerate(lines, 1):
        line = raw.strip()
        heading = re.match(r'^## Сцена (\d+)\.\s*(.*)', line)
        if heading:
            number = int(heading[1]); title, art, chapter, ambience = SCENES[number]
            scene = {'id': f'm01-s{number:02}', 'number': number, 'title': title, 'chapter': chapter,
                'art': f'stills/{art}.webp', 'ambience': ambience, 'sourceLine': line_number,
                'motion': {'from': [0, 0, 1.035], 'to': [.018 if number%2 else -.018, -.012, 1.095]}, 'cues': []}
            scenes.append(scene); speaker='narrator'; bark_event=None;phase='before'
        if line.startswith('### Исследование:'):
            phase='research-complete'
        if scene and scene['number']==7 and line.startswith('### Игровой этап: отражение атаки'):
            phase='after-raid'
        if line.startswith('# ДОПОЛНИТЕЛЬНЫЕ ИГРОВЫЕ РЕПЛИКИ'):
            extra=True;scene=None
        if line in unit_events:
            bark_event=unit_events[line];speaker='builder'
        if 'крик солдата' in line:
            speaker='soldier'
        if line=='Прапорщик оценивает стену.':
            speaker='warrant'
        role = re.match(r'^\*\*([^*]+):\*\*$', line)
        if role and role[1] in SPEAKERS:
            speaker=SPEAKERS[role[1]];bark_event=None
        spoken = line.startswith('— ')
        narrator = scene and scene['number']==1 and line.startswith('«')
        if scene and (spoken or narrator):
            spoken_text=line[2:] if spoken else line
            if narrator: spoken_text=re.sub(r'^«|»(?=[.!?]?$)', '', spoken_text)
            if bark_event:
                bark={'id':f'm01-b{len(barks)+1:03}', 'event':bark_event,'speaker':'builder','text':spoken_text,'sourceLine':line_number}
                barks.append(bark)
            else:
                cue={'id':f'{scene["id"]}-l{len(scene["cues"])+1:03}', 'speaker':speaker,'text':spoken_text,'sourceLine':line_number,'phase':phase,
                    'pauseAfter': .85 if spoken_text.endswith(('…','?')) else .5}
                scene['cues'].append(cue['id']);dialogue.append(cue)
        if extra and line.startswith('|') and not line.startswith(('| Событие','|---')):
            cells=[x.strip() for x in line.strip('|').split('|')]
            if len(cells)==2:
                barks.append({'id':f'm01-b{len(barks)+1:03}', 'event':cells[0], 'speaker':'commander' if 'УАЗ' in cells[0] else 'builder' if any(x in cells[0] for x in ['Стро','Ремонт']) else 'scientist' if 'Исслед' in cells[0] else 'scout', 'text':re.sub('[«»]', '', cells[1]), 'sourceText':cells[1], 'sourceLine':line_number})
    assert len(scenes)==14 and all(s['cues'] for s in scenes)
    assert all(c['speaker'] in PROFILES for c in dialogue+barks)
    scenes[4]['endCard']={'seconds':7,'title':'МИССИЯ 1 — «ОСВОЕНИЕ ЦЕЛИНЫ»','subtitle':'ОСНОВНЫЕ ЗАДАЧИ','lines':['Развернуть передовую базу.','Обеспечить энергоснабжение.','Наладить производство техники.','Организовать научные исследования.','Обеспечить безопасность района.']}
    scenes[13]['endCard']={'seconds':7,'title':'ОПЕРАЦИЯ «РАЙ»','subtitle':'МИССИЯ 1 ЗАВЕРШЕНА','lines':['СЛЕДУЮЩАЯ МИССИЯ:','ЭНЕРГЕТИЧЕСКИЙ ВСПЛЕСК']}
    OUT.mkdir(parents=True, exist_ok=True)
    def part(number,phase=None):
        scene_id=f'm01-s{number:02}'
        return {'scene':scene_id,'cues':[c['id'] for c in dialogue if c['id'].startswith(scene_id+'-') and (phase is None or c['phase']==phase)]}
    result={'schemaVersion':1,'id':'alpha-m01','name':'Освоение целины', 'campaign':'Операция «Рай»',
        'source':{'path':'docs/campaign/alpha/mission01-script.md','sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
        'presentation':{'tone':'Серьёзная военная хроника; юмор в тексте и паузах, без комедийных эффектов.', 'language':'ru-RU', 'style':'слегка движущиеся рисованные кадры'},
        'speakers':{key:dict(zip(['name','voice','lengthScale','pitchSemitones','effect'],profile)) for key,profile in PROFILES.items()},
        'chapters':{name:[s['id'] for s in scenes if s['chapter']==name] for name in dict.fromkeys(s['chapter'] for s in scenes)},
        'gameplayCinematics':{'intro':[part(1),part(2),part(3)],'briefing':[part(4),part(5)],'arrival':[part(6)],'first-contact':[part(7,'before')],'raid-won':[part(7,'after-raid')],
            'artifact-flamethrower':[part(8,'before')],'research-flamethrower':[part(8,'research-complete')],
            'artifact-mg-ammo-1':[part(9,'before')],'research-mg-ammo-1':[part(9,'research-complete')],
            'camp3-sighted':[part(10,'before')],'research-mg-tower':[part(10,'research-complete')],
            'last-camp':[part(11)],'victory':[part(12)],'outro':[part(13),part(14)]},
        'scenes':scenes,'dialogue':dialogue,'barks':barks}
    (OUT/'story.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'scenes':len(scenes),'spokenCues':len(dialogue),'unitBarks':len(barks),'speakers':len(PROFILES)},ensure_ascii=False))

if __name__=='__main__':main()
