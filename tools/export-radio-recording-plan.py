"""Export the actual enabled phrase bank, grouped into six suggested voices."""
from collections import defaultdict
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
library=json.loads((ROOT/'assets/radio/situations_catalog.json').read_text(encoding='utf-8'))
voices=['Водитель — спокойный, короткие подтверждения','Водитель — сухой юмор и дорожные доклады',
        'Женский голос — прямой, боевые доклады','Строитель — практик','Женский голос — спокойный, ремонт и быт','Радист — чёткий диспетчер']
groups=[defaultdict(list) for _ in voices]
templates=[]
for rule in library['rules']:
    if rule['support']!='wired' or not rule['enabled']: continue
    event=rule['eventType']
    voice=3 if event.startswith('construction.') or event=='command.build' else 4 if event.startswith(('repair.','factory.')) else 2 if event.startswith('damage.') else 5 if event.startswith(('mission.','research.','recon.','loot.')) or event=='traffic.network_overload' else 1 if event.startswith('traffic.') else 0
    for tier in rule['tiers']:
        for graph in tier['graphs']:
            for turn,node in enumerate(graph['nodes']):
                phrase=library['phrases'][node['phraseId']]
                if '{' in phrase['text']:
                    if phrase['id'] not in [p['id'] for p in templates]: templates.append(phrase)
                    continue
                selected=(1 if turn==0 else 0) if phrase['kind']=='dry_joke' else ([1,0,5,4,3,2][voice] if turn%2 else voice)
                if phrase.get('speakerGender')=='f':selected=2
                if phrase.get('speakerGender')=='m' and selected in (2,4):selected=1
                spoken=phrase.get('femaleText',phrase['text']) if selected in (2,4) else phrase['text']
                groups[selected][spoken].append(phrase['id'])
lines=['РАЙ — ЛИСТ ЗАПИСИ ДИНАМИЧЕСКОГО ЭФИРА','',
       'Рекомендуется 6 дополнительных голосов. Вместе с прежними командиром и прапорщиком — 8.',
       'Из шести дополнительных голосов четыре мужских и два женских. Для первого прохода: водитель, строитель и один женский голос.',
       'Имена ролей здесь — режиссёрские ориентиры для актёров, а не добавленные в игру персонажи.',
       'Существующие пользовательские записи не перезаписывать. Фразы ниже — новый банк.',
       'Каждый пункт — отдельный цельный файл OGG/WAV/MP3, без музыки и радиоэффекта. Не записывать числа отдельными словами.',
       'Оставить примерно 100 мс тишины в начале и 120–180 мс в конце; одинаковое расстояние до микрофона.',
       'Загрузка: /dialogues/#dynamic → ситуация → вариант разговора → значок загрузки рядом с репликой.',
       'Затем: значок радио «Сохранить и применить в игре». Открытую игру нужно обновить.',
       'Общие фразы можно записать одним файлом и явно выбрать его для перечисленных ID.',
       'Файл привязан к тексту при загрузке. После изменения текста несовпадающая запись остаётся на диске, а новый текст произносит временный локальный голос.',
       'Пока свои записи не загружены, в игре и симуляторе работает временная озвучка Piper. Все фразы произносятся целиком, включая реальные числа.','']
total=0
for index,(voice,phrases) in enumerate(zip(voices,groups),1):
    lines += [f'{index}. {voice.upper()} — {len(phrases)} записей','']
    for i,(text,ids) in enumerate(phrases.items(),1):
        total+=1
        lines += [f'{index:02}-{i:03}. {text}', 'ID: '+', '.join(dict.fromkeys(ids)), '']
lines += [f'ИТОГО: {total} коротких записей для полного подключённого банка.','',
          'ПЕРЕМЕННЫЕ ЧИСЛА, ИМЕНА И ПОЗЫВНЫЕ — ВРЕМЕННАЯ ЛОКАЛЬНАЯ ОЗВУЧКА',
          'Не читайте фигурные скобки. Piper произносит целую готовую фразу с фактическим числом, именем и позывным живого участника. В мастерской у шаблона есть учебный пример для прослушивания.',
          'Для своей числовой сводки создайте цельные варианты 1/2/3/5/20 и условие равенства соответствующего счётчика. Для именной записи нужен конкретный адресат и совпадение полного текста.',
          'Временное вступление с позывным не приклеивается к вашей записи другим голосом. Если загружена цельная актёрская запись без позывного, она играет целиком; говорящий обозначен в субтитрах.',
          'Не заменяйте текст записи при сохранении без соответствующей перезаписи.','']
for p in templates: lines += [p['id'],p['text'],'']
output=ROOT/'docs/campaign/radio-recording-plan.txt'
output.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(f'{total} recordings, 6 additional voices; {len(templates)} identity/count templates use local temporary speech')
